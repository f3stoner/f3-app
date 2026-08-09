/*
 * Canonical member activity logger.
 *
 * Logs one activity event and reconciles the member's resulting
 * daily activity total across every compatible active campaign.
 *
 * This is the primary command for standalone activity logging.
 */

create or replace function public.log_member_activity(
    p_activity_key text,
    p_quantity numeric,
    p_occurred_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    activity public.activity_types%rowtype;

    effective_date date;
    current_activity_total numeric := 0;
    new_activity_total numeric := 0;

    affected_campaign_count integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if nullif(trim(p_activity_key), '') is null then
        raise exception 'Activity key is required';
    end if;

    if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantity must be greater than zero';
    end if;

    effective_date :=
        coalesce(
            p_occurred_on,
            current_date
        );

    if effective_date > current_date then
        raise exception 'Future activity is not allowed';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    if caller_profile.member_id is null then
        raise exception 'Authenticated member not found';
    end if;

    select *
    into activity
    from public.activity_types
    where activity_key = trim(p_activity_key)
      and status = 'active';

    if activity.id is null then
        raise exception
            'Unknown or inactive activity: %',
            p_activity_key;
    end if;


    /*
     * Canonical activity ledger.
     *
     * p_quantity is an increment here:
     * "I did 25 Merkins."
     */
    insert into public.member_activity_entries (
        member_id,
        region_id,
        activity_type_id,
        quantity,
        occurred_on,
        created_by_user_id
    )
    select
        caller_profile.member_id,
        campaign.region_id,
        activity.id,
        p_quantity,
        effective_date,
        auth.uid()
    from public.campaigns campaign
    where campaign.activity_type_id = activity.id
      and campaign.metric_key = 'manual_quantity'
      and campaign.tracking_mode = 'manual'
      and campaign.status in (
            'active',
            'scheduled'
      )
      and effective_date between
            campaign.starts_on
            and campaign.ends_on
      and public.has_region_access(
            campaign.region_id
      )
    order by campaign.created_at
    limit 1;

    if not found then
        raise exception
            'No active campaign is tracking this activity';
    end if;


    /*
     * Calculate the member's canonical total for this activity/date.
     */
    select coalesce(
        sum(entry.quantity),
        0
    )
    into new_activity_total
    from public.member_activity_entries entry
    where entry.member_id =
            caller_profile.member_id
      and entry.activity_type_id =
            activity.id
      and entry.occurred_on =
            effective_date;


    /*
     * Fan the canonical daily total out to every compatible campaign.
     */
    insert into public.campaign_contributions (
        campaign_id,
        member_id,
        contribution_date,
        quantity,
        completed
    )
    select
        campaign.id,
        caller_profile.member_id,
        effective_date,
        new_activity_total,

        case
            when campaign.cadence = 'daily'
                then new_activity_total >= campaign.target_value
            else null
        end

    from public.campaigns campaign

    where campaign.activity_type_id =
            activity.id

      and campaign.metric_key =
            'manual_quantity'

      and campaign.tracking_mode =
            'manual'

      and campaign.status in (
            'active',
            'scheduled'
      )

      and effective_date between
            campaign.starts_on
            and campaign.ends_on

      and public.has_region_access(
            campaign.region_id
      )

      and (
            campaign.participant_mode = 'collective'

            or (
                campaign.participant_mode = 'individual'
                and exists (
                    select 1
                    from public.campaign_enrollments enrollment
                    where enrollment.campaign_id =
                            campaign.id
                      and enrollment.member_id =
                            caller_profile.member_id
                      and enrollment.status =
                            'active'
                )
            )
      )

    on conflict (
        campaign_id,
        member_id,
        contribution_date
    )
    do update set
        quantity = excluded.quantity,
        completed = excluded.completed,
        updated_at = now();


    get diagnostics
        affected_campaign_count = row_count;


    return jsonb_build_object(
        'memberId',
        caller_profile.member_id,
        'activityTypeId',
        activity.id,
        'activityKey',
        activity.activity_key,
        'activityName',
        activity.display_name,
        'unit',
        activity.unit,
        'occurredOn',
        effective_date,
        'addedQuantity',
        p_quantity,
        'dailyTotal',
        new_activity_total,
        'affectedCampaignCount',
        affected_campaign_count
    );
end;
$function$;

revoke all on function public.log_member_activity(
    text,
    numeric,
    date
)
from public;

grant execute on function public.log_member_activity(
    text,
    numeric,
    date
)
to authenticated;