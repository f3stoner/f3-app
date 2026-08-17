/*
 * =========================================================
 * REGION IMPORT — MEMBER MERGE LINKAGE
 * =========================================================
 */

alter table public.region_import_identity_resolutions
add column if not exists merge_id uuid
references public.member_merges(id)
on delete restrict;


alter table public.region_import_identity_resolutions
add constraint region_import_identity_resolutions_merge_check
check (
    merge_id is null
    or resolution_type = 'create_new_then_merge'
);


/*
 * =========================================================
 * CREATE / REUSE ONBOARDING MERGE DRAFT
 * =========================================================
 */

create or replace function public.create_region_import_identity_merge_draft(
    p_source_identity_id uuid
)
returns public.member_merges
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    source_identity
        public.region_import_source_identities%rowtype;

    current_resolution
        public.region_import_identity_resolutions%rowtype;

    existing_merge
        public.member_merges%rowtype;

    created_merge
        public.member_merges%rowtype;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can create onboarding member merges'
            using errcode = '42501';
    end if;

    if p_source_identity_id is null then
        raise exception 'Source identity is required'
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

    select resolution.*
    into current_resolution
    from public.region_import_identity_resolutions resolution
    where resolution.source_identity_id =
        p_source_identity_id
    order by
        resolution.resolved_at desc,
        resolution.id desc
    limit 1
    for update;

    if current_resolution.id is null then
        raise exception 'Source identity has no resolution'
            using errcode = '23514';
    end if;

    if current_resolution.resolution_type <>
        'create_new_then_merge' then

        raise exception
            'Source identity is not resolved as create_new_then_merge'
            using errcode = '23514';
    end if;

    if current_resolution.created_member_id is null then
        raise exception
            'Imported canonical member must be created before merge draft creation'
            using errcode = '23514';
    end if;

    if current_resolution.canonical_member_id is null then
        raise exception
            'Existing duplicate member is missing from resolution'
            using errcode = '23514';
    end if;

    if current_resolution.created_member_id =
        current_resolution.canonical_member_id then

        raise exception
            'Imported canonical member and existing duplicate member must be different'
            using errcode = '23514';
    end if;

    /*
     * If this resolution already has a merge, reuse it unless
     * that merge was cancelled.
     */
    if current_resolution.merge_id is not null then
        select *
        into existing_merge
        from public.member_merges merge
        where merge.id =
            current_resolution.merge_id;

        if existing_merge.id is null then
            raise exception
                'Linked member merge % no longer exists',
                current_resolution.merge_id
                using errcode = '23514';
        end if;

        if existing_merge.canonical_member_id <>
            current_resolution.created_member_id
            or existing_merge.duplicate_member_id <>
            current_resolution.canonical_member_id then

            raise exception
                'Linked member merge does not match the onboarding identity resolution'
                using errcode = '23514';
        end if;

        if existing_merge.status <> 'cancelled' then
            return existing_merge;
        end if;
    end if;

    /*
     * There may already be an active merge for this duplicate
     * member. Reuse it only if it has exactly the direction
     * onboarding requires.
     */
    select *
    into existing_merge
    from public.member_merges merge
    where merge.duplicate_member_id =
        current_resolution.canonical_member_id
      and merge.status <> 'cancelled'
    limit 1;

    if existing_merge.id is not null then
        if existing_merge.canonical_member_id <>
            current_resolution.created_member_id then

            raise exception
                'Existing member % already has an active merge with a different canonical survivor',
                current_resolution.canonical_member_id
                using errcode = '23514';
        end if;

        update public.region_import_identity_resolutions
        set merge_id = existing_merge.id
        where id = current_resolution.id;

        return existing_merge;
    end if;

    /*
     * Direction matters:
     *
     * canonical = imported/new member
     * duplicate = previously existing member
     */
    select *
    into created_merge
    from public.create_member_merge_draft(
        current_resolution.created_member_id,
        current_resolution.canonical_member_id,
        format(
            'Region onboarding identity %s: imported identity selected as canonical survivor.',
            source_identity.display_name
        )
    );

    update public.region_import_identity_resolutions
    set merge_id = created_merge.id
    where id = current_resolution.id;

    return created_merge;
end;
$function$;


/*
 * =========================================================
 * UPDATE IDENTITY REVIEW LOADER
 * =========================================================
 */

create or replace function public.load_region_import_identity_review(
    p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();
    result jsonb;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can review import identities'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.region_import_projects project
        where project.id = p_project_id
    ) then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', identity.id,
                'displayName', identity.display_name,
                'sourceF3Name', identity.source_f3_name,
                'sourceRealName', identity.source_real_name,
                'sourceEmail', identity.source_email,
                'sourcePhone', identity.source_phone,
                'sourceHomeRegion', identity.source_home_region,
                'status', identity.source_identity_status,

                'resolution',
                case
                    when latest_resolution.id is null
                        then null

                    else jsonb_build_object(
                        'id',
                            latest_resolution.id,

                        'type',
                            latest_resolution.resolution_type,

                        'canonicalMemberId',
                            latest_resolution.canonical_member_id,

                        'createdMemberId',
                            latest_resolution.created_member_id,

                        'mergeId',
                            latest_resolution.merge_id,

                        'mergeStatus',
                            linked_merge.status,

                        'notes',
                            latest_resolution.notes,

                        'resolvedAt',
                            latest_resolution.resolved_at
                    )
                end,

                'candidates',
                coalesce(
                    candidates.items,
                    '[]'::jsonb
                )
            )
            order by
                case
                    when identity.source_identity_status =
                        'needs_review'
                        then 0
                    else 1
                end,
                lower(
                    coalesce(
                        identity.display_name,
                        ''
                    )
                ),
                identity.id
        ),
        '[]'::jsonb
    )
    into result

    from public.region_import_source_identities identity

    left join lateral (
        select resolution.*
        from public.region_import_identity_resolutions resolution
        where resolution.source_identity_id =
            identity.id
        order by
            resolution.resolved_at desc,
            resolution.id desc
        limit 1
    ) latest_resolution on true

    left join public.member_merges linked_merge
        on linked_merge.id =
            latest_resolution.merge_id

    left join lateral (
        select jsonb_agg(
            jsonb_build_object(
                'id',
                    candidate.id,

                'memberId',
                    member.id,

                'paxName',
                    member.pax_name,

                'realName',
                    member.real_name,

                'homeRegion',
                    region.name,

                'rank',
                    candidate.candidate_rank,

                'classification',
                    candidate.classification,

                'score',
                    candidate.overall_score,

                'scoreBreakdown',
                    candidate.score_breakdown,

                'positiveEvidence',
                    candidate.positive_evidence
            )
            order by
                candidate.candidate_rank,
                candidate.id
        ) as items

        from public.region_import_identity_candidates candidate

        join public.members member
            on member.id =
                candidate.canonical_member_id

        left join public.regions region
            on region.id =
                member.region_id

        where candidate.source_identity_id =
            identity.id
    ) candidates on true

    where identity.project_id =
        p_project_id;

    return result;
end;
$function$;