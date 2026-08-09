/*
 * Return standings for an individual opt-in campaign.
 *
 * Supported metrics:
 * - member_posts
 * - manual_quantity
 *
 * Daily manual challenges rank by completed days first,
 * cumulative quantity second.
 */
create or replace function public.get_campaign_standings(
    p_campaign_id uuid
)
returns table (
    rank_position bigint,
    member_id uuid,
    pax_name text,
    current_value numeric,
    target_value numeric,
    progress_percent numeric,
    completed_days bigint,
    total_days integer,
    is_current_member boolean
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_campaign public.campaigns%rowtype;
    campaign_target numeric;
    campaign_days integer := 0;
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

    if target_campaign.participant_mode <> 'individual'
       or target_campaign.enrollment_mode <> 'opt_in'
    then
        raise exception
            'Campaign does not support individual standings';
    end if;


    /*
     * Automatic attendance challenge.
     */
    if target_campaign.metric_key = 'member_posts' then

        campaign_target := target_campaign.target_value;

        return query
        with enrolled_members as (
            select
                enrollment.member_id,
                member.pax_name
            from public.campaign_enrollments enrollment
            join public.members member
              on member.id = enrollment.member_id
            where enrollment.campaign_id = target_campaign.id
              and enrollment.status = 'active'
        ),

        member_posts as (
            select
                enrolled.member_id,
                enrolled.pax_name,
                count(
                    distinct post.session_id
                )::numeric as current_value
            from enrolled_members enrolled

            left join lateral (
                select distinct session_row.id as session_id
                from public.sessions session_row
                cross join lateral jsonb_array_elements_text(
                    coalesce(
                        session_row.attendee_ids,
                        '[]'::jsonb
                    )
                ) attendee(member_id_text)
                where session_row.region_id =
                        target_campaign.region_id
                  and session_row.date::date between
                        target_campaign.starts_on
                        and target_campaign.ends_on
                  and attendee.member_id_text =
                        enrolled.member_id::text

                union

                select distinct session_row.id as session_id
                from public.sessions session_row
                cross join lateral jsonb_array_elements(
                    coalesce(
                        session_row.fngs,
                        '[]'::jsonb
                    )
                ) fng(fng_obj)
                where session_row.region_id =
                        target_campaign.region_id
                  and session_row.date::date between
                        target_campaign.starts_on
                        and target_campaign.ends_on
                  and coalesce(
                        fng.fng_obj ->> 'memberId',
                        fng.fng_obj ->> 'member_id'
                  ) = enrolled.member_id::text
            ) post on true

            group by
                enrolled.member_id,
                enrolled.pax_name
        ),

        ranked as (
            select
                row_number() over (
                    order by
                        member_posts.current_value desc,
                        member_posts.pax_name asc
                ) as rank_position,

                member_posts.member_id,
                member_posts.pax_name,
                member_posts.current_value
            from member_posts
        )

        select
            ranked.rank_position,
            ranked.member_id,
            ranked.pax_name,
            ranked.current_value,
            campaign_target,
            case
                when campaign_target > 0 then
                    round(
                        (
                            ranked.current_value
                            / campaign_target
                        ) * 100,
                        1
                    )
                else 0
            end,
            0::bigint,
            0::integer,
            ranked.member_id =
                caller_profile.member_id
        from ranked
        order by ranked.rank_position;

        return;
    end if;


    /*
     * Manual quantity challenge.
     */
    if target_campaign.metric_key = 'manual_quantity' then

        if target_campaign.cadence = 'daily' then
            campaign_days :=
                target_campaign.ends_on
                - target_campaign.starts_on
                + 1;

            campaign_target :=
                target_campaign.target_value
                * campaign_days;
        else
            campaign_target :=
                target_campaign.target_value;
        end if;

        return query
        with enrolled_members as (
            select
                enrollment.member_id,
                member.pax_name
            from public.campaign_enrollments enrollment
            join public.members member
              on member.id = enrollment.member_id
            where enrollment.campaign_id = target_campaign.id
              and enrollment.status = 'active'
        ),

        totals as (
            select
                enrolled.member_id,
                enrolled.pax_name,

                coalesce(
                    sum(contribution.quantity),
                    0
                )::numeric as current_value,

                count(*) filter (
                    where
                        target_campaign.cadence = 'daily'
                        and contribution.quantity >=
                            target_campaign.target_value
                )::bigint as completed_days

            from enrolled_members enrolled

            left join public.campaign_contributions contribution
              on contribution.campaign_id =
                    target_campaign.id
             and contribution.member_id =
                    enrolled.member_id

            group by
                enrolled.member_id,
                enrolled.pax_name
        ),

        ranked as (
            select
                row_number() over (
                    order by
                        case
                            when target_campaign.cadence = 'daily'
                                then totals.completed_days
                            else 0
                        end desc,
                        totals.current_value desc,
                        totals.pax_name asc
                ) as rank_position,

                totals.*
            from totals
        )

        select
            ranked.rank_position,
            ranked.member_id,
            ranked.pax_name,
            ranked.current_value,
            campaign_target,
            case
                when campaign_target > 0 then
                    round(
                        (
                            ranked.current_value
                            / campaign_target
                        ) * 100,
                        1
                    )
                else 0
            end,
            ranked.completed_days,
            campaign_days,
            ranked.member_id =
                caller_profile.member_id
        from ranked
        order by ranked.rank_position;

        return;
    end if;


    raise exception
        'Unsupported campaign standings metric: %',
        target_campaign.metric_key;
end;
$function$;

revoke all on function public.get_campaign_standings(uuid)
from public;

grant execute on function public.get_campaign_standings(uuid)
to authenticated;