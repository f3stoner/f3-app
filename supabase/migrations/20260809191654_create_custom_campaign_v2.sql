/*
 * General custom campaign / challenge creation.
 *
 * Supported V1 custom definitions:
 *
 * PAX-created:
 * - individual
 * - opt-in
 * - manual quantity
 * - daily or cumulative
 * - automatic member post count
 *
 * Region-created:
 * - individual opt-in
 * - regional collective
 * - manual quantity
 * - automatic regional FNG goal
 * - automatic member post challenge
 *
 * Templates remain separate and continue using create_campaign().
 */

create or replace function public.create_custom_campaign(
    p_definition jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_member_id uuid;

    p_region_id uuid;
    p_title text;
    p_description text;

    p_creator_mode text;
    p_participant_mode text;
    p_enrollment_mode text;

    p_tracking_mode text;
    p_cadence text;
    p_metric_key text;

    p_target_value numeric;
    p_starts_on date;
    p_ends_on date;

    p_metric_config jsonb;

    created_campaign public.campaigns%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_definition is null then
        raise exception 'Campaign definition is required';
    end if;


    /*
     * Resolve definition.
     */

    p_region_id :=
        nullif(
            p_definition ->> 'regionId',
            ''
        )::uuid;

    p_title :=
        nullif(
            trim(
                p_definition ->> 'title'
            ),
            ''
        );

    p_description :=
        nullif(
            trim(
                p_definition ->> 'description'
            ),
            ''
        );

    p_creator_mode :=
        coalesce(
            nullif(
                p_definition ->> 'creatorMode',
                ''
            ),
            'pax'
        );

    p_participant_mode :=
        coalesce(
            nullif(
                p_definition ->> 'participantMode',
                ''
            ),
            'individual'
        );

    p_enrollment_mode :=
        coalesce(
            nullif(
                p_definition ->> 'enrollmentMode',
                ''
            ),
            case
                when p_participant_mode = 'collective'
                    then 'automatic'
                else 'opt_in'
            end
        );

    p_tracking_mode :=
        nullif(
            p_definition ->> 'trackingMode',
            ''
        );

    p_cadence :=
        coalesce(
            nullif(
                p_definition ->> 'cadence',
                ''
            ),
            'campaign'
        );

    p_metric_key :=
        nullif(
            p_definition ->> 'metricKey',
            ''
        );

    p_target_value :=
        nullif(
            p_definition ->> 'targetValue',
            ''
        )::numeric;

    p_starts_on :=
        nullif(
            p_definition ->> 'startsOn',
            ''
        )::date;

    p_ends_on :=
        nullif(
            p_definition ->> 'endsOn',
            ''
        )::date;

    p_metric_config :=
        coalesce(
            p_definition -> 'metricConfig',
            '{}'::jsonb
        );


    /*
     * Basic validation.
     */

    if p_region_id is null then
        raise exception 'Region id is required';
    end if;

    if not public.has_region_access(p_region_id) then
        raise exception 'Not authorized for this region';
    end if;

    if p_title is null then
        raise exception 'Title is required';
    end if;

    if length(p_title) > 100 then
        raise exception 'Title is too long';
    end if;

    if p_starts_on is null or p_ends_on is null then
        raise exception 'Campaign dates are required';
    end if;

    if p_starts_on < current_date then
        raise exception 'Campaign cannot start in the past';
    end if;

    if p_ends_on < p_starts_on then
        raise exception
            'Campaign end date cannot precede start date';
    end if;

    if p_ends_on - p_starts_on + 1 > 3660 then
        raise exception
            'Campaign duration is too long';
    end if;

    if p_target_value is null
       or p_target_value <= 0
    then
        raise exception
            'Campaign target must be greater than zero';
    end if;

    if p_creator_mode not in (
        'pax',
        'region'
    ) then
        raise exception
            'Invalid creator mode';
    end if;

    if p_participant_mode not in (
        'individual',
        'collective'
    ) then
        raise exception
            'Invalid participant mode';
    end if;

    if p_enrollment_mode not in (
        'opt_in',
        'automatic'
    ) then
        raise exception
            'Invalid enrollment mode';
    end if;

    if p_tracking_mode not in (
        'automatic',
        'manual'
    ) then
        raise exception
            'Invalid tracking mode';
    end if;

    if p_cadence not in (
        'campaign',
        'daily',
        'weekly'
    ) then
        raise exception
            'Invalid cadence';
    end if;


    /*
     * Creator authority.
     */

    if p_creator_mode = 'region'
       and not public.is_region_leader(p_region_id)
    then
        raise exception
            'Regional leadership is required to create regional campaigns';
    end if;

    if p_creator_mode = 'pax' then
        p_participant_mode := 'individual';
        p_enrollment_mode := 'opt_in';
    end if;


    /*
     * Supported metric/configuration combinations.
     *
     * We validate capabilities here instead of letting the
     * frontend invent unsupported campaign shapes.
     */

    if p_metric_key = 'manual_quantity' then

        if p_tracking_mode <> 'manual' then
            raise exception
                'Manual quantity requires manual tracking';
        end if;

        if p_cadence not in (
            'campaign',
            'daily'
        ) then
            raise exception
                'Manual quantity currently supports cumulative or daily goals';
        end if;

        if nullif(
            trim(
                p_metric_config ->> 'unit'
            ),
            ''
        ) is null then
            raise exception
                'Tracked unit is required';
        end if;


    elsif p_metric_key = 'member_posts' then

        if p_tracking_mode <> 'automatic'
           or p_cadence <> 'campaign'
           or p_participant_mode <> 'individual'
           or p_enrollment_mode <> 'opt_in'
        then
            raise exception
                'Post-count challenges must be individual automatic cumulative challenges';
        end if;


    elsif p_metric_key = 'regional_first_time_fngs' then

        if p_creator_mode <> 'region'
           or p_tracking_mode <> 'automatic'
           or p_cadence <> 'campaign'
           or p_participant_mode <> 'collective'
           or p_enrollment_mode <> 'automatic'
        then
            raise exception
                'FNG goals must be regional collective automatic campaigns';
        end if;


    else
        raise exception
            'Unsupported campaign metric: %',
            p_metric_key;
    end if;


    /*
     * Resolve caller member for auto-enrollment.
     */

    select profile.member_id
    into caller_member_id
    from public.profiles profile
    where profile.id = auth.uid();


    /*
     * Create campaign.
     */

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
        null,
        p_title,
        p_description,
        'region',
        null,
        p_participant_mode,
        p_enrollment_mode,
        'active',
        p_starts_on,
        p_ends_on,
        p_metric_key,
        p_target_value,
        p_metric_config,
        p_tracking_mode,
        p_cadence,
        p_creator_mode,
        auth.uid(),
        now()
    )
    returning *
    into created_campaign;


    /*
     * Individual opt-in campaign creators begin enrolled.
     */

    if p_participant_mode = 'individual'
       and p_enrollment_mode = 'opt_in'
       and caller_member_id is not null
    then
        insert into public.campaign_enrollments (
            campaign_id,
            member_id,
            status,
            joined_at
        )
        values (
            created_campaign.id,
            caller_member_id,
            'active',
            now()
        )
        on conflict (
            campaign_id,
            member_id
        )
        do update set
            status = 'active',
            joined_at = now(),
            completed_at = null,
            withdrawn_at = null,
            updated_at = now();
    end if;


    return jsonb_build_object(
        'campaign',
        to_jsonb(created_campaign)
    );
end;
$function$;

revoke all on function
public.create_custom_campaign(jsonb)
from public;

grant execute on function
public.create_custom_campaign(jsonb)
to authenticated;