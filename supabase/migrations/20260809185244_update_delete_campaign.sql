/*
 * Delete a campaign.
 *
 * Regional leadership may delete any campaign in the region.
 *
 * The creator of a PAX-created challenge may delete his own
 * challenge.
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
    caller_is_creator boolean := false;
    caller_is_region_leader boolean := false;
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

    caller_is_region_leader :=
        public.is_region_leader(
            target_campaign.region_id
        );

    caller_is_creator :=
        target_campaign.creator_mode = 'pax'
        and target_campaign.created_by_user_id = auth.uid();

    if not (
        caller_is_region_leader
        or caller_is_creator
    ) then
        raise exception
            'Not authorized to delete this campaign';
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