begin;

-- ============================================================
-- HC / SC Q-SLOT COMMITMENTS
--
-- Commitments represent intent to attend a scheduled BD.
-- They do not imply or create session attendance.
-- They do not depend on a planned workout existing.
-- ============================================================


-- ============================================================
-- 0. REMOVE THE ABANDONED PLANNED-WORKOUT MODEL
--
-- These drops make this migration safe whether the previous
-- migration reached the database or only existed locally.
-- ============================================================

drop function if exists
    public.load_planned_workout_commitments(uuid);

drop function if exists
    public.load_planned_workout_commitment_summaries(uuid[]);

drop function if exists
    public.set_planned_workout_commitment(uuid, uuid, text);

drop function if exists
    public.can_manage_planned_workout(uuid);

drop table if exists
    public.planned_workout_commitments;


-- ============================================================
-- 1. TABLE
-- ============================================================

create table public.q_slot_commitments (
    id uuid primary key default gen_random_uuid(),

    q_slot_id uuid not null
        references public.q_slots(id)
        on delete cascade,

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    commitment_type text not null
        constraint q_slot_commitments_type_check
        check (commitment_type in ('hc', 'sc')),

    source text not null
        constraint q_slot_commitments_source_check
        check (source in ('self', 'leader')),

    created_by uuid
        references public.profiles(id)
        on delete set null,

    updated_by uuid
        references public.profiles(id)
        on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint q_slot_commitments_slot_member_key
        unique (q_slot_id, member_id)
);

comment on table public.q_slot_commitments is
    'Current HC and SC intent for scheduled Q slots. A commitment does not represent attendance and does not require a planned workout.';

comment on column public.q_slot_commitments.commitment_type is
    'hc = hard commit; sc = soft commit.';

comment on column public.q_slot_commitments.source is
    'The most recent setter: self or leader.';

comment on column public.q_slot_commitments.created_by is
    'Profile that originally created the commitment. Preserved across updates.';

comment on column public.q_slot_commitments.updated_by is
    'Profile that most recently changed the commitment.';


-- The unique constraint already provides an index beginning with
-- q_slot_id, so only add the reverse/member lookup index.

create index q_slot_commitments_member_idx
    on public.q_slot_commitments (member_id);


-- ============================================================
-- 2. UPDATED_AT TRIGGER
-- ============================================================

create trigger q_slot_commitments_set_updated_at
before update on public.q_slot_commitments
for each row
execute function public.set_updated_at();


-- ============================================================
-- 3. HELPER: MEMBER KNOWN IN REGION
--
-- This represents the regional participant directory boundary:
--   - home-region member, or
--   - member with regional stats/activity, or
--   - member explicitly found in regional session attendance.
--
-- It does NOT grant workspace access or alter members.region_id.
-- ============================================================

create or replace function public.is_member_known_in_region(
    target_region_id uuid,
    target_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        exists (
            select 1
            from public.members m
            where m.id = target_member_id
              and m.region_id = target_region_id
        )
        or exists (
            select 1
            from public.member_stats ms
            where ms.region_id = target_region_id
              and ms.member_id = target_member_id
        )
        or exists (
            select 1
            from public.sessions s
            where s.region_id = target_region_id
              and coalesce(s.attendee_ids, '[]'::jsonb)
                    ? target_member_id::text
        );
$$;

comment on function public.is_member_known_in_region(uuid, uuid) is
    'Returns whether a canonical member is part of a region home roster or is known through regional activity.';


-- ============================================================
-- 4. HELPER: MANAGE Q-SLOT COMMITMENTS
--
-- Allows:
--   - existing AO/Q-slot managers
--   - the assigned BDQ for the Q slot
--
-- Region access is also required.
-- ============================================================

create or replace function public.can_manage_q_slot_commitments(
    target_q_slot_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.q_slots qs
        where qs.id = target_q_slot_id
          and public.has_region_access(qs.region_id)
          and (
              public.can_manage_ao_q_slots(
                  qs.ao_id,
                  qs.region_id
              )
              or qs.q_user_id = public.my_member_id()
          )
    );
$$;

comment on function public.can_manage_q_slot_commitments(uuid) is
    'Returns whether the caller may manage commitments for a Q slot as an AO/Q-slot manager or its assigned BDQ.';


-- ============================================================
-- 5. ROW LEVEL SECURITY AND TABLE PRIVILEGES
--
-- The production default privileges grant broad rights to new
-- public tables. Lock them down in this same transaction.
-- ============================================================

alter table public.q_slot_commitments
enable row level security;

revoke all
on table public.q_slot_commitments
from public, anon, authenticated;

grant select
on table public.q_slot_commitments
to authenticated;

grant all
on table public.q_slot_commitments
to service_role;


create policy q_slot_commitments_select_accessible_regions
on public.q_slot_commitments
for select
to authenticated
using (
    exists (
        select 1
        from public.q_slots qs
        where qs.id = q_slot_commitments.q_slot_id
          and public.has_region_access(qs.region_id)
    )
);


-- ============================================================
-- 6. WRITE RPC
--
-- target_commitment_type:
--   'hc' = hard commit
--   'sc' = soft commit
--   null = clear commitment
--
-- Rules:
--   - caller must have access to the Q-slot region
--   - users may manage themselves
--   - qualified leaders/assigned BDQs may manage another member
--   - leader-selected members must already be known in region
--   - created_by is preserved during updates
--   - source and updated_by represent the most recent setter
-- ============================================================

create or replace function public.set_q_slot_commitment(
    target_q_slot_id uuid,
    target_member_id uuid,
    target_commitment_type text
)
returns table (
    commitment_id uuid,
    q_slot_id uuid,
    member_id uuid,
    commitment_type text,
    source text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz,
    updated_at timestamptz,
    cleared boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_slot public.q_slots%rowtype;
    v_my_member_id uuid;
    v_is_self boolean;
    v_can_manage boolean;
    v_row public.q_slot_commitments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if target_q_slot_id is null then
        raise exception 'Q slot ID is required'
            using errcode = '22004';
    end if;

    if target_member_id is null then
        raise exception 'Member ID is required'
            using errcode = '22004';
    end if;

    if target_commitment_type is not null
       and target_commitment_type not in ('hc', 'sc') then
        raise exception
            'Commitment type must be hc, sc, or null'
            using errcode = '22023';
    end if;

    select qs.*
    into v_slot
    from public.q_slots qs
    where qs.id = target_q_slot_id;

    if not found then
        raise exception 'Q slot not found'
            using errcode = 'P0002';
    end if;

    if not public.has_region_access(v_slot.region_id) then
        raise exception 'Region access required'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.members m
        where m.id = target_member_id
    ) then
        raise exception 'Member not found'
            using errcode = 'P0002';
    end if;

    v_my_member_id := public.my_member_id();

    v_is_self :=
        v_my_member_id is not null
        and v_my_member_id = target_member_id;

    v_can_manage :=
        public.can_manage_q_slot_commitments(
            target_q_slot_id
        );

    if not v_is_self and not v_can_manage then
        raise exception
            'You may only manage your own commitment for this Q slot'
            using errcode = '42501';
    end if;

    -- Prevent leaders from selecting arbitrary global members.
    -- Self-service is allowed because the HC itself may be the
    -- visitor's first activity in this regional workspace.
    if not v_is_self
       and not public.is_member_known_in_region(
           v_slot.region_id,
           target_member_id
       ) then
        raise exception
            'Member is not known in this regional workspace'
            using errcode = '42501';
    end if;

    -- Null is an idempotent clear operation.
    if target_commitment_type is null then
        delete from public.q_slot_commitments qsc
        where qsc.q_slot_id = target_q_slot_id
          and qsc.member_id = target_member_id
        returning qsc.*
        into v_row;

        return query
        select
            v_row.id,
            target_q_slot_id,
            target_member_id,
            null::text,
            v_row.source,
            v_row.created_by,
            auth.uid(),
            v_row.created_at,
            now(),
            true;

        return;
    end if;

    insert into public.q_slot_commitments (
        q_slot_id,
        member_id,
        commitment_type,
        source,
        created_by,
        updated_by
    )
    values (
        target_q_slot_id,
        target_member_id,
        target_commitment_type,
        case
            when v_is_self then 'self'
            else 'leader'
        end,
        auth.uid(),
        auth.uid()
    on conflict on constraint q_slot_commitments_slot_member_key
    do update set
        commitment_type = excluded.commitment_type,
        source = excluded.source,
        updated_by = excluded.updated_by,
        updated_at = now()
    returning *
    into v_row;

    return query
    select
        v_row.id,
        v_row.q_slot_id,
        v_row.member_id,
        v_row.commitment_type,
        v_row.source,
        v_row.created_by,
        v_row.updated_by,
        v_row.created_at,
        v_row.updated_at,
        false;
end;
$$;


-- ============================================================
-- 7. DASHBOARD SUMMARY RPC
--
-- Returns all accessible requested Q slots, including slots with
-- zero commitments. It does not inspect planned_workouts.
--
-- Duplicate input IDs are removed.
-- Null/empty arrays return zero rows.
-- ============================================================

create or replace function public.load_q_slot_commitment_summaries(
    target_q_slot_ids uuid[]
)
returns table (
    q_slot_id uuid,
    hc_count bigint,
    sc_count bigint,
    my_commitment text
)
language sql
stable
security definer
set search_path = ''
as $$
    with requested_ids as (
        select distinct requested.id
        from unnest(
            coalesce(
                target_q_slot_ids,
                '{}'::uuid[]
            )
        ) as requested(id)
    ),
    caller as (
        select public.my_member_id() as member_id
    )
    select
        qs.id as q_slot_id,

        count(qsc.id) filter (
            where qsc.commitment_type = 'hc'
        )::bigint as hc_count,

        count(qsc.id) filter (
            where qsc.commitment_type = 'sc'
        )::bigint as sc_count,

        max(qsc.commitment_type) filter (
            where qsc.member_id = caller.member_id
        ) as my_commitment

    from requested_ids requested

    join public.q_slots qs
      on qs.id = requested.id

    cross join caller

    left join public.q_slot_commitments qsc
      on qsc.q_slot_id = qs.id

    where public.has_region_access(qs.region_id)

    group by
        qs.id,
        caller.member_id;
$$;


-- ============================================================
-- 8. DETAIL / ATTENDANCE-PRIORITY RPC
--
-- SECURITY DEFINER is required because ordinary member RLS is
-- based on home region and could hide a foreign-home member who
-- is legitimately known through this Q-slot region.
-- ============================================================

create or replace function public.load_q_slot_commitments(
    target_q_slot_id uuid
)
returns table (
    commitment_id uuid,
    q_slot_id uuid,
    member_id uuid,
    pax_name text,
    real_name text,
    home_ao text,
    commitment_type text,
    source text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        qsc.id as commitment_id,
        qsc.q_slot_id,
        qsc.member_id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        qsc.commitment_type,
        qsc.source,
        qsc.created_by,
        qsc.updated_by,
        qsc.created_at,
        qsc.updated_at

    from public.q_slot_commitments qsc

    join public.q_slots qs
      on qs.id = qsc.q_slot_id

    join public.members m
      on m.id = qsc.member_id

    where qsc.q_slot_id = target_q_slot_id
      and public.has_region_access(qs.region_id)

    order by
        case qsc.commitment_type
            when 'hc' then 1
            when 'sc' then 2
            else 3
        end,
        lower(
            coalesce(
                nullif(trim(m.pax_name), ''),
                nullif(trim(m.real_name), ''),
                'Unnamed PAX'
            )
        ),
        qsc.member_id;
$$;


-- ============================================================
-- 9. FUNCTION PRIVILEGES
--
-- Security-definer functions are explicitly withheld from
-- PUBLIC/anon and exposed only to authenticated/service roles.
-- ============================================================

revoke all
on function public.is_member_known_in_region(uuid, uuid)
from public, anon, authenticated;

revoke all
on function public.can_manage_q_slot_commitments(uuid)
from public, anon, authenticated;

revoke all
on function public.set_q_slot_commitment(uuid, uuid, text)
from public, anon, authenticated;

revoke all
on function public.load_q_slot_commitment_summaries(uuid[])
from public, anon, authenticated;

revoke all
on function public.load_q_slot_commitments(uuid)
from public, anon, authenticated;


grant execute
on function public.is_member_known_in_region(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.can_manage_q_slot_commitments(uuid)
to authenticated, service_role;

grant execute
on function public.set_q_slot_commitment(uuid, uuid, text)
to authenticated, service_role;

grant execute
on function public.load_q_slot_commitment_summaries(uuid[])
to authenticated, service_role;

grant execute
on function public.load_q_slot_commitments(uuid)
to authenticated, service_role;


-- ============================================================
-- 10. OWNERSHIP
-- ============================================================

alter table public.q_slot_commitments
owner to postgres;

alter function public.is_member_known_in_region(uuid, uuid)
owner to postgres;

alter function public.can_manage_q_slot_commitments(uuid)
owner to postgres;

alter function public.set_q_slot_commitment(uuid, uuid, text)
owner to postgres;

alter function public.load_q_slot_commitment_summaries(uuid[])
owner to postgres;

alter function public.load_q_slot_commitments(uuid)
owner to postgres;


-- ============================================================
-- 11. POSTGREST SCHEMA REFRESH
-- ============================================================

notify pgrst, 'reload schema';

commit;