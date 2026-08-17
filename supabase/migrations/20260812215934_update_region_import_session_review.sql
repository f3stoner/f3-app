create or replace function public.review_region_import_sessions(
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
    staged_participant public.region_import_staged_session_participants%rowtype;

    v_resolved_ao_id uuid;
    v_resolved_site_id uuid;
    resolved_member_id uuid;

    existing_session_count integer;

    sessions_reviewed integer := 0;
    participants_resolved integer := 0;
    participants_ignored integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can review import sessions'
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

    for staged_session in
        select *
        from public.region_import_staged_sessions
        where project_id = p_project_id
          and validation_status <> 'ignored'
        order by session_date, start_time, id
    loop
        select ao.created_ao_id
        into v_resolved_ao_id
        from public.region_import_staged_aos ao
        where ao.project_id = p_project_id
          and ao.source_key = staged_session.ao_source_key
          and ao.status = 'committed';

        if v_resolved_ao_id is null then
            raise exception
                'Session "%" has no committed AO for source key "%"',
                staged_session.source_session_key,
                staged_session.ao_source_key
                using errcode = '23514';
        end if;

        v_resolved_site_id := null;

        if staged_session.site_source_key is not null then
            select site.created_site_id
            into v_resolved_site_id
            from public.region_import_staged_sites site
            where site.project_id = p_project_id
              and site.source_key = staged_session.site_source_key
              and site.status = 'committed';

            if v_resolved_site_id is null then
                raise exception
                    'Session "%" has no committed Site for source key "%"',
                    staged_session.source_session_key,
                    staged_session.site_source_key
                    using errcode = '23514';
            end if;
        end if;

        for staged_participant in
            select *
            from public.region_import_staged_session_participants
            where staged_session_id = staged_session.id
            order by participant_role, id
        loop
            resolved_member_id := null;

            select
                case
                    when resolution.resolution_type = 'match_existing'
                        then resolution.canonical_member_id
                    when resolution.resolution_type = 'create_new'
                        then resolution.created_member_id
                    else null
                end
            into resolved_member_id
            from public.region_import_identity_resolutions resolution
            where resolution.source_identity_id =
                staged_participant.source_identity_id
            order by
                resolution.resolved_at desc,
                resolution.id desc
            limit 1;

            if resolved_member_id is not null then
                if not exists (
                    select 1
                    from public.members member
                    where member.id = resolved_member_id
                      and member.status = 'active'
                ) then
                    raise exception
                        'Resolved canonical member % for staged participant % is not active',
                        resolved_member_id,
                        staged_participant.id
                        using errcode = '23514';
                end if;

                update public.region_import_staged_session_participants
                set
                    canonical_member_id = resolved_member_id,
                    resolution_status = 'resolved',
                    updated_at = now()
                where id = staged_participant.id;

                participants_resolved :=
                    participants_resolved + 1;

            elsif exists (
                select 1
                from public.region_import_identity_resolutions resolution
                where resolution.source_identity_id =
                    staged_participant.source_identity_id
                  and resolution.resolution_type = 'ignored'
                order by
                    resolution.resolved_at desc,
                    resolution.id desc
                limit 1
            ) then
                update public.region_import_staged_session_participants
                set
                    canonical_member_id = null,
                    resolution_status = 'ignored',
                    updated_at = now()
                where id = staged_participant.id;

                participants_ignored :=
                    participants_ignored + 1;

            else
                raise exception
                    'Participant % in session "%" does not have a committed canonical identity',
                    staged_participant.id,
                    staged_session.source_session_key
                    using errcode = '23514';
            end if;
        end loop;

        if exists (
            select 1
            from public.region_import_staged_session_participants participant
            where participant.staged_session_id = staged_session.id
              and participant.resolution_status = 'resolved'
              and participant.canonical_member_id is not null
            group by
                participant.canonical_member_id,
                participant.participant_role
            having count(*) > 1
        ) then
            raise exception
                'Session "%" contains duplicate canonical participants after identity resolution',
                staged_session.source_session_key
                using errcode = '23514';
        end if;

        select count(*)
        into existing_session_count
        from public.sessions existing
        where existing.region_id = target_project.region_id
          and existing.date = staged_session.session_date::text
          and existing.ao_id = v_resolved_ao_id
          and (
              staged_session.start_time is null
              or existing.start_time =
                  to_char(staged_session.start_time, 'HH24:MI')
              or existing.start_time =
                  staged_session.start_time::text
          );

        update public.region_import_staged_sessions
        set
            resolved_ao_id = v_resolved_ao_id,
            resolved_site_id = v_resolved_site_id,

            duplicate_status = case
                when existing_session_count = 0
                    then 'new'
                when existing_session_count = 1
                    then 'exact_existing_match'
                else 'conflicting_existing_session'
            end,

            validation_status = 'reviewed',
            updated_at = now()
        where id = staged_session.id;

        sessions_reviewed := sessions_reviewed + 1;
    end loop;

    update public.region_import_projects
    set
        status = 'data_validation',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId', p_project_id,
        'sessionsReviewed', sessions_reviewed,
        'participantsResolved', participants_resolved,
        'participantsIgnored', participants_ignored
    );
end;
$function$;