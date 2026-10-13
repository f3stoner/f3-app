begin;

-- Regional PAX merges: extend existing engine; do not deploy without sandbox testing.

create or replace function public.can_manage_regional_member_merge(p_canonical_member_id uuid, p_duplicate_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select auth.uid() is not null and (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
        or exists (
            select 1 from public.members c
            join public.members d on d.id = p_duplicate_member_id
            where c.id = p_canonical_member_id
              and c.region_id is not null
              and c.region_id = d.region_id
              and public.is_region_leader(c.region_id)

        )
    );
$function$;
revoke all on function public.can_manage_regional_member_merge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_manage_regional_member_merge(uuid, uuid) to service_role;


create or replace function public.create_member_merge_draft(
    p_canonical_member_id uuid,
    p_duplicate_member_id uuid,
    p_notes text default null
)
returns public.member_merges
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_user_id uuid;
    v_canonical_member public.members%rowtype;
    v_duplicate_member public.members%rowtype;
    v_merge public.member_merges%rowtype;
begin
    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to create a member merge draft.'
            using errcode = '42501';
    end if;

    if p_canonical_member_id is null then
        raise exception
            'Canonical member ID is required.'
            using errcode = '22004';
    end if;

    if p_duplicate_member_id is null then
        raise exception
            'Duplicate member ID is required.'
            using errcode = '22004';
    end if;

    if p_canonical_member_id = p_duplicate_member_id then
        raise exception
            'Canonical and duplicate member IDs must be different.'
            using errcode = '23514';
    end if;

    -- Lock both member rows in deterministic UUID order.
    perform m.id
    from public.members m
    where m.id in (
        p_canonical_member_id,
        p_duplicate_member_id
    )
    order by m.id
    for update;

    select m.*
    into v_canonical_member
    from public.members m
    where m.id = p_canonical_member_id;

    if not found then
        raise exception
            'Canonical member % does not exist.',
            p_canonical_member_id
            using errcode = 'P0002';
    end if;

    select m.*
    into v_duplicate_member
    from public.members m
    where m.id = p_duplicate_member_id;

    if not found then
        raise exception
            'Duplicate member % does not exist.',
            p_duplicate_member_id
            using errcode = 'P0002';
    end if;

    if not public.can_manage_regional_member_merge(p_canonical_member_id, p_duplicate_member_id) then
        raise exception 'You may only merge eligible profiles within a region you lead.' using errcode = '42501';
    end if;

    insert into public.member_merges (
        canonical_member_id,
        duplicate_member_id,
        status,
        canonical_member_snapshot,
        duplicate_member_snapshot,
        notes,
        created_by_user_id
    )
    values (
        p_canonical_member_id,
        p_duplicate_member_id,
        'draft',
        to_jsonb(v_canonical_member),
        to_jsonb(v_duplicate_member),
        nullif(btrim(p_notes), ''),
        v_actor_user_id
    )
    returning *
    into v_merge;

    return v_merge;
end;
$$;

create or replace function public.load_member_merges()
returns table (
    merge_id uuid,
    status text,
    canonical_member_id uuid,
    canonical_pax_name text,
    canonical_region_name text,
    duplicate_member_id uuid,
    duplicate_pax_name text,
    duplicate_region_name text,
    plan_hash text,
    created_at timestamptz,
    validated_at timestamptz,
    ready_at timestamptz,
    completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_actor_user_id uuid;
begin
    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to access member merges.'
            using errcode = '42501';
    end if;



    return query
    select
        mm.id,
        mm.status,

        canonical.id,
        canonical.pax_name,
        canonical_region.name,

        duplicate.id,
        duplicate.pax_name,
        duplicate_region.name,

        mm.plan_hash,

        mm.created_at,
        mm.validated_at,
        mm.ready_at,
        mm.completed_at

    from public.member_merges mm

    join public.members canonical
        on canonical.id =
            mm.canonical_member_id

    join public.members duplicate
        on duplicate.id =
            mm.duplicate_member_id

    join public.regions canonical_region
        on canonical_region.id =
            canonical.region_id

    join public.regions duplicate_region
        on duplicate_region.id =
            duplicate.region_id

    where mm.status <> 'completed'
      and public.can_manage_regional_member_merge(mm.canonical_member_id, mm.duplicate_member_id)

    order by
        mm.created_at desc;
end;
$function$;

create or replace function public.load_member_merge(
    p_merge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_actor_user_id uuid;
    v_result jsonb;
begin
    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to access a member merge.'
            using errcode = '42501';
    end if;



    if p_merge_id is null then
        raise exception
            'Member merge ID is required.'
            using errcode = '22004';
    end if;

    select jsonb_build_object(
        'merge',
            to_jsonb(mm),

        'canonicalMember',
            to_jsonb(canonical),

        'duplicateMember',
            to_jsonb(duplicate),

        'canonicalRegion',
            canonical_region.name,

        'duplicateRegion',
            duplicate_region.name
    )
    into v_result

    from public.member_merges mm

    join public.members canonical
        on canonical.id =
            mm.canonical_member_id

    join public.members duplicate
        on duplicate.id =
            mm.duplicate_member_id

    join public.regions canonical_region
        on canonical_region.id =
            canonical.region_id

    join public.regions duplicate_region
        on duplicate_region.id =
            duplicate.region_id

    where mm.id = p_merge_id
      and public.can_manage_regional_member_merge(mm.canonical_member_id, mm.duplicate_member_id);

    if v_result is null then
        raise exception 'Member merge not found or not authorized.' using errcode = '42501';
    end if;

    return v_result;
end;
$function$;

create or replace function public.preview_member_merge(
    p_merge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_user_id uuid;
    v_merge public.member_merges%rowtype;

    v_canonical_member public.members%rowtype;
    v_duplicate_member public.members%rowtype;

    v_generated_at timestamptz;
    v_current_canonical_snapshot jsonb;
    v_current_duplicate_snapshot jsonb;

    v_canonical_snapshot_matches boolean;
    v_duplicate_snapshot_matches boolean;

    v_profiles jsonb;
    v_profile_classification text;
    v_profile_requires_decision boolean;

    v_affected_regions jsonb;
    v_q_slots jsonb;
    v_sessions jsonb;
    v_commitments jsonb;
    v_inviters jsonb;
    v_baselines jsonb;
    v_derived_data jsonb;
    v_reference_scans jsonb;
    v_execution_manifest jsonb;

    v_required_decisions jsonb;
    v_warnings jsonb;
    v_blockers jsonb;

    v_required_decision_count integer;
    v_warning_count integer;
    v_blocker_count integer;

    v_plan jsonb;
    v_preview_payload jsonb;
    v_plan_hash text;

    v_result jsonb;
begin
    -- =====================================================
    -- AUTHORIZATION
    -- =====================================================

    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to preview a member merge.'
            using errcode = '42501';
    end if;



    if p_merge_id is null then
        raise exception
            'Member merge ID is required.'
            using errcode = '22004';
    end if;

    -- =====================================================
    -- LOCK MERGE RECORD
    -- =====================================================

    select mm.*
    into v_merge
    from public.member_merges mm
    where mm.id = p_merge_id
    for update;

    if not found then
        raise exception
            'Member merge % does not exist.',
            p_merge_id
            using errcode = 'P0002';
    end if;

    -- Lock both member rows in a stable order before checking regional ownership.
    perform m.id
    from public.members m
    where m.id in (v_merge.canonical_member_id, v_merge.duplicate_member_id)
    order by m.id
    for update;

    if not public.can_manage_regional_member_merge(v_merge.canonical_member_id, v_merge.duplicate_member_id) then
        raise exception 'Member merge is outside your authorized region.' using errcode = '42501';
    end if;

    if v_merge.status not in (
        'draft',
        'validated'
    ) then
        raise exception
            'Member merge % cannot be previewed while its status is %.',
            p_merge_id,
            v_merge.status
            using errcode = '23514';
    end if;

    -- =====================================================
    -- CURRENT MEMBER ROWS
    -- =====================================================

    select m.*
    into v_canonical_member
    from public.members m
    where m.id = v_merge.canonical_member_id;

    if not found then
        raise exception
            'Canonical member % no longer exists.',
            v_merge.canonical_member_id
            using errcode = 'P0002';
    end if;

    select m.*
    into v_duplicate_member
    from public.members m
    where m.id = v_merge.duplicate_member_id;

    if not found then
        raise exception
            'Duplicate member % no longer exists.',
            v_merge.duplicate_member_id
            using errcode = 'P0002';
    end if;

    v_generated_at := statement_timestamp();

    v_current_canonical_snapshot :=
        to_jsonb(v_canonical_member);

    v_current_duplicate_snapshot :=
        to_jsonb(v_duplicate_member);

    v_canonical_snapshot_matches :=
        v_current_canonical_snapshot
            = v_merge.canonical_member_snapshot;

    v_duplicate_snapshot_matches :=
        v_current_duplicate_snapshot
            = v_merge.duplicate_member_snapshot;

    -- =====================================================
    -- PROFILE OWNERSHIP
    -- =====================================================

    with profile_rows as (
        select
            p.id,
            p.member_id,
            p.display_name,
            p.email,
            p.region_id,
            p.role
        from public.profiles p
        where p.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
    ),
    canonical_profile as (
        select
            jsonb_build_object(
                'id', pr.id,
                'memberId', pr.member_id,
                'displayName', pr.display_name,
                'email', pr.email,
                'regionId', pr.region_id,
                'role', pr.role
            ) as profile
        from profile_rows pr
        where pr.member_id =
            v_merge.canonical_member_id
        limit 1
    ),
    duplicate_profile as (
        select
            jsonb_build_object(
                'id', pr.id,
                'memberId', pr.member_id,
                'displayName', pr.display_name,
                'email', pr.email,
                'regionId', pr.region_id,
                'role', pr.role
            ) as profile
        from profile_rows pr
        where pr.member_id =
            v_merge.duplicate_member_id
        limit 1
    )
    select
        case
            when cp.profile is null
             and dp.profile is null
                then 'neither_claimed'

            when cp.profile is not null
             and dp.profile is null
                then 'canonical_only_claimed'

            when cp.profile is null
             and dp.profile is not null
                then 'duplicate_only_claimed'

            when cp.profile->>'id'
                = dp.profile->>'id'
                then 'both_same_profile'

            else 'both_different_profiles'
        end,

        case
            when cp.profile is not null
             and dp.profile is not null
             and cp.profile->>'id'
                <> dp.profile->>'id'
                then true

            when cp.profile is null
             and dp.profile is not null
                then true

            else false
        end,

        jsonb_build_object(
            'classification',
                case
                    when cp.profile is null
                     and dp.profile is null
                        then 'neither_claimed'

                    when cp.profile is not null
                     and dp.profile is null
                        then 'canonical_only_claimed'

                    when cp.profile is null
                     and dp.profile is not null
                        then 'duplicate_only_claimed'

                    when cp.profile->>'id'
                        = dp.profile->>'id'
                        then 'both_same_profile'

                    else 'both_different_profiles'
                end,

            'canonical',
                cp.profile,

            'duplicate',
                dp.profile,

            'requiresDecision',
                case
                    when cp.profile is not null
                     and dp.profile is not null
                     and cp.profile->>'id'
                        <> dp.profile->>'id'
                        then true

                    when cp.profile is null
                     and dp.profile is not null
                        then true

                    else false
                end
        )
    into
        v_profile_classification,
        v_profile_requires_decision,
        v_profiles
    from canonical_profile cp
    full join duplicate_profile dp
        on true;

    v_profiles := coalesce(
        v_profiles,
        jsonb_build_object(
            'classification',
            'neither_claimed',
            'canonical',
            null,
            'duplicate',
            null,
            'requiresDecision',
            false
        )
    );

    v_profile_classification :=
        coalesce(
            v_profile_classification,
            'neither_claimed'
        );

    v_profile_requires_decision :=
        coalesce(
            v_profile_requires_decision,
            false
        );

    -- =====================================================
    -- AFFECTED REGIONS
    -- =====================================================

    with region_sources as (
        select
            v_canonical_member.region_id
                as region_id,
            'canonical_home'
                as source

        union all

        select
            v_duplicate_member.region_id,
            'duplicate_home'

        union all

        select
            m.region_id,
            'member_invited_by'
        from public.members m
        where m.invited_by_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )

        union all

        select
            s.region_id,
            'session'
        from public.sessions s
        where
            (
                jsonb_typeof(s.attendee_ids) = 'array'
                and (
                    s.attendee_ids
                        @> jsonb_build_array(
                            v_merge.canonical_member_id::text
                        )
                    or
                    s.attendee_ids
                        @> jsonb_build_array(
                            v_merge.duplicate_member_id::text
                        )
                )
            )
            or s.q_id in (
                v_merge.canonical_member_id,
                v_merge.duplicate_member_id
            )
            or v_merge.canonical_member_id
                = any(coalesce(s.q_ids, '{}'::uuid[]))
            or v_merge.duplicate_member_id
                = any(coalesce(s.q_ids, '{}'::uuid[]))
            or exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.fngs) = 'array'
                            then s.fngs
                        else '[]'::jsonb
                    end
                ) fng
                where
                    fng->>'memberId' in (
                        v_merge.canonical_member_id::text,
                        v_merge.duplicate_member_id::text
                    )
                    or fng->>'member_id' in (
                        v_merge.canonical_member_id::text,
                        v_merge.duplicate_member_id::text
                    )
                    or fng->>'invitedById' in (
                        v_merge.canonical_member_id::text,
                        v_merge.duplicate_member_id::text
                    )
                    or fng->>'invited_by_id' in (
                        v_merge.canonical_member_id::text,
                        v_merge.duplicate_member_id::text
                    )
                    or (
                        jsonb_typeof(fng->'inviterIds') = 'array'
                        and (
                            (fng->'inviterIds') @> jsonb_build_array(
                                v_merge.canonical_member_id::text
                            )
                            or (fng->'inviterIds') @> jsonb_build_array(
                                v_merge.duplicate_member_id::text
                            )
                        )
                    )
            )
            or exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.unresolved_pax) = 'array'
                            then s.unresolved_pax
                        else '[]'::jsonb
                    end
                ) unresolved
                where
                    jsonb_typeof(unresolved->'candidateMemberIds') = 'array'
                    and (
                        (unresolved->'candidateMemberIds') @> jsonb_build_array(
                            v_merge.canonical_member_id::text
                        )
                        or (unresolved->'candidateMemberIds') @> jsonb_build_array(
                            v_merge.duplicate_member_id::text
                        )
                    )
            )

        union all

        select
            qs.region_id,
            'q_slot'
        from public.q_slots qs
        where qs.q_user_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )

        union all

        select
            qs.region_id,
            'commitment'
        from public.q_slot_commitments qsc
        join public.q_slots qs
            on qs.id = qsc.q_slot_id
        where qsc.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )

        union all

        select
            msb.region_id,
            'baseline'
        from public.member_stats_baselines msb
        where msb.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )

        union all

        select
            ms.region_id,
            'member_stats'
        from public.member_stats ms
        where ms.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )

        union all

        select
            ems.region_id,
            'effective_member_stats'
        from public.effective_member_stats ems
        where ems.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
    ),
    grouped_regions as (
        select
            rs.region_id,
            array_agg(
                distinct rs.source
                order by rs.source
            ) as sources
        from region_sources rs
        where rs.region_id is not null
        group by rs.region_id
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'regionId',
                    gr.region_id,

                'sources',
                    to_jsonb(gr.sources)
            )
            order by gr.region_id
        ),
        '[]'::jsonb
    )
    into v_affected_regions
    from grouped_regions gr;

    -- =====================================================
    -- Q-SLOT ASSIGNMENTS
    -- =====================================================

    with assignment_rows as (
        select
            qs.id,
            qs.region_id,
            qs.ao_id,
            qs.date,
            qs.start_time,
            qs.site_id,
            qs.q_user_id,
            case
                when qs.q_user_id =
                    v_merge.canonical_member_id
                    then 'canonical'
                else 'duplicate'
            end as identity
        from public.q_slots qs
        where qs.q_user_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
    )
    select jsonb_build_object(
        'canonicalAssignedCount',
            count(*) filter (
                where ar.identity = 'canonical'
            ),

        'duplicateAssignedCount',
            count(*) filter (
                where ar.identity = 'duplicate'
            ),

        'assignments',
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'qSlotId', ar.id,
                        'regionId', ar.region_id,
                        'aoId', ar.ao_id,
                        'date', ar.date,
                        'startTime', ar.start_time,
                        'siteId', ar.site_id,
                        'memberId', ar.q_user_id,
                        'identity', ar.identity
                    )
                    order by
                        ar.date,
                        ar.id
                ),
                '[]'::jsonb
            )
    )
    into v_q_slots
    from assignment_rows ar;

    -- =====================================================
    -- SESSION ANALYSIS
    -- =====================================================

    with session_flags as (
        select
            s.id,
            s.region_id,
            s.date,
            s.ao_id,
            s.ao_name,
            s.q_id,
            coalesce(s.q_ids, '{}'::uuid[])
                as q_ids,

            jsonb_typeof(s.attendee_ids)
                as attendee_json_type,

            jsonb_typeof(s.fngs)
                as fng_json_type,

            jsonb_typeof(s.unresolved_pax)
                as unresolved_json_type,

            case
                when jsonb_typeof(s.attendee_ids)
                    = 'array'
                then s.attendee_ids
                    @> jsonb_build_array(
                        v_merge.canonical_member_id::text
                    )
                else false
            end as canonical_attendee,

            case
                when jsonb_typeof(s.attendee_ids)
                    = 'array'
                then s.attendee_ids
                    @> jsonb_build_array(
                        v_merge.duplicate_member_id::text
                    )
                else false
            end as duplicate_attendee,

            (
                s.q_id =
                    v_merge.canonical_member_id
                or
                v_merge.canonical_member_id
                    = any(coalesce(s.q_ids, '{}'::uuid[]))
            ) as canonical_q,

            (
                s.q_id =
                    v_merge.duplicate_member_id
                or
                v_merge.duplicate_member_id
                    = any(coalesce(s.q_ids, '{}'::uuid[]))
            ) as duplicate_q,

            (
                s.q_id is not null
                and array_length(
                    coalesce(s.q_ids, '{}'::uuid[]),
                    1
                ) is not null
                and not (
                    s.q_id =
                    any(coalesce(s.q_ids, '{}'::uuid[]))
                )
            ) as q_mirror_inconsistent,

            exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.fngs) = 'array'
                            then s.fngs
                        else '[]'::jsonb
                    end
                ) fng
                where coalesce(
                    fng->>'memberId',
                    fng->>'member_id'
                ) = v_merge.canonical_member_id::text
            ) as canonical_fng,

            exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.fngs) = 'array'
                            then s.fngs
                        else '[]'::jsonb
                    end
                ) fng
                where coalesce(
                    fng->>'memberId',
                    fng->>'member_id'
                ) = v_merge.duplicate_member_id::text
            ) as duplicate_fng,

            exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.fngs) = 'array'
                            then s.fngs
                        else '[]'::jsonb
                    end
                ) fng
                where
                    coalesce(
                        fng->>'invitedById',
                        fng->>'invited_by_id'
                    ) = v_merge.canonical_member_id::text

                    or (
                        jsonb_typeof(fng->'inviterIds')
                            = 'array'
                        and (fng->'inviterIds')
                            @> jsonb_build_array(
                                v_merge.canonical_member_id::text
                            )
                    )
            ) as canonical_embedded_inviter,

            exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.fngs) = 'array'
                            then s.fngs
                        else '[]'::jsonb
                    end
                ) fng
                where
                    coalesce(
                        fng->>'invitedById',
                        fng->>'invited_by_id'
                    ) = v_merge.duplicate_member_id::text

                    or (
                        jsonb_typeof(fng->'inviterIds')
                            = 'array'
                        and (fng->'inviterIds')
                            @> jsonb_build_array(
                                v_merge.duplicate_member_id::text
                            )
                    )
            ) as duplicate_embedded_inviter,

            exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.unresolved_pax)
                            = 'array'
                            then s.unresolved_pax
                        else '[]'::jsonb
                    end
                ) unresolved
                where
                    jsonb_typeof(
                        unresolved->'candidateMemberIds'
                    ) = 'array'
                    and
                    unresolved->'candidateMemberIds'
                        @> jsonb_build_array(
                            v_merge.canonical_member_id::text
                        )
            ) as canonical_unresolved_candidate,

            exists (
                select 1
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.unresolved_pax)
                            = 'array'
                            then s.unresolved_pax
                        else '[]'::jsonb
                    end
                ) unresolved
                where
                    jsonb_typeof(
                        unresolved->'candidateMemberIds'
                    ) = 'array'
                    and
                    unresolved->'candidateMemberIds'
                        @> jsonb_build_array(
                            v_merge.duplicate_member_id::text
                        )
            ) as duplicate_unresolved_candidate,

            (
                select coalesce(
                    jsonb_agg(fng order by fng::text),
                    '[]'::jsonb
                )
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.fngs) = 'array'
                            then s.fngs
                        else '[]'::jsonb
                    end
                ) fng
                where
                    coalesce(
                        fng->>'memberId',
                        fng->>'member_id'
                    ) in (
                        v_merge.canonical_member_id::text,
                        v_merge.duplicate_member_id::text
                    )
                    or coalesce(
                        fng->>'invitedById',
                        fng->>'invited_by_id'
                    ) in (
                        v_merge.canonical_member_id::text,
                        v_merge.duplicate_member_id::text
                    )
                    or (
                        jsonb_typeof(fng->'inviterIds')
                            = 'array'
                        and (
                            (fng->'inviterIds')
                                @> jsonb_build_array(
                                    v_merge.canonical_member_id::text
                                )
                            or
                            (fng->'inviterIds')
                                @> jsonb_build_array(
                                    v_merge.duplicate_member_id::text
                                )
                        )
                    )
            ) as relevant_fngs,

            (
                select coalesce(
                    jsonb_agg(
                        unresolved
                        order by unresolved::text
                    ),
                    '[]'::jsonb
                )
                from jsonb_array_elements(
                    case
                        when jsonb_typeof(s.unresolved_pax)
                            = 'array'
                            then s.unresolved_pax
                        else '[]'::jsonb
                    end
                ) unresolved
                where
                    jsonb_typeof(
                        unresolved->'candidateMemberIds'
                    ) = 'array'
                    and (
                        unresolved->'candidateMemberIds'
                            @> jsonb_build_array(
                                v_merge.canonical_member_id::text
                            )
                        or
                        unresolved->'candidateMemberIds'
                            @> jsonb_build_array(
                                v_merge.duplicate_member_id::text
                            )
                    )
            ) as relevant_unresolved_pax
        from public.sessions s
    ),
    referenced_sessions as (
        select sf.*
        from session_flags sf
        where
            sf.canonical_attendee
            or sf.duplicate_attendee
            or sf.canonical_q
            or sf.duplicate_q
            or sf.canonical_fng
            or sf.duplicate_fng
            or sf.canonical_embedded_inviter
            or sf.duplicate_embedded_inviter
            or sf.canonical_unresolved_candidate
            or sf.duplicate_unresolved_candidate
    )
    select jsonb_build_object(
        'counts',
            jsonb_build_object(
                'canonicalReferenced',
                    count(*) filter (
                        where
                            rs.canonical_attendee
                            or rs.canonical_q
                            or rs.canonical_fng
                            or rs.canonical_embedded_inviter
                            or rs.canonical_unresolved_candidate
                    ),

                'duplicateReferenced',
                    count(*) filter (
                        where
                            rs.duplicate_attendee
                            or rs.duplicate_q
                            or rs.duplicate_fng
                            or rs.duplicate_embedded_inviter
                            or rs.duplicate_unresolved_candidate
                    ),

                'bothReferenced',
                    count(*) filter (
                        where
                            (
                                rs.canonical_attendee
                                or rs.canonical_q
                                or rs.canonical_fng
                                or rs.canonical_embedded_inviter
                                or rs.canonical_unresolved_candidate
                            )
                            and
                            (
                                rs.duplicate_attendee
                                or rs.duplicate_q
                                or rs.duplicate_fng
                                or rs.duplicate_embedded_inviter
                                or rs.duplicate_unresolved_candidate
                            )
                    ),

                'bothAttendees',
                    count(*) filter (
                        where
                            rs.canonical_attendee
                            and rs.duplicate_attendee
                    ),

                'bothQs',
                    count(*) filter (
                        where
                            rs.canonical_q
                            and rs.duplicate_q
                    ),

                'fngRoleConflicts',
                    count(*) filter (
                        where
                            (
                                rs.canonical_fng
                                and rs.duplicate_attendee
                            )
                            or
                            (
                                rs.duplicate_fng
                                and rs.canonical_attendee
                            )
                            or
                            (
                                rs.canonical_fng
                                and rs.duplicate_fng
                            )
                    ),

                'qMirrorInconsistent',
                    count(*) filter (
                        where rs.q_mirror_inconsistent
                    ),

                'malformedPayloadCount',
                    count(*) filter (
                        where
                            rs.attendee_json_type
                                is distinct from 'array'
                            or
                            rs.fng_json_type
                                is distinct from 'array'
                            or (
                                rs.unresolved_json_type
                                    is not null
                                and rs.unresolved_json_type
                                    is distinct from 'array'
                            )
                    )
            ),

        'rows',
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'sessionId', rs.id,
                        'regionId', rs.region_id,
                        'date', rs.date,
                        'aoId', rs.ao_id,
                        'aoName', rs.ao_name,

                        'currentQId', rs.q_id,
                        'currentQIds',
                            to_jsonb(rs.q_ids),

                        'canonical',
                            jsonb_build_object(
                                'attendee',
                                    rs.canonical_attendee,

                                'q',
                                    rs.canonical_q,

                                'fng',
                                    rs.canonical_fng,

                                'embeddedInviter',
                                    rs.canonical_embedded_inviter,

                                'unresolvedCandidate',
                                    rs.canonical_unresolved_candidate
                            ),

                        'duplicate',
                            jsonb_build_object(
                                'attendee',
                                    rs.duplicate_attendee,

                                'q',
                                    rs.duplicate_q,

                                'fng',
                                    rs.duplicate_fng,

                                'embeddedInviter',
                                    rs.duplicate_embedded_inviter,

                                'unresolvedCandidate',
                                    rs.duplicate_unresolved_candidate
                            ),

                        'qMirrorInconsistent',
                            rs.q_mirror_inconsistent,

                        'fngRoleConflict',
                            (
                                rs.canonical_fng
                                and rs.duplicate_attendee
                            )
                            or
                            (
                                rs.duplicate_fng
                                and rs.canonical_attendee
                            )
                            or
                            (
                                rs.canonical_fng
                                and rs.duplicate_fng
                            ),

                        'payloadTypes',
                            jsonb_build_object(
                                'attendeeIds',
                                    rs.attendee_json_type,

                                'fngs',
                                    rs.fng_json_type,

                                'unresolvedPax',
                                    rs.unresolved_json_type
                            ),

                        'relevantFngs',
                            rs.relevant_fngs,

                        'relevantUnresolvedPax',
                            rs.relevant_unresolved_pax
                    )
                    order by
                        rs.region_id,
                        rs.date,
                        rs.id
                ),
                '[]'::jsonb
            )
    )
    into v_sessions
    from referenced_sessions rs;

    -- =====================================================
    -- Q-SLOT COMMITMENTS
    -- =====================================================

    with canonical_commitments as (
        select
            qsc.*,
            qs.region_id,
            qs.ao_id,
            qs.date,
            qs.site_id,
            qs.start_time
        from public.q_slot_commitments qsc
        join public.q_slots qs
            on qs.id = qsc.q_slot_id
        where qsc.member_id =
            v_merge.canonical_member_id
    ),
    duplicate_commitments as (
        select
            qsc.*,
            qs.region_id,
            qs.ao_id,
            qs.date,
            qs.site_id,
            qs.start_time
        from public.q_slot_commitments qsc
        join public.q_slots qs
            on qs.id = qsc.q_slot_id
        where qsc.member_id =
            v_merge.duplicate_member_id
    ),
    slot_ids as (
        select cc.q_slot_id
        from canonical_commitments cc

        union

        select dc.q_slot_id
        from duplicate_commitments dc
    )
    select jsonb_build_object(
        'canonicalOnly',
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'commitmentId', cc.id,
                        'qSlotId', cc.q_slot_id,
                        'regionId', cc.region_id,
                        'aoId', cc.ao_id,
                        'date', cc.date,
                        'siteId', cc.site_id,
                        'startTime', cc.start_time,
                        'commitmentType',
                            cc.commitment_type,
                        'source', cc.source,
                        'createdBy', cc.created_by,
                        'updatedBy', cc.updated_by,
                        'createdAt', cc.created_at,
                        'updatedAt', cc.updated_at
                    )
                    order by
                        cc.date,
                        cc.q_slot_id
                ) filter (
                    where
                        cc.id is not null
                        and dc.id is null
                ),
                '[]'::jsonb
            ),

        'duplicateOnly',
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'commitmentId', dc.id,
                        'qSlotId', dc.q_slot_id,
                        'regionId', dc.region_id,
                        'aoId', dc.ao_id,
                        'date', dc.date,
                        'siteId', dc.site_id,
                        'startTime', dc.start_time,
                        'commitmentType',
                            dc.commitment_type,
                        'source', dc.source,
                        'createdBy', dc.created_by,
                        'updatedBy', dc.updated_by,
                        'createdAt', dc.created_at,
                        'updatedAt', dc.updated_at
                    )
                    order by
                        dc.date,
                        dc.q_slot_id
                ) filter (
                    where
                        dc.id is not null
                        and cc.id is null
                ),
                '[]'::jsonb
            ),

        'sameSlotCollisions',
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'qSlotId', si.q_slot_id,
                        'regionId',
                            coalesce(
                                cc.region_id,
                                dc.region_id
                            ),
                        'aoId',
                            coalesce(
                                cc.ao_id,
                                dc.ao_id
                            ),
                        'date',
                            coalesce(
                                cc.date,
                                dc.date
                            ),

                        'canonical',
                            jsonb_build_object(
                                'commitmentId', cc.id,
                                'commitmentType',
                                    cc.commitment_type,
                                'source', cc.source,
                                'createdBy', cc.created_by,
                                'updatedBy', cc.updated_by,
                                'createdAt', cc.created_at,
                                'updatedAt', cc.updated_at
                            ),

                        'duplicate',
                            jsonb_build_object(
                                'commitmentId', dc.id,
                                'commitmentType',
                                    dc.commitment_type,
                                'source', dc.source,
                                'createdBy', dc.created_by,
                                'updatedBy', dc.updated_by,
                                'createdAt', dc.created_at,
                                'updatedAt', dc.updated_at
                            ),

                        'typeConflict',
                            cc.commitment_type
                                is distinct from
                            dc.commitment_type,

                        'sourceConflict',
                            cc.source
                                is distinct from
                            dc.source
                    )
                    order by
                        coalesce(cc.date, dc.date),
                        si.q_slot_id
                ) filter (
                    where
                        cc.id is not null
                        and dc.id is not null
                ),
                '[]'::jsonb
            ),

        'collisionCount',
            count(*) filter (
                where
                    cc.id is not null
                    and dc.id is not null
            )
    )
    into v_commitments
    from slot_ids si
    left join canonical_commitments cc
        on cc.q_slot_id = si.q_slot_id
    left join duplicate_commitments dc
        on dc.q_slot_id = si.q_slot_id;

    -- =====================================================
    -- INVITER GRAPH
    -- =====================================================

    with relevant_edges as (
        select
            mi.member_id,
            mi.inviter_member_id,
            mi.source,
            mi.source_metadata,
            mi.created_at,

            case
                when mi.member_id =
                    v_merge.duplicate_member_id
                    then v_merge.canonical_member_id
                else mi.member_id
            end as rewritten_member_id,

            case
                when mi.inviter_member_id =
                    v_merge.duplicate_member_id
                    then v_merge.canonical_member_id
                else mi.inviter_member_id
            end as rewritten_inviter_member_id
        from public.member_inviters mi
        where
            mi.member_id in (
                v_merge.canonical_member_id,
                v_merge.duplicate_member_id
            )
            or
            mi.inviter_member_id in (
                v_merge.canonical_member_id,
                v_merge.duplicate_member_id
            )
    ),
    classified_edges as (
        select
            re.*,

            (
                re.rewritten_member_id
                    = re.rewritten_inviter_member_id
            ) as creates_self_edge,

            exists (
                select 1
                from public.member_inviters existing
                where
                    existing.member_id =
                        re.rewritten_member_id
                    and existing.inviter_member_id =
                        re.rewritten_inviter_member_id
                    and (
                        existing.member_id,
                        existing.inviter_member_id
                    ) <> (
                        re.member_id,
                        re.inviter_member_id
                    )
            ) as target_edge_exists
        from relevant_edges re
    )
    select jsonb_build_object(
        'canonicalInvitedById',
            v_canonical_member.invited_by_id,

        'duplicateInvitedById',
            v_duplicate_member.invited_by_id,

        'scalarMirrorConflict',
            v_canonical_member.invited_by_id
                is distinct from
            v_duplicate_member.invited_by_id,

        'edges',
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'memberId', ce.member_id,
                        'inviterMemberId',
                            ce.inviter_member_id,
                        'source', ce.source,
                        'sourceMetadata',
                            ce.source_metadata,
                        'createdAt', ce.created_at,

                        'rewrittenMemberId',
                            ce.rewritten_member_id,

                        'rewrittenInviterMemberId',
                            ce.rewritten_inviter_member_id,

                        'createsSelfEdge',
                            ce.creates_self_edge,

                        'targetEdgeExists',
                            ce.target_edge_exists
                    )
                    order by
                        ce.member_id,
                        ce.inviter_member_id
                ),
                '[]'::jsonb
            ),

        'createsSelfEdgeCount',
            count(*) filter (
                where ce.creates_self_edge
            ),

        'targetCollisionCount',
            count(*) filter (
                where ce.target_edge_exists
            )
    )
    into v_inviters
    from classified_edges ce;

    -- =====================================================
    -- BASELINES
    -- =====================================================

    with canonical_rows as (
        select msb.*
        from public.member_stats_baselines msb
        where msb.member_id =
            v_merge.canonical_member_id
    ),
    duplicate_rows as (
        select msb.*
        from public.member_stats_baselines msb
        where msb.member_id =
            v_merge.duplicate_member_id
    ),
    exact_collisions as (
        select
            cr.id as canonical_baseline_id,
            dr.id as duplicate_baseline_id,
            cr.region_id,
            cr.source,
            cr.baseline_date,
            to_jsonb(cr) as canonical_row,
            to_jsonb(dr) as duplicate_row
        from canonical_rows cr
        join duplicate_rows dr
            on dr.region_id = cr.region_id
           and dr.source = cr.source
           and dr.baseline_date =
                cr.baseline_date
    )
    select jsonb_build_object(
        'canonicalRows',
            coalesce(
                (
                    select jsonb_agg(
                        to_jsonb(cr)
                        order by
                            cr.region_id,
                            cr.source,
                            cr.baseline_date,
                            cr.id
                    )
                    from canonical_rows cr
                ),
                '[]'::jsonb
            ),

        'duplicateRows',
            coalesce(
                (
                    select jsonb_agg(
                        to_jsonb(dr)
                        order by
                            dr.region_id,
                            dr.source,
                            dr.baseline_date,
                            dr.id
                    )
                    from duplicate_rows dr
                ),
                '[]'::jsonb
            ),

        'exactKeyCollisions',
            coalesce(
                (
                    select jsonb_agg(
                        jsonb_build_object(
                            'canonicalBaselineId',
                                ec.canonical_baseline_id,

                            'duplicateBaselineId',
                                ec.duplicate_baseline_id,

                            'regionId',
                                ec.region_id,

                            'source',
                                ec.source,

                            'baselineDate',
                                ec.baseline_date,

                            'canonical',
                                ec.canonical_row,

                            'duplicate',
                                ec.duplicate_row
                        )
                        order by
                            ec.region_id,
                            ec.source,
                            ec.baseline_date,
                            ec.canonical_baseline_id,
                            ec.duplicate_baseline_id
                    )
                    from exact_collisions ec
                ),
                '[]'::jsonb
            ),

        'exactKeyCollisionCount',
            (
                select count(*)
                from exact_collisions
            ),

        'sameRegionDifferentKeyCount',
            (
                select count(*)
                from canonical_rows cr
                join duplicate_rows dr
                    on dr.region_id = cr.region_id
                   and (
                        dr.source,
                        dr.baseline_date
                   ) <> (
                        cr.source,
                        cr.baseline_date
                   )
            )
    )
    into v_baselines;

    -- =====================================================
    -- DERIVED DATA
    -- =====================================================

    with member_stats_regions as (
        select distinct ms.region_id
        from public.member_stats ms
        where ms.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
    ),
    effective_stats_regions as (
        select distinct ems.region_id
        from public.effective_member_stats ems
        where ems.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
    ),
    rebuild_regions as (
        select region_id
        from member_stats_regions

        union

        select region_id
        from effective_stats_regions

        union

        select
            (region_item->>'regionId')::uuid
        from jsonb_array_elements(
            v_affected_regions
        ) region_item
    )
    select jsonb_build_object(
        'memberStatsRegions',
            coalesce(
                (
                    select jsonb_agg(
                        msr.region_id
                        order by msr.region_id
                    )
                    from member_stats_regions msr
                ),
                '[]'::jsonb
            ),

        'effectiveStatsRegions',
            coalesce(
                (
                    select jsonb_agg(
                        esr.region_id
                        order by esr.region_id
                    )
                    from effective_stats_regions esr
                ),
                '[]'::jsonb
            ),

        'rebuildRegions',
            coalesce(
                (
                    select jsonb_agg(
                        rr.region_id
                        order by rr.region_id
                    )
                    from rebuild_regions rr
                ),
                '[]'::jsonb
            ),

        'memberStatsPolicy',
            'rebuild',

        'effectiveStatsPolicy',
            'rebuild_owner_unconfirmed'
    )
    into v_derived_data;

    -- =====================================================
    -- SECONDARY REFERENCE SCANS
    -- =====================================================

    select jsonb_build_object(
        'adminFlags',
            jsonb_build_object(
                'matchedMemberIdsCount',
                    (
                        select count(*)
                        from public.admin_flags af
                        where
                            v_merge.canonical_member_id
                                = any(
                                    coalesce(
                                        af.matched_member_ids,
                                        '{}'::uuid[]
                                    )
                                )
                            or
                            v_merge.duplicate_member_id
                                = any(
                                    coalesce(
                                        af.matched_member_ids,
                                        '{}'::uuid[]
                                    )
                                )
                    )
            ),

        'thangCandidates',
            jsonb_build_object(
                'sourceQIdsCount',
                    (
                        select count(*)
                        from public.thang_candidates tc
                        where
                            v_merge.canonical_member_id
                                = any(
                                    coalesce(
                                        tc.source_q_ids,
                                        '{}'::uuid[]
                                    )
                                )
                            or
                            v_merge.duplicate_member_id
                                = any(
                                    coalesce(
                                        tc.source_q_ids,
                                        '{}'::uuid[]
                                    )
                                )
                    )
            ),

        'thangLibraryItems',
            jsonb_build_object(
                'sourceQIdsCount',
                    (
                        select count(*)
                        from public.thang_library_items tli
                        where
                            v_merge.canonical_member_id
                                = any(
                                    coalesce(
                                        tli.source_q_ids,
                                        '{}'::uuid[]
                                    )
                                )
                            or
                            v_merge.duplicate_member_id
                                = any(
                                    coalesce(
                                        tli.source_q_ids,
                                        '{}'::uuid[]
                                    )
                                )
                    )
            ),

        'memberChangeAudit',
            jsonb_build_object(
                'canonicalRowCount',
                    (
                        select count(*)
                        from public.member_change_audit mca
                        where mca.member_id =
                            v_merge.canonical_member_id
                    ),

                'duplicateRowCount',
                    (
                        select count(*)
                        from public.member_change_audit mca
                        where mca.member_id =
                            v_merge.duplicate_member_id
                    ),

                'policy',
                    'preserve_historical_reference'
            ),

        'offlineSnapshots',
            jsonb_build_object(
                'policy',
                    'invalidate_or_refresh_after_execution',

                'databaseEnumerable',
                    false
            )
    )
    into v_reference_scans;

    v_execution_manifest :=
        public.build_member_merge_execution_manifest(
            v_merge.id
        );

    -- =====================================================
    -- REQUIRED DECISIONS
    -- =====================================================

    v_required_decisions := '[]'::jsonb;

    if v_profile_requires_decision then
        v_required_decisions :=
            v_required_decisions ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'profile_owner',

                    'scopeType',
                        'profile',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'classification',
                                v_profile_classification,

                            'canonicalProfile',
                                v_profiles->'canonical',

                            'duplicateProfile',
                                v_profiles->'duplicate'
                        )
                )
            );
    end if;

    if coalesce(
        (v_commitments->>'collisionCount')::integer,
        0
    ) > 0 then
        v_required_decisions :=
            v_required_decisions ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'commitment_collision',

                    'scopeType',
                        'q_slot_commitments',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'collisionCount',
                                (
                                    v_commitments
                                        ->>'collisionCount'
                                )::integer
                        )
                )
            );
    end if;

    if coalesce(
        (
            v_baselines
                ->>'exactKeyCollisionCount'
        )::integer,
        0
    ) > 0 then
        v_required_decisions :=
            v_required_decisions ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'baseline_exact_key_collision',

                    'scopeType',
                        'member_stats_baselines',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'collisionCount',
                                (
                                    v_baselines
                                        ->>'exactKeyCollisionCount'
                                )::integer
                        )
                )
            );
    end if;

    if coalesce(
        (
            v_baselines
                ->>'sameRegionDifferentKeyCount'
        )::integer,
        0
    ) > 0 then
        v_required_decisions :=
            v_required_decisions ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'baseline_semantic_review',

                    'scopeType',
                        'member_stats_baselines',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'candidateCount',
                                (
                                    v_baselines
                                        ->>'sameRegionDifferentKeyCount'
                                )::integer
                        )
                )
            );
    end if;

    if coalesce(
        (
            v_inviters
                ->>'createsSelfEdgeCount'
        )::integer,
        0
    ) > 0 then
        v_required_decisions :=
            v_required_decisions ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'inviter_self_edge',

                    'scopeType',
                        'member_inviters',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'edgeCount',
                                (
                                    v_inviters
                                        ->>'createsSelfEdgeCount'
                                )::integer
                        )
                )
            );
    end if;

    if coalesce(
        (
            v_sessions
                ->'counts'
                ->>'fngRoleConflicts'
        )::integer,
        0
    ) > 0 then
        v_required_decisions :=
            v_required_decisions ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'session_fng_role_conflict',

                    'scopeType',
                        'session',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'sessionCount',
                                (
                                    v_sessions
                                        ->'counts'
                                        ->>'fngRoleConflicts'
                                )::integer
                        )
                )
            );
    end if;

    -- Deterministic ordering for decision objects.
    select coalesce(
        jsonb_agg(
            decision
            order by
                decision->>'code',
                decision->>'scopeType',
                decision->>'scopeId'
        ),
        '[]'::jsonb
    )
    into v_required_decisions
    from jsonb_array_elements(
        v_required_decisions
    ) decision;

    -- =====================================================
    -- WARNINGS
    -- =====================================================

    v_warnings := '[]'::jsonb;

    if not v_canonical_snapshot_matches then
        v_warnings :=
            v_warnings ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'canonical_member_snapshot_drift',

                    'scopeType',
                        'member',

                    'scopeId',
                        v_merge.canonical_member_id,

                    'details',
                        jsonb_build_object(
                            'originalSnapshot',
                                v_merge.canonical_member_snapshot,

                            'currentSnapshot',
                                v_current_canonical_snapshot
                        )
                )
            );
    end if;

    if not v_duplicate_snapshot_matches then
        v_warnings :=
            v_warnings ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'duplicate_member_snapshot_drift',

                    'scopeType',
                        'member',

                    'scopeId',
                        v_merge.duplicate_member_id,

                    'details',
                        jsonb_build_object(
                            'originalSnapshot',
                                v_merge.duplicate_member_snapshot,

                            'currentSnapshot',
                                v_current_duplicate_snapshot
                        )
                )
            );
    end if;

    if coalesce(
        (
            v_sessions
                ->'counts'
                ->>'qMirrorInconsistent'
        )::integer,
        0
    ) > 0 then
        v_warnings :=
            v_warnings ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'session_q_mirror_inconsistent',

                    'scopeType',
                        'session',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'sessionCount',
                                (
                                    v_sessions
                                        ->'counts'
                                        ->>'qMirrorInconsistent'
                                )::integer
                        )
                )
            );
    end if;

    if jsonb_array_length(
        coalesce(
            v_derived_data
                ->'effectiveStatsRegions',
            '[]'::jsonb
        )
    ) > 0 then
        v_warnings :=
            v_warnings ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'effective_stats_rebuild_owner_unconfirmed',

                    'scopeType',
                        'effective_member_stats',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'regions',
                                v_derived_data
                                    ->'effectiveStatsRegions'
                        )
                )
            );
    end if;

    select coalesce(
        jsonb_agg(
            warning
            order by
                warning->>'code',
                warning->>'scopeType',
                warning->>'scopeId'
        ),
        '[]'::jsonb
    )
    into v_warnings
    from jsonb_array_elements(
        v_warnings
    ) warning;

    -- =====================================================
    -- BLOCKERS
    -- =====================================================

    v_blockers := '[]'::jsonb;

    if coalesce(
        (
            v_sessions
                ->'counts'
                ->>'malformedPayloadCount'
        )::integer,
        0
    ) > 0 then
        v_blockers :=
            v_blockers ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'malformed_session_payload',

                    'scopeType',
                        'session',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'sessionCount',
                                (
                                    v_sessions
                                        ->'counts'
                                        ->>'malformedPayloadCount'
                                )::integer
                        )
                )
            );
    end if;

    if coalesce(
        (
            v_execution_manifest
                ->'integrity'
                ->>'fngDualKeyConflictCount'
        )::integer,
        0
    ) > 0 then
        v_blockers :=
            v_blockers ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'fng_dual_key_conflict',

                    'scopeType',
                        'session',

                    'scopeId',
                        v_merge.id,

                    'details',
                        jsonb_build_object(
                            'conflictCount',
                                (
                                    v_execution_manifest
                                        ->'integrity'
                                        ->>'fngDualKeyConflictCount'
                                )::integer,

                            'conflicts',
                                v_execution_manifest
                                    ->'integrity'
                                    ->'fngDualKeyConflicts'
                        )
                )
            );
    end if;

    if coalesce(
        (
            v_execution_manifest
                ->'integrity'
                ->>'memberInviterSelfReferenceCount'
        )::integer,
        0
    ) > 0 then
        v_blockers :=
            v_blockers ||
            jsonb_build_array(
                jsonb_build_object(
                    'code',
                        'member_inviter_scalar_self_reference',
                    'scopeType',
                        'members.invited_by_id',
                    'scopeId',
                        v_merge.id,
                    'details',
                        jsonb_build_object(
                            'rowCount',
                                (
                                    v_execution_manifest
                                        ->'integrity'
                                        ->>'memberInviterSelfReferenceCount'
                                )::integer
                        )
                )
            );
    end if;

    select coalesce(
        jsonb_agg(
            blocker
            order by
                blocker->>'code',
                blocker->>'scopeType',
                blocker->>'scopeId'
        ),
        '[]'::jsonb
    )
    into v_blockers
    from jsonb_array_elements(
        v_blockers
    ) blocker;

    -- =====================================================
    -- READINESS COUNTS
    -- =====================================================

    v_required_decision_count :=
        jsonb_array_length(v_required_decisions);

    v_warning_count :=
        jsonb_array_length(v_warnings);

    v_blocker_count :=
        jsonb_array_length(v_blockers);

    -- =====================================================
    -- DETERMINISTIC HASHED PLAN
    -- =====================================================

    v_plan := jsonb_build_object(
        'planVersion',
            v_merge.plan_version,

        'mergeId',
            v_merge.id,

        'canonicalMemberId',
            v_merge.canonical_member_id,

        'duplicateMemberId',
            v_merge.duplicate_member_id,

        'members',
            jsonb_build_object(
                'canonical',
                    jsonb_build_object(
                        'snapshot',
                            v_merge.canonical_member_snapshot,

                        'currentSnapshot',
                            v_current_canonical_snapshot,

                        'currentMatchesSnapshot',
                            v_canonical_snapshot_matches
                    ),

                'duplicate',
                    jsonb_build_object(
                        'snapshot',
                            v_merge.duplicate_member_snapshot,

                        'currentSnapshot',
                            v_current_duplicate_snapshot,

                        'currentMatchesSnapshot',
                            v_duplicate_snapshot_matches
                    )
            ),

        'affectedRegions',
            v_affected_regions,

        'profiles',
            v_profiles,

        'sessions',
            v_sessions,

        'qSlots',
            v_q_slots,

        'commitments',
            v_commitments,

        'inviters',
            v_inviters,

        'baselines',
            v_baselines,

        'derivedData',
            v_derived_data,

        'referenceScans',
            v_reference_scans,

        'executionManifest',
            v_execution_manifest,

        'requiredDecisions',
            v_required_decisions,

        'warnings',
            v_warnings,

        'blockers',
            v_blockers,

        'readiness',
            jsonb_build_object(
                'analysisComplete',
                    true,

                'readyForApproval',
                    (
                        v_required_decision_count = 0
                        and v_warning_count = 0
                        and v_blocker_count = 0
                    ),

                'requiredDecisionCount',
                    v_required_decision_count,

                'warningCount',
                    v_warning_count,

                'blockerCount',
                    v_blocker_count
            )
    );

    v_plan_hash :=
        pg_catalog.encode(
            extensions.digest(
                pg_catalog.convert_to(
                    v_plan::text,
                    'UTF8'
                ),
                'sha256'
            ),
            'hex'
        );

    v_preview_payload :=
        jsonb_build_object(
            'planVersion',
                v_merge.plan_version,

            'mergeId',
                v_merge.id,

            'generatedAt',
                v_generated_at,

            'plan',
                v_plan
        );

    -- =====================================================
    -- STORE PREVIEW
    -- =====================================================

    update public.member_merges mm
    set
        preview_payload =
            v_preview_payload,

        plan_hash =
            v_plan_hash,

        preview_generated_at =
            v_generated_at,

        validated_at =
            v_generated_at,

        status =
            'validated',

        failure_code =
            null,

        failure_message =
            null,

        failed_at =
            null
    where mm.id = v_merge.id;

    -- =====================================================
    -- RETURN
    -- =====================================================

    v_result := jsonb_build_object(
        'mergeId',
            v_merge.id,

        'status',
            'validated',

        'planVersion',
            v_merge.plan_version,

        'planHash',
            v_plan_hash,

        'previewPayload',
            v_preview_payload
    );

    return v_result;
end;
$$;

create or replace function public.mark_member_merge_ready(
    p_merge_id uuid,
    p_expected_plan_hash text
)
returns public.member_merges
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_user_id uuid;
    v_merge public.member_merges%rowtype;
    v_ready_merge public.member_merges%rowtype;

    v_expected_plan_hash text;
    v_stored_plan_hash text;
    v_fresh_preview_result jsonb;
    v_fresh_plan_hash text;
    v_plan jsonb;
    v_readiness jsonb;

    v_analysis_complete boolean;
    v_ready_for_approval boolean;
    v_required_decision_count integer;
    v_warning_count integer;
    v_blocker_count integer;

    v_plan_merge_id uuid;
    v_plan_canonical_member_id uuid;
    v_plan_duplicate_member_id uuid;
    v_plan_version integer;
begin
    -- =====================================================
    -- AUTHORIZATION
    -- =====================================================

    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to mark a member merge ready.'
            using errcode = '42501';
    end if;



    -- =====================================================
    -- INPUT VALIDATION
    -- =====================================================

    if p_merge_id is null then
        raise exception
            'Member merge ID is required.'
            using errcode = '22004';
    end if;

    v_expected_plan_hash :=
        lower(nullif(btrim(p_expected_plan_hash), ''));

    if v_expected_plan_hash is null then
        raise exception
            'Expected member merge plan hash is required.'
            using errcode = '22004';
    end if;

    if v_expected_plan_hash !~ '^[0-9a-f]{64}$' then
        raise exception
            'Expected member merge plan hash must be a 64-character SHA-256 hexadecimal value.'
            using errcode = '22023';
    end if;

    -- =====================================================
    -- LOCK MERGE RECORD
    -- =====================================================

    select mm.*
    into v_merge
    from public.member_merges mm
    where mm.id = p_merge_id
    for update;

    if not found then
        raise exception
            'Member merge % does not exist.',
            p_merge_id
            using errcode = 'P0002';
    end if;

    -- Lock both member rows in a stable order before checking regional ownership.
    perform m.id
    from public.members m
    where m.id in (v_merge.canonical_member_id, v_merge.duplicate_member_id)
    order by m.id
    for update;

    if not public.can_manage_regional_member_merge(v_merge.canonical_member_id, v_merge.duplicate_member_id) then
        raise exception 'Member merge is outside your authorized region.' using errcode = '42501';
    end if;

    if v_merge.status <> 'validated' then
        raise exception
            'Member merge % cannot be marked ready while its status is %.',
            p_merge_id,
            v_merge.status
            using errcode = '23514';
    end if;

    -- =====================================================
    -- STORED PLAN CONTRACT
    -- =====================================================

    if v_merge.preview_payload is null
       or jsonb_typeof(v_merge.preview_payload) <> 'object' then
        raise exception
            'Member merge % does not have a valid stored preview payload.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_merge.preview_generated_at is null
       or v_merge.validated_at is null then
        raise exception
            'Member merge % does not have complete validation provenance.',
            p_merge_id
            using errcode = '23514';
    end if;

    v_stored_plan_hash :=
        lower(nullif(btrim(v_merge.plan_hash), ''));

    if v_stored_plan_hash is null
       or v_stored_plan_hash !~ '^[0-9a-f]{64}$' then
        raise exception
            'Member merge % does not have a valid stored SHA-256 plan hash.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_stored_plan_hash <> v_expected_plan_hash then
        raise exception
            'Expected plan hash does not match the currently stored plan for member merge %.',
            p_merge_id
            using errcode = '40001',
                  detail = format(
                      'Expected %s but stored plan hash is %s.',
                      v_expected_plan_hash,
                      v_stored_plan_hash
                  ),
                  hint = 'Refresh and review the latest preview before approving this merge.';
    end if;

    if v_merge.plan_version <> 1 then
        raise exception
            'Member merge % uses unsupported plan version %.',
            p_merge_id,
            v_merge.plan_version
            using errcode = '0A000';
    end if;

    -- =====================================================
    -- REGENERATE CURRENT PLAN
    --
    -- preview_member_merge() is the current authoritative
    -- deterministic planner. Calling it here refreshes the plan
    -- under this transaction. Any later exception rolls back its
    -- member_merges update, so stale approval cannot survive.
    -- =====================================================

    v_fresh_preview_result :=
        public.preview_member_merge(p_merge_id);

    v_fresh_plan_hash :=
        lower(
            nullif(
                btrim(
                    v_fresh_preview_result->>'planHash'
                ),
                ''
            )
        );

    if v_fresh_plan_hash is null
       or v_fresh_plan_hash !~ '^[0-9a-f]{64}$' then
        raise exception
            'Regenerated member merge % preview did not return a valid plan hash.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_fresh_plan_hash <> v_stored_plan_hash
       or v_fresh_plan_hash <> v_expected_plan_hash then
        raise exception
            'Member merge % source data changed after the reviewed preview.',
            p_merge_id
            using errcode = '40001',
                  detail = format(
                      'Reviewed/stored hash %s; regenerated hash %s.',
                      v_stored_plan_hash,
                      v_fresh_plan_hash
                  ),
                  hint = 'Run preview_member_merge again, review the changed plan, and approve using the new hash.';
    end if;

    -- Reload the row written by the fresh preview.
    select mm.*
    into v_merge
    from public.member_merges mm
    where mm.id = p_merge_id
    for update;

    if v_merge.status <> 'validated' then
        raise exception
            'Member merge % did not remain validated after plan regeneration.',
            p_merge_id
            using errcode = '23514';
    end if;

    if lower(btrim(v_merge.plan_hash)) <> v_expected_plan_hash then
        raise exception
            'Stored member merge plan hash changed unexpectedly during approval.'
            using errcode = '40001';
    end if;

    -- =====================================================
    -- PLAN IDENTITY AND READINESS
    -- =====================================================

    v_plan := v_merge.preview_payload->'plan';

    if v_plan is null
       or jsonb_typeof(v_plan) <> 'object' then
        raise exception
            'Member merge % preview does not contain a valid plan object.',
            p_merge_id
            using errcode = '23514';
    end if;

    if jsonb_typeof(v_plan->'executionManifest') <> 'object' then
        raise exception
            'Member merge % plan does not contain an execution manifest.',
            p_merge_id
            using errcode = '23514';
    end if;

    begin
        v_plan_merge_id :=
            (v_plan->>'mergeId')::uuid;

        v_plan_canonical_member_id :=
            (v_plan->>'canonicalMemberId')::uuid;

        v_plan_duplicate_member_id :=
            (v_plan->>'duplicateMemberId')::uuid;

        v_plan_version :=
            (v_plan->>'planVersion')::integer;
    exception
        when invalid_text_representation
          or numeric_value_out_of_range then
            raise exception
                'Member merge % plan identity metadata is malformed.',
                p_merge_id
                using errcode = '23514';
    end;

    if v_plan_merge_id is distinct from v_merge.id
       or v_plan_canonical_member_id
            is distinct from v_merge.canonical_member_id
       or v_plan_duplicate_member_id
            is distinct from v_merge.duplicate_member_id
       or v_plan_version is distinct from v_merge.plan_version then
        raise exception
            'Member merge % plan identity does not match its durable merge record.',
            p_merge_id
            using errcode = '23514';
    end if;

    v_readiness := v_plan->'readiness';

    if v_readiness is null
       or jsonb_typeof(v_readiness) <> 'object' then
        raise exception
            'Member merge % plan does not contain valid readiness metadata.',
            p_merge_id
            using errcode = '23514';
    end if;

    begin
        v_analysis_complete :=
            (v_readiness->>'analysisComplete')::boolean;

        v_ready_for_approval :=
            (v_readiness->>'readyForApproval')::boolean;

        v_required_decision_count :=
            (v_readiness->>'requiredDecisionCount')::integer;

        v_warning_count :=
            (v_readiness->>'warningCount')::integer;

        v_blocker_count :=
            (v_readiness->>'blockerCount')::integer;
    exception
        when invalid_text_representation
          or numeric_value_out_of_range then
            raise exception
                'Member merge % readiness metadata is malformed.',
                p_merge_id
                using errcode = '23514';
    end;

    if v_analysis_complete is distinct from true then
        raise exception
            'Member merge % analysis is not complete.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_ready_for_approval is distinct from true then
        raise exception
            'Member merge % is not ready for approval.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(v_required_decision_count, -1) <> 0 then
        raise exception
            'Member merge % still has % required decisions.',
            p_merge_id,
            v_required_decision_count
            using errcode = '23514';
    end if;

    if coalesce(v_warning_count, -1) <> 0 then
        raise exception
            'Member merge % still has % warnings. Version-one approval requires zero warnings.',
            p_merge_id,
            v_warning_count
            using errcode = '23514';
    end if;

    if coalesce(v_blocker_count, -1) <> 0 then
        raise exception
            'Member merge % still has % blockers.',
            p_merge_id,
            v_blocker_count
            using errcode = '23514';
    end if;

    if jsonb_array_length(
        coalesce(v_plan->'requiredDecisions', '[]'::jsonb)
    ) <> 0 then
        raise exception
            'Member merge % required-decision rows do not match its readiness summary.',
            p_merge_id
            using errcode = '23514';
    end if;

    if jsonb_array_length(
        coalesce(v_plan->'warnings', '[]'::jsonb)
    ) <> 0 then
        raise exception
            'Member merge % warning rows do not match its readiness summary.',
            p_merge_id
            using errcode = '23514';
    end if;

    if jsonb_array_length(
        coalesce(v_plan->'blockers', '[]'::jsonb)
    ) <> 0 then
        raise exception
            'Member merge % blocker rows do not match its readiness summary.',
            p_merge_id
            using errcode = '23514';
    end if;

    -- =====================================================
    -- MARK READY
    --
    -- The existing member_merges lifecycle trigger populates
    -- ready_at on the validated -> ready transition.
    -- =====================================================

    update public.member_merges mm
    set
        status = 'ready',
        ready_by_user_id = v_actor_user_id,
        failure_code = null,
        failure_message = null,
        failed_at = null
    where mm.id = p_merge_id
      and mm.status = 'validated'
    returning mm.*
    into v_ready_merge;

    if not found then
        raise exception
            'Member merge % changed status during approval.',
            p_merge_id
            using errcode = '40001';
    end if;

    return v_ready_merge;
end;
$$;

create or replace function public.execute_member_merge(
    p_merge_id uuid,
    p_expected_plan_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_user_id uuid;
    v_merge public.member_merges%rowtype;

    v_canonical_member public.members%rowtype;
    v_duplicate_member public.members%rowtype;

    v_approved_plan jsonb;
    v_approved_manifest jsonb;
    v_current_manifest jsonb;

    v_operation jsonb;
    v_region_id uuid;

    v_profile_update_count integer := 0;
    v_region_access_insert_count integer := 0;
    v_member_inviter_update_count integer := 0;
    v_session_update_count integer := 0;
    v_q_slot_update_count integer := 0;
    v_commitment_update_count integer := 0;
    v_inviter_edge_update_count integer := 0;
    v_baseline_update_count integer := 0;
    v_admin_flag_update_count integer := 0;
    v_thang_candidate_update_count integer := 0;
    v_thang_library_update_count integer := 0;
    v_stats_region_count integer := 0;

    v_postcondition_count integer;
    v_completed_at timestamptz;

    v_result jsonb;
begin
    -- =====================================================
    -- AUTHORIZATION
    -- =====================================================

    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to execute a member merge.'
            using errcode = '42501';
    end if;



    if p_merge_id is null then
        raise exception
            'Member merge ID is required.'
            using errcode = '22004';
    end if;

    if nullif(btrim(p_expected_plan_hash), '') is null then
        raise exception
            'Expected approved plan hash is required.'
            using errcode = '22004';
    end if;

    -- Prevent concurrent execution attempts for this merge.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            p_merge_id::text,
            0
        )
    );

    -- =====================================================
    -- LOCK MERGE RECORD
    -- =====================================================

    select mm.*
    into v_merge
    from public.member_merges mm
    where mm.id = p_merge_id
    for update;

    if not found then
        raise exception
            'Member merge % does not exist.',
            p_merge_id
            using errcode = 'P0002';
    end if;

    -- Lock both member rows in a stable order before checking regional ownership.
    perform m.id
    from public.members m
    where m.id in (v_merge.canonical_member_id, v_merge.duplicate_member_id)
    order by m.id
    for update;

    if not public.can_manage_regional_member_merge(v_merge.canonical_member_id, v_merge.duplicate_member_id) then
        raise exception 'Member merge is outside your authorized region.' using errcode = '42501';
    end if;

    if v_merge.status <> 'ready' then
        raise exception
            'Member merge % cannot be executed while its status is %. Expected ready.',
            p_merge_id,
            v_merge.status
            using errcode = '23514';
    end if;

    if v_merge.preview_payload is null then
        raise exception
            'Member merge % has no stored preview payload.',
            p_merge_id
            using errcode = '23514';
    end if;

    if nullif(btrim(v_merge.plan_hash), '') is null then
        raise exception
            'Member merge % has no stored plan hash.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_merge.plan_hash <> btrim(p_expected_plan_hash) then
        raise exception
            'Expected plan hash does not match the approved plan hash for member merge %.',
            p_merge_id
            using errcode = '40001';
    end if;

    -- =====================================================
    -- APPROVED PLAN CONTRACT
    -- =====================================================

    v_approved_plan :=
        v_merge.preview_payload->'plan';

    if v_approved_plan is null
       or jsonb_typeof(v_approved_plan) <> 'object' then
        raise exception
            'Member merge % has an invalid stored plan.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_approved_plan->>'mergeId' is distinct from v_merge.id::text then
        raise exception
            'Stored plan merge ID does not match member merge %.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_approved_plan->>'canonicalMemberId'
        is distinct from v_merge.canonical_member_id::text then
        raise exception
            'Stored plan canonical member ID does not match member merge %.',
            p_merge_id
            using errcode = '23514';
    end if;

    if v_approved_plan->>'duplicateMemberId'
        is distinct from v_merge.duplicate_member_id::text then
        raise exception
            'Stored plan duplicate member ID does not match member merge %.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_approved_plan
                ->'readiness'
                ->>'analysisComplete'
        )::boolean,
        false
    ) is not true then
        raise exception
            'Approved member merge plan % is not marked analysis-complete.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_approved_plan
                ->'readiness'
                ->>'readyForApproval'
        )::boolean,
        false
    ) is not true then
        raise exception
            'Approved member merge plan % is not marked ready for approval.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_approved_plan
                ->'readiness'
                ->>'requiredDecisionCount'
        )::integer,
        -1
    ) <> 0 then
        raise exception
            'Member merge % has unresolved required decisions.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_approved_plan
                ->'readiness'
                ->>'warningCount'
        )::integer,
        -1
    ) <> 0 then
        raise exception
            'Member merge % has unresolved warnings.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_approved_plan
                ->'readiness'
                ->>'blockerCount'
        )::integer,
        -1
    ) <> 0 then
        raise exception
            'Member merge % has unresolved blockers.',
            p_merge_id
            using errcode = '23514';
    end if;

    v_approved_manifest :=
        v_approved_plan->'executionManifest';

    if v_approved_manifest is null
       or jsonb_typeof(v_approved_manifest) <> 'object' then
        raise exception
            'Member merge % has no valid approved execution manifest.',
            p_merge_id
            using errcode = '23514';
    end if;

        if coalesce(
        (v_approved_manifest->>'manifestVersion')::integer,
        0
    ) <> 1 then
        raise exception
            'Member merge % uses unsupported execution manifest version %.',
            p_merge_id,
            v_approved_manifest->>'manifestVersion'
            using errcode = '0A000';
    end if;

    if jsonb_typeof(
        v_approved_manifest
            ->'operations'
            ->'duplicateRetirement'
    ) <> 'object' then
        raise exception
            'Member merge % has no valid duplicate retirement operation.',
            p_merge_id
            using errcode = '23514';
    end if;

    if (
        v_approved_manifest
            ->'operations'
            ->'duplicateRetirement'
            ->>'rowId'
    ) is distinct from v_merge.duplicate_member_id::text then
        raise exception
            'Member merge % duplicate retirement row does not match duplicate member %.',
            p_merge_id,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    if (
        v_approved_manifest
            ->'operations'
            ->'duplicateRetirement'
            ->'after'
            ->>'status'
    ) is distinct from 'inactive' then
        raise exception
            'Member merge % duplicate retirement does not target inactive status.',
            p_merge_id
            using errcode = '23514';
    end if;

    -- =====================================================
    -- LOCK BOTH MEMBER ROWS
    -- =====================================================

    perform 1
    from public.members m
    where m.id in (
        v_merge.canonical_member_id,
        v_merge.duplicate_member_id
    )
    order by m.id
    for update;

    select m.*
    into v_canonical_member
    from public.members m
    where m.id = v_merge.canonical_member_id;

    if not found then
        raise exception
            'Canonical member % no longer exists.',
            v_merge.canonical_member_id
            using errcode = 'P0002';
    end if;

    select m.*
    into v_duplicate_member
    from public.members m
    where m.id = v_merge.duplicate_member_id;

    if not found then
        raise exception
            'Duplicate member % no longer exists.',
            v_merge.duplicate_member_id
            using errcode = 'P0002';
    end if;

    -- The approved preview required these current rows to match
    -- the immutable snapshots. Recheck immediately before work.
    if to_jsonb(v_canonical_member)
        is distinct from v_merge.canonical_member_snapshot then
        raise exception
            'Canonical member % changed after merge approval.',
            v_merge.canonical_member_id
            using errcode = '40001';
    end if;

    if to_jsonb(v_duplicate_member)
        is distinct from v_merge.duplicate_member_snapshot then
        raise exception
            'Duplicate member % changed after merge approval.',
            v_merge.duplicate_member_id
            using errcode = '40001';
    end if;

    -- Lock all operational rows represented by this merge before
    -- regenerating the manifest.
    perform 1
    from public.profiles p
    where p.member_id in (
        v_merge.canonical_member_id,
        v_merge.duplicate_member_id
    )
    order by p.id
    for update;

    perform 1
    from public.sessions s
    where
        (
            jsonb_typeof(s.attendee_ids) = 'array'
            and (
                s.attendee_ids @> jsonb_build_array(
                    v_merge.canonical_member_id::text
                )
                or
                s.attendee_ids @> jsonb_build_array(
                    v_merge.duplicate_member_id::text
                )
            )
        )
        or s.q_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
        or v_merge.canonical_member_id = any(
            coalesce(s.q_ids, '{}'::uuid[])
        )
        or v_merge.duplicate_member_id = any(
            coalesce(s.q_ids, '{}'::uuid[])
        )
        or exists (
            select 1
            from jsonb_array_elements(
                case
                    when jsonb_typeof(s.fngs) = 'array'
                        then s.fngs
                    else '[]'::jsonb
                end
            ) fng
            where
                fng->>'memberId' in (
                    v_merge.canonical_member_id::text,
                    v_merge.duplicate_member_id::text
                )
                or fng->>'member_id' in (
                    v_merge.canonical_member_id::text,
                    v_merge.duplicate_member_id::text
                )
                or fng->>'invitedById' in (
                    v_merge.canonical_member_id::text,
                    v_merge.duplicate_member_id::text
                )
                or fng->>'invited_by_id' in (
                    v_merge.canonical_member_id::text,
                    v_merge.duplicate_member_id::text
                )
                or (
                    jsonb_typeof(fng->'inviterIds') = 'array'
                    and (
                        (fng->'inviterIds') @> jsonb_build_array(
                            v_merge.canonical_member_id::text
                        )
                        or
                        (fng->'inviterIds') @> jsonb_build_array(
                            v_merge.duplicate_member_id::text
                        )
                    )
                )
        )
        or exists (
            select 1
            from jsonb_array_elements(
                case
                    when jsonb_typeof(s.unresolved_pax) = 'array'
                        then s.unresolved_pax
                    else '[]'::jsonb
                end
            ) unresolved
            where
                jsonb_typeof(
                    unresolved->'candidateMemberIds'
                ) = 'array'
                and (
                    (unresolved->'candidateMemberIds')
                        @> jsonb_build_array(
                            v_merge.canonical_member_id::text
                        )
                    or
                    (unresolved->'candidateMemberIds')
                        @> jsonb_build_array(
                            v_merge.duplicate_member_id::text
                        )
                )
        )
    order by s.id
    for update;

    perform 1
    from public.q_slots qs
    where qs.q_user_id in (
        v_merge.canonical_member_id,
        v_merge.duplicate_member_id
    )
    order by qs.id
    for update;

    perform 1
    from public.q_slot_commitments qsc
    where qsc.member_id in (
        v_merge.canonical_member_id,
        v_merge.duplicate_member_id
    )
    order by qsc.id
    for update;

    perform 1
    from public.member_stats_baselines msb
    where msb.member_id in (
        v_merge.canonical_member_id,
        v_merge.duplicate_member_id
    )
    order by msb.id
    for update;

    perform 1
    from public.admin_flags af
    where
        v_merge.canonical_member_id = any(
            coalesce(af.matched_member_ids, '{}'::uuid[])
        )
        or
        v_merge.duplicate_member_id = any(
            coalesce(af.matched_member_ids, '{}'::uuid[])
        )
    order by af.id
    for update;

    perform 1
    from public.thang_candidates tc
    where
        v_merge.canonical_member_id = any(
            coalesce(tc.source_q_ids, '{}'::uuid[])
        )
        or
        v_merge.duplicate_member_id = any(
            coalesce(tc.source_q_ids, '{}'::uuid[])
        )
    order by tc.id
    for update;

    perform 1
    from public.thang_library_items tli
    where
        v_merge.canonical_member_id = any(
            coalesce(tli.source_q_ids, '{}'::uuid[])
        )
        or
        v_merge.duplicate_member_id = any(
            coalesce(tli.source_q_ids, '{}'::uuid[])
        )
    order by tli.id
    for update;

        -- Clean-v1 does not support inviter-edge collisions.
    --
    -- Detect any existing edge that would have the same
    -- composite key after duplicate IDs are rewritten to the
    -- canonical ID.
    if exists (
        select 1
        from public.member_inviters source_edge
        join public.member_inviters target_edge
          on target_edge.member_id =
                case
                    when source_edge.member_id =
                        v_merge.duplicate_member_id
                        then v_merge.canonical_member_id
                    else source_edge.member_id
                end

         and target_edge.inviter_member_id =
                case
                    when source_edge.inviter_member_id =
                        v_merge.duplicate_member_id
                        then v_merge.canonical_member_id
                    else source_edge.inviter_member_id
                end

         and (
                target_edge.member_id,
                target_edge.inviter_member_id
             ) <> (
                source_edge.member_id,
                source_edge.inviter_member_id
             )

        where source_edge.member_id =
                v_merge.duplicate_member_id
           or source_edge.inviter_member_id =
                v_merge.duplicate_member_id
    ) then
        raise exception
            'Member merge % contains inviter-edge target collisions.',
            p_merge_id
            using errcode = '23514';
    end if;

    -- =====================================================
    -- REGENERATE APPROVED MANIFEST
    -- =====================================================

    v_current_manifest :=
        public.build_member_merge_execution_manifest(
            v_merge.id
        );

    if v_current_manifest is distinct from v_approved_manifest then
        raise exception
            'Member merge % changed after approval. Generate and approve a new preview.',
            p_merge_id
            using errcode = '40001';
    end if;

    -- Clean-v1 integrity requirements.
    if coalesce(
        (
            v_current_manifest
                ->'integrity'
                ->>'fngDualKeyConflictCount'
        )::integer,
        -1
    ) <> 0 then
        raise exception
            'Member merge % contains FNG dual-key conflicts.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_current_manifest
                ->'integrity'
                ->>'memberInviterSelfReferenceCount'
        )::integer,
        -1
    ) <> 0 then
        raise exception
            'Member merge % would create a scalar inviter self-reference.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_current_manifest
                ->'integrity'
                ->>'commitmentTargetCollisionCount'
        )::integer,
        -1
    ) <> 0 then
        raise exception
            'Member merge % contains commitment target collisions.',
            p_merge_id
            using errcode = '23514';
    end if;

    if coalesce(
        (
            v_current_manifest
                ->'integrity'
                ->>'baselineTargetCollisionCount'
        )::integer,
        -1
    ) <> 0 then
        raise exception
            'Member merge % contains baseline target collisions.',
            p_merge_id
            using errcode = '23514';
    end if;

    -- effective_member_stats currently has no known rebuild owner.
    -- Clean-v1 merges require no rows for either identity.
    if exists (
        select 1
        from public.effective_member_stats ems
        where ems.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
    ) then
        raise exception
            'Member merge % cannot execute while effective_member_stats contains rows for either identity.',
            p_merge_id
            using errcode = '0A000';
    end if;

    -- =====================================================
    -- MARK RUNNING
    -- =====================================================

    update public.member_merges mm
    set
        status = 'running',
        executed_by_user_id = v_actor_user_id,
        execution_started_at = statement_timestamp(),
        completed_at = null,
        failed_at = null,
        failure_code = null,
        failure_message = null
    where mm.id = v_merge.id;

    -- =====================================================
    -- PRESERVE REGIONAL ACCESS
    --
    -- Profiles attached to either identity receive access
    -- to both original member regions before profile member
    -- IDs are rewritten to the canonical identity.
    -- =====================================================

    with linked_profiles as (
        select distinct
            p.id as user_id
        from public.profiles p
        where p.member_id in (
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        )
    ),

    merged_regions as (

        select distinct region_id
        from (

            select region_id
            from public.region_access
            where user_id in (
                select id
                from public.profiles
                where member_id in (
                    v_merge.canonical_member_id,
                    v_merge.duplicate_member_id
                )
            )

            union

            select v_canonical_member.region_id

            union

            select v_duplicate_member.region_id

        ) x
        where region_id is not null
    ),

    inserted_access as (
        insert into public.region_access (
            user_id,
            region_id
        )
        select
            linked_profiles.user_id,
            merged_regions.region_id
        from linked_profiles
        cross join merged_regions
        on conflict (user_id, region_id)
        do nothing
        returning 1
            )

    select count(*)
    into v_region_access_insert_count
    from inserted_access;

    -- =====================================================
    -- PROFILE OWNERSHIP
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'profileUpdates',
                '[]'::jsonb
            )
        )
    loop
        update public.profiles p
        set member_id =
            (
                v_operation
                    ->'after'
                    ->>'memberId'
            )::uuid
        where p.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved profile row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_profile_update_count :=
            v_profile_update_count + 1;
    end loop;

    -- =====================================================
    -- MEMBERS.INVITED_BY_ID
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'memberInviterUpdates',
                '[]'::jsonb
            )
        )
    loop
        if coalesce(
            (
                v_operation
                    ->>'createsSelfReference'
            )::boolean,
            false
        ) then
            raise exception
                'Approved scalar inviter update for member % would create a self-reference.',
                v_operation->>'rowId'
                using errcode = '23514';
        end if;

        update public.members m
        set invited_by_id =
            (
                v_operation
                    ->'after'
                    ->>'invitedById'
            )::uuid
        where m.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved member inviter row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_member_inviter_update_count :=
            v_member_inviter_update_count + 1;
    end loop;

    -- =====================================================
    -- SESSIONS
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'sessionUpdates',
                '[]'::jsonb
            )
        )
    loop
        update public.sessions s
        set
            attendee_ids =
                v_operation
                    ->'after'
                    ->'attendeeIds',

            q_id =
                nullif(
                    v_operation
                        ->'after'
                        ->>'qId',
                    ''
                )::uuid,

            q_ids =
                case
                    when jsonb_typeof(
                        v_operation
                            ->'after'
                            ->'qIds'
                    ) = 'array'
                    then array(
                        select value::uuid
                        from jsonb_array_elements_text(
                            v_operation
                                ->'after'
                                ->'qIds'
                        ) as item(value)
                    )
                    else null
                end,

            fngs =
                v_operation
                    ->'after'
                    ->'fngs',

            unresolved_pax =
                v_operation
                    ->'after'
                    ->'unresolvedPax'

        where s.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved session row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_session_update_count :=
            v_session_update_count + 1;
    end loop;

    -- =====================================================
    -- Q-SLOT ASSIGNMENTS
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'qSlotUpdates',
                '[]'::jsonb
            )
        )
    loop
        update public.q_slots qs
        set q_user_id =
            (
                v_operation
                    ->'after'
                    ->>'qUserId'
            )::uuid
        where qs.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved Q-slot row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_q_slot_update_count :=
            v_q_slot_update_count + 1;
    end loop;

    -- =====================================================
    -- Q-SLOT COMMITMENTS
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'commitmentUpdates',
                '[]'::jsonb
            )
        )
    loop
        if coalesce(
            (
                v_operation
                    ->>'targetExists'
            )::boolean,
            false
        ) then
            raise exception
                'Approved commitment row % has a target collision.',
                v_operation->>'rowId'
                using errcode = '23514';
        end if;

        update public.q_slot_commitments qsc
        set member_id =
            (
                v_operation
                    ->'after'
                    ->>'memberId'
            )::uuid
        where qsc.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved commitment row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_commitment_update_count :=
            v_commitment_update_count + 1;
    end loop;

    -- =====================================================
    -- INVITER EDGES
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'inviterEdgeUpdates',
                '[]'::jsonb
            )
        )
    loop
        update public.member_inviters mi
        set
            member_id =
                (
                    v_operation
                        ->'after'
                        ->>'memberId'
                )::uuid,

            inviter_member_id =
                (
                    v_operation
                        ->'after'
                        ->>'inviterMemberId'
                )::uuid

        where mi.member_id =
            (
                v_operation
                    ->'rowKey'
                    ->>'memberId'
            )::uuid

          and mi.inviter_member_id =
            (
                v_operation
                    ->'rowKey'
                    ->>'inviterMemberId'
            )::uuid;

        if not found then
            raise exception
                'Approved inviter edge (%, %) no longer exists.',
                v_operation->'rowKey'->>'memberId',
                v_operation->'rowKey'->>'inviterMemberId'
                using errcode = '40001';
        end if;

        v_inviter_edge_update_count :=
            v_inviter_edge_update_count + 1;
    end loop;

    -- =====================================================
    -- MEMBER STATS BASELINES
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'baselineUpdates',
                '[]'::jsonb
            )
        )
    loop
        if coalesce(
            (
                v_operation
                    ->>'targetExists'
            )::boolean,
            false
        ) then
            raise exception
                'Approved baseline row % has a target collision.',
                v_operation->>'rowId'
                using errcode = '23514';
        end if;

        update public.member_stats_baselines msb
        set member_id =
            (
                v_operation
                    ->'after'
                    ->>'member_id'
            )::uuid
        where msb.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved stats baseline row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_baseline_update_count :=
            v_baseline_update_count + 1;
    end loop;

    -- =====================================================
    -- ADMIN FLAGS
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'adminFlagUpdates',
                '[]'::jsonb
            )
        )
    loop
        update public.admin_flags af
        set matched_member_ids =
            case
                when jsonb_typeof(
                    v_operation
                        ->'after'
                        ->'matchedMemberIds'
                ) = 'array'
                then array(
                    select value::uuid
                    from jsonb_array_elements_text(
                        v_operation
                            ->'after'
                            ->'matchedMemberIds'
                    ) as item(value)
                )
                else null
            end
        where af.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved admin flag row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_admin_flag_update_count :=
            v_admin_flag_update_count + 1;
    end loop;

    -- =====================================================
    -- THANG CANDIDATES
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'thangCandidateUpdates',
                '[]'::jsonb
            )
        )
    loop
        update public.thang_candidates tc
        set source_q_ids =
            case
                when jsonb_typeof(
                    v_operation
                        ->'after'
                        ->'sourceQIds'
                ) = 'array'
                then array(
                    select value::uuid
                    from jsonb_array_elements_text(
                        v_operation
                            ->'after'
                            ->'sourceQIds'
                    ) as item(value)
                )
                else null
            end
        where tc.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved thang candidate row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_thang_candidate_update_count :=
            v_thang_candidate_update_count + 1;
    end loop;

    -- =====================================================
    -- THANG LIBRARY ITEMS
    -- =====================================================

    for v_operation in
        select value
        from jsonb_array_elements(
            coalesce(
                v_approved_manifest
                    ->'operations'
                    ->'thangLibraryItemUpdates',
                '[]'::jsonb
            )
        )
    loop
        update public.thang_library_items tli
        set source_q_ids =
            case
                when jsonb_typeof(
                    v_operation
                        ->'after'
                        ->'sourceQIds'
                ) = 'array'
                then array(
                    select value::uuid
                    from jsonb_array_elements_text(
                        v_operation
                            ->'after'
                            ->'sourceQIds'
                    ) as item(value)
                )
                else null
            end
        where tli.id =
            (
                v_operation
                    ->>'rowId'
            )::uuid;

        if not found then
            raise exception
                'Approved thang library item row % no longer exists.',
                v_operation->>'rowId'
                using errcode = '40001';
        end if;

        v_thang_library_update_count :=
            v_thang_library_update_count + 1;
    end loop;

        -- =====================================================
    -- REBUILD REGION-SCOPED MEMBER STATS
    --
    -- rebuildRegions is a JSON array of UUID strings.
    --
    -- Do not combine or sum member_stats rows. Remove all
    -- affected derived rows for both identities, then rebuild
    -- the canonical identity independently in each region.
    -- =====================================================

    delete from public.member_stats ms
    where ms.member_id in (
        v_merge.canonical_member_id,
        v_merge.duplicate_member_id
    )
      and ms.region_id in (
        select region_id_text::uuid
        from jsonb_array_elements_text(
            coalesce(
                v_approved_plan
                    ->'derivedData'
                    ->'rebuildRegions',
                '[]'::jsonb
            )
        ) as rebuild_region(region_id_text)
    );

    for v_region_id in
        select region_id_text::uuid
        from jsonb_array_elements_text(
            coalesce(
                v_approved_plan
                    ->'derivedData'
                    ->'rebuildRegions',
                '[]'::jsonb
            )
        ) as rebuild_region(region_id_text)
        order by region_id_text::uuid
    loop
        perform public.rebuild_member_stats_for_member(
            v_region_id,
            v_merge.canonical_member_id
        );

        v_stats_region_count :=
            v_stats_region_count + 1;
    end loop;

    -- =====================================================
    -- RETIRE DUPLICATE
    -- =====================================================

    update public.members m
    set status =
        v_approved_manifest
            ->'operations'
            ->'duplicateRetirement'
            ->'after'
            ->>'status'
    where m.id =
        (
            v_approved_manifest
                ->'operations'
                ->'duplicateRetirement'
                ->>'rowId'
        )::uuid;

    if not found then
        raise exception
            'Duplicate member % could not be retired.',
            v_merge.duplicate_member_id
            using errcode = '40001';
    end if;

    -- =====================================================
    -- POSTCONDITIONS
    -- =====================================================

    if (
        select m.status
        from public.members m
        where m.id = v_merge.duplicate_member_id
    ) is distinct from 'inactive' then
        raise exception
            'Duplicate member % was not retired as inactive.',
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.profiles p
    where p.member_id = v_merge.duplicate_member_id;

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % profiles still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

   /*
    * Every profile now attached to the canonical member
    * must have access to both original member regions.
    */

    select count(*)
    into v_postcondition_count
    from public.profiles p
    cross join (
        values
            (v_canonical_member.region_id),
            (v_duplicate_member.region_id)
    ) as required_regions(region_id)
    where p.member_id =
            v_merge.canonical_member_id
    and required_regions.region_id is not null
    and not exists (
        select 1
        from public.region_access ra
        where ra.user_id = p.id
            and ra.region_id =
                required_regions.region_id
    );

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % required profile-region access grants are missing.',
            v_postcondition_count
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.members m
    where m.invited_by_id = v_merge.duplicate_member_id;

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % members still reference duplicate inviter %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.sessions s
    where
        (
            jsonb_typeof(s.attendee_ids) = 'array'
            and s.attendee_ids @> jsonb_build_array(
                v_merge.duplicate_member_id::text
            )
        )
        or s.q_id = v_merge.duplicate_member_id
        or v_merge.duplicate_member_id = any(
            coalesce(s.q_ids, '{}'::uuid[])
        )
        or exists (
            select 1
            from jsonb_array_elements(
                case
                    when jsonb_typeof(s.fngs) = 'array'
                        then s.fngs
                    else '[]'::jsonb
                end
            ) fng
            where
                fng->>'memberId' =
                    v_merge.duplicate_member_id::text
                or
                fng->>'member_id' =
                    v_merge.duplicate_member_id::text
                or
                fng->>'invitedById' =
                    v_merge.duplicate_member_id::text
                or
                fng->>'invited_by_id' =
                    v_merge.duplicate_member_id::text
                or (
                    jsonb_typeof(fng->'inviterIds') = 'array'
                    and (fng->'inviterIds')
                        @> jsonb_build_array(
                            v_merge.duplicate_member_id::text
                        )
                )
        )
        or exists (
            select 1
            from jsonb_array_elements(
                case
                    when jsonb_typeof(s.unresolved_pax) = 'array'
                        then s.unresolved_pax
                    else '[]'::jsonb
                end
            ) unresolved
            where
                jsonb_typeof(
                    unresolved->'candidateMemberIds'
                ) = 'array'
                and
                (unresolved->'candidateMemberIds')
                    @> jsonb_build_array(
                        v_merge.duplicate_member_id::text
                    )
        );

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % sessions still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.q_slots qs
    where qs.q_user_id = v_merge.duplicate_member_id;

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % Q slots still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.q_slot_commitments qsc
    where qsc.member_id = v_merge.duplicate_member_id;

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % commitments still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.member_inviters mi
    where mi.member_id = v_merge.duplicate_member_id
       or mi.inviter_member_id = v_merge.duplicate_member_id;

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % inviter edges still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.member_stats_baselines msb
    where msb.member_id = v_merge.duplicate_member_id;

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % stats baselines still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.admin_flags af
    where v_merge.duplicate_member_id = any(
        coalesce(af.matched_member_ids, '{}'::uuid[])
    );

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % admin flags still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.thang_candidates tc
    where v_merge.duplicate_member_id = any(
        coalesce(tc.source_q_ids, '{}'::uuid[])
    );

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % thang candidates still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.thang_library_items tli
    where v_merge.duplicate_member_id = any(
        coalesce(tli.source_q_ids, '{}'::uuid[])
    );

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % thang library items still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.member_stats ms
    where ms.member_id = v_merge.duplicate_member_id;

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: % member_stats rows still reference duplicate member %.',
            v_postcondition_count,
            v_merge.duplicate_member_id
            using errcode = '23514';
    end if;

    select count(*)
    into v_postcondition_count
    from public.effective_member_stats ems
    where ems.member_id in (
        v_merge.canonical_member_id,
        v_merge.duplicate_member_id
    );

    if v_postcondition_count <> 0 then
        raise exception
            'Postcondition failed: effective_member_stats contains % rows for the merged identities.',
            v_postcondition_count
            using errcode = '23514';
    end if;

    -- Regenerating the manifest now should show no remaining
    -- production rewrite operations. Duplicate retirement is
    -- expected to show inactive as both current and target.
    v_current_manifest :=
        public.build_member_merge_execution_manifest(
            v_merge.id
        );

    if jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'profileUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'memberInviterUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'sessionUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'qSlotUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'commitmentUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'inviterEdgeUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'baselineUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'adminFlagUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'thangCandidateUpdates',
            '[]'::jsonb
        )
    ) <> 0
    or jsonb_array_length(
        coalesce(
            v_current_manifest
                ->'operations'
                ->'thangLibraryItemUpdates',
            '[]'::jsonb
        )
    ) <> 0 then
        raise exception
            'Postcondition failed: member merge % still has pending manifest operations.',
            p_merge_id
            using errcode = '23514';
    end if;

    -- =====================================================
    -- COMPLETE
    -- =====================================================

    v_completed_at := statement_timestamp();

    update public.member_merges mm
    set
        status = 'completed',
        completed_at = v_completed_at,
        failed_at = null,
        failure_code = null,
        failure_message = null
    where mm.id = v_merge.id;

    v_result := jsonb_build_object(
        'mergeId',
            v_merge.id,

        'status',
            'completed',

        'planHash',
            v_merge.plan_hash,

        'canonicalMemberId',
            v_merge.canonical_member_id,

        'duplicateMemberId',
            v_merge.duplicate_member_id,

        'completedAt',
            v_completed_at,

        'operationCounts',
            jsonb_build_object(
                'profileUpdates',
                    v_profile_update_count,

                'regionAccessInserted',
                    v_region_access_insert_count,

                'memberInviterUpdates',
                    v_member_inviter_update_count,

                'sessionUpdates',
                    v_session_update_count,

                'qSlotUpdates',
                    v_q_slot_update_count,

                'commitmentUpdates',
                    v_commitment_update_count,

                'inviterEdgeUpdates',
                    v_inviter_edge_update_count,

                'baselineUpdates',
                    v_baseline_update_count,

                'adminFlagUpdates',
                    v_admin_flag_update_count,

                'thangCandidateUpdates',
                    v_thang_candidate_update_count,

                'thangLibraryItemUpdates',
                    v_thang_library_update_count,

                'statsRegionsRebuilt',
                    v_stats_region_count
            )
    );

    return v_result;
end;
$$;

comment on function public.create_member_merge_draft(uuid, uuid, text) is 'Creates a member merge draft for superadmin or authorized same-region leadership.';
comment on function public.load_member_merges() is 'Lists member merges visible to superadmin or authorized regional leadership.';
comment on function public.load_member_merge(uuid) is 'Loads a member merge visible to superadmin or authorized regional leadership.';
comment on function public.preview_member_merge(uuid) is 'Previews a member merge for superadmin or authorized regional leadership.';
comment on function public.mark_member_merge_ready(uuid, text) is 'Approves a member merge for superadmin or authorized regional leadership.';
comment on function public.execute_member_merge(uuid, text) is 'Executes an approved member merge for superadmin or authorized regional leadership.';

notify pgrst, 'reload schema';

commit;
