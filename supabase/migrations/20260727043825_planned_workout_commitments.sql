begin;

-- ============================================================
-- HC / SC PLANNED WORKOUT COMMITMENTS
--
-- Commitments represent intent only.
-- They do not imply or create session attendance.
-- ============================================================


-- ============================================================
-- 1. TABLE
-- ============================================================

create table public.planned_workout_commitments (
    id uuid primary key default gen_random_uuid(),

    planned_workout_id uuid not null
        references public.planned_workouts(id)
        on delete cascade,

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    commitment_type text not null
        constraint planned_workout_commitments_type_check
        check (commitment_type in ('hc', 'sc')),

    source text not null
        constraint planned_workout_commitments_source_check
        check (source in ('self', 'leader')),

    created_by uuid
        references public.profiles(id)
        on delete set null,

    updated_by uuid
        references public.profiles(id)
        on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint planned_workout_commitments_workout_member_key
        unique (planned_workout_id, member_id)
);

comment on table public.planned_workout_commitments is
    'Current HC and SC intent for planned workouts. Commitment does not represent attendance.';

comment on column public.planned_workout_commitments.commitment_type is
    'hc = hard commit; sc = soft commit.';

comment on column public.planned_workout_commitments.source is
    'The most recent setter: self or leader.';

comment on column public.planned_workout_commitments.created_by is
    'Profile that originally created the commitment. Preserved across updates.';

comment on column public.planned_workout_commitments.updated_by is
    'Profile that most recently changed the commitment.';


-- The unique constraint already provides an index beginning with
-- planned_workout_id, so only add the reverse/member lookup index.

create index planned_workout_commitments_member_idx
    on public.planned_workout_commitments (member_id);


-- ============================================================
-- 2. UPDATED_AT TRIGGER
-- ============================================================

create trigger planned_workout_commitments_set_updated_at
before update on public.planned_workout_commitments
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
-- 4. HELPER: MANAGE A PLANNED WORKOUT
--
-- Allows:
--   - existing AO/Q-slot managers
--   - the assigned BDQ from the source Q slot
--
-- Region access is also required.
-- ============================================================

create or replace function public.can_manage_planned_workout(
    target_planned_workout_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.planned_workouts pw
        where pw.id = target_planned_workout_id
          and public.has_region_access(pw.region_id)
          and (
              public.can_manage_ao_q_slots(
                  pw.ao_id,
                  pw.region_id
              )
              or exists (
                  select 1
                  from public.q_slots qs
                  where qs.id = pw.source_q_slot_id
                    and qs.region_id = pw.region_id
                    and qs.q_user_id = public.my_member_id()
              )
          )
    );
$$;

comment on function public.can_manage_planned_workout(uuid) is
    'Returns whether the caller may manage a planned workout as an AO/Q-slot manager or its assigned BDQ.';


-- ============================================================
-- 5. ROW LEVEL SECURITY AND TABLE PRIVILEGES
--
-- The production default privileges grant broad rights to new
-- public tables. Lock them down in this same transaction.
-- ============================================================

alter table public.planned_workout_commitments
enable row level security;

revoke all
on table public.planned_workout_commitments
from public, anon, authenticated;

grant select
on table public.planned_workout_commitments
to authenticated;

grant all
on table public.planned_workout_commitments
to service_role;


create policy planned_workout_commitments_select_accessible_regions
on public.planned_workout_commitments
for select
to authenticated
using (
    exists (
        select 1
        from public.planned_workouts pw
        where pw.id =
            planned_workout_commitments.planned_workout_id
          and public.has_region_access(pw.region_id)
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
--   - caller must have access to the workout region
--   - users may manage themselves
--   - qualified leaders/assigned BDQs may manage another member
--   - leader-selected members must already be known in region
--   - created_by is preserved during updates
--   - source and updated_by represent the most recent setter
-- ============================================================

create or replace function public.set_planned_workout_commitment(
    target_planned_workout_id uuid,
    target_member_id uuid,
    target_commitment_type text
)
returns table (
    commitment_id uuid,
    planned_workout_id uuid,
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
    v_workout public.planned_workouts%rowtype;
    v_my_member_id uuid;
    v_is_self boolean;
    v_can_manage boolean;
    v_row public.planned_workout_commitments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if target_planned_workout_id is null then
        raise exception 'Planned workout ID is required'
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

    select pw.*
    into v_workout
    from public.planned_workouts pw
    where pw.id = target_planned_workout_id;

    if not found then
        raise exception 'Planned workout not found'
            using errcode = 'P0002';
    end if;

    if not public.has_region_access(v_workout.region_id) then
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
        public.can_manage_planned_workout(
            target_planned_workout_id
        );

    if not v_is_self and not v_can_manage then
        raise exception
            'You may only manage your own commitment for this workout'
            using errcode = '42501';
    end if;

    -- Prevent leaders from selecting arbitrary global members.
    -- Self-service is allowed because the HC itself may be the
    -- visitor's first activity in this regional workspace.
    if not v_is_self
       and not public.is_member_known_in_region(
           v_workout.region_id,
           target_member_id
       ) then
        raise exception
            'Member is not known in this regional workspace'
            using errcode = '42501';
    end if;

    -- Null is an idempotent clear operation.
    if target_commitment_type is null then
        delete from public.planned_workout_commitments pwc
        where pwc.planned_workout_id =
                target_planned_workout_id
          and pwc.member_id = target_member_id
        returning pwc.*
        into v_row;

        return query
        select
            v_row.id,
            target_planned_workout_id,
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

    insert into public.planned_workout_commitments (
        planned_workout_id,
        member_id,
        commitment_type,
        source,
        created_by,
        updated_by
    )
    values (
        target_planned_workout_id,
        target_member_id,
        target_commitment_type,
        case
            when v_is_self then 'self'
            else 'leader'
        end,
        auth.uid(),
        auth.uid()
    )
    on conflict (
        planned_workout_id,
        member_id
    )
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
        v_row.planned_workout_id,
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
-- Returns all accessible requested workouts, including workouts
-- with zero commitments.
--
-- Duplicate input IDs are removed.
-- Null/empty arrays return zero rows.
-- ============================================================

create or replace function public.load_planned_workout_commitment_summaries(
    target_planned_workout_ids uuid[]
)
returns table (
    planned_workout_id uuid,
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
                target_planned_workout_ids,
                '{}'::uuid[]
            )
        ) as requested(id)
    ),
    caller as (
        select public.my_member_id() as member_id
    )
    select
        pw.id as planned_workout_id,

        count(pwc.id) filter (
            where pwc.commitment_type = 'hc'
        )::bigint as hc_count,

        count(pwc.id) filter (
            where pwc.commitment_type = 'sc'
        )::bigint as sc_count,

        max(pwc.commitment_type) filter (
            where pwc.member_id = caller.member_id
        ) as my_commitment

    from requested_ids requested

    join public.planned_workouts pw
      on pw.id = requested.id

    cross join caller

    left join public.planned_workout_commitments pwc
      on pwc.planned_workout_id = pw.id

    where public.has_region_access(pw.region_id)

    group by
        pw.id,
        caller.member_id;
$$;


-- ============================================================
-- 8. DETAIL / ATTENDANCE-PRIORITY RPC
--
-- SECURITY DEFINER is required because ordinary member RLS is
-- based on home region and could hide a foreign-home member who
-- is legitimately known through this workout region.
-- ============================================================

create or replace function public.load_planned_workout_commitments(
    target_planned_workout_id uuid
)
returns table (
    commitment_id uuid,
    planned_workout_id uuid,
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
        pwc.id as commitment_id,
        pwc.planned_workout_id,
        pwc.member_id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        pwc.commitment_type,
        pwc.source,
        pwc.created_by,
        pwc.updated_by,
        pwc.created_at,
        pwc.updated_at

    from public.planned_workout_commitments pwc

    join public.planned_workouts pw
      on pw.id = pwc.planned_workout_id

    join public.members m
      on m.id = pwc.member_id

    where pwc.planned_workout_id =
            target_planned_workout_id
      and public.has_region_access(pw.region_id)

    order by
        case pwc.commitment_type
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
        pwc.member_id;
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
on function public.can_manage_planned_workout(uuid)
from public, anon, authenticated;

revoke all
on function public.set_planned_workout_commitment(uuid, uuid, text)
from public, anon, authenticated;

revoke all
on function public.load_planned_workout_commitment_summaries(uuid[])
from public, anon, authenticated;

revoke all
on function public.load_planned_workout_commitments(uuid)
from public, anon, authenticated;


grant execute
on function public.is_member_known_in_region(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.can_manage_planned_workout(uuid)
to authenticated, service_role;

grant execute
on function public.set_planned_workout_commitment(uuid, uuid, text)
to authenticated, service_role;

grant execute
on function public.load_planned_workout_commitment_summaries(uuid[])
to authenticated, service_role;

grant execute
on function public.load_planned_workout_commitments(uuid)
to authenticated, service_role;


-- ============================================================
-- 10. OWNERSHIP
-- ============================================================

alter table public.planned_workout_commitments
owner to postgres;

alter function public.is_member_known_in_region(uuid, uuid)
owner to postgres;

alter function public.can_manage_planned_workout(uuid)
owner to postgres;

alter function public.set_planned_workout_commitment(uuid, uuid, text)
owner to postgres;

alter function public.load_planned_workout_commitment_summaries(uuid[])
owner to postgres;

alter function public.load_planned_workout_commitments(uuid)
owner to postgres;


-- ============================================================
-- 11. POSTGREST SCHEMA REFRESH
-- ============================================================

notify pgrst, 'reload schema';

commit;