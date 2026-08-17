create or replace function public.resolve_region_import_identity(
    p_source_identity_id uuid,
    p_resolution_type text,
    p_canonical_member_id uuid default null::uuid,
    p_notes text default null::text
)
returns public.region_import_identity_resolutions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();

    source_identity
        public.region_import_source_identities%rowtype;

    previous_resolution
        public.region_import_identity_resolutions%rowtype;

    created_resolution
        public.region_import_identity_resolutions%rowtype;

    has_committed_session_dependency boolean := false;
    resolution_is_locked boolean := false;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can resolve import identities'
            using errcode = '42501';
    end if;

    if p_source_identity_id is null then
        raise exception 'Source identity is required'
            using errcode = '22023';
    end if;

    if p_resolution_type not in (
        'match_existing',
        'create_new',
        'create_new_then_merge',
        'deferred',
        'ignored',
        'needs_superadmin'
    ) then
        raise exception 'Unsupported identity resolution type'
            using errcode = '22023';
    end if;

    select *
    into source_identity
    from public.region_import_source_identities
    where id = p_source_identity_id
    for update;

    if source_identity.id is null then
        raise exception 'Source identity not found'
            using errcode = '22023';
    end if;

    /*
     * Both of these decisions point at an existing canonical
     * member and therefore require a valid active target.
     */
    if p_resolution_type in (
        'match_existing',
        'create_new_then_merge'
    ) then
        if p_canonical_member_id is null then
            raise exception
                'Canonical member is required for %',
                p_resolution_type
                using errcode = '22023';
        end if;

        if not exists (
            select 1
            from public.members member
            where member.id = p_canonical_member_id
              and member.status = 'active'
        ) then
            raise exception
                'Canonical member must exist and be active'
                using errcode = '22023';
        end if;

    elsif p_canonical_member_id is not null then
        raise exception
            'Canonical member is only valid for match_existing or create_new_then_merge'
            using errcode = '22023';
    end if;

    /*
     * Lock and load the current effective resolution.
     */
    select *
    into previous_resolution
    from public.region_import_identity_resolutions resolution
    where resolution.source_identity_id = p_source_identity_id
    order by
        resolution.resolved_at desc,
        resolution.id desc
    limit 1
    for update;

    /*
     * A committed historical session is downstream production
     * state. Once this identity has participated in one, its
     * generic onboarding resolution can no longer be replaced.
     */
    select exists (
        select 1
        from public.region_import_staged_session_participants participant
        join public.region_import_staged_sessions session
            on session.id = participant.staged_session_id
        where participant.source_identity_id = p_source_identity_id
          and (
              session.validation_status = 'committed'
              or session.created_session_id is not null
          )
    )
    into has_committed_session_dependency;

    resolution_is_locked :=
        previous_resolution.id is not null
        and (
            previous_resolution.created_member_id is not null
            or previous_resolution.merge_id is not null
            or has_committed_session_dependency
        );

    /*
     * Once the identity has created or linked production state,
     * the generic resolver may not change the effective decision.
     *
     * Identical retries are allowed so double-clicks/network
     * retries remain idempotent.
     */
    if resolution_is_locked then
        if previous_resolution.resolution_type = p_resolution_type
           and previous_resolution.canonical_member_id
               is not distinct from p_canonical_member_id then

            return previous_resolution;
        end if;

        raise exception
            'Identity resolution is locked because production state already depends on it. Use the dedicated identity recovery workflow for corrections.'
            using errcode = '23514';
    end if;

    insert into public.region_import_identity_resolutions (
        source_identity_id,
        resolution_type,
        canonical_member_id,
        resolved_by_user_id,
        notes,
        supersedes_resolution_id
    )
    values (
        p_source_identity_id,
        p_resolution_type,
        p_canonical_member_id,
        caller_id,
        nullif(btrim(p_notes), ''),
        previous_resolution.id
    )
    returning *
    into created_resolution;

    update public.region_import_source_identities
    set
        source_identity_status = case
            when p_resolution_type = 'deferred'
                then 'deferred'

            when p_resolution_type = 'ignored'
                then 'ignored'

            /*
             * The identity decision is made, but onboarding
             * remains blocked until the canonical merge occurs.
             */
            when p_resolution_type = 'create_new_then_merge'
                then 'needs_review'

            else 'resolved'
        end,
        updated_at = now()
    where id = p_source_identity_id;

    return created_resolution;
end;
$function$;