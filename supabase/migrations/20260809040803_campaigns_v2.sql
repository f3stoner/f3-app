/*
 * Campaigns V2:
 *
 * - allow templates to define tracking mode and cadence;
 * - support individual automatic opt-in campaigns;
 * - add join/leave commands;
 * - add member_posts progress;
 * - publish the first individual automatic template.
 */


/* =========================================================
   TEMPLATE CAPABILITIES
   ========================================================= */

alter table public.campaign_templates
add column tracking_mode text not null default 'automatic';

alter table public.campaign_templates
add column cadence text not null default 'campaign';

alter table public.campaign_templates
add constraint campaign_templates_tracking_mode_check
check (
    tracking_mode in (
        'automatic',
        'manual'
    )
);

alter table public.campaign_templates
add constraint campaign_templates_cadence_check
check (
    cadence in (
        'campaign',
        'daily',
        'weekly'
    )
);


/* =========================================================
   CREATE CAMPAIGN
   ========================================================= */

/*
 * Launch a campaign from a published template.
 *
 * V2 supports:
 *
 * - regional collective automatic campaigns;
 * - regional individual automatic opt-in campaigns.
 *
 * Manual campaigns come next.
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

    if not public.is_region_leader(p_region_id) then
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
        raise exception 'Published campaign template not found';
    end if;

    if nullif(trim(p_title), '') is null then
        raise exception 'Campaign title is required';
    end if;

    if p_starts_on is null or p_ends_on is null then
        raise exception 'Campaign dates are required';
    end if;

    if p_ends_on < p_starts_on then
        raise exception
            'Campaign end date cannot precede start date';
    end if;

    if p_target_value is null or p_target_value <= 0 then
        raise exception
            'Campaign target must be greater than zero';
    end if;

    /*
     * V2 still launches only region-scoped official templates.
     *
     * The participant/enrollment shape may now be either
     * collective/automatic or individual/opt-in.
     */
    if source_template.scope_type <> 'region' then
        raise exception
            'Unsupported campaign template scope';
    end if;

    if source_template.tracking_mode <> 'automatic' then
        raise exception
            'Manual campaign templates are not supported yet';
    end if;

    if not (
        (
            source_template.participant_mode = 'collective'
            and source_template.enrollment_mode = 'automatic'
        )
        or (
            source_template.participant_mode = 'individual'
            and source_template.enrollment_mode = 'opt_in'
        )
    ) then
        raise exception
            'Unsupported campaign participation configuration';
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
        source_template.id,
        trim(p_title),
        nullif(trim(p_description), ''),
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
        source_template.tracking_mode,
        source_template.cadence,
        'region',
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


/* =========================================================
   JOIN CAMPAIGN
   ========================================================= */

create or replace function public.join_campaign(
    p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_member_id uuid;
    target_campaign public.campaigns%rowtype;
    enrollment public.campaign_enrollments%rowtype;
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

    if target_campaign.participant_mode <> 'individual'
       or target_campaign.enrollment_mode <> 'opt_in'
    then
        raise exception
            'Campaign does not support opt-in participation';
    end if;

    if target_campaign.status in ('completed', 'cancelled') then
        raise exception 'Campaign is no longer accepting participants';
    end if;

    insert into public.campaign_enrollments (
        campaign_id,
        member_id,
        status,
        joined_at
    )
    values (
        target_campaign.id,
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
        updated_at = now()
    returning *
    into enrollment;

    return jsonb_build_object(
        'campaignId',
        target_campaign.id,
        'memberId',
        caller_member_id,
        'status',
        enrollment.status
    );
end;
$function$;

revoke all on function public.join_campaign(uuid)
from public;

grant execute on function public.join_campaign(uuid)
to authenticated;


/* =========================================================
   LEAVE CAMPAIGN
   ========================================================= */

create or replace function public.leave_campaign(
    p_campaign_id uuid
)
returns jsonb
language plpgsql
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

    update public.campaign_enrollments
    set
        status = 'withdrawn',
        withdrawn_at = now(),
        completed_at = null,
        updated_at = now()
    where campaign_id = target_campaign.id
      and member_id = caller_member_id;

    return jsonb_build_object(
        'campaignId',
        target_campaign.id,
        'memberId',
        caller_member_id,
        'status',
        'withdrawn'
    );
end;
$function$;

revoke all on function public.leave_campaign(uuid)
from public;

grant execute on function public.leave_campaign(uuid)
to authenticated;


/* =========================================================
   CAMPAIGN PROGRESS
   ========================================================= */

create or replace function public.get_campaign_progress(
    p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_campaign public.campaigns%rowtype;

    current_value numeric := 0;
    progress_percent numeric := 0;

    is_enrolled boolean := false;
    participant_count bigint := 0;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_campaign_id is null then
        raise exception 'Campaign id is required';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    select *
    into target_campaign
    from public.campaigns
    where id = p_campaign_id;

    if target_campaign.id is null then
        raise exception 'Campaign not found';
    end if;

    if not (
        caller_profile.role = 'superadmin'
        or public.has_region_access(target_campaign.region_id)
    ) then
        raise exception 'Not authorized for this region';
    end if;


    /*
     * Regional first-time FNGs.
     */
    if target_campaign.metric_key = 'regional_first_time_fngs' then

        with regional_post_events as (
            select distinct
                session_row.id as session_id,
                session_row.date::date as session_date,
                attendee.member_id_text::uuid as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements_text(
                coalesce(session_row.attendee_ids, '[]'::jsonb)
            ) as attendee(member_id_text)
            where session_row.region_id = target_campaign.region_id

            union

            select distinct
                session_row.id as session_id,
                session_row.date::date as session_date,
                coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
                )::uuid as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(session_row.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            where session_row.region_id = target_campaign.region_id
              and coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
              ) is not null
        ),

        first_regional_post_dates as (
            select
                post.member_id,
                min(post.session_date) as first_post_date
            from regional_post_events post
            group by post.member_id
        ),

        campaign_fng_events as (
            select distinct
                session_row.date::date as session_date,
                member.id as member_id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(session_row.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            join public.members member
              on member.id::text = coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
              )
            where session_row.region_id = target_campaign.region_id
              and session_row.date::date between
                    target_campaign.starts_on
                    and target_campaign.ends_on
        ),

        qualifying_fngs as (
            select distinct
                campaign_fng.member_id
            from campaign_fng_events campaign_fng
            join first_regional_post_dates first_post
              on first_post.member_id = campaign_fng.member_id
             and first_post.first_post_date = campaign_fng.session_date
        )

        select count(*)
        into current_value
        from qualifying_fngs;


    /*
     * Individual attendance/posts.
     *
     * Progress belongs to the authenticated member.
     */
    elsif target_campaign.metric_key = 'member_posts' then

        if caller_profile.member_id is null then
            raise exception 'Authenticated member not found';
        end if;

        select exists (
            select 1
            from public.campaign_enrollments enrollment
            where enrollment.campaign_id = target_campaign.id
              and enrollment.member_id = caller_profile.member_id
              and enrollment.status = 'active'
        )
        into is_enrolled;

        select count(*)
        into participant_count
        from public.campaign_enrollments enrollment
        where enrollment.campaign_id = target_campaign.id
          and enrollment.status = 'active';

        /*
         * Keep progress available even before joining so the
         * user can see what his current campaign-window total
         * would be.
         */
        with member_post_sessions as (
            select distinct
                session_row.id
            from public.sessions session_row
            cross join lateral jsonb_array_elements_text(
                coalesce(session_row.attendee_ids, '[]'::jsonb)
            ) as attendee(member_id_text)
            where session_row.region_id = target_campaign.region_id
              and session_row.date::date between
                    target_campaign.starts_on
                    and target_campaign.ends_on
              and attendee.member_id_text = caller_profile.member_id::text

            union

            select distinct
                session_row.id
            from public.sessions session_row
            cross join lateral jsonb_array_elements(
                coalesce(session_row.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            where session_row.region_id = target_campaign.region_id
              and session_row.date::date between
                    target_campaign.starts_on
                    and target_campaign.ends_on
              and coalesce(
                    fng.fng_obj ->> 'memberId',
                    fng.fng_obj ->> 'member_id'
              ) = caller_profile.member_id::text
        )

        select count(*)
        into current_value
        from member_post_sessions;


    else
        raise exception
            'Unsupported campaign metric: %',
            target_campaign.metric_key;
    end if;


    progress_percent :=
        round(
            (
                current_value
                / target_campaign.target_value
            ) * 100,
            1
        );


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
        current_value,
        'target',
        target_campaign.target_value,
        'percent',
        progress_percent,
        'goalReached',
        current_value >= target_campaign.target_value,
        'unit',
        target_campaign.metric_config ->> 'unit',
        'startsOn',
        target_campaign.starts_on,
        'endsOn',
        target_campaign.ends_on,
        'isEnrolled',
        is_enrolled,
        'participantCount',
        participant_count
    );
end;
$function$;

revoke all on function public.get_campaign_progress(uuid)
from public;

grant execute on function public.get_campaign_progress(uuid)
to authenticated;


/* =========================================================
   OFFICIAL TEMPLATE: 20 POSTS
   ========================================================= */

insert into public.campaign_templates (
    template_key,
    version,
    title,
    description,
    status,
    scope_type,
    participant_mode,
    enrollment_mode,
    default_duration_days,
    metric_key,
    metric_config,
    tracking_mode,
    cadence
)
values (
    'twenty_posts',
    1,
    '20 Posts',
    'Challenge PAX to post 20 times during the campaign.',
    'published',
    'region',
    'individual',
    'opt_in',
    30,
    'member_posts',
    jsonb_build_object(
        'unit',
        'Posts'
    ),
    'automatic',
    'campaign'
);