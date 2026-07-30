begin;

-- =========================================================
-- MARK MEMBER MERGE READY
--
-- Approval boundary for a validated canonical-member merge.
--
-- This function:
--   1. Requires an authenticated superadmin.
--   2. Locks the merge record.
--   3. Confirms the caller reviewed the currently stored hash.
--   4. Regenerates the preview inside the same transaction.
--   5. Requires the regenerated hash to match both the stored
--      and caller-supplied hashes.
--   6. Requires a completely clean, execution-ready plan.
--   7. Transitions only public.member_merges:
--          validated -> ready
--
-- It does not rewrite any production identity references.
-- =========================================================

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

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_user_id
          and p.role = 'superadmin'
    ) then
        raise exception
            'Only a superadmin may mark a member merge ready.'
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

comment on function public.mark_member_merge_ready(
    uuid,
    text
) is
    'Regenerates and verifies a clean deterministic member-merge plan, then transitions validated to ready. Updates only public.member_merges. Superadmin only.';

alter function public.mark_member_merge_ready(
    uuid,
    text
)
owner to postgres;

revoke all
on function public.mark_member_merge_ready(
    uuid,
    text
)
from public, anon, authenticated;

grant execute
on function public.mark_member_merge_ready(
    uuid,
    text
)
to authenticated;

grant execute
on function public.mark_member_merge_ready(
    uuid,
    text
)
to service_role;

notify pgrst, 'reload schema';

commit;