create or replace function public.commit_region_import_structure(
    p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    target_project public.region_import_projects%rowtype;

    staged_site public.region_import_staged_sites%rowtype;
    staged_ao public.region_import_staged_aos%rowtype;
    staged_schedule public.region_import_staged_schedules%rowtype;

    resolved_site_id uuid;
    resolved_ao_id uuid;
    resolved_default_site_id uuid;
    resolved_schedule_id uuid;

    ao_days_of_week integer[];
    ao_default_time text;

    sites_created integer := 0;
    sites_reused integer := 0;

    aos_created integer := 0;
    aos_reused integer := 0;

    schedules_created integer := 0;
    schedules_reused integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can commit import structure'
            using errcode = '42501';
    end if;

    if p_project_id is null then
        raise exception 'Import project is required'
            using errcode = '22023';
    end if;

    select *
    into target_project
    from public.region_import_projects
    where id = p_project_id
    for update;

    if target_project.id is null then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    /*
     * Nothing still staged may be committed.
     * All non-ignored structure must pass review first.
     */
    if exists (
        select 1
        from public.region_import_staged_sites
        where project_id = p_project_id
          and status = 'staged'
    )
    or exists (
        select 1
        from public.region_import_staged_aos
        where project_id = p_project_id
          and status = 'staged'
    )
    or exists (
        select 1
        from public.region_import_staged_schedules
        where project_id = p_project_id
          and status = 'staged'
    ) then
        raise exception 'All staged structure must be reviewed before commit'
            using errcode = '23514';
    end if;

    /*
     * =========================================================
     * SITES
     * =========================================================
     */
    for staged_site in
        select *
        from public.region_import_staged_sites
        where project_id = p_project_id
          and status <> 'ignored'
        order by created_at, id
    loop
        if staged_site.created_site_id is not null then
            if not exists (
                select 1
                from public.sites site
                where site.id = staged_site.created_site_id
                  and site.region_id = target_project.region_id
            ) then
                raise exception
                    'Previously created Site % is missing or belongs to another region',
                    staged_site.created_site_id
                    using errcode = '23514';
            end if;

            resolved_site_id := staged_site.created_site_id;
            sites_reused := sites_reused + 1;

        else
            if exists (
                select 1
                from public.sites site
                where site.region_id = target_project.region_id
                  and lower(btrim(site.name)) =
                      lower(btrim(staged_site.name))
            ) then
                raise exception
                    'A live Site named "%" already exists in this region. Explicit mapping is required before import commit.',
                    staged_site.name
                    using errcode = '23514';
            end if;

            insert into public.sites (
                region_id,
                name,
                address,
                map_url,
                latitude,
                longitude,
                weather_location_label,
                weather_enabled,
                is_active
            )
            values (
                target_project.region_id,
                btrim(staged_site.name),
                nullif(btrim(staged_site.address), ''),
                nullif(btrim(staged_site.map_url), ''),
                staged_site.latitude,
                staged_site.longitude,
                nullif(
                    btrim(staged_site.weather_location_label),
                    ''
                ),
                staged_site.weather_enabled,
                true
            )
            returning id
            into resolved_site_id;

            update public.region_import_staged_sites
            set
                created_site_id = resolved_site_id,
                status = 'committed',
                updated_at = now()
            where id = staged_site.id;

            sites_created := sites_created + 1;
        end if;

        update public.region_import_staged_sites
        set
            status = 'committed',
            updated_at = now()
        where id = staged_site.id
          and status <> 'committed';
    end loop;

    /*
     * =========================================================
     * AOs
     * =========================================================
     */
    for staged_ao in
        select *
        from public.region_import_staged_aos
        where project_id = p_project_id
          and status <> 'ignored'
        order by created_at, id
    loop
        resolved_default_site_id := null;

        if staged_ao.default_site_source_key is not null then
            select site.created_site_id
            into resolved_default_site_id
            from public.region_import_staged_sites site
            where site.project_id = p_project_id
              and site.source_key =
                  staged_ao.default_site_source_key
              and site.status = 'committed';

            if resolved_default_site_id is null then
                raise exception
                    'AO "%" has no committed default Site',
                    staged_ao.name
                    using errcode = '23514';
            end if;
        end if;

        select
            coalesce(
                array_agg(
                    distinct schedule.weekday
                    order by schedule.weekday
                ),
                '{}'::integer[]
            ),
            min(
                to_char(
                    schedule.start_time,
                    'HH24:MI'
                )
            )
        into
            ao_days_of_week,
            ao_default_time
        from public.region_import_staged_schedules schedule
        where schedule.project_id = p_project_id
          and schedule.ao_source_key = staged_ao.source_key
          and schedule.status <> 'ignored';

        ao_default_time :=
            coalesce(
                ao_default_time,
                ''
            );

        if staged_ao.created_ao_id is not null then
            if not exists (
                select 1
                from public.aos ao
                where ao.id = staged_ao.created_ao_id
                  and ao.region_id = target_project.region_id
            ) then
                raise exception
                    'Previously created AO % is missing or belongs to another region',
                    staged_ao.created_ao_id
                    using errcode = '23514';
            end if;

            resolved_ao_id := staged_ao.created_ao_id;
            aos_reused := aos_reused + 1;

        else
            if exists (
                select 1
                from public.aos ao
                where ao.region_id = target_project.region_id
                  and lower(btrim(ao.name)) =
                      lower(btrim(staged_ao.name))
            ) then
                raise exception
                    'A live AO named "%" already exists in this region. Explicit mapping is required before import commit.',
                    staged_ao.name
                    using errcode = '23514';
            end if;

            resolved_ao_id := gen_random_uuid();

            insert into public.aos (
                id,
                region_id,
                name,
                location_name,
                days_of_week,
                time,
                is_active,
                default_site_id
            )
            values (
                resolved_ao_id,
                target_project.region_id,
                btrim(staged_ao.name),
                (
                    select site.name
                    from public.sites site
                    where site.id =
                        resolved_default_site_id
                ),
                ao_days_of_week,
                ao_default_time,
                staged_ao.is_active,
                resolved_default_site_id
            );

            update public.region_import_staged_aos
            set
                created_ao_id = resolved_ao_id,
                status = 'committed',
                updated_at = now()
            where id = staged_ao.id;

            aos_created := aos_created + 1;
        end if;

        update public.region_import_staged_aos
        set
            status = 'committed',
            updated_at = now()
        where id = staged_ao.id
          and status <> 'committed';
    end loop;

    /*
     * =========================================================
     * RECURRING SCHEDULES
     * =========================================================
     */
    for staged_schedule in
        select *
        from public.region_import_staged_schedules
        where project_id = p_project_id
          and status <> 'ignored'
        order by created_at, id
    loop
        select ao.created_ao_id
        into resolved_ao_id
        from public.region_import_staged_aos ao
        where ao.project_id = p_project_id
          and ao.source_key =
              staged_schedule.ao_source_key
          and ao.status = 'committed';

        if resolved_ao_id is null then
            raise exception
                'Schedule "%" has no committed AO',
                staged_schedule.source_key
                using errcode = '23514';
        end if;

        select site.created_site_id
        into resolved_site_id
        from public.region_import_staged_sites site
        where site.project_id = p_project_id
          and site.source_key =
              staged_schedule.site_source_key
          and site.status = 'committed';

        if resolved_site_id is null then
            raise exception
                'Schedule "%" has no committed Site',
                staged_schedule.source_key
                using errcode = '23514';
        end if;

        if staged_schedule.created_schedule_id is not null then
            if not exists (
                select 1
                from public.ao_recurring_schedules schedule
                where schedule.id =
                    staged_schedule.created_schedule_id
                  and schedule.region_id =
                    target_project.region_id
            ) then
                raise exception
                    'Previously created recurring schedule % is missing or belongs to another region',
                    staged_schedule.created_schedule_id
                    using errcode = '23514';
            end if;

            schedules_reused := schedules_reused + 1;

        else
            if exists (
                select 1
                from public.ao_recurring_schedules schedule
                where schedule.region_id =
                    target_project.region_id
                  and schedule.ao_id =
                    resolved_ao_id
                  and schedule.site_id =
                    resolved_site_id
                  and schedule.weekday =
                    staged_schedule.weekday
                  and schedule.start_time =
                    staged_schedule.start_time
                  and schedule.is_active = true
            ) then
                raise exception
                    'An equivalent live recurring schedule already exists for "%". Explicit mapping is required.',
                    staged_schedule.source_key
                    using errcode = '23514';
            end if;

            insert into public.ao_recurring_schedules (
                region_id,
                ao_id,
                site_id,
                weekday,
                start_time,
                duration_minutes,
                schedule_label,
                emphasis_rule,
                effective_start_date,
                effective_end_date,
                is_active
            )
            values (
                target_project.region_id,
                resolved_ao_id,
                resolved_site_id,
                staged_schedule.weekday,
                staged_schedule.start_time,
                staged_schedule.duration_minutes,
                nullif(
                    btrim(staged_schedule.schedule_label),
                    ''
                ),
                staged_schedule.emphasis_rule,
                staged_schedule.effective_start_date,
                staged_schedule.effective_end_date,
                staged_schedule.is_active
            )
            returning id
            into resolved_schedule_id;

            update public.region_import_staged_schedules
            set
                created_schedule_id = resolved_schedule_id,
                status = 'committed',
                updated_at = now()
            where id = staged_schedule.id;

            schedules_created := schedules_created + 1;
        end if;

        update public.region_import_staged_schedules
        set
            status = 'committed',
            updated_at = now()
        where id = staged_schedule.id
          and status <> 'committed';
    end loop;

    update public.region_import_projects
    set
        status = 'data_validation',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId', p_project_id,
        'sitesCreated', sites_created,
        'sitesReused', sites_reused,
        'aosCreated', aos_created,
        'aosReused', aos_reused,
        'schedulesCreated', schedules_created,
        'schedulesReused', schedules_reused
    );
end;
$function$;