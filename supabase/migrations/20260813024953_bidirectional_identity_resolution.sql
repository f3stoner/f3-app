/*
 * =========================================================
 * REGION IMPORT — BIDIRECTIONAL IDENTITY RESOLUTION
 * =========================================================
 *
 * Adds:
 *
 * create_new_then_merge
 *
 * Meaning:
 *
 * - Create a new canonical member from the imported identity.
 * - canonical_member_id identifies the existing active member
 *   that appears to represent the same human.
 * - After creation, the normal member-merge system must be used
 *   with the imported member as survivor and the existing member
 *   as duplicate.
 *
 * The onboarding identity intentionally remains needs_review
 * until that merge workflow is completed.
 */


/*
 * =========================================================
 * CONSTRAINTS
 * =========================================================
 */

alter table public.region_import_identity_resolutions
drop constraint region_import_identity_resolutions_type_check;

alter table public.region_import_identity_resolutions
add constraint region_import_identity_resolutions_type_check
check (
    resolution_type in (
        'match_existing',
        'create_new',
        'create_new_then_merge',
        'deferred',
        'ignored',
        'needs_superadmin'
    )
);


alter table public.region_import_identity_resolutions
drop constraint region_import_identity_resolutions_existing_member_check;

alter table public.region_import_identity_resolutions
add constraint region_import_identity_resolutions_existing_member_check
check (
    (
        resolution_type = 'match_existing'
        and canonical_member_id is not null
        and created_member_id is null
    )
    or
    (
        resolution_type = 'create_new_then_merge'
        and canonical_member_id is not null
    )
    or
    (
        resolution_type not in (
            'match_existing',
            'create_new_then_merge'
        )
        and canonical_member_id is null
    )
);


alter table public.region_import_identity_resolutions
drop constraint region_import_identity_resolutions_created_member_check;

alter table public.region_import_identity_resolutions
add constraint region_import_identity_resolutions_created_member_check
check (
    created_member_id is null
    or resolution_type in (
        'create_new',
        'create_new_then_merge'
    )
);


/*
 * =========================================================
 * RESOLVE IDENTITY
 * =========================================================
 */

create or replace function public.resolve_region_import_identity(
    p_source_identity_id uuid,
    p_resolution_type text,
    p_canonical_member_id uuid default null,
    p_notes text default null
)
returns public.region_import_identity_resolutions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    source_identity
        public.region_import_source_identities%rowtype;

    previous_resolution
        public.region_import_identity_resolutions%rowtype;

    created_resolution
        public.region_import_identity_resolutions%rowtype;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can resolve import identities'
            using errcode = '42501';
    end if;

    if p_source_identity_id is null then
        raise exception 'Source identity is required'
            using errcode = '22023';
    end if;

    if p_resolution_type not in (
        'match_existing',
        'create_new',
        'create_new_then_merge',
        'deferred',
        'ignored',
        'needs_superadmin'
    ) then
        raise exception 'Unsupported identity resolution type'
            using errcode = '22023';
    end if;

    select *
    into source_identity
    from public.region_import_source_identities
    where id = p_source_identity_id
    for update;

    if source_identity.id is null then
        raise exception 'Source identity not found'
            using errcode = '22023';
    end if;

    /*
     * Both of these decisions point at an existing canonical
     * member and therefore require a valid active target.
     */
    if p_resolution_type in (
        'match_existing',
        'create_new_then_merge'
    ) then
        if p_canonical_member_id is null then
            raise exception
                'Canonical member is required for %',
                p_resolution_type
                using errcode = '22023';
        end if;

        if not exists (
            select 1
            from public.members member
            where member.id =
                    p_canonical_member_id
              and member.status = 'active'
        ) then
            raise exception
                'Canonical member must exist and be active'
                using errcode = '22023';
        end if;

    elsif p_canonical_member_id is not null then
        raise exception
            'Canonical member is only valid for match_existing or create_new_then_merge'
            using errcode = '22023';
    end if;

    select *
    into previous_resolution
    from public.region_import_identity_resolutions resolution
    where resolution.source_identity_id =
        p_source_identity_id
    order by
        resolution.resolved_at desc,
        resolution.id desc
    limit 1;

    insert into public.region_import_identity_resolutions (
        source_identity_id,
        resolution_type,
        canonical_member_id,
        resolved_by_user_id,
        notes,
        supersedes_resolution_id
    )
    values (
        p_source_identity_id,
        p_resolution_type,
        p_canonical_member_id,
        caller_id,
        nullif(btrim(p_notes), ''),
        previous_resolution.id
    )
    returning *
    into created_resolution;

    update public.region_import_source_identities
    set
        source_identity_status = case
            when p_resolution_type = 'deferred'
                then 'deferred'

            when p_resolution_type = 'ignored'
                then 'ignored'

            /*
             * The identity decision is made, but onboarding
             * remains blocked until the canonical merge occurs.
             */
            when p_resolution_type =
                'create_new_then_merge'
                then 'needs_review'

            else 'resolved'
        end,
        updated_at = now()
    where id = p_source_identity_id;

    return created_resolution;
end;
$function$;


/*
 * =========================================================
 * COMMIT IDENTITIES
 * =========================================================
 */

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

    target_project
        public.region_import_projects%rowtype;

    source_identity
        public.region_import_source_identities%rowtype;

    current_resolution
        public.region_import_identity_resolutions%rowtype;

    resolved_member_id uuid;

    matched_existing_count integer := 0;
    created_new_count integer := 0;
    created_for_merge_count integer := 0;
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
     * Every source identity must have at least one durable
     * resolution before commit.
     */
    if exists (
        select 1
        from public.region_import_source_identities identity
        where identity.project_id = p_project_id
          and not exists (
              select 1
              from public.region_import_identity_resolutions resolution
              where resolution.source_identity_id =
                  identity.id
          )
    ) then
        raise exception
            'Every source identity must be reviewed before identity commit'
            using errcode = '23514';
    end if;

    /*
     * needs_superadmin remains a blocking resolution.
     */
    if exists (
        select 1
        from public.region_import_source_identities identity

        join lateral (
            select resolution.*
            from public.region_import_identity_resolutions resolution
            where resolution.source_identity_id =
                identity.id
            order by
                resolution.resolved_at desc,
                resolution.id desc
            limit 1
        ) latest on true

        where identity.project_id = p_project_id
          and latest.resolution_type =
              'needs_superadmin'
    ) then
        raise exception
            'Import project contains identity resolutions requiring superadmin review'
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
        where resolution.source_identity_id =
            source_identity.id
        order by
            resolution.resolved_at desc,
            resolution.id desc
        limit 1
        for update;

        if current_resolution.id is null then
            raise exception
                'Source identity % has no resolution',
                source_identity.id
                using errcode = '23514';
        end if;

        /*
         * =====================================================
         * MATCH EXISTING
         * =====================================================
         */
        if current_resolution.resolution_type =
            'match_existing' then

            if current_resolution.canonical_member_id
                is null then
                raise exception
                    'match_existing resolution % has no canonical member',
                    current_resolution.id
                    using errcode = '23514';
            end if;

            if not exists (
                select 1
                from public.members member
                where member.id =
                        current_resolution
                            .canonical_member_id
                  and member.status = 'active'
            ) then
                raise exception
                    'Canonical member selected for source identity % is no longer active',
                    source_identity.id
                    using errcode = '23514';
            end if;

            resolved_member_id :=
                current_resolution
                    .canonical_member_id;

            perform public.upsert_region_participant(
                target_project.region_id,
                resolved_member_id,
                null,
                'historic_import',
                caller_id
            );

            matched_existing_count :=
                matched_existing_count + 1;

        /*
         * =====================================================
         * CREATE NEW
         * =====================================================
         */
        elsif current_resolution.resolution_type =
            'create_new' then

            /*
             * Rerun safety.
             */
            if current_resolution.created_member_id
                is not null then

                if not exists (
                    select 1
                    from public.members member
                    where member.id =
                        current_resolution
                            .created_member_id
                ) then
                    raise exception
                        'Previously created member % no longer exists',
                        current_resolution
                            .created_member_id
                        using errcode = '23514';
                end if;

                resolved_member_id :=
                    current_resolution
                        .created_member_id;

                perform public.upsert_region_participant(
                    target_project.region_id,
                    resolved_member_id,
                    null,
                    'historic_import',
                    caller_id
                );

                reused_created_count :=
                    reused_created_count + 1;

                continue;
            end if;

            /*
             * Normal create_new is still guarded against a
             * newly appearing deterministic canonical match.
             */
            if exists (
                select 1
                from public.members member

                left join public.profiles profile
                    on profile.member_id =
                        member.id

                where member.status = 'active'
                  and (
                      (
                          source_identity.normalized_email
                              is not null
                          and lower(
                              btrim(
                                  coalesce(
                                      profile.email,
                                      ''
                                  )
                              )
                          ) =
                              source_identity
                                  .normalized_email
                      )
                      or
                      (
                          source_identity
                              .normalized_f3_name
                              is not null
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
                          ) =
                              source_identity
                                  .normalized_f3_name
                      )
                      or
                      (
                          source_identity
                              .normalized_real_name
                              is not null
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
                          ) =
                              source_identity
                                  .normalized_real_name
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
                        btrim(
                            source_identity
                                .source_f3_name
                        ),
                        ''
                    ),
                    nullif(
                        btrim(
                            source_identity
                                .display_name
                        ),
                        ''
                    ),
                    nullif(
                        btrim(
                            source_identity
                                .source_real_name
                        ),
                        ''
                    ),
                    'Imported PAX'
                ),

                nullif(
                    btrim(
                        source_identity
                            .source_real_name
                    ),
                    ''
                ),

                'active'
            )
            returning id
            into resolved_member_id;

            update public.region_import_identity_resolutions
            set created_member_id =
                resolved_member_id
            where id =
                current_resolution.id;

            perform public.upsert_region_participant(
                target_project.region_id,
                resolved_member_id,
                null,
                'historic_import',
                caller_id
            );

            created_new_count :=
                created_new_count + 1;

        /*
         * =====================================================
         * CREATE NEW THEN MERGE
         * =====================================================
         *
         * Unlike normal create_new, the known existing canonical
         * match is intentional here.
         */
        elsif current_resolution.resolution_type =
            'create_new_then_merge' then

            if current_resolution.canonical_member_id
                is null then
                raise exception
                    'create_new_then_merge resolution % has no existing duplicate member',
                    current_resolution.id
                    using errcode = '23514';
            end if;

            if not exists (
                select 1
                from public.members member
                where member.id =
                        current_resolution
                            .canonical_member_id
                  and member.status = 'active'
            ) then
                raise exception
                    'Existing duplicate member % is no longer active',
                    current_resolution
                        .canonical_member_id
                    using errcode = '23514';
            end if;

            /*
             * Rerun safety.
             */
            if current_resolution.created_member_id
                is not null then

                if not exists (
                    select 1
                    from public.members member
                    where member.id =
                        current_resolution
                            .created_member_id
                ) then
                    raise exception
                        'Previously created imported member % no longer exists',
                        current_resolution
                            .created_member_id
                        using errcode = '23514';
                end if;

                resolved_member_id :=
                    current_resolution
                        .created_member_id;

                perform public.upsert_region_participant(
                    target_project.region_id,
                    resolved_member_id,
                    null,
                    'historic_import',
                    caller_id
                );

                reused_created_count :=
                    reused_created_count + 1;

                continue;
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
                        btrim(
                            source_identity
                                .source_f3_name
                        ),
                        ''
                    ),
                    nullif(
                        btrim(
                            source_identity
                                .display_name
                        ),
                        ''
                    ),
                    nullif(
                        btrim(
                            source_identity
                                .source_real_name
                        ),
                        ''
                    ),
                    'Imported PAX'
                ),

                nullif(
                    btrim(
                        source_identity
                            .source_real_name
                    ),
                    ''
                ),

                'active'
            )
            returning id
            into resolved_member_id;

            update public.region_import_identity_resolutions
            set created_member_id =
                resolved_member_id
            where id =
                current_resolution.id;

            perform public.upsert_region_participant(
                target_project.region_id,
                resolved_member_id,
                null,
                'historic_import',
                caller_id
            );

            created_for_merge_count :=
                created_for_merge_count + 1;

        elsif current_resolution.resolution_type =
            'ignored' then

            ignored_count :=
                ignored_count + 1;

        elsif current_resolution.resolution_type =
            'deferred' then

            deferred_count :=
                deferred_count + 1;

        elsif current_resolution.resolution_type =
            'needs_superadmin' then

            raise exception
                'Source identity % still requires superadmin review',
                source_identity.id
                using errcode = '23514';

        else
            raise exception
                'Unsupported resolution type: %',
                current_resolution.resolution_type
                using errcode = '23514';
        end if;
    end loop;

    update public.region_import_projects
    set
        status = 'data_validation',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId',
            p_project_id,

        'matchedExisting',
            matched_existing_count,

        'createdNew',
            created_new_count,

        'createdForMerge',
            created_for_merge_count,

        'reusedPreviouslyCreated',
            reused_created_count,

        'ignored',
            ignored_count,

        'deferred',
            deferred_count
    );
end;
$function$;