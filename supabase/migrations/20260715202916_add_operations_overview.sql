begin;

alter table public.region_access
add column if not exists granted_at timestamptz;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'created_at'
    ) then
        execute $backfill$
            update public.region_access ra
            set granted_at = coalesce(
                (
                    select p.created_at
                    from public.profiles p
                    where p.id = ra.user_id
                ),
                now()
            )
            where ra.granted_at is null
        $backfill$;
    else
        update public.region_access
        set granted_at = now()
        where granted_at is null;
    end if;
end;
$$;

alter table public.region_access
alter column granted_at set default now();

alter table public.region_access
alter column granted_at set not null;

create index if not exists app_events_operations_overview_idx
on public.app_events (
    region_id,
    type,
    created_at,
    user_id
);

create index if not exists region_access_operations_overview_idx
on public.region_access (
    region_id,
    granted_at,
    user_id
);

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
                select count(distinct ra.user_id)
                from public.region_access ra
                where ra.region_id = p_region_id
            ),

            'new7d',
            (
                select count(distinct ra.user_id)
                from public.region_access ra
                where ra.region_id = p_region_id
                  and ra.granted_at >= now() - interval '7 days'
            ),

            'new30d',
            (
                select count(distinct ra.user_id)
                from public.region_access ra
                where ra.region_id = p_region_id
                  and ra.granted_at >= now() - interval '30 days'
            )
        ),

        'activity',
        jsonb_build_object(
            'active7d',
            (
                select count(distinct ae.user_id)
                from public.app_events ae
                where ae.region_id = p_region_id
                  and ae.type = 'app_opened'
                  and ae.created_at >= now() - interval '7 days'
                  and ae.user_id is not null
            ),

            'active30d',
            (
                select count(distinct ae.user_id)
                from public.app_events ae
                where ae.region_id = p_region_id
                  and ae.type = 'app_opened'
                  and ae.created_at >= now() - interval '30 days'
                  and ae.user_id is not null
            ),

            'appOpensToday',
            (
                select count(*)
                from public.app_events ae
                where ae.region_id = p_region_id
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

revoke all
on function public.get_operations_overview(uuid)
from public;

grant execute
on function public.get_operations_overview(uuid)
to authenticated;

commit;