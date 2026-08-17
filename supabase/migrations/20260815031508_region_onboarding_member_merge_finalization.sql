/*
 * ============================================================
 * REGION ONBOARDING MEMBER-MERGE FINALIZATION
 * ============================================================
 *
 * Completes the create_new_then_merge onboarding lifecycle
 * without coupling onboarding logic directly into the core
 * member-merge execution function.
 */

create index if not exists
    region_import_identity_resolutions_source_latest_idx
on public.region_import_identity_resolutions (
    source_identity_id,
    resolved_at desc,
    id desc
);

create index if not exists
    region_import_identity_resolutions_merge_id_idx
on public.region_import_identity_resolutions (merge_id)
where merge_id is not null;


/*
 * ============================================================
 * SYNC ONBOARDING IDENTITY WHEN A LINKED MERGE CHANGES STATE
 * ============================================================
 */

create or replace function public.sync_region_import_identity_for_merge()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    linked_resolution
        public.region_import_identity_resolutions%rowtype;

    linked_identity
        public.region_import_source_identities%rowtype;
begin
    /*
     * We only care about terminal merge-state changes.
     */
    if new.status not in ('completed', 'cancelled') then
        return new;
    end if;

    if old.status is not distinct from new.status then
        return new;
    end if;

    /*
     * Find an onboarding resolution linked to this merge only
     * if that resolution is still the effective/latest decision
     * for its source identity.
     */
    select resolution.*
    into linked_resolution
    from public.region_import_identity_resolutions resolution
    where resolution.merge_id = new.id
      and resolution.resolution_type = 'create_new_then_merge'
      and not exists (
          select 1
          from public.region_import_identity_resolutions newer
          where newer.source_identity_id =
                    resolution.source_identity_id
            and (
                newer.resolved_at > resolution.resolved_at
                or (
                    newer.resolved_at = resolution.resolved_at
                    and newer.id > resolution.id
                )
            )
      )
    limit 1;

    /*
     * Most member merges are unrelated to onboarding.
     */
    if linked_resolution.id is null then
        return new;
    end if;

    select *
    into linked_identity
    from public.region_import_source_identities identity
    where identity.id = linked_resolution.source_identity_id
    for update;

    if linked_identity.id is null then
        raise exception
            'Linked onboarding source identity % no longer exists',
            linked_resolution.source_identity_id
            using errcode = '23514';
    end if;

    /*
     * Direction is an invariant:
     *
     * merge canonical = imported/new survivor
     * merge duplicate = previously existing member
     */
    if linked_resolution.created_member_id is null then
        raise exception
            'Onboarding merge % has no imported survivor member',
            new.id
            using errcode = '23514';
    end if;

    if linked_resolution.canonical_member_id is null then
        raise exception
            'Onboarding merge % has no existing duplicate member',
            new.id
            using errcode = '23514';
    end if;

    if new.canonical_member_id <>
        linked_resolution.created_member_id then

        raise exception
            'Onboarding merge % canonical survivor does not match imported member %',
            new.id,
            linked_resolution.created_member_id
            using errcode = '23514';
    end if;

    if new.duplicate_member_id <>
        linked_resolution.canonical_member_id then

        raise exception
            'Onboarding merge % duplicate member does not match selected existing member %',
            new.id,
            linked_resolution.canonical_member_id
            using errcode = '23514';
    end if;

    /*
     * A completed merge finalizes the onboarding identity.
     *
     * A cancelled merge leaves the identity blocked for review.
     * create_region_import_identity_merge_draft() already knows
     * how to replace a cancelled merge with a fresh draft.
     */
    update public.region_import_source_identities
    set
        source_identity_status = case
            when new.status = 'completed'
                then 'resolved'
            else 'needs_review'
        end,
        updated_at = now()
    where id = linked_resolution.source_identity_id;

    return new;
end;
$function$;


drop trigger if exists
    sync_region_import_identity_for_merge_status
on public.member_merges;

create trigger
    sync_region_import_identity_for_merge_status
after update of status
on public.member_merges
for each row
execute function
    public.sync_region_import_identity_for_merge();


/*
 * ============================================================
 * HISTORICAL SESSION REVIEW
 * ============================================================
 *
 * Resolve the current identity decision exactly once.
 *
 * Supports:
 *   match_existing
 *   create_new
 *   completed create_new_then_merge
 *   ignored
 *
 * This also fixes the old bug where any historical ignored
 * resolution could cause a participant to be treated as ignored.
 */

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

    target_project
        public.region_import_projects%rowtype;

    staged_session
        public.region_import_staged_sessions%rowtype;

    staged_participant
        public.region_import_staged_session_participants%rowtype;

    current_resolution
        public.region_import_identity_resolutions%rowtype;

    linked_merge
        public.member_merges%rowtype;

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

    /*
     * Committed staged rows are terminal and must not be
     * re-reviewed against the production rows they created or
     * reused.
     */
    for staged_session in
        select *
        from public.region_import_staged_sessions
        where project_id = p_project_id
          and validation_status in (
              'staged',
              'reviewed'
          )
          and created_session_id is null
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
            current_resolution := null;
            linked_merge := null;

            /*
             * Read the current effective resolution once.
             */
            select resolution.*
            into current_resolution
            from public.region_import_identity_resolutions resolution
            where resolution.source_identity_id =
                    staged_participant.source_identity_id
            order by
                resolution.resolved_at desc,
                resolution.id desc
            limit 1;

            if current_resolution.id is null then
                raise exception
                    'Participant % in session "%" has no identity resolution',
                    staged_participant.id,
                    staged_session.source_session_key
                    using errcode = '23514';
            end if;

            /*
             * MATCH EXISTING
             */
            if current_resolution.resolution_type =
                'match_existing' then

                resolved_member_id :=
                    current_resolution.canonical_member_id;

            /*
             * CREATE NEW
             */
            elsif current_resolution.resolution_type =
                'create_new' then

                resolved_member_id :=
                    current_resolution.created_member_id;

            /*
             * CREATE NEW THEN MERGE
             *
             * Historical sessions may use the imported survivor
             * only after the linked merge has completed and its
             * direction has been verified.
             */
            elsif current_resolution.resolution_type =
                'create_new_then_merge' then

                if current_resolution.merge_id is null then
                    raise exception
                        'Participant % in session "%" is waiting for member merge setup',
                        staged_participant.id,
                        staged_session.source_session_key
                        using errcode = '23514';
                end if;

                select *
                into linked_merge
                from public.member_merges merge
                where merge.id = current_resolution.merge_id;

                if linked_merge.id is null then
                    raise exception
                        'Linked member merge % no longer exists',
                        current_resolution.merge_id
                        using errcode = '23514';
                end if;

                if linked_merge.status <> 'completed' then
                    raise exception
                        'Participant % in session "%" is waiting for member merge % to complete',
                        staged_participant.id,
                        staged_session.source_session_key,
                        linked_merge.id
                        using errcode = '23514';
                end if;

                if current_resolution.created_member_id is null then
                    raise exception
                        'Completed onboarding merge % has no imported survivor member',
                        linked_merge.id
                        using errcode = '23514';
                end if;

                if linked_merge.canonical_member_id <>
                    current_resolution.created_member_id then

                    raise exception
                        'Completed onboarding merge % has the wrong canonical survivor',
                        linked_merge.id
                        using errcode = '23514';
                end if;

                if linked_merge.duplicate_member_id <>
                    current_resolution.canonical_member_id then

                    raise exception
                        'Completed onboarding merge % has the wrong duplicate member',
                        linked_merge.id
                        using errcode = '23514';
                end if;

                resolved_member_id :=
                    current_resolution.created_member_id;

            /*
             * IGNORED
             */
            elsif current_resolution.resolution_type =
                'ignored' then

                update public.region_import_staged_session_participants
                set
                    canonical_member_id = null,
                    resolution_status = 'ignored',
                    updated_at = now()
                where id = staged_participant.id;

                participants_ignored :=
                    participants_ignored + 1;

                continue;

            else
                raise exception
                    'Participant % in session "%" does not have a committed canonical identity',
                    staged_participant.id,
                    staged_session.source_session_key
                    using errcode = '23514';
            end if;

            if resolved_member_id is null then
                raise exception
                    'Participant % in session "%" has no resolved canonical member',
                    staged_participant.id,
                    staged_session.source_session_key
                    using errcode = '23514';
            end if;

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
                  to_char(
                      staged_session.start_time,
                      'HH24:MI'
                  )
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

        sessions_reviewed :=
            sessions_reviewed + 1;
    end loop;

    update public.region_import_projects
    set
        status = 'data_validation',
        updated_at = now()
    where id = p_project_id;

    return jsonb_build_object(
        'projectId',
            p_project_id,

        'sessionsReviewed',
            sessions_reviewed,

        'participantsResolved',
            participants_resolved,

        'participantsIgnored',
            participants_ignored
    );
end;
$function$;