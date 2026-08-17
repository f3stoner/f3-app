create table public.region_import_staged_sites (
    id uuid primary key default gen_random_uuid(),

    project_id uuid not null
        references public.region_import_projects(id)
        on delete cascade,

    source_key text not null,

    name text not null,
    address text,
    map_url text,
    latitude numeric,
    longitude numeric,
    weather_location_label text,
    weather_enabled boolean not null default true,

    status text not null default 'staged',

    created_site_id uuid
        references public.sites(id)
        on delete restrict,

    source_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint region_import_staged_sites_name_not_blank
        check (length(btrim(name)) > 0),

    constraint region_import_staged_sites_status_check
        check (
            status in (
                'staged',
                'reviewed',
                'committed',
                'ignored',
                'error'
            )
        ),

    constraint region_import_staged_sites_project_source_unique
        unique (project_id, source_key)
);


create table public.region_import_staged_aos (
    id uuid primary key default gen_random_uuid(),

    project_id uuid not null
        references public.region_import_projects(id)
        on delete cascade,

    source_key text not null,

    name text not null,

    default_site_source_key text,

    is_active boolean not null default true,

    status text not null default 'staged',

    created_ao_id uuid
        references public.aos(id)
        on delete restrict,

    source_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint region_import_staged_aos_name_not_blank
        check (length(btrim(name)) > 0),

    constraint region_import_staged_aos_status_check
        check (
            status in (
                'staged',
                'reviewed',
                'committed',
                'ignored',
                'error'
            )
        ),

    constraint region_import_staged_aos_project_source_unique
        unique (project_id, source_key)
);


create table public.region_import_staged_schedules (
    id uuid primary key default gen_random_uuid(),

    project_id uuid not null
        references public.region_import_projects(id)
        on delete cascade,

    source_key text not null,

    ao_source_key text not null,
    site_source_key text not null,

    weekday integer not null,
    start_time time without time zone not null,
    duration_minutes integer,

    schedule_label text,
    emphasis_rule jsonb not null default '{}'::jsonb,

    effective_start_date date,
    effective_end_date date,

    is_active boolean not null default true,

    status text not null default 'staged',

    created_schedule_id uuid
        references public.ao_recurring_schedules(id)
        on delete restrict,

    source_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint region_import_staged_schedules_weekday_valid
        check (weekday >= 0 and weekday <= 6),

    constraint region_import_staged_schedules_duration_valid
        check (
            duration_minutes is null
            or duration_minutes > 0
        ),

    constraint region_import_staged_schedules_dates_valid
        check (
            effective_end_date is null
            or effective_start_date is null
            or effective_end_date >= effective_start_date
        ),

    constraint region_import_staged_schedules_status_check
        check (
            status in (
                'staged',
                'reviewed',
                'committed',
                'ignored',
                'error'
            )
        ),

    constraint region_import_staged_schedules_project_source_unique
        unique (project_id, source_key)
);


create index region_import_staged_sites_project_idx
    on public.region_import_staged_sites(project_id);

create index region_import_staged_aos_project_idx
    on public.region_import_staged_aos(project_id);

create index region_import_staged_schedules_project_idx
    on public.region_import_staged_schedules(project_id);


alter table public.region_import_staged_sites
    enable row level security;

alter table public.region_import_staged_aos
    enable row level security;

alter table public.region_import_staged_schedules
    enable row level security;


create policy region_import_staged_sites_superadmin_all
on public.region_import_staged_sites
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_staged_aos_superadmin_all
on public.region_import_staged_aos
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_staged_schedules_superadmin_all
on public.region_import_staged_schedules
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());