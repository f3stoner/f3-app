begin;

-- =========================================================
-- PREVIEW MEMBER MERGE
--
-- Builds and stores a deterministic, read-only reconciliation
-- plan for an existing member_merges draft.
--
-- This function may update only public.member_merges.
-- It does not rewrite any member identity or production data.
-- =========================================================

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

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_user_id
          and p.role = 'superadmin'
    ) then
        raise exception
            'Only a superadmin may preview a member merge.'
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
            or sf.q_mirror_inconsistent
            or sf.attendee_json_type is distinct from 'array'
            or sf.fng_json_type is distinct from 'array'
            or (
                sf.unresolved_json_type is not null
                and sf.unresolved_json_type
                    is distinct from 'array'
            )
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

comment on function public.preview_member_merge(
    uuid
) is
    'Builds, hashes, and stores a deterministic read-only member reconciliation plan. Updates only public.member_merges. Superadmin only.';

alter function public.preview_member_merge(
    uuid
)
owner to postgres;

revoke all
on function public.preview_member_merge(
    uuid
)
from public, anon, authenticated;

grant execute
on function public.preview_member_merge(
    uuid
)
to authenticated;

grant execute
on function public.preview_member_merge(
    uuid
)
to service_role;

notify pgrst, 'reload schema';

commit;