-- ============================================================
-- Region lifecycle blast doors
--
-- IMPORTANT:
-- Existing RPC signatures, result shapes, security modes,
-- search paths, validation, and side effects are preserved.
--
-- lifecycle_status:
--   onboarding
--   active
--   suspended
--
-- has_region_access() intentionally remains unchanged.
-- ============================================================


-- ============================================================
-- 1. Runtime authorization helper
-- ADDITIVE FUNCTION
-- ============================================================

create or replace function public.can_use_region_runtime(
    p_region_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
    select
        auth.uid() is not null
        and public.has_region_access(p_region_id)
        and exists (
            select 1
            from public.regions r
            where r.id = p_region_id
              and r.lifecycle_status = 'active'
        );
$function$;


-- ============================================================
-- 2. Public/runtime region catalog
--
-- EXISTING CONTRACT PRESERVED:
-- load_public_regions()
-- RETURNS TABLE(id uuid, name text, environment text)
--
-- CHANGE:
-- only active regions participate in normal runtime catalog.
-- Active test regions such as Sandbox remain available.
-- ============================================================

create or replace function public.load_public_regions()
returns table(
    id uuid,
    name text,
    environment text
)
language sql
stable
security definer
set search_path to ''
as $function$
    select
        r.id,
        r.name,
        r.environment
    from public.regions r
    where r.lifecycle_status = 'active' -- LIFECYCLE
    order by r.name;
$function$;


-- ============================================================
-- 3. Participant-region invitations
--
-- EXISTING DEPLOYED CONTRACT PRESERVED.
--
-- CHANGE:
-- onboarding/suspended regions cannot generate invitations.
-- ============================================================

create or replace function public.load_my_participant_region_invitations()
returns table(
    region_id uuid,
    region_name text,
    participant_id uuid,
    first_participated_on date,
    last_participated_on date,
    participant_sources text[],
    dashboard_dismissed boolean,
    dashboard_dismissed_at timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_user_id uuid;
    v_member_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    select
        p.member_id
    into
        v_member_id
    from public.profiles p
    where p.id = v_user_id;

    if v_member_id is null then
        return;
    end if;

    return query
    select
        r.id,
        r.name,
        rp.id,
        rp.first_participated_on,
        rp.last_participated_on,

        coalesce(
            rp.sources,
            '{}'::text[]
        ),

        dismissal.user_id is not null,

        dismissal.dismissed_at

    from public.region_participants rp

    join public.regions r
        on r.id = rp.region_id

    left join
    public.participant_region_invitation_dismissals dismissal
        on dismissal.user_id =
            v_user_id
       and dismissal.region_id =
            rp.region_id

    where rp.member_id =
            v_member_id

      and rp.status =
            'active'

      -- LIFECYCLE
      and r.lifecycle_status =
            'active'

      and not exists (
          select 1
          from public.region_access ra
          where ra.user_id =
                    v_user_id
            and ra.region_id =
                    rp.region_id
      )

    order by
        rp.last_participated_on
            desc nulls last,
        r.name;
end;
$function$;


-- ============================================================
-- 4. Claim participant-region access
--
-- EXISTING DEPLOYED CONTRACT PRESERVED:
--
-- input:
--   p_region_id uuid
--
-- returns:
--   result_region_id uuid
--   result_region_name text
--   result_granted_at timestamptz
--   result_already_had_access boolean
--
-- CHANGE:
-- lifecycle is validated BEFORE an existing region_access grant
-- can produce a successful response.
-- ============================================================

create or replace function public.claim_participant_region_access(
    p_region_id uuid
)
returns table(
    result_region_id uuid,
    result_region_name text,
    result_granted_at timestamp with time zone,
    result_already_had_access boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_user_id uuid;
    v_member_id uuid;
    v_region_name text;

    -- LIFECYCLE
    v_region_lifecycle_status text;

    v_existing_granted_at timestamptz;
    v_granted_at timestamptz;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    if p_region_id is null then
        raise exception
            'Region ID is required.'
            using errcode = '22004';
    end if;

    select
        p.member_id
    into
        v_member_id
    from public.profiles p
    where p.id = v_user_id;

    if v_member_id is null then
        raise exception
            'Your account is not linked to a canonical member.'
            using errcode = '23514';
    end if;

    select
        r.name,
        r.lifecycle_status -- LIFECYCLE
    into
        v_region_name,
        v_region_lifecycle_status -- LIFECYCLE
    from public.regions r
    where r.id = p_region_id;

    if v_region_name is null then
        raise exception
            'Region % does not exist.',
            p_region_id
            using errcode = 'P0002';
    end if;

    -- LIFECYCLE
    -- This must occur before the existing-access early return.
    if v_region_lifecycle_status <> 'active' then
        raise exception
            'Region is not currently active.'
            using errcode = '42501';
    end if;

    select
        ra.granted_at
    into
        v_existing_granted_at
    from public.region_access ra
    where ra.user_id = v_user_id
      and ra.region_id = p_region_id;

    if found then
        return query
        select
            p_region_id,
            v_region_name,
            v_existing_granted_at,
            true;

        return;
    end if;

    if not exists (
        select 1
        from public.region_participants rp
        where rp.region_id = p_region_id
          and rp.member_id = v_member_id
          and rp.status = 'active'
    ) then
        raise exception
            'Your member identity is not an active participant in this region.'
            using errcode = '42501';
    end if;

    insert into public.region_access as inserted_access (
        user_id,
        region_id
    )
    values (
        v_user_id,
        p_region_id
    )
    on conflict do nothing
    returning
        inserted_access.granted_at
    into
        v_granted_at;

    if v_granted_at is null then
        select
            ra.granted_at
        into
            v_granted_at
        from public.region_access ra
        where ra.user_id = v_user_id
          and ra.region_id = p_region_id;
    end if;

    if v_granted_at is null then
        raise exception
            'Region access could not be confirmed.'
            using errcode = '23514';
    end if;

    return query
    select
        p_region_id,
        v_region_name,
        v_granted_at,
        false;
end;
$function$;


-- ============================================================
-- 5. Password-based region join
--
-- EXISTING DEPLOYED CONTRACT PRESERVED:
--
-- join_region(p_region_id uuid, p_password text)
-- RETURNS TABLE(
--   region_id uuid,
--   granted_at timestamptz,
--   created boolean
-- )
--
-- Existing credential validation remains intact.
--
-- CHANGE:
-- after valid credentials are established, lifecycle must be
-- active BEFORE retained access can succeed or access can be
-- inserted.
-- ============================================================

create or replace function public.join_region(
    p_region_id uuid,
    p_password text
)
returns table(
    region_id uuid,
    granted_at timestamp with time zone,
    created boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
    caller_id uuid;
    existing_access public.region_access%rowtype;
    inserted_access public.region_access%rowtype;
begin
    caller_id := auth.uid();

    if caller_id is null then
        raise exception 'authentication_required'
            using errcode = '28000';
    end if;

    if p_region_id is null
       or p_password is null
       or btrim(p_password) = '' then
        raise exception 'invalid_region_credentials'
            using errcode = 'P0001';
    end if;

    -- Preserve existing credential behavior.
    if not exists (
        select 1
        from public.regions r
        where r.id = p_region_id
          and r.region_password = p_password
    ) then
        raise exception 'invalid_region_credentials'
            using errcode = 'P0001';
    end if;

    -- LIFECYCLE
    -- Valid credentials do not make an onboarding/suspended
    -- region joinable.
    if not exists (
        select 1
        from public.regions r
        where r.id = p_region_id
          and r.lifecycle_status = 'active'
    ) then
        raise exception 'region_not_active'
            using errcode = 'P0001';
    end if;

    select ra.*
    into existing_access
    from public.region_access ra
    where ra.user_id = caller_id
      and ra.region_id = p_region_id;

    if found then
        return query
        select
            existing_access.region_id,
            existing_access.granted_at,
            false;

        return;
    end if;

    insert into public.region_access (
        user_id,
        region_id
    )
    values (
        caller_id,
        p_region_id
    )
    on conflict do nothing
    returning *
    into inserted_access;

    if inserted_access.id is not null then
        return query
        select
            inserted_access.region_id,
            inserted_access.granted_at,
            true;

        return;
    end if;

    select ra.*
    into existing_access
    from public.region_access ra
    where ra.user_id = caller_id
      and ra.region_id = p_region_id;

    if not found then
        raise exception 'region_enrollment_failed'
            using errcode = 'P0001';
    end if;

    return query
    select
        existing_access.region_id,
        existing_access.granted_at,
        false;
end;
$function$;


-- ============================================================
-- 6. Global canonical member search
--
-- EXISTING CONTRACT PRESERVED.
--
-- CHANGE:
-- production-global identity eligibility now also requires
-- the member's HOME region to be active.
-- ============================================================

create or replace function public.search_global_members(
    p_search_term text,
    p_limit integer default 20
)
returns table(
    member_id uuid,
    pax_name text,
    real_name text,
    home_ao text,
    status text,
    home_region_id uuid,
    home_region_name text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_search_term text;
    v_limit integer;
begin
    if auth.uid() is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    v_search_term :=
        nullif(
            btrim(p_search_term),
            ''
        );

    if v_search_term is null
       or length(v_search_term) < 2
    then
        return;
    end if;

    v_limit :=
        least(
            greatest(
                coalesce(p_limit, 20),
                1
            ),
            50
        );

    return query
    select
        m.id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        m.status,
        m.region_id,
        r.name
    from public.members m
    join public.regions r
        on r.id = m.region_id
    where m.status = 'active'
      and r.environment = 'production'

      -- LIFECYCLE
      and r.lifecycle_status = 'active'

      and (
            m.pax_name ilike
                '%' || v_search_term || '%'

            or m.real_name ilike
                '%' || v_search_term || '%'

            or regexp_replace(
                lower(
                    coalesce(
                        m.pax_name,
                        ''
                    )
                ),
                '[^a-z0-9]',
                '',
                'g'
            ) like
                '%' ||
                regexp_replace(
                    lower(v_search_term),
                    '[^a-z0-9]',
                    '',
                    'g'
                ) ||
                '%'
      )
    order by
        case
            when lower(m.pax_name) =
                lower(v_search_term)
                then 0

            when lower(m.pax_name) like
                lower(v_search_term) || '%'
                then 1

            else 2
        end,

        m.pax_name,
        r.name

    limit v_limit;
end;
$function$;


-- ============================================================
-- 7. Public Q Site
--
-- EXISTING ARGUMENTS AND JSON CONTRACT PRESERVED.
--
-- CHANGE:
-- region must be:
--   production
--   active
--   public-site enabled
-- ============================================================

create or replace function public.load_public_region_site(
    p_region_slug text,
    p_from_date date default current_date,
    p_to_date date default (current_date + 42)
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_region_id uuid;
    v_from_date date;
    v_to_date date;
    v_result jsonb;
begin
    v_from_date := greatest(p_from_date, current_date);
    v_to_date := least(p_to_date, v_from_date + 90);

    if v_to_date < v_from_date then
        raise exception 'Invalid public site date range.';
    end if;

    select r.id
    into v_region_id
    from public.regions r
    join public.region_public_site_config c
      on c.region_id = r.id
    where r.slug = lower(trim(p_region_slug))
      and r.environment = 'production'

      -- LIFECYCLE
      and r.lifecycle_status = 'active'

      and c.is_enabled = true
    limit 1;

    if v_region_id is null then
        return null;
    end if;

    select jsonb_build_object(
        'version', 2,
        'generatedAt', now(),

        'region',
        jsonb_build_object(
            'slug', r.slug,
            'name', r.name,
            'shortName', c.short_name,
            'tagline', c.tagline,
            'description', c.description,
            'timezone', c.timezone,
            'logoAssetPath', c.logo_asset_path,
            'heroAssetPath', c.hero_asset_path,
            'brand', jsonb_build_object(
                'primaryColor', c.primary_color,
                'secondaryColor', c.secondary_color
            ),
            'links', jsonb_build_object(
                'contact', c.contact_url,
                'join', c.join_url,
                'social', c.social_links
            ),
            'seo', jsonb_build_object(
                'title', c.seo_title,
                'description', c.seo_description
            )
        ),

        'media',
        coalesce(
            (
                select jsonb_object_agg(
                    s.slot_key,
                    jsonb_build_object(
                        'storagePath', a.storage_path,
                        'altText', s.alt_text,
                        'focalX', s.focal_x,
                        'focalY', s.focal_y
                    )
                )
                from public.region_public_site_media_slots s
                join public.region_public_site_media_assets a
                  on a.id = s.asset_id
                 and a.region_id = s.region_id
                 and a.status = 'ready'
                where s.region_id = v_region_id
                  and public.is_supported_region_public_site_media_slot(
                      s.slot_key
                  )
            ),
            '{}'::jsonb
        ),

        'aos',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'slug', ao.slug,
                        'name', ao.name,
                        'description', ao.public_description,
                        'displayOrder', ao.public_display_order,

                        'site',
                        case
                            when s.id is null then null
                            else jsonb_build_object(
                                'name', s.name,
                                'address', s.address,
                                'mapUrl', s.map_url
                            )
                        end,

                        'schedules',
                        coalesce(
                            (
                                select jsonb_agg(
                                    jsonb_build_object(
                                        'weekday', ars.weekday,
                                        'startTime', ars.start_time::text,
                                        'durationMinutes', ars.duration_minutes,
                                        'label', ars.schedule_label,

                                        'site',
                                        case
                                            when schedule_site.id is null then null
                                            else jsonb_build_object(
                                                'name', schedule_site.name,
                                                'address', schedule_site.address,
                                                'mapUrl', schedule_site.map_url
                                            )
                                        end
                                    )
                                    order by
                                        ars.weekday,
                                        ars.start_time
                                )
                                from public.ao_recurring_schedules ars
                                left join public.sites schedule_site
                                  on schedule_site.id = ars.site_id
                                 and schedule_site.region_id = v_region_id
                                where ars.region_id = v_region_id
                                  and ars.ao_id = ao.id
                                  and ars.is_active = true
                                  and (
                                       ars.effective_start_date is null
                                       or ars.effective_start_date <= v_to_date
                                  )
                                  and (
                                       ars.effective_end_date is null
                                       or ars.effective_end_date >= v_from_date
                                  )
                            ),
                            '[]'::jsonb
                        )
                    )
                    order by
                        ao.public_display_order nulls last,
                        ao.name
                )
                from public.aos ao
                left join public.sites s
                  on s.id = ao.default_site_id
                 and s.region_id = v_region_id
                where ao.region_id = v_region_id
                  and ao.is_active = true
                  and ao.is_public = true
            ),
            '[]'::jsonb
        ),

        'calendar',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id', qs.id,
                        'date', qs.date,

                        'startTime',
                        coalesce(
                            nullif(trim(qs.override_time), ''),
                            nullif(trim(qs.start_time::text), ''),
                            nullif(
                                trim(
                                    ao.time_schedule
                                        ->> (extract(dow from qs.date)::integer)::text
                                ),
                                ''
                            ),
                            nullif(trim(ao.time), '')
                        ),

                        'durationMinutes',
                        qs.duration_minutes,

                        'title',
                        qs.override_title,

                        'emphasis',
                        coalesce(
                            qs.custom_emphasis_label,
                            qs.override_emphasis
                        ),

                        'ao',
                        jsonb_build_object(
                            'slug', ao.slug,
                            'name', ao.name
                        ),

                        'site',
                        case
                            when effective_site.id is null then null
                            else jsonb_build_object(
                                'name', effective_site.name,
                                'address', effective_site.address,
                                'mapUrl', effective_site.map_url
                            )
                        end,

                        'qName',
                        m.pax_name
                    )
                    order by
                        qs.date,
                        coalesce(
                            nullif(trim(qs.override_time), ''),
                            nullif(trim(qs.start_time::text), ''),
                            nullif(
                                trim(
                                    ao.time_schedule
                                        ->> (extract(dow from qs.date)::integer)::text
                                ),
                                ''
                            ),
                            nullif(trim(ao.time), '')
                        ) nulls last,
                        ao.name
                )
                from public.q_slots qs
                join public.aos ao
                  on ao.id = qs.ao_id
                 and ao.region_id = v_region_id
                 and ao.is_active = true
                 and ao.is_public = true
                left join public.sites effective_site
                  on effective_site.id = coalesce(
                      qs.site_id,
                      ao.default_site_id
                  )
                 and effective_site.region_id = v_region_id
                left join public.members m
                  on m.id = qs.q_user_id
                where qs.region_id = v_region_id
                  and qs.date between v_from_date and v_to_date
            ),
            '[]'::jsonb
        )
    )
    into v_result
    from public.regions r
    join public.region_public_site_config c
      on c.region_id = r.id
    where r.id = v_region_id
      and r.environment = 'production'

      -- LIFECYCLE: defense in depth
      and r.lifecycle_status = 'active';

    return v_result;
end;
$function$;


-- ============================================================
-- 8. Operations reporting
--
-- EXISTING CONTRACT PRESERVED:
-- get_operations_overview(p_region_id uuid default null)
-- RETURNS jsonb
--
-- CHANGE:
-- reportable region must also be active.
-- ============================================================

create or replace function public.get_operations_overview(
    p_region_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_role text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select role
    into caller_role
    from public.profiles
    where id = auth.uid();

    if caller_role is distinct from 'superadmin' then
        raise exception 'Superadmin access required';
    end if;

    return (
        with reportable_regions as (
            select id
            from public.regions
            where environment = 'production'

              -- LIFECYCLE
              and lifecycle_status = 'active'

              and include_in_reporting = true
              and (
                    p_region_id is null
                 or id = p_region_id
              )
        )

        select jsonb_build_object(

            'generatedAt',
            now(),

            'scope',
            jsonb_build_object(
                'regionId',
                p_region_id
            ),

            'users',
            jsonb_build_object(

                'total',
                (
                    select count(*)
                    from public.profiles p
                    where p.region_id in (
                        select id
                        from reportable_regions
                    )
                ),

                'linkedPax',
                (
                    select count(*)
                    from public.profiles p
                    where p.member_id is not null
                      and p.region_id in (
                          select id
                          from reportable_regions
                      )
                ),

                'new7d',
                (
                    select count(*)
                    from public.profiles p
                    join public.region_access ra
                      on ra.user_id = p.id
                     and ra.region_id = p.region_id
                    where p.region_id in (
                        select id
                        from reportable_regions
                    )
                      and ra.granted_at >=
                          now() - interval '7 days'
                ),

                'new30d',
                (
                    select count(*)
                    from public.profiles p
                    join public.region_access ra
                      on ra.user_id = p.id
                     and ra.region_id = p.region_id
                    where p.region_id in (
                        select id
                        from reportable_regions
                    )
                      and ra.granted_at >=
                          now() - interval '30 days'
                )
            ),

            'activity',
            jsonb_build_object(

                'active7d',
                (
                    select count(distinct ae.user_id)
                    from public.app_events ae
                    join public.profiles p
                      on p.id = ae.user_id
                    where ae.type = 'app_opened'
                      and ae.created_at >=
                          now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                      and p.region_id = ae.region_id
                ),

                'active30d',
                (
                    select count(distinct ae.user_id)
                    from public.app_events ae
                    join public.profiles p
                      on p.id = ae.user_id
                    where ae.type = 'app_opened'
                      and ae.created_at >=
                          now() - interval '30 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                      and p.region_id = ae.region_id
                ),

                'appOpensToday',
                (
                    select count(*)
                    from public.app_events ae
                    join public.profiles p
                      on p.id = ae.user_id
                    where ae.type = 'app_opened'
                      and ae.created_at >=
                          date_trunc('day', now())
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                      and p.region_id = ae.region_id
                )
            ),

            'usage7d',
            jsonb_build_object(

                'sessionsLogged',
                (
                    select count(*)
                    from public.app_events ae
                    where ae.type = 'session_logged'
                      and ae.created_at >=
                          now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                ),

                'workoutsCreated',
                (
                    select count(*)
                    from public.app_events ae
                    where ae.type =
                          'planned_workout_created'
                      and ae.created_at >=
                          now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                ),

                'executionsStarted',
                (
                    select count(*)
                    from public.app_events ae
                    where ae.type =
                          'execution_started'
                      and ae.created_at >=
                          now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                ),

                'backblastsGenerated',
                (
                    select count(*)
                    from public.app_events ae
                    where ae.type =
                          'backblast_generated'
                      and ae.created_at >=
                          now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                )
            ),

            'health',
            jsonb_build_object(
                'status', 'not_configured',
                'criticalCount', 0,
                'warningCount', 0,
                'passingCount', 0,
                'lastAuditAt', null
            )
        )
    );
end;
$function$;


-- ============================================================
-- 9. Operations Center region scopes
-- ADDITIVE FUNCTION
--
-- Do not overload load_public_regions() with reporting concerns.
-- ============================================================

create or replace function public.load_operations_region_scopes()
returns table(
    id uuid,
    name text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_caller_role text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select p.role
    into v_caller_role
    from public.profiles p
    where p.id = auth.uid();

    if v_caller_role is distinct from 'superadmin' then
        raise exception 'Superadmin access required';
    end if;

    return query
    select
        r.id,
        r.name
    from public.regions r
    where r.environment = 'production'
      and r.lifecycle_status = 'active'
      and r.include_in_reporting = true
    order by r.name;
end;
$function$;