create or replace function public.get_campaign_daily_history(
    p_campaign_id uuid
)
returns table (
    contribution_date date,
    quantity numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
    caller_member_id uuid;
    target_campaign public.campaigns%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_campaign_id is null then
        raise exception 'Campaign id is required';
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
       or target_campaign.cadence <> 'daily'
    then
        raise exception
            'Campaign does not support daily history';
    end if;

    return query
    select
        contribution.contribution_date,
        contribution.quantity
    from public.campaign_contributions contribution
    where contribution.campaign_id = target_campaign.id
      and contribution.member_id = caller_member_id
    order by contribution.contribution_date;
end;
$function$;

revoke all on function public.get_campaign_daily_history(uuid)
from public;

grant execute on function public.get_campaign_daily_history(uuid)
to authenticated;