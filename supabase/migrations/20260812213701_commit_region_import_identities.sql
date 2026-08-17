create or replace function public.commit_region_import_identities(
    p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    target_project public.region_import_projects%rowtype;
    source_identity public.region_import_source_identities%rowtype;
    current_resolution public.region_import_identity_resolutions%rowtype;

    resolved_member_id uuid;

    matched_existing_count integer := 0;
    created_new_count integer := 0;
    reused_created_count integer := 0;
    ignored_count integer := 0;
    deferred_count integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can commit import identities'
            using errcode = '42501';
    end if;

    if p_project_id is null then
        raise exception 'Import project is required'
            using errcode = '22023';
    end if;

    select *
    into target_project
    from public.region_import_projects
    where id = p_project_id
    for update;

    if target_project.id is null then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    /*
     * Every source identity must have a durable resolution.
     */
    if exists (
        select 1
        from public.region_import_source_identities identity
        where identity.project_id = p_project_id
          and not exists (
              select 1
              from public.region_import_identity_resolutions resolution
              where resolution.source_identity_id = identity.id
          )
    ) then
        raise exception 'Every source identity must be reviewed before identity commit'
            using errcode = '23514';
    end if;

    /*
     * needs_superadmin is intentionally blocking.
     */
    if exists (
        select 1
        from public.region_import_source_identities identity
        join lateral (
            select resolution.*
            from public.region_import_identity_resolutions resolution
            where resolution.source_identity_id = identity.id
            order by
                resolution.resolved_at desc,
                resolution.id desc
            limit 1
        ) latest on true
        where identity.project_id = p_project_id
          and latest.resolution_type = 'needs_superadmin'
    ) then
        raise exception 'Import project contains identity resolutions requiring superadmin review'
            using errcode = '23514';
    end if;

    update public.region_import_projects
    set
        status = 'committing',
        updated_at = now()
    where id = p_project_id;

    for source_identity in
        select *
        from public.region_import_source_identities
        where project_id = p_project_id
        order by created_at, id
    loop
        select resolution.*
        into current_resolution
        from public.region_import_identity_resolutions resolution
        where resolution.source_identity_id = source_identity.id
        order by
            resolution.resolved_at desc,
            resolution.id desc
        limit 1
        for update;

        if current_resolution.id is null then
            raise exception 'Source identity % has no resolution',
                source_identity.id
                using errcode = '23514';
        end if;

        /*
         * MATCH EXISTING
         *
         * Revalidate that the selected canonical member still exists
         * and is active immediately before use.
         */
        if current_resolution.resolution_type = 'match_existing' then
            if current_resolution.canonical_member_id is null then
                raise exception 'match_existing resolution % has no canonical member',
                    current_resolution.id
                    using errcode = '23514';
            end if;

            if not exists (
                select 1
                from public.members member
                where member.id = current_resolution.canonical_member_id
                  and member.status = 'active'
            ) then
                raise exception 'Canonical member selected for source identity % is no longer active',
                    source_identity.id
                    using errcode = '23514';
            end if;

            resolved_member_id := current_resolution.canonical_member_id;

            /*
             * Imported roster membership is participation evidence,
             * not a home-region reassignment and not workspace access.
             */
            perform public.upsert_region_participant(
                target_project.region_id,
                resolved_member_id,
                null,
                'historic_import',
                caller_id
            );

            matched_existing_count := matched_existing_count + 1;

        /*
         * CREATE NEW
         *
         * The reviewer approved the intent earlier. Only now may the
         * canonical member actually be created.
         */
        elsif current_resolution.resolution_type = 'create_new' then

            /*
             * Rerun safety:
             *
             * If this resolution already created a canonical member,
             * reuse it rather than creating another one.
             */
            if current_resolution.created_member_id is not null then
                if not exists (
                    select 1
                    from public.members member
                    where member.id = current_resolution.created_member_id
                ) then
                    raise exception 'Previously created member % no longer exists',
                        current_resolution.created_member_id
                        using errcode = '23514';
                end if;

                resolved_member_id := current_resolution.created_member_id;

                perform public.upsert_region_participant(
                    target_project.region_id,
                    resolved_member_id,
                    null,
                    'historic_import',
                    caller_id
                );

                reused_created_count := reused_created_count + 1;

                continue;
            end if;

            /*
             * Recheck the current canonical directory.
             *
             * Candidate generation may have happened hours or days ago.
             * Do not create a new canonical member if an active member
             * now matches any deterministic V1 identity field.
             */
            if exists (
                select 1
                from public.members member
                left join public.profiles profile
                    on profile.member_id = member.id
                where member.status = 'active'
                  and (
                      (
                          source_identity.normalized_email is not null
                          and lower(
                              btrim(
                                  coalesce(
                                      profile.email,
                                      ''
                                  )
                              )
                          ) = source_identity.normalized_email
                      )
                      or
                      (
                          source_identity.normalized_f3_name is not null
                          and regexp_replace(
                              lower(
                                  coalesce(
                                      member.pax_name,
                                      ''
                                  )
                              ),
                              '[^a-z0-9]+',
                              '',
                              'g'
                          ) = source_identity.normalized_f3_name
                      )
                      or
                      (
                          source_identity.normalized_real_name is not null
                          and regexp_replace(
                              lower(
                                  coalesce(
                                      member.real_name,
                                      ''
                                  )
                              ),
                              '[^a-z0-9]+',
                              '',
                              'g'
                          ) = source_identity.normalized_real_name
                      )
                  )
            ) then
                raise exception
                    'Source identity % now matches an active canonical member. Regenerate candidates and review again before creating a new member.',
                    source_identity.id
                    using errcode = '23514';
            end if;

            insert into public.members (
                region_id,
                pax_name,
                real_name,
                status
            )
            values (
                target_project.region_id,
                coalesce(
                    nullif(
                        btrim(source_identity.source_f3_name),
                        ''
                    ),
                    nullif(
                        btrim(source_identity.display_name),
                        ''
                    ),
                    nullif(
                        btrim(source_identity.source_real_name),
                        ''
                    ),
                    'Imported PAX'
                ),
                nullif(
                    btrim(source_identity.source_real_name),
                    ''
                ),
                'active'
            )
            returning id
            into resolved_member_id;

            update public.region_import_identity_resolutions
            set created_member_id = resolved_member_id
            where id = current_resolution.id;

            /*
             * Member creation already creates home-region participation
             * through the current members trigger. Add import provenance
             * to the regional participant record as well.
             */
            perform public.upsert_region_participant(
                target_project.region_id,
                resolved_member_id,
                null,
                'historic_import',
                caller_id
            );

            created_new_count := created_new_count + 1;

        elsif current_resolution.resolution_type = 'ignored' then
            ignored_count := ignored_count + 1;

        elsif current_resolution.resolution_type = 'deferred' then
            deferred_count := deferred_count + 1;

        elsif current_resolution.resolution_type = 'needs_superadmin' then
            raise exception 'Source identity % still requires superadmin review',
                source_identity.id
                using errcode = '23514';

        else
            raise exception 'Unsupported resolution type: %',
                current_resolution.resolution_type
                using errcode = '23514';
        end if;
    end loop;

    /*
     * Identity commit is complete.
     *
     * We are not declaring the overall region import completed;
     * sessions/AOs/sites/etc. have not been staged or committed yet.
     */
    update public.region_import_projects
    set
        status = 'data_validation',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId', p_project_id,
        'matchedExisting', matched_existing_count,
        'createdNew', created_new_count,
        'reusedPreviouslyCreated', reused_created_count,
        'ignored', ignored_count,
        'deferred', deferred_count
    );
end;
$function$;