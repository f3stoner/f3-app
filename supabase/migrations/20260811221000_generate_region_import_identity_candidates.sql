create or replace function public.generate_region_import_identity_candidates(
    p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    source_identity public.region_import_source_identities%rowtype;
    candidate_record record;

    candidate_count integer := 0;
    identity_count integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can generate import identity candidates'
            using errcode = '42501';
    end if;

    if p_project_id is null then
        raise exception 'Import project is required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.region_import_projects project
        where project.id = p_project_id
    ) then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    for source_identity in
        select *
        from public.region_import_source_identities
        where project_id = p_project_id
          and source_identity_status not in (
              'resolved',
              'deferred',
              'ignored'
          )
        order by created_at, id
    loop
        delete from public.region_import_identity_candidates
        where source_identity_id = source_identity.id;

        for candidate_record in
            with member_matches as (
                select
                    member.id as canonical_member_id,

                    case
                        when source_identity.normalized_email is not null
                         and lower(btrim(coalesce(profile.email, ''))) =
                             source_identity.normalized_email
                            then 1
                        else 0
                    end as exact_email,

                    case
                        when source_identity.normalized_f3_name is not null
                         and regexp_replace(
                             lower(coalesce(member.pax_name, '')),
                             '[^a-z0-9]+',
                             '',
                             'g'
                         ) = source_identity.normalized_f3_name
                            then 1
                        else 0
                    end as exact_f3_name,

                    case
                        when source_identity.normalized_real_name is not null
                         and regexp_replace(
                             lower(coalesce(member.real_name, '')),
                             '[^a-z0-9]+',
                             '',
                             'g'
                         ) = source_identity.normalized_real_name
                            then 1
                        else 0
                    end as exact_real_name

                from public.members member

                left join public.profiles profile
                    on profile.member_id = member.id

                where
                    (
                        source_identity.normalized_email is not null
                        and lower(btrim(coalesce(profile.email, ''))) =
                            source_identity.normalized_email
                    )
                    or
                    (
                        source_identity.normalized_f3_name is not null
                        and regexp_replace(
                            lower(coalesce(member.pax_name, '')),
                            '[^a-z0-9]+',
                            '',
                            'g'
                        ) = source_identity.normalized_f3_name
                    )
                    or
                    (
                        source_identity.normalized_real_name is not null
                        and regexp_replace(
                            lower(coalesce(member.real_name, '')),
                            '[^a-z0-9]+',
                            '',
                            'g'
                        ) = source_identity.normalized_real_name
                    )
            ),

            scored as (
                select
                    canonical_member_id,
                    max(exact_email) as exact_email,
                    max(exact_f3_name) as exact_f3_name,
                    max(exact_real_name) as exact_real_name,

                    (
                        max(exact_email) * 100
                        +
                        max(exact_f3_name) * 40
                        +
                        max(exact_real_name) * 40
                    )::numeric as overall_score

                from member_matches

                group by canonical_member_id
            ),

            ranked as (
                select
                    scored.*,

                    row_number() over (
                        order by
                            scored.overall_score desc,
                            scored.canonical_member_id
                    ) as candidate_rank,

                    count(*) over () as total_candidates

                from scored
            )

            select
                ranked.canonical_member_id,
                ranked.candidate_rank,
                ranked.total_candidates,
                ranked.overall_score,
                ranked.exact_email,
                ranked.exact_f3_name,
                ranked.exact_real_name

            from ranked

            order by ranked.candidate_rank
        loop
            insert into public.region_import_identity_candidates (
                source_identity_id,
                canonical_member_id,
                candidate_rank,
                classification,
                overall_score,
                score_breakdown,
                positive_evidence,
                negative_evidence,
                matching_version,
                generation_source
            )
            values (
                source_identity.id,
                candidate_record.canonical_member_id,
                candidate_record.candidate_rank,

                case
                    when candidate_record.candidate_rank = 1
                     and candidate_record.total_candidates = 1
                     and (
                         candidate_record.exact_email = 1
                         or (
                             candidate_record.exact_f3_name = 1
                             and candidate_record.exact_real_name = 1
                         )
                     )
                        then 'recommended'

                    when candidate_record.total_candidates > 1
                     and candidate_record.candidate_rank <= 2
                     and candidate_record.overall_score >= 40
                        then 'conflict'

                    else 'possible'
                end,

                candidate_record.overall_score,

                jsonb_build_object(
                    'exactEmail',
                        candidate_record.exact_email = 1,
                    'exactF3Name',
                        candidate_record.exact_f3_name = 1,
                    'exactRealName',
                        candidate_record.exact_real_name = 1
                ),

                jsonb_strip_nulls(
                    jsonb_build_array(
                        case
                            when candidate_record.exact_email = 1
                                then 'exact_email'
                        end,

                        case
                            when candidate_record.exact_f3_name = 1
                                then 'exact_f3_name'
                        end,

                        case
                            when candidate_record.exact_real_name = 1
                                then 'exact_real_name'
                        end
                    )
                ),

                '[]'::jsonb,

                'identity_matcher_v1',
                'exact_identity_evidence'
            );

            candidate_count := candidate_count + 1;
        end loop;

        if exists (
            select 1
            from public.region_import_identity_candidates candidate
            where candidate.source_identity_id = source_identity.id
        ) then
            update public.region_import_source_identities
            set
                source_identity_status = 'needs_review',
                updated_at = now()
            where id = source_identity.id;
        else
            update public.region_import_source_identities
            set
                source_identity_status = 'needs_review',
                updated_at = now()
            where id = source_identity.id;
        end if;

        identity_count := identity_count + 1;
    end loop;

    update public.region_import_projects
    set
        status = 'identity_review',
        matching_version = 'identity_matcher_v1',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId', p_project_id,
        'identitiesProcessed', identity_count,
        'candidatesGenerated', candidate_count,
        'matchingVersion', 'identity_matcher_v1'
    );
end;
$function$;