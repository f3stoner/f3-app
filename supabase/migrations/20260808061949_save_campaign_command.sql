/*
 * Create a regional campaign.
 *
 * Campaign administration is restricted to regional leadership.
 * Direct authenticated table writes remain unavailable.
 */
create or replace function public.create_campaign(
    p_region_id uuid,
    p_template_id uuid,
    p_title text,
    p_description text,
    p_starts_on date,
    p_ends_on date,
    p_target_value numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    source_template public.campaign_templates%rowtype;
    created_campaign public.campaigns%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_region_id is null then
        raise exception 'Region id is required';
    end if;

    if not public.is_region_leader(
        p_region_id
    )
    then
        raise exception
            'Not authorized to create campaigns for this region';
    end if;

    if p_template_id is null then
        raise exception 'Campaign template is required';
    end if;

    select *
    into source_template
    from public.campaign_templates
    where id = p_template_id
      and status = 'published';

    if source_template.id is null then
        raise exception
            'Published campaign template not found';
    end if;

    if nullif(
        trim(p_title),
        ''
    ) is null
    then
        raise exception 'Campaign title is required';
    end if;

    if p_starts_on is null
       or p_ends_on is null
    then
        raise exception
            'Campaign dates are required';
    end if;

    if p_ends_on < p_starts_on then
        raise exception
            'Campaign end date cannot precede start date';
    end if;

    if p_target_value is null
       or p_target_value <= 0
    then
        raise exception
            'Campaign target must be greater than zero';
    end if;

    /*
     * V1 only launches regional collective automatic
     * campaigns from supported official templates.
     */
    if source_template.scope_type <> 'region'
       or source_template.participant_mode <> 'collective'
       or source_template.enrollment_mode <> 'automatic'
    then
        raise exception
            'Unsupported campaign template configuration';
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
        created_by_user_id,
        published_at
    )
    values (
        p_region_id,
        source_template.id,
        trim(p_title),
        nullif(
            trim(p_description),
            ''
        ),
        source_template.scope_type,
        null,
        source_template.participant_mode,
        source_template.enrollment_mode,
        'active',
        p_starts_on,
        p_ends_on,
        source_template.metric_key,
        p_target_value,
        source_template.metric_config,
        auth.uid(),
        now()
    )
    returning *
    into created_campaign;

    return jsonb_build_object(
        'campaign',
        to_jsonb(created_campaign)
    );
end;
$function$;

revoke all on function public.create_campaign(
    uuid,
    uuid,
    text,
    text,
    date,
    date,
    numeric
)
from public;

grant execute on function public.create_campaign(
    uuid,
    uuid,
    text,
    text,
    date,
    date,
    numeric
)
to authenticated;