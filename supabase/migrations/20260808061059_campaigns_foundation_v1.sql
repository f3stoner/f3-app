/*
 * Campaigns V1 foundation.
 *
 * Campaigns are reusable regional coordination initiatives.
 *
 * Automatic campaign progress is derived from canonical
 * production data rather than maintained in mutable counters.
 */


/*
 * Reusable campaign definitions published by The Q.
 *
 * Launched campaigns snapshot their effective configuration so
 * future template changes do not alter historical campaigns.
 */
create table public.campaign_templates (
    id uuid primary key default gen_random_uuid(),

    template_key text not null,
    version integer not null default 1,

    title text not null,
    description text,

    status text not null default 'draft',

    scope_type text not null default 'region',
    participant_mode text not null default 'collective',
    enrollment_mode text not null default 'automatic',

    default_duration_days integer,

    metric_key text not null,
    metric_config jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint campaign_templates_key_version_unique
        unique (
            template_key,
            version
        ),

    constraint campaign_templates_status_check
        check (
            status in (
                'draft',
                'published',
                'retired'
            )
        ),

    constraint campaign_templates_scope_type_check
        check (
            scope_type in (
                'region',
                'ao',
                'team'
            )
        ),

    constraint campaign_templates_participant_mode_check
        check (
            participant_mode in (
                'collective',
                'individual'
            )
        ),

    constraint campaign_templates_enrollment_mode_check
        check (
            enrollment_mode in (
                'automatic',
                'opt_in',
                'managed'
            )
        ),

    constraint campaign_templates_duration_check
        check (
            default_duration_days is null
            or default_duration_days > 0
        ),

    constraint campaign_templates_metric_key_check
        check (
            length(trim(metric_key)) > 0
        ),

    constraint campaign_templates_metric_config_check
        check (
            jsonb_typeof(metric_config) = 'object'
        )
);


/*
 * One launched campaign.
 *
 * Campaigns belong to one region. AO/team scope can be added
 * without changing the regional tenant boundary.
 */
create table public.campaigns (
    id uuid primary key default gen_random_uuid(),

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    template_id uuid
        references public.campaign_templates(id)
        on delete set null,

    title text not null,
    description text,

    scope_type text not null default 'region',

    scope_ao_id uuid
        references public.aos(id)
        on delete restrict,

    participant_mode text not null default 'collective',
    enrollment_mode text not null default 'automatic',

    status text not null default 'draft',

    starts_on date not null,
    ends_on date not null,

    metric_key text not null,
    target_value numeric not null,
    metric_config jsonb not null default '{}'::jsonb,

    created_by_user_id uuid not null
        references auth.users(id)
        on delete restrict,

    published_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint campaigns_scope_type_check
        check (
            scope_type in (
                'region',
                'ao',
                'team'
            )
        ),

    constraint campaigns_participant_mode_check
        check (
            participant_mode in (
                'collective',
                'individual'
            )
        ),

    constraint campaigns_enrollment_mode_check
        check (
            enrollment_mode in (
                'automatic',
                'opt_in',
                'managed'
            )
        ),

    constraint campaigns_status_check
        check (
            status in (
                'draft',
                'scheduled',
                'active',
                'completed',
                'cancelled'
            )
        ),

    constraint campaigns_date_range_check
        check (
            ends_on >= starts_on
        ),

    constraint campaigns_metric_key_check
        check (
            length(trim(metric_key)) > 0
        ),

    constraint campaigns_target_value_check
        check (
            target_value > 0
        ),

    constraint campaigns_metric_config_check
        check (
            jsonb_typeof(metric_config) = 'object'
        ),

    constraint campaigns_ao_scope_shape_check
        check (
            (
                scope_type = 'ao'
                and scope_ao_id is not null
            )
            or (
                scope_type <> 'ao'
                and scope_ao_id is null
            )
        )
);


create index campaigns_region_status_dates_idx
on public.campaigns (
    region_id,
    status,
    starts_on,
    ends_on
);

create index campaigns_scope_ao_idx
on public.campaigns (
    scope_ao_id
)
where scope_ao_id is not null;


/*
 * RLS.
 */

alter table public.campaign_templates
enable row level security;

alter table public.campaigns
enable row level security;


/*
 * Published official templates are readable by authenticated
 * users.
 */
create policy campaign_templates_authenticated_read
on public.campaign_templates
for select
to authenticated
using (
    status = 'published'
);


/*
 * Campaign visibility follows the existing regional workspace
 * access model used by the regional feed.
 */
create policy campaigns_region_read
on public.campaigns
for select
to authenticated
using (
    public.has_region_access(region_id)
    or exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.role = 'superadmin'
    )
);


/*
 * Campaign mutations will go through explicit security-definer
 * commands rather than direct table writes.
 */
revoke insert, update, delete
on public.campaign_templates
from anon, authenticated;

revoke insert, update, delete
on public.campaigns
from anon, authenticated;


/*
 * First official The Q campaign template.
 */
insert into public.campaign_templates (
    template_key,
    version,
    title,
    description,
    status,
    scope_type,
    participant_mode,
    enrollment_mode,
    default_duration_days,
    metric_key,
    metric_config
)
values (
    'regional_fng_drive',
    1,
    'FNG Drive',
    'Set a regional goal for welcoming first-time PAX during a defined campaign window.',
    'published',
    'region',
    'collective',
    'automatic',
    30,
    'regional_first_time_fngs',
    jsonb_build_object(
        'unit',
        'FNGs'
    )
);


/*
 * Return current campaign progress.
 *
 * Automatic metrics derive from canonical application facts.
 * No campaign-progress counter is stored.
 */
create or replace function public.get_campaign_progress(
    p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_campaign public.campaigns%rowtype;

    current_value numeric := 0;
    progress_percent numeric := 0;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_campaign_id is null then
        raise exception 'Campaign id is required';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    select *
    into target_campaign
    from public.campaigns
    where id = p_campaign_id;

    if target_campaign.id is null then
        raise exception 'Campaign not found';
    end if;

    if not (
        caller_profile.role = 'superadmin'
        or public.has_region_access(
            target_campaign.region_id
        )
    )
    then
        raise exception 'Not authorized for this region';
    end if;


    /*
     * Regional first-time FNGs.
     *
     * A qualifying member:
     *
     * 1. has canonical regional attendance;
     * 2. was represented as an FNG during the campaign;
     * 3. the FNG session occurred on that member's earliest
     *    credited regional post date.
     *
     * Attendance compatibility follows existing application
     * behavior by reading both attendee_ids and linked FNG
     * member ids.
     *
     * FNG compatibility supports both current memberId and
     * historical member_id JSON keys.
     */
    if target_campaign.metric_key =
        'regional_first_time_fngs'
    then
        with regional_post_events as (
            /*
             * Canonical attendance.
             */
            select distinct
                session_row.id as session_id,
                session_row.date::date as session_date,
                attendee.member_id_text::uuid as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements_text(
                coalesce(
                    session_row.attendee_ids,
                    '[]'::jsonb
                )
            ) as attendee(member_id_text)
            where session_row.region_id =
                target_campaign.region_id


            union


            /*
             * Historical linked-FNG compatibility.
             */
            select distinct
                session_row.id as session_id,
                session_row.date::date as session_date,
                coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
                )::uuid as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(
                    session_row.fngs,
                    '[]'::jsonb
                )
            ) as fng(fng_obj)
            where session_row.region_id =
                target_campaign.region_id
              and coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
              ) is not null
        ),

        first_regional_post_dates as (
            select
                post.member_id,
                min(post.session_date) as first_post_date
            from regional_post_events post
            group by post.member_id
        ),

        campaign_fng_events as (
            select distinct
                session_row.id as session_id,
                session_row.date::date as session_date,
                member.id as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(
                    session_row.fngs,
                    '[]'::jsonb
                )
            ) as fng(fng_obj)
            join public.members member
              on member.id::text = coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
              )
            where session_row.region_id =
                target_campaign.region_id
              and session_row.date::date
                    between
                        target_campaign.starts_on
                        and target_campaign.ends_on
        ),

        qualifying_fngs as (
            select distinct
                campaign_fng.member_id
            from campaign_fng_events campaign_fng
            join first_regional_post_dates first_post
              on first_post.member_id =
                    campaign_fng.member_id
             and first_post.first_post_date =
                    campaign_fng.session_date
        )

        select count(*)
        into current_value
        from qualifying_fngs;


    else
        raise exception
            'Unsupported campaign metric: %',
            target_campaign.metric_key;
    end if;


    progress_percent :=
        round(
            (
                current_value
                / target_campaign.target_value
            ) * 100,
            1
        );


    return jsonb_build_object(
        'campaignId',
        target_campaign.id,
        'metric',
        target_campaign.metric_key,
        'current',
        current_value,
        'target',
        target_campaign.target_value,
        'percent',
        progress_percent,
        'goalReached',
        current_value >= target_campaign.target_value,
        'unit',
        target_campaign.metric_config ->> 'unit',
        'startsOn',
        target_campaign.starts_on,
        'endsOn',
        target_campaign.ends_on
    );
end;
$function$;


revoke all on function
public.get_campaign_progress(uuid)
from public;

grant execute on function
public.get_campaign_progress(uuid)
to authenticated;