begin;


/*
 * =========================================================
 * MEMBER / TARGET REGION ELIGIBILITY
 * =========================================================
 *
 * Rules:
 *
 * - Production-home canonical members may participate anywhere.
 * - Test-home canonical members may participate only in test regions.
 * - Production regions therefore reject test-home identities.
 *
 * This intentionally uses canonical HOME-region environment.
 * region_participants does not grant production eligibility.
 */

create or replace function public.member_is_eligible_for_region(
    p_member_id uuid,
    p_region_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select
        case
            when target_region.environment = 'test'
                then true

            when target_region.environment = 'production'
                then public.member_is_production_eligible(p_member_id)

            else false
        end
    from public.regions target_region
    where target_region.id = p_region_id
      and exists (
          select 1
          from public.members member
          where member.id = p_member_id
      );
$function$;

alter function public.member_is_eligible_for_region(uuid, uuid)
owner to postgres;

revoke all
on function public.member_is_eligible_for_region(uuid, uuid)
from public, anon, authenticated;


/*
 * =========================================================
 * REGION PARTICIPANT HARD BOUNDARY
 * =========================================================
 *
 * This is the ultimate defense against laundering a test-home
 * member into production participation.
 *
 * Real production members may still participate in Sandbox.
 */

create or replace function public.enforce_region_participant_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if not public.member_is_eligible_for_region(
        new.member_id,
        new.region_id
    ) then
        raise exception
            'Member % is not eligible to participate in region %',
            new.member_id,
            new.region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

alter function public.enforce_region_participant_environment()
owner to postgres;

revoke all
on function public.enforce_region_participant_environment()
from public, anon, authenticated;

drop trigger if exists
    region_participants_environment_guard
on public.region_participants;

create trigger region_participants_environment_guard
before insert or update of region_id, member_id
on public.region_participants
for each row
execute function public.enforce_region_participant_environment();


/*
 * =========================================================
 * IMPORT RESOLUTION HARD BOUNDARY
 * =========================================================
 *
 * Even if a caller bypasses the normal resolver RPC, an import
 * resolution cannot point a production onboarding project at a
 * test-home canonical member.
 */

create or replace function public.enforce_region_import_resolution_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    target_region_id uuid;
begin
    select project.region_id
    into target_region_id
    from public.region_import_source_identities identity
    join public.region_import_projects project
        on project.id = identity.project_id
    where identity.id = new.source_identity_id;

    if target_region_id is null then
        raise exception
            'Unable to resolve target region for import identity %',
            new.source_identity_id
            using errcode = '23514';
    end if;

    if new.canonical_member_id is not null
       and not public.member_is_eligible_for_region(
           new.canonical_member_id,
           target_region_id
       ) then
        raise exception
            'Canonical member % is not eligible for target import region %',
            new.canonical_member_id,
            target_region_id
            using errcode = '23514';
    end if;

    if new.created_member_id is not null
       and not public.member_is_eligible_for_region(
           new.created_member_id,
           target_region_id
       ) then
        raise exception
            'Created member % is not eligible for target import region %',
            new.created_member_id,
            target_region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

alter function public.enforce_region_import_resolution_environment()
owner to postgres;

revoke all
on function public.enforce_region_import_resolution_environment()
from public, anon, authenticated;

drop trigger if exists
    region_import_resolution_environment_guard
on public.region_import_identity_resolutions;

create trigger region_import_resolution_environment_guard
before insert or update of
    source_identity_id,
    canonical_member_id,
    created_member_id
on public.region_import_identity_resolutions
for each row
execute function public.enforce_region_import_resolution_environment();


/*
 * =========================================================
 * IMPORT CANDIDATE GENERATION
 * =========================================================
 *
 * Same matcher as current production implementation, except
 * candidate members must now be eligible for the project's
 * target region.
 */

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

    target_project
        public.region_import_projects%rowtype;

    source_identity
        public.region_import_source_identities%rowtype;

    candidate_record record;

    candidate_count integer := 0;
    identity_count integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception
            'Only superadmins can generate import identity candidates'
            using errcode = '42501';
    end if;

    if p_project_id is null then
        raise exception 'Import project is required'
            using errcode = '22023';
    end if;

    select *
    into target_project
    from public.region_import_projects project
    where project.id = p_project_id;

    if target_project.id is null then
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
                         and lower(
                             btrim(
                                 coalesce(profile.email, '')
                             )
                         ) = source_identity.normalized_email
                            then 1
                        else 0
                    end as exact_email,

                    case
                        when source_identity.normalized_f3_name is not null
                         and regexp_replace(
                             lower(
                                 coalesce(member.pax_name, '')
                             ),
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
                             lower(
                                 coalesce(member.real_name, '')
                             ),
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

                where member.status = 'active'

                  /*
                   * Environment boundary:
                   *
                   * Production onboarding sees production-home
                   * canonical identities only.
                   *
                   * Test onboarding may see both production-home
                   * and test-home identities.
                   */
                  and public.member_is_eligible_for_region(
                      member.id,
                      target_project.region_id
                  )

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
                              source_identity.normalized_email
                      )
                      or
                      (
                          source_identity.normalized_f3_name
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
                              source_identity.normalized_f3_name
                      )
                      or
                      (
                          source_identity.normalized_real_name
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
                              source_identity.normalized_real_name
                      )
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

                'identity_matcher_v1_environment',
                'exact_identity_evidence'
            );

            candidate_count := candidate_count + 1;
        end loop;

        update public.region_import_source_identities
        set
            source_identity_status = 'needs_review',
            updated_at = now()
        where id = source_identity.id;

        identity_count := identity_count + 1;
    end loop;

    update public.region_import_projects
    set
        status = 'identity_review',
        matching_version =
            'identity_matcher_v1_environment',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId',
            p_project_id,
        'identitiesProcessed',
            identity_count,
        'candidatesGenerated',
            candidate_count,
        'matchingVersion',
            'identity_matcher_v1_environment'
    );
end;
$function$;


commit;