/*
 * Log manual activity once and reconcile that activity across
 * every compatible active campaign.
 *
 * The selected campaign provides the canonical activity identity.
 *
 * Existing UI semantics remain:
 * p_quantity represents the member's desired total quantity
 * for that activity on the supplied date.
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

    effective_contribution_date date;

    current_activity_total numeric := 0;
    activity_delta numeric := 0;
    new_activity_total numeric := 0;

    affected_campaign_count integer := 0;
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

    effective_contribution_date :=
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

    if target_campaign.activity_type_id is null then
        raise exception
            'Campaign has no canonical activity type';
    end if;

    if effective_contribution_date
        < target_campaign.starts_on
       or effective_contribution_date
        > target_campaign.ends_on
    then
        raise exception
            'Contribution date is outside the campaign window';
    end if;

    if effective_contribution_date > current_date then
        raise exception
            'Future contributions are not allowed';
    end if;


    /*
     * Individual opt-in campaigns still require membership
     * in the campaign used to initiate the log.
     */
    if target_campaign.participant_mode = 'individual' then

        if not exists (
            select 1
            from public.campaign_enrollments enrollment
            where enrollment.campaign_id = target_campaign.id
              and enrollment.member_id = caller_member_id
              and enrollment.status = 'active'
        ) then
            raise exception
                'Join the challenge before logging progress';
        end if;

    elsif target_campaign.participant_mode <> 'collective' then
        raise exception
            'Unsupported campaign participation mode';
    end if;


    /*
     * Find the canonical amount already logged today for this
     * member/activity.
     */
    select coalesce(
        sum(entry.quantity),
        0
    )
    into current_activity_total
    from public.member_activity_entries entry
    where entry.member_id = caller_member_id
      and entry.activity_type_id =
            target_campaign.activity_type_id
      and entry.occurred_on =
            effective_contribution_date;


    /*
     * Existing campaign UI sends the desired daily total.
     *
     * Translate that total into an activity delta so the
     * canonical activity ledger remains event-based.
     */
    activity_delta :=
        p_quantity - current_activity_total;

    if activity_delta < 0 then
        raise exception
            'Reducing an existing activity total is not supported yet';
    end if;


    /*
     * Only create a new activity event when something was
     * actually added.
     */
    if activity_delta > 0 then
        insert into public.member_activity_entries (
            member_id,
            region_id,
            activity_type_id,
            quantity,
            occurred_on,
            created_by_user_id
        )
        values (
            caller_member_id,
            target_campaign.region_id,
            target_campaign.activity_type_id,
            activity_delta,
            effective_contribution_date,
            auth.uid()
        );
    end if;


    /*
     * Re-read the canonical activity total.
     */
    select coalesce(
        sum(entry.quantity),
        0
    )
    into new_activity_total
    from public.member_activity_entries entry
    where entry.member_id = caller_member_id
      and entry.activity_type_id =
            target_campaign.activity_type_id
      and entry.occurred_on =
            effective_contribution_date;


    /*
     * Reconcile every applicable campaign consuming the same
     * canonical activity.
     *
     * Individual campaigns only receive credit when the member
     * is actively enrolled.
     *
     * Collective campaigns automatically receive the activity.
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
        caller_member_id,
        effective_contribution_date,
        new_activity_total,

        case
            when campaign.cadence = 'daily'
                then new_activity_total >= campaign.target_value
            else null
        end

    from public.campaigns campaign

    where campaign.region_id =
            target_campaign.region_id

      and campaign.metric_key =
            'manual_quantity'

      and campaign.tracking_mode =
            'manual'

      and campaign.activity_type_id =
            target_campaign.activity_type_id

      and campaign.status in (
            'active',
            'scheduled'
      )

      and effective_contribution_date
            between campaign.starts_on
            and campaign.ends_on

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
                            caller_member_id
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
        'campaignId',
        target_campaign.id,
        'memberId',
        caller_member_id,
        'activityTypeId',
        target_campaign.activity_type_id,
        'contributionDate',
        effective_contribution_date,
        'quantity',
        new_activity_total,
        'addedQuantity',
        activity_delta,
        'affectedCampaignCount',
        affected_campaign_count
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