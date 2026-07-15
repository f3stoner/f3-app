begin;

create or replace function public.get_operations_overview(
    p_region_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    caller_role text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select p.role
    into caller_role
    from public.profiles p
    where p.id = auth.uid();

    if caller_role is distinct from 'superadmin' then
        raise exception 'Superadmin access required';
    end if;

    if p_region_id is null then
        raise exception 'Region ID is required';
    end if;

    return jsonb_build_object(
        'generatedAt',
        now(),

        'users',
        jsonb_build_object(
            'total',
            (
                select count(*)
                from public.profiles p
                where p.region_id = p_region_id
            ),

            'linkedPax',
            (
                select count(*)
                from public.profiles p
                where p.region_id = p_region_id
                  and p.member_id is not null
            ),

            'new7d',
            (
                select count(*)
                from public.profiles p
                join public.region_access ra
                  on ra.user_id = p.id
                 and ra.region_id = p_region_id
                where p.region_id = p_region_id
                  and ra.granted_at >= now() - interval '7 days'
            ),

            'new30d',
            (
                select count(*)
                from public.profiles p
                join public.region_access ra
                  on ra.user_id = p.id
                 and ra.region_id = p_region_id
                where p.region_id = p_region_id
                  and ra.granted_at >= now() - interval '30 days'
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
                where ae.region_id = p_region_id
                  and p.region_id = p_region_id
                  and ae.type = 'app_opened'
                  and ae.created_at >= now() - interval '7 days'
                  and ae.user_id is not null
            ),

            'active30d',
            (
                select count(distinct ae.user_id)
                from public.app_events ae
                join public.profiles p
                  on p.id = ae.user_id
                where ae.region_id = p_region_id
                  and p.region_id = p_region_id
                  and ae.type = 'app_opened'
                  and ae.created_at >= now() - interval '30 days'
                  and ae.user_id is not null
            ),

            'appOpensToday',
            (
                select count(*)
                from public.app_events ae
                join public.profiles p
                  on p.id = ae.user_id
                where ae.region_id = p_region_id
                  and p.region_id = p_region_id
                  and ae.type = 'app_opened'
                  and ae.created_at >= date_trunc('day', now())
            )
        ),

        'usage7d',
        jsonb_build_object(
            'sessionsLogged',
            (
                select count(*)
                from public.app_events ae
                where ae.region_id = p_region_id
                  and ae.type = 'session_logged'
                  and ae.created_at >= now() - interval '7 days'
            ),

            'workoutsCreated',
            (
                select count(*)
                from public.app_events ae
                where ae.region_id = p_region_id
                  and ae.type = 'planned_workout_created'
                  and ae.created_at >= now() - interval '7 days'
            ),

            'executionsStarted',
            (
                select count(*)
                from public.app_events ae
                where ae.region_id = p_region_id
                  and ae.type = 'execution_started'
                  and ae.created_at >= now() - interval '7 days'
            ),

            'backblastsGenerated',
            (
                select count(*)
                from public.app_events ae
                where ae.region_id = p_region_id
                  and ae.type = 'backblast_generated'
                  and ae.created_at >= now() - interval '7 days'
            )
        ),

        'health',
        jsonb_build_object(
            'status',
            'not_configured',
            'criticalCount',
            0,
            'warningCount',
            0,
            'passingCount',
            0,
            'lastAuditAt',
            null
        )
    );
end;
$$;

commit;