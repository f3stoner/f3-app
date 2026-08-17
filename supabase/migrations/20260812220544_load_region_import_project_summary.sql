create or replace function public.load_region_import_project_summary(
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
    target_region public.regions%rowtype;

    result jsonb;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can view region import projects'
            using errcode = '42501';
    end if;

    if p_project_id is null then
        raise exception 'Import project is required'
            using errcode = '22023';
    end if;

    select *
    into target_project
    from public.region_import_projects
    where id = p_project_id;

    if target_project.id is null then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    select *
    into target_region
    from public.regions
    where id = target_project.region_id;

    if target_region.id is null then
        raise exception 'Import project region not found'
            using errcode = '23514';
    end if;

    select jsonb_build_object(
        'project',
        jsonb_build_object(
            'id', target_project.id,
            'name', target_project.name,
            'status', target_project.status,
            'sourceSystem', target_project.source_system,
            'parserVersion', target_project.parser_version,
            'matchingVersion', target_project.matching_version,
            'expectedMemberCount', target_project.expected_member_count,
            'expectedSessionCount', target_project.expected_session_count,
            'createdAt', target_project.created_at,
            'updatedAt', target_project.updated_at,
            'completedAt', target_project.completed_at,
            'activatedAt', target_project.activated_at
        ),

        'region',
        jsonb_build_object(
            'id', target_region.id,
            'name', target_region.name
        ),

        'batches',
        jsonb_build_object(
            'total',
            (
                select count(*)
                from public.region_import_batches batch
                where batch.project_id = p_project_id
            ),

            'rows',
            (
                select count(*)
                from public.region_import_raw_rows raw
                join public.region_import_batches batch
                    on batch.id = raw.batch_id
                where batch.project_id = p_project_id
            )
        ),

        'identities',
        jsonb_build_object(
            'total',
            (
                select count(*)
                from public.region_import_source_identities identity
                where identity.project_id = p_project_id
            ),

            'needsReview',
            (
                select count(*)
                from public.region_import_source_identities identity
                where identity.project_id = p_project_id
                  and identity.source_identity_status = 'needs_review'
            ),

            'resolved',
            (
                select count(*)
                from public.region_import_source_identities identity
                where identity.project_id = p_project_id
                  and identity.source_identity_status = 'resolved'
            ),

            'ignored',
            (
                select count(*)
                from public.region_import_source_identities identity
                where identity.project_id = p_project_id
                  and identity.source_identity_status = 'ignored'
            ),

            'deferred',
            (
                select count(*)
                from public.region_import_source_identities identity
                where identity.project_id = p_project_id
                  and identity.source_identity_status = 'deferred'
            ),

            'matchedExisting',
            (
                select count(*)
                from public.region_import_source_identities identity
                join lateral (
                    select resolution.*
                    from public.region_import_identity_resolutions resolution
                    where resolution.source_identity_id = identity.id
                    order by
                        resolution.resolved_at desc,
                        resolution.id desc
                    limit 1
                ) latest on true
                where identity.project_id = p_project_id
                  and latest.resolution_type = 'match_existing'
            ),

            'createNew',
            (
                select count(*)
                from public.region_import_source_identities identity
                join lateral (
                    select resolution.*
                    from public.region_import_identity_resolutions resolution
                    where resolution.source_identity_id = identity.id
                    order by
                        resolution.resolved_at desc,
                        resolution.id desc
                    limit 1
                ) latest on true
                where identity.project_id = p_project_id
                  and latest.resolution_type = 'create_new'
            ),

            'membersCreated',
            (
                select count(*)
                from public.region_import_source_identities identity
                join lateral (
                    select resolution.*
                    from public.region_import_identity_resolutions resolution
                    where resolution.source_identity_id = identity.id
                    order by
                        resolution.resolved_at desc,
                        resolution.id desc
                    limit 1
                ) latest on true
                where identity.project_id = p_project_id
                  and latest.created_member_id is not null
            )
        ),

        'structure',
        jsonb_build_object(
            'sites',
            (
                select count(*)
                from public.region_import_staged_sites site
                where site.project_id = p_project_id
                  and site.status <> 'ignored'
            ),

            'sitesCommitted',
            (
                select count(*)
                from public.region_import_staged_sites site
                where site.project_id = p_project_id
                  and site.status = 'committed'
            ),

            'aos',
            (
                select count(*)
                from public.region_import_staged_aos ao
                where ao.project_id = p_project_id
                  and ao.status <> 'ignored'
            ),

            'aosCommitted',
            (
                select count(*)
                from public.region_import_staged_aos ao
                where ao.project_id = p_project_id
                  and ao.status = 'committed'
            ),

            'schedules',
            (
                select count(*)
                from public.region_import_staged_schedules schedule
                where schedule.project_id = p_project_id
                  and schedule.status <> 'ignored'
            ),

            'schedulesCommitted',
            (
                select count(*)
                from public.region_import_staged_schedules schedule
                where schedule.project_id = p_project_id
                  and schedule.status = 'committed'
            )
        ),

        'sessions',
        jsonb_build_object(
            'total',
            (
                select count(*)
                from public.region_import_staged_sessions session
                where session.project_id = p_project_id
                  and session.validation_status <> 'ignored'
            ),

            'staged',
            (
                select count(*)
                from public.region_import_staged_sessions session
                where session.project_id = p_project_id
                  and session.validation_status = 'staged'
            ),

            'reviewed',
            (
                select count(*)
                from public.region_import_staged_sessions session
                where session.project_id = p_project_id
                  and session.validation_status = 'reviewed'
            ),

            'committed',
            (
                select count(*)
                from public.region_import_staged_sessions session
                where session.project_id = p_project_id
                  and session.validation_status = 'committed'
            ),

            'new',
            (
                select count(*)
                from public.region_import_staged_sessions session
                where session.project_id = p_project_id
                  and session.duplicate_status = 'new'
            ),

            'duplicateReview',
            (
                select count(*)
                from public.region_import_staged_sessions session
                where session.project_id = p_project_id
                  and session.created_session_id is null
                  and session.duplicate_status in (
                      'exact_existing_match',
                      'probable_duplicate',
                      'conflicting_existing_session'
                  )
            ),

            'participants',
            (
                select count(*)
                from public.region_import_staged_session_participants participant
                join public.region_import_staged_sessions session
                    on session.id = participant.staged_session_id
                where session.project_id = p_project_id
            ),

            'participantsUnresolved',
            (
                select count(*)
                from public.region_import_staged_session_participants participant
                join public.region_import_staged_sessions session
                    on session.id = participant.staged_session_id
                where session.project_id = p_project_id
                  and participant.resolution_status not in (
                      'resolved',
                      'ignored'
                  )
            )
        )
    )
    into result;

    return result;
end;
$function$;