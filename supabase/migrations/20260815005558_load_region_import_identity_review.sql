create or replace function public.load_region_import_identity_review(
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
        raise exception 'Only superadmins can review import identities'
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

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', identity.id,
                'displayName', identity.display_name,
                'sourceF3Name', identity.source_f3_name,
                'sourceRealName', identity.source_real_name,
                'sourceEmail', identity.source_email,
                'sourcePhone', identity.source_phone,
                'sourceHomeRegion', identity.source_home_region,
                'status', identity.source_identity_status,

                'resolution',
                case
                    when latest_resolution.id is null then null

                    else jsonb_build_object(
                        'id', latest_resolution.id,
                        'type', latest_resolution.resolution_type,
                        'canonicalMemberId', latest_resolution.canonical_member_id,
                        'createdMemberId', latest_resolution.created_member_id,
                        'mergeId', latest_resolution.merge_id,
                        'mergeStatus', linked_merge.status,
                        'notes', latest_resolution.notes,
                        'resolvedAt', latest_resolution.resolved_at,

                        'isLocked',
                            (
                                latest_resolution.created_member_id is not null
                                or latest_resolution.merge_id is not null
                                or committed_dependency.has_dependency
                            ),

                        'lockReason',
                            case
                                when latest_resolution.merge_id is not null then
                                    'A member merge is linked to this identity.'

                                when latest_resolution.created_member_id is not null then
                                    'A canonical member has already been created from this identity.'

                                when committed_dependency.has_dependency then
                                    'Committed historical session data depends on this identity resolution.'

                                else null
                            end
                    )
                end,

                'candidates',
                coalesce(
                    candidates.items,
                    '[]'::jsonb
                )
            )
            order by
                case
                    when identity.source_identity_status = 'needs_review'
                        then 0
                    else 1
                end,
                lower(coalesce(identity.display_name, '')),
                identity.id
        ),
        '[]'::jsonb
    )
    into result

    from public.region_import_source_identities identity

    left join lateral (
        select resolution.*
        from public.region_import_identity_resolutions resolution
        where resolution.source_identity_id = identity.id
        order by
            resolution.resolved_at desc,
            resolution.id desc
        limit 1
    ) latest_resolution on true

    left join public.member_merges linked_merge
        on linked_merge.id = latest_resolution.merge_id

    left join lateral (
        select exists (
            select 1
            from public.region_import_staged_session_participants participant
            join public.region_import_staged_sessions session
                on session.id = participant.staged_session_id
            where participant.source_identity_id = identity.id
              and (
                  session.validation_status = 'committed'
                  or session.created_session_id is not null
              )
        ) as has_dependency
    ) committed_dependency on true

    left join lateral (
        select jsonb_agg(
            jsonb_build_object(
                'id', candidate.id,
                'memberId', member.id,
                'paxName', member.pax_name,
                'realName', member.real_name,
                'homeRegion', region.name,
                'rank', candidate.candidate_rank,
                'classification', candidate.classification,
                'score', candidate.overall_score,
                'scoreBreakdown', candidate.score_breakdown,
                'positiveEvidence', candidate.positive_evidence
            )
            order by
                candidate.candidate_rank,
                candidate.id
        ) as items

        from public.region_import_identity_candidates candidate

        join public.members member
            on member.id = candidate.canonical_member_id

        left join public.regions region
            on region.id = member.region_id

        where candidate.source_identity_id = identity.id
    ) candidates on true

    where identity.project_id = p_project_id;

    return result;
end;
$function$;