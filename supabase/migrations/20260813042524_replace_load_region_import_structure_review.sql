create or replace function public.load_region_import_structure_review(
    p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();
    result jsonb;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can review import structure'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.region_import_projects project
        where project.id = p_project_id
    ) then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    select jsonb_build_object(
        'sites',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id', site.id,
                        'sourceKey', site.source_key,
                        'name', site.name,
                        'address', site.address,
                        'mapUrl', site.map_url,
                        'latitude', site.latitude,
                        'longitude', site.longitude,
                        'weatherLocationLabel', site.weather_location_label,
                        'weatherEnabled', site.weather_enabled,
                        'status', site.status,
                        'createdSiteId', site.created_site_id,
                        'sourceData', site.source_data
                    )
                    order by lower(site.name), site.id
                )
                from public.region_import_staged_sites site
                where site.project_id = p_project_id
            ),
            '[]'::jsonb
        ),

        'aos',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id', ao.id,
                        'sourceKey', ao.source_key,
                        'name', ao.name,
                        'defaultSiteSourceKey', ao.default_site_source_key,
                        'isActive', ao.is_active,
                        'status', ao.status,
                        'createdAoId', ao.created_ao_id,
                        'sourceData', ao.source_data
                    )
                    order by lower(ao.name), ao.id
                )
                from public.region_import_staged_aos ao
                where ao.project_id = p_project_id
            ),
            '[]'::jsonb
        ),

        'schedules',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id', schedule.id,
                        'sourceKey', schedule.source_key,
                        'aoSourceKey', schedule.ao_source_key,
                        'siteSourceKey', schedule.site_source_key,
                        'weekday', schedule.weekday,
                        'startTime', schedule.start_time,
                        'durationMinutes', schedule.duration_minutes,
                        'label', schedule.schedule_label,
                        'emphasisRule', schedule.emphasis_rule,
                        'effectiveStartDate', schedule.effective_start_date,
                        'effectiveEndDate', schedule.effective_end_date,
                        'isActive', schedule.is_active,
                        'status', schedule.status,
                        'createdScheduleId', schedule.created_schedule_id,
                        'sourceData', schedule.source_data
                    )
                    order by
                        schedule.ao_source_key,
                        schedule.weekday,
                        schedule.start_time,
                        schedule.id
                )
                from public.region_import_staged_schedules schedule
                where schedule.project_id = p_project_id
            ),
            '[]'::jsonb
        )
    )
    into result;

    return result;
end;
$function$;