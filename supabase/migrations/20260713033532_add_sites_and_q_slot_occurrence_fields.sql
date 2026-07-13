begin;

-- =========================================================
-- 1. Reusable physical sites
-- =========================================================

create table public.sites (
    id uuid primary key default gen_random_uuid(),
    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    name text not null,
    address text,
    map_url text,
    latitude numeric,
    longitude numeric,

    weather_location_label text,
    weather_enabled boolean not null default true,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint sites_name_not_blank
        check (length(trim(name)) > 0)
);

create index sites_region_id_idx
    on public.sites(region_id);

create unique index sites_region_normalized_name_key
    on public.sites(region_id, lower(trim(name)));


-- =========================================================
-- 2. Sites RLS
-- Mirrors current AO access behavior
-- =========================================================

alter table public.sites enable row level security;

create policy sites_select_accessible_regions
on public.sites
for select
to authenticated
using (
    exists (
        select 1
        from public.region_access ra
        where ra.user_id = auth.uid()
          and ra.region_id = sites.region_id
    )
);

create policy sites_insert_region_leader
on public.sites
for insert
to authenticated
with check (
    public.is_region_leader(region_id)
);

create policy sites_update_region_leader
on public.sites
for update
to authenticated
using (
    public.is_region_leader(region_id)
)
with check (
    public.is_region_leader(region_id)
);

create policy sites_delete_region_leader
on public.sites
for delete
to authenticated
using (
    public.is_region_leader(region_id)
);


-- =========================================================
-- 3. Q-slot occurrence snapshots
-- =========================================================

alter table public.q_slots
    add column site_id uuid
        references public.sites(id),

    add column start_time text,

    add column duration_minutes integer;

alter table public.q_slots
    add constraint q_slots_duration_minutes_valid
    check (
        duration_minutes is null
        or duration_minutes > 0
    );

create index q_slots_site_id_idx
    on public.q_slots(site_id);

create index q_slots_region_date_start_time_idx
    on public.q_slots(region_id, date, start_time);

create index q_slots_region_ao_date_start_time_idx
    on public.q_slots(region_id, ao_id, date, start_time);


-- =========================================================
-- 4. Historical occurrence location snapshots
-- =========================================================

alter table public.sessions
    add column site_id uuid
        references public.sites(id);

create index sessions_site_id_idx
    on public.sessions(site_id);

create index sessions_region_site_date_idx
    on public.sessions(region_id, site_id, date);


-- =========================================================
-- 5. Planned-workout site snapshot
--
-- Kept nullable. Normal Q-slot-linked workouts can later
-- inherit from source_q_slot_id, while standalone workouts
-- may explicitly select a site.
-- =========================================================

alter table public.planned_workouts
    add column site_id uuid
        references public.sites(id);

create index planned_workouts_site_id_idx
    on public.planned_workouts(site_id);


-- =========================================================
-- 6. Replace the one-AO-per-date uniqueness assumption
-- =========================================================

drop index public.q_slots_ao_id_date_key;

-- Transition guard for existing/runtime-created legacy slots.
-- The current app still creates slots without site/start snapshots.
create unique index q_slots_legacy_ao_date_key
    on public.q_slots(ao_id, date)
    where site_id is null
      and start_time is null;

-- Concrete occurrence identity.
--
-- This supports:
-- - AM and PM on the same date
-- - multiple AM start times
-- - simultaneous starts at different sites
create unique index q_slots_concrete_occurrence_key
    on public.q_slots(
        ao_id,
        date,
        start_time,
        site_id
    )
    where site_id is not null
      and start_time is not null;


-- =========================================================
-- 7. Protect the new Q-slot identity fields
--
-- Normal users may claim/unclaim and edit permitted metadata,
-- but may not change the slot's site, time, or duration.
-- =========================================================

create or replace function public.guard_q_slot_user_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    -- Region leaders and AO Q-slot managers can manage the slot.
    if public.can_manage_ao_q_slots(old.ao_id, old.region_id)
    then
        return new;
    end if;

    -- Normal users cannot change slot identity/schedule fields.
    if old.region_id is distinct from new.region_id
        or old.ao_id is distinct from new.ao_id
        or old.date is distinct from new.date
        or old.site_id is distinct from new.site_id
        or old.start_time is distinct from new.start_time
        or old.duration_minutes is distinct from new.duration_minutes
        or old.created_at is distinct from new.created_at
    then
        raise exception
            'Only leaders can modify Q slot identity fields.';
    end if;

    -- User must be linked to a member.
    if public.my_member_id() is null then
        raise exception
            'User must be linked to a member to update Q slots.';
    end if;

    -- Cannot assign the slot to someone else.
    if new.q_user_id is not null
       and new.q_user_id is distinct from public.my_member_id()
    then
        raise exception
            'Users may only claim Q slots for themselves.';
    end if;

    -- If the slot is open, the only allowed normal-user
    -- action is claiming it.
    if old.q_user_id is null then
        if new.q_user_id is distinct from public.my_member_id() then
            raise exception
                'Users may only claim open Q slots for themselves.';
        end if;

        if old.override_time
                is distinct from new.override_time
            or old.override_emphasis
                is distinct from new.override_emphasis
            or old.override_title
                is distinct from new.override_title
            or old.custom_emphasis_label
                is distinct from new.custom_emphasis_label
            or old.preblast_text
                is distinct from new.preblast_text
            or old.preblast_last_modified_at
                is distinct from new.preblast_last_modified_at
            or old.preblast_posted_at
                is distinct from new.preblast_posted_at
        then
            raise exception
                'Users cannot edit open Q slot metadata.';
        end if;

        return new;
    end if;

    -- If the slot belongs to someone else, normal users
    -- cannot update it.
    if old.q_user_id is distinct from public.my_member_id() then
        raise exception
            'Users may only update their own assigned Q slots.';
    end if;

    -- Assigned Q can edit metadata or unclaim.
    return new;
end;
$function$;

commit;