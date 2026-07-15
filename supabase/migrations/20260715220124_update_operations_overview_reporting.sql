begin;

create or replace function public.get_operations_overview(
    p_region_id uuid default null
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
            where include_in_reporting = true
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
                      and ra.granted_at >= now() - interval '7 days'
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
                    where ae.type = 'app_opened'
                      and ae.created_at >= now() - interval '7 days'
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
                      and ae.created_at >= now() - interval '30 days'
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
                      and ae.created_at >= date_trunc('day', now())
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
                      and ae.created_at >= now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                ),

                'workoutsCreated',
                (
                    select count(*)
                    from public.app_events ae
                    where ae.type = 'planned_workout_created'
                      and ae.created_at >= now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                ),

                'executionsStarted',
                (
                    select count(*)
                    from public.app_events ae
                    where ae.type = 'execution_started'
                      and ae.created_at >= now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                ),

                'backblastsGenerated',
                (
                    select count(*)
                    from public.app_events ae
                    where ae.type = 'backblast_generated'
                      and ae.created_at >= now() - interval '7 days'
                      and ae.region_id in (
                          select id
                          from reportable_regions
                      )
                )
            ),

            'health',
            jsonb_build_object(
                'status','not_configured',
                'criticalCount',0,
                'warningCount',0,
                'passingCount',0,
                'lastAuditAt',null
            )
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