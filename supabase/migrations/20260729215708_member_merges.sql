begin;

-- =========================================================
-- MEMBER MERGES
--
-- Durable provenance and lifecycle for canonical-member
-- reconciliation.
--
-- This migration does not preview, rewrite, retire, delete,
-- or otherwise mutate any existing member identity.
-- =========================================================

create table public.member_merges (
    id uuid primary key default gen_random_uuid(),

    canonical_member_id uuid not null,
    duplicate_member_id uuid not null,

    status text not null default 'draft',

    canonical_member_snapshot jsonb not null,
    duplicate_member_snapshot jsonb not null,

    preview_payload jsonb,
    plan_hash text,
    plan_version integer not null default 1,
    preview_generated_at timestamptz,

    decision_metadata jsonb not null default '{}'::jsonb,
    notes text,

    created_by_user_id uuid not null,
    ready_by_user_id uuid,
    executed_by_user_id uuid,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    validated_at timestamptz,
    ready_at timestamptz,
    execution_started_at timestamptz,
    completed_at timestamptz,
    failed_at timestamptz,
    cancelled_at timestamptz,

    failure_code text,
    failure_message text,

    constraint member_merges_canonical_member_id_fkey
        foreign key (canonical_member_id)
        references public.members(id)
        on delete restrict,

    constraint member_merges_duplicate_member_id_fkey
        foreign key (duplicate_member_id)
        references public.members(id)
        on delete restrict,

    constraint member_merges_created_by_user_id_fkey
        foreign key (created_by_user_id)
        references auth.users(id)
        on delete restrict,

    constraint member_merges_ready_by_user_id_fkey
        foreign key (ready_by_user_id)
        references auth.users(id)
        on delete restrict,

    constraint member_merges_executed_by_user_id_fkey
        foreign key (executed_by_user_id)
        references auth.users(id)
        on delete restrict,

    constraint member_merges_distinct_members_check
        check (canonical_member_id <> duplicate_member_id),

    constraint member_merges_status_check
        check (
            status in (
                'draft',
                'validated',
                'ready',
                'running',
                'completed',
                'failed',
                'cancelled'
            )
        ),

    constraint member_merges_plan_version_check
        check (plan_version > 0),

    constraint member_merges_snapshot_shapes_check
        check (
            jsonb_typeof(canonical_member_snapshot) = 'object'
            and jsonb_typeof(duplicate_member_snapshot) = 'object'
        ),

    constraint member_merges_snapshot_ids_check
        check (
            canonical_member_snapshot->>'id'
                is not distinct from canonical_member_id::text
            and duplicate_member_snapshot->>'id'
                is not distinct from duplicate_member_id::text
        ),

    constraint member_merges_decision_metadata_shape_check
        check (jsonb_typeof(decision_metadata) = 'object'),

    constraint member_merges_preview_payload_shape_check
        check (
            preview_payload is null
            or jsonb_typeof(preview_payload) = 'object'
        ),

    constraint member_merges_validated_plan_check
        check (
            status not in (
                'validated',
                'ready',
                'running',
                'completed',
                'failed'
            )
            or (
                preview_payload is not null
                and nullif(btrim(plan_hash), '') is not null
                and preview_generated_at is not null
                and validated_at is not null
            )
        ),

    constraint member_merges_ready_state_check
        check (
            status not in (
                'ready',
                'running',
                'completed',
                'failed'
            )
            or (
                ready_by_user_id is not null
                and ready_at is not null
            )
        ),

    constraint member_merges_running_state_check
        check (
            status not in (
                'running',
                'completed',
                'failed'
            )
            or (
                executed_by_user_id is not null
                and execution_started_at is not null
            )
        ),

    constraint member_merges_completed_state_check
        check (
            status <> 'completed'
            or (
                completed_at is not null
                and failed_at is null
                and failure_code is null
                and failure_message is null
            )
        ),

    constraint member_merges_failed_state_check
        check (
            status <> 'failed'
            or (
                failed_at is not null
                and nullif(btrim(failure_message), '') is not null
                and completed_at is null
            )
        ),

    constraint member_merges_cancelled_state_check
        check (
            status <> 'cancelled'
            or cancelled_at is not null
        )
);

comment on table public.member_merges is
    'Durable lifecycle and provenance for reconciling a duplicate member identity into one canonical member. Creating a row does not execute a merge.';

comment on column public.member_merges.canonical_member_id is
    'The surviving canonical member identity.';

comment on column public.member_merges.duplicate_member_id is
    'The duplicate member identity that will eventually resolve to the canonical member.';

comment on column public.member_merges.status is
    'Lifecycle state: draft, validated, ready, running, completed, failed, or cancelled.';

comment on column public.member_merges.canonical_member_snapshot is
    'Immutable public-member-row snapshot captured when the merge record is created. Must not include auth secrets.';

comment on column public.member_merges.duplicate_member_snapshot is
    'Immutable public-member-row snapshot captured when the merge record is created. Must not include auth secrets.';

comment on column public.member_merges.preview_payload is
    'Deterministic read-only merge plan produced by the future preview RPC.';

comment on column public.member_merges.plan_hash is
    'Hash of the deterministic merge plan used to ensure execution matches the reviewed preview.';

comment on column public.member_merges.plan_version is
    'Version of the merge-plan format and hashing contract.';

comment on column public.member_merges.decision_metadata is
    'Structured human decisions and conflict resolutions associated with the merge.';

comment on column public.member_merges.created_by_user_id is
    'Authenticated user who created the merge record.';

comment on column public.member_merges.ready_by_user_id is
    'Authenticated user who reviewed the validated plan and marked it ready for execution.';

comment on column public.member_merges.executed_by_user_id is
    'Authenticated user who initiated merge execution.';


-- =========================================================
-- UNIQUENESS AND LOOKUP INDEXES
-- =========================================================

create unique index member_merges_active_duplicate_member_key
    on public.member_merges (duplicate_member_id)
    where status <> 'cancelled';

comment on index public.member_merges_active_duplicate_member_key is
    'Prevents one duplicate identity from resolving to multiple active canonical members.';

create index member_merges_canonical_member_idx
    on public.member_merges (canonical_member_id);

create index member_merges_status_idx
    on public.member_merges (status);

create index member_merges_created_at_idx
    on public.member_merges (created_at desc);


-- =========================================================
-- MERGE-GRAPH AND LIFECYCLE GUARDS
-- =========================================================

create or replace function public.validate_member_merge_record()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_conflicting_merge_id uuid;
begin
    -- Every merge must begin as a draft and progress through
    -- the controlled lifecycle.
    if tg_op = 'INSERT'
       and new.status <> 'draft' then
        raise exception
            'New member merge records must begin in draft status.'
            using errcode = '23514';
    end if;

    -- Completed and cancelled rows are immutable provenance.
    if tg_op = 'UPDATE'
       and old.status in ('completed', 'cancelled') then
        raise exception
            'Member merge % is immutable because its status is %.',
            old.id,
            old.status
            using errcode = '23514';
    end if;

    -- Member identity direction is immutable after creation.
    -- A different member pair requires a new merge record.
    if tg_op = 'UPDATE'
       and (
           new.canonical_member_id is distinct from old.canonical_member_id
           or new.duplicate_member_id is distinct from old.duplicate_member_id
       ) then
        raise exception
            'Canonical and duplicate member IDs are immutable after creation.'
            using errcode = '23514';
    end if;

    -- Member snapshots are immutable after creation.
    if tg_op = 'UPDATE'
       and (
           new.canonical_member_snapshot
               is distinct from old.canonical_member_snapshot
           or new.duplicate_member_snapshot
               is distinct from old.duplicate_member_snapshot
       ) then
        raise exception
            'Member identity snapshots are immutable.'
            using errcode = '23514';
    end if;

    -- Once a plan has been approved as ready, the reviewed plan
    -- and its hashing contract are immutable. Any changed data
    -- requires returning to validated status and generating a
    -- fresh plan before it can be approved again.
    if tg_op = 'UPDATE'
       and old.status in ('ready', 'running', 'completed', 'failed')
       and (
           new.preview_payload
               is distinct from old.preview_payload
           or new.plan_hash
               is distinct from old.plan_hash
           or new.plan_version
               is distinct from old.plan_version
           or new.preview_generated_at
               is distinct from old.preview_generated_at
       ) then
        raise exception
            'The reviewed member merge plan is immutable after the merge is marked ready.'
            using errcode = '23514';
    end if;

    -- Enforce explicit allowed lifecycle transitions.
    if tg_op = 'UPDATE'
       and new.status is distinct from old.status then

        if not (
            (old.status = 'draft'
                and new.status in ('validated', 'cancelled'))

            or (old.status = 'validated'
                and new.status in ('draft', 'ready', 'cancelled'))

            or (old.status = 'ready'
                and new.status in ('validated', 'running', 'cancelled'))

            or (old.status = 'running'
                and new.status in ('completed', 'failed'))

            or (old.status = 'failed'
                and new.status in ('validated', 'cancelled'))
        ) then
            raise exception
                'Invalid member merge status transition from % to %.',
                old.status,
                new.status
                using errcode = '23514';
        end if;
    end if;

    -- Keep the redirect graph flat. A canonical target may not
    -- itself already be an active duplicate.
    select mm.id
    into v_conflicting_merge_id
    from public.member_merges mm
    where mm.duplicate_member_id = new.canonical_member_id
      and mm.status <> 'cancelled'
      and mm.id <> new.id
    limit 1;

    if v_conflicting_merge_id is not null then
        raise exception
            'Canonical member % is already the duplicate member in merge %.',
            new.canonical_member_id,
            v_conflicting_merge_id
            using errcode = '23514';
    end if;

    -- A member that already serves as an active canonical target
    -- may not later become a duplicate. This prevents C -> B -> A
    -- chains and preserves direct terminal canonical identities.
    select mm.id
    into v_conflicting_merge_id
    from public.member_merges mm
    where mm.canonical_member_id = new.duplicate_member_id
      and mm.status <> 'cancelled'
      and mm.id <> new.id
    limit 1;

    if v_conflicting_merge_id is not null then
        raise exception
            'Duplicate member % is already the canonical member in merge %.',
            new.duplicate_member_id,
            v_conflicting_merge_id
            using errcode = '23514';
    end if;

    -- Populate lifecycle timestamps from controlled status changes.
    if tg_op = 'UPDATE'
       and new.status is distinct from old.status then

        case new.status
            when 'validated' then
                new.validated_at := coalesce(
                    new.validated_at,
                    statement_timestamp()
                );

                -- A revalidated plan is no longer approved for execution.
                new.ready_at := null;
                new.ready_by_user_id := null;
                new.execution_started_at := null;
                new.executed_by_user_id := null;
                new.completed_at := null;
                new.failed_at := null;
                new.cancelled_at := null;
                new.failure_code := null;
                new.failure_message := null;

            when 'ready' then
                new.ready_at := coalesce(
                    new.ready_at,
                    statement_timestamp()
                );

            when 'running' then
                new.execution_started_at := coalesce(
                    new.execution_started_at,
                    statement_timestamp()
                );

            when 'completed' then
                new.completed_at := coalesce(
                    new.completed_at,
                    statement_timestamp()
                );
                new.failed_at := null;
                new.failure_code := null;
                new.failure_message := null;

            when 'failed' then
                new.failed_at := coalesce(
                    new.failed_at,
                    statement_timestamp()
                );
                new.completed_at := null;

            when 'cancelled' then
                new.cancelled_at := coalesce(
                    new.cancelled_at,
                    statement_timestamp()
                );

            when 'draft' then
                new.preview_payload := null;
                new.plan_hash := null;
                new.preview_generated_at := null;
                new.validated_at := null;
                new.ready_at := null;
                new.ready_by_user_id := null;
                new.execution_started_at := null;
                new.executed_by_user_id := null;
                new.completed_at := null;
                new.failed_at := null;
                new.cancelled_at := null;
                new.failure_code := null;
                new.failure_message := null;

            else
                null;
        end case;
    end if;

    return new;
end;
$$;

create or replace function public.prevent_member_merge_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception
        'Member merge records are durable provenance and cannot be deleted.'
        using errcode = '23514';
end;
$$;

alter function public.prevent_member_merge_delete()
    owner to postgres;

revoke all
    on function public.prevent_member_merge_delete()
    from public, anon, authenticated;

alter function public.validate_member_merge_record()
    owner to postgres;

revoke all
    on function public.validate_member_merge_record()
    from public, anon, authenticated;


create trigger member_merges_validate_record
before insert or update on public.member_merges
for each row
execute function public.validate_member_merge_record();


create trigger member_merges_prevent_delete
before delete on public.member_merges
for each row
execute function public.prevent_member_merge_delete();


create trigger member_merges_set_updated_at
before update on public.member_merges
for each row
execute function public.set_updated_at();


-- =========================================================
-- ROW-LEVEL SECURITY AND PRIVILEGES
-- =========================================================

alter table public.member_merges enable row level security;

revoke all
    on table public.member_merges
    from public, anon, authenticated;

grant select
    on table public.member_merges
    to authenticated;

grant all
    on table public.member_merges
    to service_role;


create policy member_merges_select_superadmin
on public.member_merges
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'superadmin'
    )
);

comment on policy member_merges_select_superadmin
on public.member_merges is
    'Only authenticated superadmins may directly read member merge provenance and plans. Writes occur only through privileged RPCs.';


notify pgrst, 'reload schema';

commit;