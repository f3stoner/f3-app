/*
 * Expand campaign progress support for collective
 * cumulative manual quantity campaigns.
 *
 * Existing behavior remains unchanged for:
 * - regional FNG campaigns;
 * - individual post-count challenges;
 * - individual daily manual quantity challenges;
 * - individual cumulative manual quantity challenges.
 *
 * Collective cumulative manual campaigns:
 * - sum contributions from all PAX;
 * - count distinct contributors;
 * - still return the current member's todayCurrent
 *   for incremental logging.
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

        /*
         * Individual manual challenges.
         */
        if target_campaign.participant_mode = 'individual' then

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

            elsif target_campaign.cadence = 'campaign' then
                campaign_target := target_campaign.target_value;

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
                raise exception
                    'Unsupported manual quantity cadence: %',
                    target_campaign.cadence;
            end if;


        /*
         * Collective cumulative manual campaigns.
         */
        elsif target_campaign.participant_mode = 'collective' then

            if target_campaign.cadence <> 'campaign' then
                raise exception
                    'Collective manual quantity currently requires campaign cadence';
            end if;

            campaign_target := target_campaign.target_value;

            select coalesce(sum(contribution.quantity), 0)
            into current_value
            from public.campaign_contributions contribution
            where contribution.campaign_id = target_campaign.id;

            select count(
                distinct contribution.member_id
            )
            into participant_count
            from public.campaign_contributions contribution
            where contribution.campaign_id = target_campaign.id;

            select coalesce(contribution.quantity, 0)
            into today_current
            from public.campaign_contributions contribution
            where contribution.campaign_id = target_campaign.id
              and contribution.member_id = caller_profile.member_id
              and contribution.contribution_date = current_date;

            if not found then
                today_current := 0;
            end if;

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
            raise exception
                'Unsupported manual quantity participation mode: %',
                target_campaign.participant_mode;
        end if;


    else
        raise exception
            'Unsupported campaign metric: %',
            target_campaign.metric_key;
    end if;


    if target_campaign.metric_key <> 'manual_quantity' then
        campaign_target := target_campaign.target_value;

        progress_percent :=
            case
                when campaign_target > 0 then
                    round(
                        (current_value / campaign_target) * 100,
                        1
                    )
                else 0
            end;
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

revoke all on function public.get_campaign_progress(uuid)
from public;

grant execute on function public.get_campaign_progress(uuid)
to authenticated;