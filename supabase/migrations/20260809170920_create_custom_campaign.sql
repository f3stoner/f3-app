/*
 * Create a custom PAX challenge.
 *
 * V1 supports:
 * - region-visible
 * - individual
 * - opt-in
 * - manual quantity
 * - daily cadence
 *
 * The creator is enrolled automatically.
 */
create or replace function public.create_custom_campaign(
    p_region_id uuid,
    p_title text,
    p_description text,
    p_activity_name text,
    p_unit text,
    p_starts_on date,
    p_ends_on date,
    p_daily_target numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_member_id uuid;
    created_campaign public.campaigns%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_region_id is null then
        raise exception 'Region id is required';
    end if;

    if not public.has_region_access(p_region_id) then
        raise exception 'Not authorized for this region';
    end if;

    select profile.member_id
    into caller_member_id
    from public.profiles profile
    where profile.id = auth.uid();

    if caller_member_id is null then
        raise exception 'Authenticated member not found';
    end if;

    if nullif(trim(p_title), '') is null then
        raise exception 'Challenge title is required';
    end if;

    if length(trim(p_title)) > 100 then
        raise exception 'Challenge title is too long';
    end if;

    if nullif(trim(p_activity_name), '') is null then
        raise exception 'Activity name is required';
    end if;

    if length(trim(p_activity_name)) > 60 then
        raise exception 'Activity name is too long';
    end if;

    if nullif(trim(p_unit), '') is null then
        raise exception 'Unit is required';
    end if;

    if length(trim(p_unit)) > 40 then
        raise exception 'Unit is too long';
    end if;

    if p_starts_on is null or p_ends_on is null then
        raise exception 'Challenge dates are required';
    end if;

    if p_starts_on < current_date then
        raise exception 'Challenge cannot start in the past';
    end if;

    if p_ends_on < p_starts_on then
        raise exception
            'Challenge end date cannot precede start date';
    end if;

    if p_ends_on - p_starts_on + 1 > 365 then
        raise exception
            'Custom challenges cannot exceed 365 days';
    end if;

    if p_daily_target is null or p_daily_target <= 0 then
        raise exception
            'Daily target must be greater than zero';
    end if;

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
        trim(p_title),
        nullif(trim(p_description), ''),
        'region',
        null,
        'individual',
        'opt_in',
        'active',
        p_starts_on,
        p_ends_on,
        'manual_quantity',
        p_daily_target,
        jsonb_build_object(
            'activityName',
            trim(p_activity_name),
            'unit',
            trim(p_unit)
        ),
        'manual',
        'daily',
        'pax',
        auth.uid(),
        now()
    )
    returning *
    into created_campaign;

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

    return jsonb_build_object(
        'campaign',
        to_jsonb(created_campaign)
    );
end;
$function$;

revoke all on function public.create_custom_campaign(
    uuid,
    text,
    text,
    text,
    text,
    date,
    date,
    numeric
)
from public;

grant execute on function public.create_custom_campaign(
    uuid,
    text,
    text,
    text,
    text,
    date,
    date,
    numeric
)
to authenticated;