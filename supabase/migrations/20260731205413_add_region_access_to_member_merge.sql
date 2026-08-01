begin;

-- =========================================================
-- EXECUTE MEMBER MERGE
--
-- Executes a previously previewed, validated, and approved
-- clean member merge.
--
-- Version-one scope:
--   - stored plan is ready
--   - no blockers
--   - no warnings
--   - no required decisions
--   - no supported collision types
--   - no effective_member_stats rows
--
-- The function:
--   1. authenticates a superadmin
--   2. locks the merge and both member rows
--   3. verifies the approved plan hash
--   4. regenerates and compares the execution manifest
--   5. applies the exact approved row set
--   6. rebuilds regional member_stats
--   7. retires the duplicate member
--   8. verifies postconditions
--   9. marks the merge completed
-- =========================================================

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

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_user_id
          and p.role = 'superadmin'
    ) then
        raise exception
            'Only a superadmin may execute a member merge.'
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
        where not exists (
            select 1
            from public.region_access existing_access
            where existing_access.user_id =
                    linked_profiles.user_id
            and existing_access.region_id =
                    merged_regions.region_id
        )
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

comment on function public.execute_member_merge(
    uuid,
    text
) is
    'Executes an approved clean member merge using its stored deterministic manifest, preserves linked profile region access, rebuilds regional member_stats, retires the duplicate, and verifies postconditions. Superadmin only.';

alter function public.execute_member_merge(
    uuid,
    text
)
owner to postgres;

revoke all
on function public.execute_member_merge(
    uuid,
    text
)
from public, anon, authenticated;

grant execute
on function public.execute_member_merge(
    uuid,
    text
)
to authenticated;

grant execute
on function public.execute_member_merge(
    uuid,
    text
)
to service_role;

notify pgrst, 'reload schema';

commit;