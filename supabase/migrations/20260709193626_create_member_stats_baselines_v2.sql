create table if not exists public.member_stats_baselines (
    id uuid primary key default gen_random_uuid(),

    member_id uuid not null references public.members(id) on delete cascade,
    region_id uuid not null references public.regions(id) on delete cascade,

    source text not null,
    baseline_date date not null,
    import_batch_id uuid not null,

    baseline_posts integer not null default 0,
    baseline_qs integer not null default 0,
    baseline_bds integer not null default 0,
    baseline_csaups integer not null default 0,
    baseline_dd_only integer not null default 0,
    baseline_other integer not null default 0,
    baseline_dr_posts integer not null default 0,
    baseline_last_post date,

    created_at timestamptz not null default now(),
    created_by uuid references auth.users(id),

    constraint member_stats_baselines_nonnegative_counts check (
        baseline_posts >= 0
        and baseline_qs >= 0
        and baseline_bds >= 0
        and baseline_csaups >= 0
        and baseline_dd_only >= 0
        and baseline_other >= 0
        and baseline_dr_posts >= 0
    ),

    constraint member_stats_baselines_unique_source_date unique (
        member_id,
        region_id,
        source,
        baseline_date
    )
);

create index if not exists idx_member_stats_baselines_member_id
    on public.member_stats_baselines(member_id);

create index if not exists idx_member_stats_baselines_region_id
    on public.member_stats_baselines(region_id);

create index if not exists idx_member_stats_baselines_import_batch_id
    on public.member_stats_baselines(import_batch_id);

alter table public.member_stats_baselines enable row level security;



create policy "Users can read member stat baselines for accessible regions"
    on public.member_stats_baselines
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.region_access ra
            where ra.region_id = member_stats_baselines.region_id
              and ra.user_id = auth.uid()
        )
    );