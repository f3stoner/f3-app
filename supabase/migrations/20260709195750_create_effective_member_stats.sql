create table if not exists public.effective_member_stats (
    region_id uuid not null references public.regions(id) on delete cascade,
    member_id uuid not null references public.members(id) on delete cascade,

    total_posts integer not null default 0,
    total_qs integer not null default 0,

    baseline_posts integer not null default 0,
    baseline_qs integer not null default 0,

    post_cutover_posts integer not null default 0,
    post_cutover_qs integer not null default 0,

    posts_30_days integer not null default 0,
    qs_30_days integer not null default 0,
    posts_90_days integer not null default 0,
    qs_90_days integer not null default 0,

    first_post_date date,
    last_post_date date,
    last_q_date date,
    favorite_ao text,
    fngs_eh integer not null default 0,

    baseline_date date,
    baseline_source text,
    baseline_import_batch_id uuid,

    updated_at timestamptz not null default now(),

    primary key (region_id, member_id),

    constraint effective_member_stats_nonnegative_counts check (
        total_posts >= 0
        and total_qs >= 0
        and baseline_posts >= 0
        and baseline_qs >= 0
        and post_cutover_posts >= 0
        and post_cutover_qs >= 0
        and posts_30_days >= 0
        and qs_30_days >= 0
        and posts_90_days >= 0
        and qs_90_days >= 0
        and fngs_eh >= 0
    )
);

create index if not exists idx_effective_member_stats_member_id
    on public.effective_member_stats(member_id);

create index if not exists idx_effective_member_stats_region_id
    on public.effective_member_stats(region_id);

alter table public.effective_member_stats enable row level security;

create policy "Users can read effective member stats for accessible regions"
    on public.effective_member_stats
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.region_access ra
            where ra.region_id = effective_member_stats.region_id
              and ra.user_id = auth.uid()
        )
    );