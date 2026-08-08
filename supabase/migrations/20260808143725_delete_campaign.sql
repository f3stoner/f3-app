/*
 * Delete a regional campaign.
 *
 * Campaign deletion is restricted to regional leadership using
 * the same authorization model as campaign creation.
 */
create or replace function public.delete_campaign(
    p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    target_campaign public.campaigns%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_campaign_id is null then
        raise exception 'Campaign id is required';
    end if;

    select *
    into target_campaign
    from public.campaigns
    where id = p_campaign_id;

    if target_campaign.id is null then
        raise exception 'Campaign not found';
    end if;

    if not public.is_region_leader(target_campaign.region_id) then
        raise exception
            'Not authorized to delete campaigns for this region';
    end if;

    delete from public.campaigns
    where id = target_campaign.id;

    return jsonb_build_object(
        'deletedId',
        target_campaign.id,
        'regionId',
        target_campaign.region_id
    );
end;
$function$;

revoke all on function public.delete_campaign(uuid)
from public;

grant execute on function public.delete_campaign(uuid)
to authenticated;