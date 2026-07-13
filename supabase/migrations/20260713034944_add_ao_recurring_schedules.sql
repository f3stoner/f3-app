begin;

-- =========================================================
-- 1. Recurring AO schedules
--
-- One row represents one recurring:
-- AO + weekday + start time + Site combination.
-- =========================================================

create table public.ao_recurring_schedules (
    id uuid primary key default gen_random_uuid(),

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    ao_id uuid not null
        references public.aos(id)
        on delete cascade,

    site_id uuid not null
        references public.sites(id),

    weekday integer not null,

    start_time time without time zone not null,

    duration_minutes integer,

    schedule_label text,

    -- Preserve the existing per-day emphasis rule without
    -- flattening rotating or fixed configurations.
    emphasis_rule jsonb not null default '{}'::jsonb,

    effective_start_date date,
    effective_end_date date,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint ao_recurring_schedules_weekday_valid
        check (weekday between 0 and 6),

    constraint ao_recurring_schedules_duration_valid
        check (
            duration_minutes is null
            or duration_minutes > 0
        ),

    constraint ao_recurring_schedules_effective_dates_valid
        check (
            effective_end_date is null
            or effective_start_date is null
            or effective_end_date >= effective_start_date
        )
);

create index ao_recurring_schedules_region_id_idx
    on public.ao_recurring_schedules(region_id);

create index ao_recurring_schedules_ao_id_idx
    on public.ao_recurring_schedules(ao_id);

create index ao_recurring_schedules_site_id_idx
    on public.ao_recurring_schedules(site_id);

create index ao_recurring_schedules_active_lookup_idx
    on public.ao_recurring_schedules(
        region_id,
        weekday,
        is_active
    );

create unique index ao_recurring_schedules_identity_key
    on public.ao_recurring_schedules(
        ao_id,
        weekday,
        start_time,
        site_id
    )
    where effective_end_date is null;


-- =========================================================
-- 2. RLS
-- Mirrors AO administration for now.
-- =========================================================

alter table public.ao_recurring_schedules
    enable row level security;

create policy ao_recurring_schedules_select_accessible_regions
on public.ao_recurring_schedules
for select
to authenticated
using (
    public.has_region_access(region_id)
);

create policy ao_recurring_schedules_insert_region_leader
on public.ao_recurring_schedules
for insert
to authenticated
with check (
    public.is_region_leader(region_id)
);

create policy ao_recurring_schedules_update_region_leader
on public.ao_recurring_schedules
for update
to authenticated
using (
    public.is_region_leader(region_id)
)
with check (
    public.is_region_leader(region_id)
);

create policy ao_recurring_schedules_delete_region_leader
on public.ao_recurring_schedules
for delete
to authenticated
using (
    public.is_region_leader(region_id)
);


-- =========================================================
-- 3. Backfill one recurring schedule per current AO weekday.
--
-- The matching Site is determined by exact normalized
-- location_name within the same region.
-- =========================================================

insert into public.ao_recurring_schedules (
    region_id,
    ao_id,
    site_id,
    weekday,
    start_time,
    duration_minutes,
    schedule_label,
    emphasis_rule,
    effective_start_date,
    effective_end_date,
    is_active
)
select
    a.region_id,
    a.id,
    s.id,
    day_value.weekday,
    coalesce(
        nullif(a.time_schedule ->> day_value.weekday::text, ''),
        a.time
    )::time,
    null,
    null,
    coalesce(
        a.emphasis_schedule -> day_value.weekday::text,
        case
            when (
                a.emphasis_schedule -> '*'
            ) is not null
            and (
                coalesce(
                    a.emphasis_schedule
                        -> '*'
                        -> 'daysOfWeek',
                    '[]'::jsonb
                ) = '[]'::jsonb
                or (
                    a.emphasis_schedule
                        -> '*'
                        -> 'daysOfWeek'
                ) @> to_jsonb(
                    array[day_value.weekday]
                )
            )
            then a.emphasis_schedule -> '*'
            else '{}'::jsonb
        end,
        '{}'::jsonb
    ),
    null,
    null,
    a.is_active
from public.aos a
cross join lateral unnest(a.days_of_week)
    as day_value(weekday)
join public.sites s
    on s.region_id = a.region_id
   and lower(trim(s.name)) =
       lower(trim(a.location_name))
where nullif(trim(a.location_name), '') is not null
  and lower(trim(a.location_name)) <> 'various'
on conflict do nothing;

commit;