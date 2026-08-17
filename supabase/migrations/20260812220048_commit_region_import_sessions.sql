create or replace function public.commit_region_import_sessions(
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
    staged_session public.region_import_staged_sessions%rowtype;

    attendee_ids_json jsonb;
    q_member_ids uuid[];
    primary_q_id uuid;

    v_created_session_id uuid;

    sessions_created integer := 0;
    sessions_reused integer := 0;
    sessions_ignored integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can commit import sessions'
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
     * Every non-ignored staged session must be reviewed first.
     */
    if exists (
        select 1
        from public.region_import_staged_sessions session
        where session.project_id = p_project_id
          and session.validation_status = 'staged'
    ) then
        raise exception 'All staged sessions must be reviewed before commit'
            using errcode = '23514';
    end if;

    /*
     * Do not automatically decide what to do with sessions that
     * overlap existing production data.
     */
    if exists (
        select 1
        from public.region_import_staged_sessions session
        where session.project_id = p_project_id
          and session.validation_status <> 'ignored'
          and session.created_session_id is null
          and session.duplicate_status in (
              'exact_existing_match',
              'probable_duplicate',
              'conflicting_existing_session',
              'unchecked'
          )
    ) then
        raise exception
            'Import project contains sessions requiring duplicate review before commit'
            using errcode = '23514';
    end if;

    for staged_session in
        select *
        from public.region_import_staged_sessions
        where project_id = p_project_id
        order by session_date, start_time, id
    loop
        if staged_session.validation_status = 'ignored' then
            sessions_ignored := sessions_ignored + 1;
            continue;
        end if;

        /*
         * Rerun safety.
         */
        if staged_session.created_session_id is not null then
            if not exists (
                select 1
                from public.sessions session
                where session.id = staged_session.created_session_id
                  and session.region_id = target_project.region_id
            ) then
                raise exception
                    'Previously created session % is missing or belongs to another region',
                    staged_session.created_session_id
                    using errcode = '23514';
            end if;

            sessions_reused := sessions_reused + 1;
            continue;
        end if;

        if staged_session.validation_status <> 'reviewed' then
            raise exception
                'Session "%" has not been reviewed',
                staged_session.source_session_key
                using errcode = '23514';
        end if;

        if staged_session.duplicate_status <> 'new' then
            raise exception
                'Session "%" is not approved as a new production session',
                staged_session.source_session_key
                using errcode = '23514';
        end if;

        if staged_session.resolved_ao_id is null then
            raise exception
                'Session "%" has no resolved AO',
                staged_session.source_session_key
                using errcode = '23514';
        end if;

        /*
         * Recheck immediately before creation in case a session was
         * added after the review pass.
         */
        if exists (
            select 1
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
        ) then
            raise exception
                'A matching production session now exists for "%". Review duplicates again before commit.',
                staged_session.source_session_key
                using errcode = '23514';
        end if;

        /*
         * Every active participant reference must already be resolved.
         */
        if exists (
            select 1
            from public.region_import_staged_session_participants participant
            where participant.staged_session_id = staged_session.id
              and participant.resolution_status not in (
                  'resolved',
                  'ignored'
              )
        ) then
            raise exception
                'Session "%" contains unresolved participants',
                staged_session.source_session_key
                using errcode = '23514';
        end if;

        /*
         * Build production attendee_ids as a JSON array of canonical
         * UUID strings.
         */
        select coalesce(
            jsonb_agg(
                distinct participant.canonical_member_id::text
            ),
            '[]'::jsonb
        )
        into attendee_ids_json
        from public.region_import_staged_session_participants participant
        where participant.staged_session_id = staged_session.id
          and participant.participant_role = 'attendee'
          and participant.resolution_status = 'resolved'
          and participant.canonical_member_id is not null;

        /*
         * Build current multi-Q representation.
         */
        select coalesce(
            array_agg(
                distinct participant.canonical_member_id
                order by participant.canonical_member_id
            ),
            '{}'::uuid[]
        )
        into q_member_ids
        from public.region_import_staged_session_participants participant
        where participant.staged_session_id = staged_session.id
          and participant.participant_role in (
              'q',
              'coq'
          )
          and participant.resolution_status = 'resolved'
          and participant.canonical_member_id is not null;

        /*
         * Legacy single-Q compatibility.
         *
         * Prefer an explicit q over coq.
         */
        select participant.canonical_member_id
        into primary_q_id
        from public.region_import_staged_session_participants participant
        where participant.staged_session_id = staged_session.id
          and participant.participant_role = 'q'
          and participant.resolution_status = 'resolved'
          and participant.canonical_member_id is not null
        order by participant.created_at, participant.id
        limit 1;

        if primary_q_id is null
           and cardinality(q_member_ids) > 0 then
            primary_q_id := q_member_ids[1];
        end if;

        insert into public.sessions (
            region_id,
            date,
            ao_name,
            q_id,
            attendee_ids,
            fngs,
            notes,
            created_at,
            q_ids,
            created_by_user_id,
            start_time,
            attendance_review_status,
            ao_id,
            site_id
        )
        values (
            target_project.region_id,
            staged_session.session_date::text,
            (
                select ao.name
                from public.aos ao
                where ao.id = staged_session.resolved_ao_id
            ),
            primary_q_id,
            attendee_ids_json,
            '[]'::jsonb,
            staged_session.notes,
            floor(
                extract(
                    epoch from clock_timestamp()
                ) * 1000
            )::bigint,
            q_member_ids,
            caller_id,
            case
                when staged_session.start_time is null
                    then null
                else to_char(
                    staged_session.start_time,
                    'HH24:MI'
                )
            end,
            'not_required',
            staged_session.resolved_ao_id,
            staged_session.resolved_site_id
        )
        returning id
        into v_created_session_id;

        update public.region_import_staged_sessions
        set
            created_session_id = v_created_session_id,
            validation_status = 'committed',
            updated_at = now()
        where id = staged_session.id;

        /*
         * Let the existing production participation system remain
         * authoritative instead of implementing another one here.
         */
        perform public.sync_region_participants_for_session(
            v_created_session_id
        );

        sessions_created := sessions_created + 1;
    end loop;

    update public.region_import_projects
    set
        status = 'data_validation',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId', p_project_id,
        'sessionsCreated', sessions_created,
        'sessionsReused', sessions_reused,
        'sessionsIgnored', sessions_ignored
    );
end;
$function$;