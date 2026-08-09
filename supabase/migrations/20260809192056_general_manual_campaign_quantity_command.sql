/*
 * General manual campaign quantity command.
 *
 * Supports:
 *
 * - individual daily quantity challenges;
 * - individual cumulative quantity challenges;
 * - regional collective cumulative quantity campaigns.
 *
 * One canonical quantity is stored per member / campaign / date.
 */
create or replace function public.set_campaign_quantity(
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
    contribution_date date;
    saved_contribution public.campaign_contributions%rowtype;
    is_enrolled boolean := false;
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

    contribution_date :=
        coalesce(
            p_contribution_date,
            current_date
        );

    select profile.member_id
    into caller_member_id
    from public.profiles profile
    where profile.id = auth.uid();

    if caller_member_id is null then
        raise exception
            'Authenticated member not found';
    end if;

    select *
    into target_campaign
    from public.campaigns
    where id = p_campaign_id;

    if target_campaign.id is null then
        raise exception 'Campaign not found';
    end if;

    if not public.has_region_access(
        target_campaign.region_id
    ) then
        raise exception
            'Not authorized for this region';
    end if;

    if target_campaign.metric_key <> 'manual_quantity'
       or target_campaign.tracking_mode <> 'manual'
    then
        raise exception
            'Campaign does not support manual quantity logging';
    end if;

    if target_campaign.cadence not in (
        'campaign',
        'daily'
    ) then
        raise exception
            'Campaign cadence does not support quantity logging';
    end if;

    if contribution_date < target_campaign.starts_on
       or contribution_date > target_campaign.ends_on
    then
        raise exception
            'Contribution date is outside the campaign window';
    end if;

    if contribution_date > current_date then
        raise exception
            'Future contributions are not allowed';
    end if;


    /*
     * Individual opt-in challenges require active enrollment.
     *
     * Collective campaigns do not require enrollment rows.
     */
    if target_campaign.participant_mode = 'individual' then

        if target_campaign.enrollment_mode <> 'opt_in' then
            raise exception
                'Unsupported individual enrollment mode';
        end if;

        select exists (
            select 1
            from public.campaign_enrollments enrollment
            where enrollment.campaign_id =
                    target_campaign.id
              and enrollment.member_id =
                    caller_member_id
              and enrollment.status = 'active'
        )
        into is_enrolled;

        if not is_enrolled then
            raise exception
                'Join the challenge before logging progress';
        end if;


    elsif target_campaign.participant_mode = 'collective' then

        if target_campaign.enrollment_mode <> 'automatic' then
            raise exception
                'Unsupported collective enrollment mode';
        end if;


    else
        raise exception
            'Unsupported campaign participation mode';
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
        contribution_date,
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

revoke all on function public.set_campaign_quantity(
    uuid,
    numeric,
    date
)
from public;

grant execute on function public.set_campaign_quantity(
    uuid,
    numeric,
    date
)
to authenticated;

create or replace function public.set_campaign_daily_quantity(
    p_campaign_id uuid,
    p_quantity numeric,
    p_contribution_date date default current_date
)
returns jsonb
language sql
security definer
set search_path = public
as $function$
    select public.set_campaign_quantity(
        p_campaign_id,
        p_quantity,
        coalesce(
            p_contribution_date,
            current_date
        )
    );
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