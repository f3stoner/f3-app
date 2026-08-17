create or replace function public.load_region_import_session_review(
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
        raise exception 'Only superadmins can review import sessions'
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
        'sessions',
        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'id', session.id,
                    'sourceSessionKey', session.source_session_key,
                    'sessionDate', session.session_date,
                    'startTime', session.start_time,
                    'aoSourceKey', session.ao_source_key,
                    'siteSourceKey', session.site_source_key,
                    'resolvedAoId', session.resolved_ao_id,
                    'resolvedSiteId', session.resolved_site_id,
                    'validationStatus', session.validation_status,
                    'duplicateStatus', session.duplicate_status,
                    'createdSessionId', session.created_session_id,
                    'notes', session.notes,
                    'participants', (
                        select coalesce(
                            jsonb_agg(
                                jsonb_build_object(
                                    'id', participant.id,
                                    'displayName', identity.display_name,
                                    'participantRole', participant.participant_role,
                                    'resolutionStatus', participant.resolution_status,
                                    'canonicalMemberId', participant.canonical_member_id,
                                    'canonicalPaxName', member.pax_name
                                )
                                order by participant.participant_role, identity.display_name
                            ),
                            '[]'::jsonb
                        )
                        from public.region_import_staged_session_participants participant
                        left join public.region_import_source_identities identity
                            on identity.id = participant.source_identity_id
                        left join public.members member
                            on member.id = participant.canonical_member_id
                        where participant.staged_session_id = session.id
                    )
                )
                order by session.session_date, session.start_time, session.id
            ),
            '[]'::jsonb
        )
    )
    into result
    from public.region_import_staged_sessions session
    where session.project_id = p_project_id;

    return result;
end;
$function$;