create or replace function public.resolve_region_import_session_duplicate(
    p_staged_session_id uuid,
    p_resolution_type text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    staged_session public.region_import_staged_sessions%rowtype;
    target_project public.region_import_projects%rowtype;

    matching_session_id uuid;
    matching_session_count integer;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can resolve imported session duplicates'
            using errcode = '42501';
    end if;

    if p_staged_session_id is null then
        raise exception 'Staged session is required'
            using errcode = '22023';
    end if;

    if p_resolution_type not in (
        'use_existing',
        'ignore'
    ) then
        raise exception 'Unsupported duplicate resolution type'
            using errcode = '22023';
    end if;

    select *
    into staged_session
    from public.region_import_staged_sessions
    where id = p_staged_session_id
    for update;

    if staged_session.id is null then
        raise exception 'Staged session not found'
            using errcode = '22023';
    end if;

    select *
    into target_project
    from public.region_import_projects
    where id = staged_session.project_id;

    if target_project.id is null then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    if staged_session.validation_status = 'committed' then
        raise exception 'Staged session is already committed'
            using errcode = '23514';
    end if;

    if staged_session.validation_status = 'ignored' then
        return jsonb_build_object(
            'stagedSessionId', staged_session.id,
            'resolutionType', 'ignore',
            'validationStatus', 'ignored',
            'createdSessionId', null
        );
    end if;

    if staged_session.validation_status <> 'reviewed' then
        raise exception 'Staged session must be reviewed before duplicate resolution'
            using errcode = '23514';
    end if;

    if staged_session.duplicate_status <> 'exact_existing_match' then
        raise exception 'Staged session is not an exact existing-session match'
            using errcode = '23514';
    end if;

    /*
     * =========================================================
     * IGNORE IMPORTED SESSION
     * =========================================================
     */
    if p_resolution_type = 'ignore' then
        update public.region_import_staged_sessions
        set
            validation_status = 'ignored',
            updated_at = now()
        where id = staged_session.id;

        return jsonb_build_object(
            'stagedSessionId', staged_session.id,
            'resolutionType', 'ignore',
            'validationStatus', 'ignored',
            'createdSessionId', null
        );
    end if;

    /*
     * =========================================================
     * USE EXISTING SESSION
     * =========================================================
     *
     * Re-run the same production overlap check used by review.
     * We require exactly one matching session before linking the
     * import row to it.
     */
    select count(*)
    into matching_session_count
    from public.sessions existing
    where existing.region_id = target_project.region_id
      and existing.date = staged_session.session_date::text
      and existing.ao_id = staged_session.resolved_ao_id
      and (
          staged_session.start_time is null
          or existing.start_time =
              to_char(
                  staged_session.start_time,
                  'HH24:MI'
              )
          or existing.start_time =
              staged_session.start_time::text
      );

    if matching_session_count <> 1 then
        raise exception
            'Exact existing-session match is no longer unique. Review sessions again.'
            using errcode = '23514';
    end if;

    select existing.id
    into matching_session_id
    from public.sessions existing
    where existing.region_id = target_project.region_id
      and existing.date = staged_session.session_date::text
      and existing.ao_id = staged_session.resolved_ao_id
      and (
          staged_session.start_time is null
          or existing.start_time =
              to_char(
                  staged_session.start_time,
                  'HH24:MI'
              )
          or existing.start_time =
              staged_session.start_time::text
      )
    limit 1;

    if matching_session_id is null then
        raise exception
            'Matching production session could not be resolved'
            using errcode = '23514';
    end if;

    update public.region_import_staged_sessions
    set
        created_session_id = matching_session_id,
        validation_status = 'committed',
        updated_at = now()
    where id = staged_session.id;

    return jsonb_build_object(
        'stagedSessionId', staged_session.id,
        'resolutionType', 'use_existing',
        'validationStatus', 'committed',
        'createdSessionId', matching_session_id
    );
end;
$function$;