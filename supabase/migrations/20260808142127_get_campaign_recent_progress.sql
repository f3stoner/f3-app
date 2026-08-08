/*
 * Return recent qualifying progress for a campaign.
 *
 * V1 supports regional_first_time_fngs.
 * This uses the same first-regional-post semantics as
 * get_campaign_progress().
 */
create or replace function public.get_campaign_recent_progress(
    p_campaign_id uuid,
    p_limit integer default 20
)
returns table (
    member_id uuid,
    pax_name text,
    session_id uuid,
    session_date date,
    ao_id uuid,
    ao_name text
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_campaign public.campaigns%rowtype;
    safe_limit integer;
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

    safe_limit := least(
        greatest(coalesce(p_limit, 20), 1),
        100
    );

    if target_campaign.metric_key <> 'regional_first_time_fngs' then
        raise exception
            'Unsupported campaign metric: %',
            target_campaign.metric_key;
    end if;

    return query
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
            member.id as member_id,
            member.pax_name,
            session_row.id as session_id,
            session_row.date::date as session_date,
            session_row.ao_id,
            session_row.ao_name
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
        select distinct on (campaign_fng.member_id)
            campaign_fng.member_id,
            campaign_fng.pax_name,
            campaign_fng.session_id,
            campaign_fng.session_date,
            campaign_fng.ao_id,
            campaign_fng.ao_name
        from campaign_fng_events campaign_fng
        join first_regional_post_dates first_post
          on first_post.member_id = campaign_fng.member_id
         and first_post.first_post_date = campaign_fng.session_date
        order by
            campaign_fng.member_id,
            campaign_fng.session_date,
            campaign_fng.session_id
    )

    select
        qualifying.member_id,
        qualifying.pax_name,
        qualifying.session_id,
        qualifying.session_date,
        qualifying.ao_id,
        qualifying.ao_name
    from qualifying_fngs qualifying
    order by
        qualifying.session_date desc,
        qualifying.pax_name
    limit safe_limit;
end;
$function$;

revoke all on function
public.get_campaign_recent_progress(uuid, integer)
from public;

grant execute on function
public.get_campaign_recent_progress(uuid, integer)
to authenticated;