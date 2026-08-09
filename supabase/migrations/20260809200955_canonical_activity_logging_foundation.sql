/*
 * Canonical activity logging foundation.
 *
 * Activities provide stable identities so one logged effort can
 * count toward multiple compatible challenges/campaigns.
 *
 * Activity entries represent what a PAX actually did.
 * Campaign-specific progress can later be derived from these entries.
 */


/* =========================================================
   ACTIVITY CATALOG
   ========================================================= */

create table public.activity_types (
    id uuid primary key default gen_random_uuid(),

    activity_key text not null unique,
    display_name text not null,
    unit text not null,

    quantity_type text not null default 'number'
        check (
            quantity_type in (
                'number',
                'duration'
            )
        ),

    status text not null default 'active'
        check (
            status in (
                'active',
                'inactive'
            )
        ),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index activity_types_status_idx
on public.activity_types (
    status,
    display_name
);


/* =========================================================
   MEMBER ACTIVITY ENTRIES
   ========================================================= */

create table public.member_activity_entries (
    id uuid primary key default gen_random_uuid(),

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    activity_type_id uuid not null
        references public.activity_types(id),

    quantity numeric not null
        check (quantity > 0),

    occurred_on date not null default current_date,

    created_by_user_id uuid not null
        references auth.users(id),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index member_activity_entries_member_date_idx
on public.member_activity_entries (
    member_id,
    occurred_on desc
);

create index member_activity_entries_activity_date_idx
on public.member_activity_entries (
    activity_type_id,
    occurred_on desc
);

create index member_activity_entries_region_activity_date_idx
on public.member_activity_entries (
    region_id,
    activity_type_id,
    occurred_on desc
);


/* =========================================================
   INITIAL CANONICAL ACTIVITIES
   ========================================================= */

insert into public.activity_types (
    activity_key,
    display_name,
    unit
)
values
    ('merkins', 'Merkins', 'Merkins'),
    ('burpees', 'Burpees', 'Burpees'),
    ('squats', 'Squats', 'Squats'),
    ('pull_ups', 'Pull-Ups', 'Pull-Ups'),
    ('miles', 'Miles', 'Miles'),
    ('ruck_miles', 'Ruck Miles', 'Miles'),
    ('run_miles', 'Run Miles', 'Miles'),
    ('minutes', 'Minutes', 'Minutes')
on conflict (activity_key) do nothing;


/* =========================================================
   RLS
   ========================================================= */

alter table public.activity_types
enable row level security;

alter table public.member_activity_entries
enable row level security;


/*
 * Authenticated users may read the activity catalog.
 */
create policy activity_types_authenticated_read
on public.activity_types
for select
to authenticated
using (true);


/*
 * Activity entries are not written directly by clients.
 *
 * We will add SECURITY DEFINER commands for reads/writes
 * in the next migration after verifying this schema.
 */