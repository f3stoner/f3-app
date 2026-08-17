create or replace function public.review_region_import_structure(
    p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    site_count integer := 0;
    ao_count integer := 0;
    schedule_count integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can review import structure'
            using errcode = '42501';
    end if;

    if p_project_id is null then
        raise exception 'Import project is required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.region_import_projects project
        where project.id = p_project_id
    ) then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    /*
     * Every staged AO default Site must exist in the same project.
     */
    if exists (
        select 1
        from public.region_import_staged_aos ao
        left join public.region_import_staged_sites site
            on site.project_id = ao.project_id
           and site.source_key = ao.default_site_source_key
        where ao.project_id = p_project_id
          and ao.status <> 'ignored'
          and ao.default_site_source_key is not null
          and site.id is null
    ) then
        raise exception 'One or more staged AOs reference a missing staged Site'
            using errcode = '23514';
    end if;

    /*
     * Every staged schedule must resolve to a staged AO.
     */
    if exists (
        select 1
        from public.region_import_staged_schedules schedule
        left join public.region_import_staged_aos ao
            on ao.project_id = schedule.project_id
           and ao.source_key = schedule.ao_source_key
        where schedule.project_id = p_project_id
          and schedule.status <> 'ignored'
          and ao.id is null
    ) then
        raise exception 'One or more staged schedules reference a missing staged AO'
            using errcode = '23514';
    end if;

    /*
     * Every staged schedule must resolve to a staged Site.
     */
    if exists (
        select 1
        from public.region_import_staged_schedules schedule
        left join public.region_import_staged_sites site
            on site.project_id = schedule.project_id
           and site.source_key = schedule.site_source_key
        where schedule.project_id = p_project_id
          and schedule.status <> 'ignored'
          and site.id is null
    ) then
        raise exception 'One or more staged schedules reference a missing staged Site'
            using errcode = '23514';
    end if;

    /*
     * Do not allow reviewed schedules to point at ignored structure.
     */
    if exists (
        select 1
        from public.region_import_staged_schedules schedule
        join public.region_import_staged_aos ao
            on ao.project_id = schedule.project_id
           and ao.source_key = schedule.ao_source_key
        join public.region_import_staged_sites site
            on site.project_id = schedule.project_id
           and site.source_key = schedule.site_source_key
        where schedule.project_id = p_project_id
          and schedule.status <> 'ignored'
          and (
              ao.status = 'ignored'
              or site.status = 'ignored'
          )
    ) then
        raise exception 'A staged schedule references ignored AO or Site structure'
            using errcode = '23514';
    end if;

    /*
     * Mark all non-ignored structure reviewed.
     */
    update public.region_import_staged_sites
    set
        status = 'reviewed',
        updated_at = now()
    where project_id = p_project_id
      and status = 'staged';

    get diagnostics site_count = row_count;

    update public.region_import_staged_aos
    set
        status = 'reviewed',
        updated_at = now()
    where project_id = p_project_id
      and status = 'staged';

    get diagnostics ao_count = row_count;

    update public.region_import_staged_schedules
    set
        status = 'reviewed',
        updated_at = now()
    where project_id = p_project_id
      and status = 'staged';

    get diagnostics schedule_count = row_count;

    update public.region_import_projects
    set
        status = 'data_validation',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId', p_project_id,
        'sitesReviewed', site_count,
        'aosReviewed', ao_count,
        'schedulesReviewed', schedule_count
    );
end;
$function$;