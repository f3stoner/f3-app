/*
 * Campaign participation foundation.
 *
 * Extends Campaigns to support automatic and manual
 * individual challenges without changing existing
 * regional collective campaigns.
 */

alter table public.campaigns
add column tracking_mode text not null default 'automatic';

alter table public.campaigns
add column cadence text not null default 'campaign';

alter table public.campaigns
add column creator_mode text not null default 'region';

alter table public.campaigns
add constraint campaigns_tracking_mode_check
check (
    tracking_mode in (
        'automatic',
        'manual'
    )
);

alter table public.campaigns
add constraint campaigns_cadence_check
check (
    cadence in (
        'campaign',
        'daily',
        'weekly'
    )
);

alter table public.campaigns
add constraint campaigns_creator_mode_check
check (
    creator_mode in (
        'region',
        'pax'
    )
);


/*
 * Explicit participation.
 *
 * Regional collective/automatic campaigns do not require
 * enrollment rows.
 *
 * Individual opt-in challenges do.
 */
create table public.campaign_enrollments (
    id uuid primary key default gen_random_uuid(),

    campaign_id uuid not null
        references public.campaigns(id)
        on delete cascade,

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    status text not null default 'active',

    joined_at timestamptz not null default now(),
    completed_at timestamptz,
    withdrawn_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint campaign_enrollments_campaign_member_unique
        unique (
            campaign_id,
            member_id
        ),

    constraint campaign_enrollments_status_check
        check (
            status in (
                'active',
                'completed',
                'withdrawn'
            )
        )
);

create index campaign_enrollments_campaign_idx
on public.campaign_enrollments (
    campaign_id,
    status
);

create index campaign_enrollments_member_idx
on public.campaign_enrollments (
    member_id,
    status
);


/*
 * Self-reported manual activity.
 *
 * Automatic campaign metrics never write here.
 */
create table public.campaign_contributions (
    id uuid primary key default gen_random_uuid(),

    campaign_id uuid not null
        references public.campaigns(id)
        on delete cascade,

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    contribution_date date not null,

    quantity numeric,

    completed boolean,

    note text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint campaign_contributions_value_check
        check (
            quantity is not null
            or completed is not null
        ),

    constraint campaign_contributions_quantity_check
        check (
            quantity is null
            or quantity >= 0
        )
);

create index campaign_contributions_campaign_member_date_idx
on public.campaign_contributions (
    campaign_id,
    member_id,
    contribution_date
);


/*
 * Read access inherits campaign region access.
 */

alter table public.campaign_enrollments
enable row level security;

alter table public.campaign_contributions
enable row level security;


create policy campaign_enrollments_region_read
on public.campaign_enrollments
for select
to authenticated
using (
    exists (
        select 1
        from public.campaigns campaign
        where campaign.id = campaign_enrollments.campaign_id
          and (
              public.has_region_access(campaign.region_id)
              or exists (
                  select 1
                  from public.profiles profile
                  where profile.id = auth.uid()
                    and profile.role = 'superadmin'
              )
          )
    )
);


create policy campaign_contributions_region_read
on public.campaign_contributions
for select
to authenticated
using (
    exists (
        select 1
        from public.campaigns campaign
        where campaign.id = campaign_contributions.campaign_id
          and (
              public.has_region_access(campaign.region_id)
              or exists (
                  select 1
                  from public.profiles profile
                  where profile.id = auth.uid()
                    and profile.role = 'superadmin'
              )
          )
    )
);


/*
 * Writes will use explicit commands.
 */

revoke insert, update, delete
on public.campaign_enrollments
from anon, authenticated;

revoke insert, update, delete
on public.campaign_contributions
from anon, authenticated;