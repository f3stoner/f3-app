/*
 * Campaigns V3:
 *
 * - support individual manual quantity challenges;
 * - record one quantity per member per campaign per day;
 * - calculate campaign and daily progress;
 * - publish the first manual challenge template.
 */


/* =========================================================
   CONTRIBUTION UNIQUENESS
   ========================================================= */

/*
 * Daily quantity challenges need one canonical row per member
 * per campaign per date.
 */
alter table public.campaign_contributions
add constraint campaign_contributions_campaign_member_date_unique
unique (
    campaign_id,
    member_id,
    contribution_date
);


/* =========================================================
   CREATE CAMPAIGN
   ========================================================= */

/*
 * Expand campaign creation to support manual individual
 * opt-in templates.
 */
create or replace function public.create_campaign(
    p_region_id uuid,
    p_template_id uuid,
    p_title text,
    p_description text,
    p_starts_on date,
    p_ends_on date,
    p_target_value numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    source_template public.campaign_templates%rowtype;
    created_campaign public.campaigns%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_region_id is null then
        raise exception 'Region id is required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception
            'Not authorized to create campaigns for this region';
    end if;

    if p_template_id is null then
        raise exception 'Campaign template is required';
    end if;

    select *
    into source_template
    from public.campaign_templates
    where id = p_template_id
      and status = 'published';

    if source_template.id is null then
        raise exception 'Published campaign template not found';
    end if;

    if nullif(trim(p_title), '') is null then
        raise exception 'Campaign title is required';
    end if;

    if p_starts_on is null or p_ends_on is null then
        raise exception 'Campaign dates are required';
    end if;

    if p_ends_on < p_starts_on then
        raise exception
            'Campaign end date cannot precede start date';
    end if;

    if p_target_value is null or p_target_value <= 0 then
        raise exception
            'Campaign target must be greater than zero';
    end if;

    if source_template.scope_type <> 'region' then
        raise exception
            'Unsupported campaign template scope';
    end if;

    if not (
        (
            source_template.participant_mode = 'collective'
            and source_template.enrollment_mode = 'automatic'
            and source_template.tracking_mode = 'automatic'
        )
        or (
            source_template.participant_mode = 'individual'
            and source_template.enrollment_mode = 'opt_in'
            and source_template.tracking_mode in (
                'automatic',
                'manual'
            )
        )
    ) then
        raise exception
            'Unsupported campaign participation configuration';
    end if;

    insert into public.campaigns (
        region_id,
        template_id,
        title,
        description,
        scope_type,
        scope_ao_id,
        participant_mode,
        enrollment_mode,
        status,
        starts_on,
        ends_on,
        metric_key,
        target_value,
        metric_config,
        tracking_mode,
        cadence,
        creator_mode,
        created_by_user_id,
        published_at
    )
    values (
        p_region_id,
        source_template.id,
        trim(p_title),
        nullif(trim(p_description), ''),
        source_template.scope_type,
        null,
        source_template.participant_mode,
        source_template.enrollment_mode,
        'active',
        p_starts_on,
        p_ends_on,
        source_template.metric_key,
        p_target_value,
        source_template.metric_config,
        source_template.tracking_mode,
        source_template.cadence,
        'region',
        auth.uid(),
        now()
    )
    returning *
    into created_campaign;

    return jsonb_build_object(
        'campaign',
        to_jsonb(created_campaign)
    );
end;
$function$;


/* =========================================================
   LOG MANUAL QUANTITY
   ========================================================= */

create or replace function public.set_campaign_daily_quantity(
    p_campaign_id uuid,
    p_quantity numeric,
    p_contribution_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_member_id uuid;
    target_campaign public.campaigns%rowtype;
    enrollment public.campaign_enrollments%rowtype;
    saved_contribution public.campaign_contributions%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_campaign_id is null then
        raise exception 'Campaign id is required';
    end if;

    if p_quantity is null or p_quantity < 0 then
        raise exception
            'Quantity must be zero or greater';
    end if;

    if p_contribution_date is null then
        raise exception
            'Contribution date is required';
    end if;

    select profile.member_id
    into caller_member_id
    from public.profiles profile
    where profile.id = auth.uid();

    if caller_member_id is null then
        raise exception 'Authenticated member not found';
    end if;

    select *
    into target_campaign
    from public.campaigns
    where id = p_campaign_id;

    if target_campaign.id is null then
        raise exception 'Campaign not found';
    end if;

    if not public.has_region_access(target_campaign.region_id) then
        raise exception 'Not authorized for this region';
    end if;

    if target_campaign.metric_key <> 'manual_quantity'
       or target_campaign.tracking_mode <> 'manual'
       or target_campaign.participant_mode <> 'individual'
       or target_campaign.enrollment_mode <> 'opt_in'
    then
        raise exception
            'Campaign does not support manual quantity logging';
    end if;

    if p_contribution_date < target_campaign.starts_on
       or p_contribution_date > target_campaign.ends_on
    then
        raise exception
            'Contribution date is outside the campaign window';
    end if;

    if p_contribution_date > current_date then
        raise exception
            'Future contributions are not allowed';
    end if;

    select *
    into enrollment
    from public.campaign_enrollments
    where campaign_id = target_campaign.id
      and member_id = caller_member_id
      and status = 'active';

    if enrollment.id is null then
        raise exception
            'Join the challenge before logging progress';
    end if;

    insert into public.campaign_contributions (
        campaign_id,
        member_id,
        contribution_date,
        quantity,
        completed
    )
    values (
        target_campaign.id,
        caller_member_id,
        p_contribution_date,
        p_quantity,
        null
    )
    on conflict (
        campaign_id,
        member_id,
        contribution_date
    )
    do update set
        quantity = excluded.quantity,
        updated_at = now()
    returning *
    into saved_contribution;

    return jsonb_build_object(
        'campaignId',
        target_campaign.id,
        'memberId',
        caller_member_id,
        'contributionDate',
        saved_contribution.contribution_date,
        'quantity',
        saved_contribution.quantity
    );
end;
$function$;

revoke all on function public.set_campaign_daily_quantity(
    uuid,
    numeric,
    date
)
from public;

grant execute on function public.set_campaign_daily_quantity(
    uuid,
    numeric,
    date
)
to authenticated;


/* =========================================================
   CAMPAIGN PROGRESS
   ========================================================= */

/*
 * Add manual_quantity support.
 *
 * For daily cadence:
 * - target_value is the daily target;
 * - current is the campaign cumulative quantity;
 * - todayCurrent is today's quantity;
 * - todayTarget is target_value;
 * - completedDays counts dates meeting the daily target;
 * - totalDays is campaign duration.
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

    is_enrolled boolean := false;
    participant_count bigint := 0;

    today_current numeric := 0;
    today_target numeric := 0;
    completed_days bigint := 0;
    total_days integer := 0;
    campaign_target numeric := 0;
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
        or public.has_region_access(target_campaign.region_id)
    ) then
        raise exception 'Not authorized for this region';
    end if;


    if target_campaign.metric_key = 'regional_first_time_fngs' then

        with regional_post_events as (
            select distinct
                session_row.id as session_id,
                session_row.date::date as session_date,
                attendee.member_id_text::uuid as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements_text(
                coalesce(session_row.attendee_ids, '[]'::jsonb)
            ) as attendee(member_id_text)
            where session_row.region_id = target_campaign.region_id

            union

            select distinct
                session_row.id as session_id,
                session_row.date::date as session_date,
                coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
                )::uuid as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(session_row.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            where session_row.region_id = target_campaign.region_id
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
                session_row.date::date as session_date,
                member.id as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(session_row.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            join public.members member
              on member.id::text = coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
              )
            where session_row.region_id = target_campaign.region_id
              and session_row.date::date between
                    target_campaign.starts_on
                    and target_campaign.ends_on
        ),

        qualifying_fngs as (
            select distinct
                campaign_fng.member_id
            from campaign_fng_events campaign_fng
            join first_regional_post_dates first_post
              on first_post.member_id = campaign_fng.member_id
             and first_post.first_post_date = campaign_fng.session_date
        )

        select count(*)
        into current_value
        from qualifying_fngs;


    elsif target_campaign.metric_key = 'member_posts' then

        if caller_profile.member_id is null then
            raise exception 'Authenticated member not found';
        end if;

        select exists (
            select 1
            from public.campaign_enrollments enrollment
            where enrollment.campaign_id = target_campaign.id
              and enrollment.member_id = caller_profile.member_id
              and enrollment.status = 'active'
        )
        into is_enrolled;

        select count(*)
        into participant_count
        from public.campaign_enrollments enrollment
        where enrollment.campaign_id = target_campaign.id
          and enrollment.status = 'active';

        with member_post_sessions as (
            select distinct
                session_row.id
            from public.sessions session_row
            cross join lateral jsonb_array_elements_text(
                coalesce(session_row.attendee_ids, '[]'::jsonb)
            ) as attendee(member_id_text)
            where session_row.region_id = target_campaign.region_id
              and session_row.date::date between
                    target_campaign.starts_on
                    and target_campaign.ends_on
              and attendee.member_id_text = caller_profile.member_id::text

            union

            select distinct
                session_row.id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(session_row.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            where session_row.region_id = target_campaign.region_id
              and session_row.date::date between
                    target_campaign.starts_on
                    and target_campaign.ends_on
              and coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
              ) = caller_profile.member_id::text
        )

        select count(*)
        into current_value
        from member_post_sessions;


    elsif target_campaign.metric_key = 'manual_quantity' then

        if caller_profile.member_id is null then
            raise exception 'Authenticated member not found';
        end if;

        select exists (
            select 1
            from public.campaign_enrollments enrollment
            where enrollment.campaign_id = target_campaign.id
              and enrollment.member_id = caller_profile.member_id
              and enrollment.status = 'active'
        )
        into is_enrolled;

        select count(*)
        into participant_count
        from public.campaign_enrollments enrollment
        where enrollment.campaign_id = target_campaign.id
          and enrollment.status = 'active';

        if target_campaign.cadence = 'daily' then
            total_days :=
                target_campaign.ends_on
                - target_campaign.starts_on
                + 1;

            today_target := target_campaign.target_value;

            campaign_target :=
                target_campaign.target_value
                * total_days;

            select coalesce(sum(contribution.quantity), 0)
            into current_value
            from public.campaign_contributions contribution
            where contribution.campaign_id = target_campaign.id
              and contribution.member_id = caller_profile.member_id;

            select coalesce(contribution.quantity, 0)
            into today_current
            from public.campaign_contributions contribution
            where contribution.campaign_id = target_campaign.id
              and contribution.member_id = caller_profile.member_id
              and contribution.contribution_date = current_date;

            if not found then
                today_current := 0;
            end if;

            select count(*)
            into completed_days
            from public.campaign_contributions contribution
            where contribution.campaign_id = target_campaign.id
              and contribution.member_id = caller_profile.member_id
              and contribution.quantity >= target_campaign.target_value;

            progress_percent :=
                case
                    when campaign_target > 0 then
                        round(
                            (current_value / campaign_target) * 100,
                            1
                        )
                    else 0
                end;

        else
            campaign_target := target_campaign.target_value;

            select coalesce(sum(contribution.quantity), 0)
            into current_value
            from public.campaign_contributions contribution
            where contribution.campaign_id = target_campaign.id
              and contribution.member_id = caller_profile.member_id;

            progress_percent :=
                round(
                    (
                        current_value
                        / campaign_target
                    ) * 100,
                    1
                );
        end if;


    else
        raise exception
            'Unsupported campaign metric: %',
            target_campaign.metric_key;
    end if;


    if target_campaign.metric_key <> 'manual_quantity' then
        campaign_target := target_campaign.target_value;

        progress_percent :=
            round(
                (
                    current_value
                    / campaign_target
                ) * 100,
                1
            );
    end if;


    return jsonb_build_object(
        'campaignId',
        target_campaign.id,
        'metric',
        target_campaign.metric_key,
        'participantMode',
        target_campaign.participant_mode,
        'enrollmentMode',
        target_campaign.enrollment_mode,
        'trackingMode',
        target_campaign.tracking_mode,
        'cadence',
        target_campaign.cadence,
        'current',
        current_value,
        'target',
        campaign_target,
        'percent',
        progress_percent,
        'goalReached',
        current_value >= campaign_target,
        'unit',
        target_campaign.metric_config ->> 'unit',
        'activityName',
        target_campaign.metric_config ->> 'activityName',
        'startsOn',
        target_campaign.starts_on,
        'endsOn',
        target_campaign.ends_on,
        'isEnrolled',
        is_enrolled,
        'participantCount',
        participant_count,
        'todayCurrent',
        today_current,
        'todayTarget',
        today_target,
        'completedDays',
        completed_days,
        'totalDays',
        total_days
    );
end;
$function$;


/* =========================================================
   OFFICIAL TEMPLATE: 100 MERKINS A DAY
   ========================================================= */

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
    metric_config,
    tracking_mode,
    cadence
)
values (
    'hundred_merkins_daily',
    1,
    '100 Merkins a Day',
    'Complete 100 merkins each day for 30 days.',
    'published',
    'region',
    'individual',
    'opt_in',
    30,
    'manual_quantity',
    jsonb_build_object(
        'unit',
        'Merkins',
        'activityName',
        'Merkins'
    ),
    'manual',
    'daily'
);