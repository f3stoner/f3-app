begin;

alter table public.regions
add column if not exists timezone text;

update public.regions
set timezone = 'America/Chicago'
where timezone is null;

alter table public.regions
alter column timezone set default 'America/Chicago';

alter table public.regions
alter column timezone set not null;

comment on column public.regions.timezone is
'IANA timezone used for region-local calendar dates and time-sensitive regional behavior.';

create or replace function public.region_local_date(
    p_region_id uuid
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
    region_timezone text;
begin
    select r.timezone
    into region_timezone
    from public.regions r
    where r.id = p_region_id;

    if region_timezone is null then
        raise exception 'Region timezone not found';
    end if;

    return (now() at time zone region_timezone)::date;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_daily_checkin_campaign(p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    caller_member_id uuid;

    p_region_id uuid;
    p_title text;
    p_description text;

    p_creator_mode text;
    p_visibility text;

    p_starts_on date;
    p_ends_on date;

    p_prompt text;
    p_yes_label text;
    p_no_label text;

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

    p_visibility :=
        coalesce(
            nullif(
                p_definition ->> 'visibility',
                ''
            ),
            'public'
        );

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

    p_prompt :=
        nullif(
            trim(
                p_definition ->> 'prompt'
            ),
            ''
        );

    p_yes_label :=
        coalesce(
            nullif(
                trim(
                    p_definition ->> 'yesLabel'
                ),
                ''
            ),
            'Yes'
        );

    p_no_label :=
        coalesce(
            nullif(
                trim(
                    p_definition ->> 'noLabel'
                ),
                ''
            ),
            'No'
        );


    /*
     * Basic validation.
     */

    if p_region_id is null then
        raise exception 'Region id is required';
    end if;

    if not public.has_region_access(
        p_region_id
    ) then
        raise exception
            'Not authorized for this region';
    end if;

    if p_title is null then
        raise exception
            'Challenge name is required';
    end if;

    if length(p_title) > 100 then
        raise exception
            'Challenge name is too long';
    end if;

    if p_prompt is null then
        raise exception
            'Daily prompt is required';
    end if;

    if length(p_prompt) > 250 then
        raise exception
            'Daily prompt is too long';
    end if;

    if length(p_yes_label) > 40 then
        raise exception
            'Yes label is too long';
    end if;

    if length(p_no_label) > 40 then
        raise exception
            'No label is too long';
    end if;

    if p_starts_on is null
       or p_ends_on is null
    then
        raise exception
            'Challenge dates are required';
    end if;

    if p_starts_on < public.region_local_date(p_region_id) then
        raise exception
            'Challenge cannot start in the past';
    end if;

    if p_ends_on < p_starts_on then
        raise exception
            'Challenge end date cannot precede start date';
    end if;

    if (
        p_ends_on
        - p_starts_on
        + 1
    ) > 3660 then
        raise exception
            'Challenge duration is too long';
    end if;

    if p_creator_mode not in (
        'pax',
        'region'
    ) then
        raise exception
            'Invalid creator mode';
    end if;

    if p_visibility not in (
        'public',
        'private'
    ) then
        raise exception
            'Invalid campaign visibility';
    end if;


    /*
     * Region-created challenges require leadership.
     */

    if p_creator_mode = 'region'
       and not public.is_region_leader(
            p_region_id
       )
    then
        raise exception
            'Regional leadership is required to create regional campaigns';
    end if;


    /*
     * Private challenges are personal.
     */

    if p_visibility = 'private'
       and p_creator_mode <> 'pax'
    then
        raise exception
            'Private challenges must be PAX-created';
    end if;


    /*
     * Resolve caller member.
     */

    select profile.member_id
    into caller_member_id
    from public.profiles profile
    where profile.id = auth.uid();

    if caller_member_id is null
       and p_creator_mode = 'pax'
    then
        raise exception
            'Authenticated member not found';
    end if;


    /*
     * Create campaign.
     *
     * target_value = 1 represents one successful
     * completion per day. Overall target is derived
     * from campaign duration by the progress RPC.
     */

    insert into public.campaigns (
        region_id,
        template_id,
        visibility,
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
        activity_type_id,
        published_at
    )
    values (
        p_region_id,
        null,
        p_visibility,
        p_title,
        p_description,
        'region',
        null,
        'individual',
        'opt_in',
        'active',
        p_starts_on,
        p_ends_on,
        'daily_checkin',
        1,
        jsonb_build_object(
            'prompt',
            p_prompt,
            'yesLabel',
            p_yes_label,
            'noLabel',
            p_no_label,
            'unit',
            'days'
        ),
        'manual',
        'daily',
        p_creator_mode,
        auth.uid(),
        null,
        now()
    )
    returning *
    into created_campaign;


    /*
     * A PAX-created challenge begins with its
     * creator enrolled.
     *
     * Region-created shared challenges remain
     * opt-in.
     */

    if p_creator_mode = 'pax'
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

CREATE OR REPLACE FUNCTION public.get_campaign_checkin_progress(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    caller_profile public.profiles%rowtype;
    target_campaign public.campaigns%rowtype;

    is_enrolled boolean := false;
    participant_count bigint := 0;

    yes_days bigint := 0;
    no_days bigint := 0;
    answered_days bigint := 0;

    total_days integer := 0;
    elapsed_days integer := 0;
    unanswered_days integer := 0;

    progress_percent numeric := 0;

    today_response boolean := null;
    campaign_today date;
begin
    if auth.uid() is null then
        raise exception
            'Authentication is required';
    end if;

    if p_campaign_id is null then
        raise exception
            'Campaign id is required';
    end if;


    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception
            'Authenticated profile not found';
    end if;

    if caller_profile.member_id is null then
        raise exception
            'Authenticated member not found';
    end if;


    select *
    into target_campaign
    from public.campaigns
    where id = p_campaign_id;

    if target_campaign.id is null then
        raise exception
            'Campaign not found';
    end if;

    if not public.can_access_campaign(
        target_campaign.id
    ) then
        raise exception
            'Not authorized for this campaign';
    end if;


    if target_campaign.metric_key <>
            'daily_checkin'
       or target_campaign.cadence <>
            'daily'
    then
        raise exception
            'Campaign does not support daily check-in progress';
    end if;


    campaign_today :=
        public.region_local_date(
            target_campaign.region_id
        );


    select exists (
        select 1
        from public.campaign_enrollments enrollment
        where enrollment.campaign_id =
                target_campaign.id
          and enrollment.member_id =
                caller_profile.member_id
          and enrollment.status =
                'active'
    )
    into is_enrolled;


    select count(*)
    into participant_count
    from public.campaign_enrollments enrollment
    where enrollment.campaign_id =
            target_campaign.id
      and enrollment.status =
            'active';


    total_days :=
        target_campaign.ends_on
        - target_campaign.starts_on
        + 1;


    /*
     * Elapsed challenge days through today.
     *
     * Future days are not considered unanswered.
     */

    if campaign_today <
            target_campaign.starts_on
    then
        elapsed_days := 0;

    elsif campaign_today >
            target_campaign.ends_on
    then
        elapsed_days := total_days;

    else
        elapsed_days :=
            campaign_today
            - target_campaign.starts_on
            + 1;
    end if;


    if is_enrolled then

        select
            count(*) filter (
                where contribution.completed = true
            ),

            count(*) filter (
                where contribution.completed = false
            ),

            count(*)

        into
            yes_days,
            no_days,
            answered_days

        from public.campaign_contributions contribution

        where contribution.campaign_id =
                target_campaign.id

          and contribution.member_id =
                caller_profile.member_id

          and contribution.contribution_date
                between
                    target_campaign.starts_on
                    and target_campaign.ends_on;


        select contribution.completed
        into today_response
        from public.campaign_contributions contribution
        where contribution.campaign_id =
                target_campaign.id
          and contribution.member_id =
                caller_profile.member_id
          and contribution.contribution_date =
                campaign_today;

        if not found then
            today_response := null;
        end if;

    end if;


    unanswered_days :=
        greatest(
            elapsed_days
            - answered_days,
            0
        );


    progress_percent :=
        case
            when total_days > 0 then
                round(
                    (
                        yes_days::numeric
                        / total_days::numeric
                    ) * 100,
                    1
                )
            else 0
        end;


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
        yes_days,

        'target',
        total_days,

        'percent',
        progress_percent,

        'goalReached',
        yes_days >= total_days,

        'unit',
        'days',

        'activityName',
        '',

        'startsOn',
        target_campaign.starts_on,

        'endsOn',
        target_campaign.ends_on,

        'isEnrolled',
        is_enrolled,

        'participantCount',
        participant_count,

        'todayCurrent',
        case
            when today_response = true
                then 1
            else 0
        end,

        'todayTarget',
        1,

        'completedDays',
        yes_days,

        'totalDays',
        total_days,

        'yesDays',
        yes_days,

        'noDays',
        no_days,

        'answeredDays',
        answered_days,

        'unansweredDays',
        unanswered_days,

        'elapsedDays',
        elapsed_days,

        'todayResponse',
        today_response,

        'prompt',
        target_campaign.metric_config
            ->> 'prompt',

        'yesLabel',
        coalesce(
            target_campaign.metric_config
                ->> 'yesLabel',
            'Yes'
        ),

        'noLabel',
        coalesce(
            target_campaign.metric_config
                ->> 'noLabel',
            'No'
        )
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_campaign_daily_checkin(p_campaign_id uuid, p_completed boolean, p_contribution_date date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    caller_member_id uuid;
    target_campaign public.campaigns%rowtype;

    effective_date date;
    campaign_today date;
begin
    if auth.uid() is null then
        raise exception
            'Authentication is required';
    end if;

    if p_campaign_id is null then
        raise exception
            'Campaign id is required';
    end if;

    if p_completed is null then
        raise exception
            'A Yes or No response is required';
    end if;

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
        raise exception
            'Campaign not found';
    end if;

    if not public.can_access_campaign(
        target_campaign.id
    ) then
        raise exception
            'Not authorized for this campaign';
    end if;


    /*
     * Ensure this really is a check-in challenge.
     */

    if target_campaign.metric_key <>
            'daily_checkin'
       or target_campaign.tracking_mode <>
            'manual'
       or target_campaign.cadence <>
            'daily'
    then
        raise exception
            'Campaign does not support daily check-ins';
    end if;


    campaign_today :=
        public.region_local_date(
            target_campaign.region_id
        );

    effective_date :=
        coalesce(
            p_contribution_date,
            campaign_today
        );


    if effective_date <
            target_campaign.starts_on
       or effective_date >
            target_campaign.ends_on
    then
        raise exception
            'Response date is outside the campaign window';
    end if;

    if effective_date > campaign_today then
        raise exception
            'Future responses are not allowed';
    end if;


    /*
     * Daily check-ins are individual opt-in
     * challenges, so the member must be enrolled.
     */

    if not exists (
        select 1
        from public.campaign_enrollments enrollment
        where enrollment.campaign_id =
                target_campaign.id
          and enrollment.member_id =
                caller_member_id
          and enrollment.status =
                'active'
    ) then
        raise exception
            'Join the challenge before checking in';
    end if;


    /*
     * One row per member per day.
     *
     * quantity:
     *   1 = Yes
     *   0 = No
     *
     * completed mirrors the boolean answer.
     */

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
        effective_date,
        case
            when p_completed then 1
            else 0
        end,
        p_completed
    )
    on conflict (
        campaign_id,
        member_id,
        contribution_date
    )
    do update set
        quantity =
            excluded.quantity,
        completed =
            excluded.completed,
        updated_at =
            now();


    return jsonb_build_object(
        'campaignId',
        target_campaign.id,
        'memberId',
        caller_member_id,
        'contributionDate',
        effective_date,
        'response',
        p_completed
    );
end;
$function$;

grant execute on function public.region_local_date(uuid) to authenticated, service_role;
grant execute on function public.create_daily_checkin_campaign(jsonb) to anon, authenticated, service_role;
grant execute on function public.get_campaign_checkin_progress(uuid) to anon, authenticated, service_role;
grant execute on function public.set_campaign_daily_checkin(uuid, boolean, date) to anon, authenticated, service_role;

commit;
