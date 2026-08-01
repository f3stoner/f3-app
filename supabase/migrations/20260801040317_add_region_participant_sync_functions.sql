begin;

-- =========================================================
-- UPSERT ONE REGION PARTICIPANT
--
-- Maintains one canonical member/region relationship.
--
-- This function:
--   - validates the region and member
--   - activates the relationship
--   - accumulates source provenance
--   - preserves the earliest participation date
--   - preserves the latest participation date
-- =========================================================

create or replace function public.upsert_region_participant(
    p_region_id uuid,
    p_member_id uuid,
    p_participated_on date,
    p_source text,
    p_created_by_user_id uuid default null
)
returns public.region_participants
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_source text;
    v_result public.region_participants%rowtype;
begin
    if p_region_id is null then
        raise exception
            'Region ID is required.'
            using errcode = '22004';
    end if;

    if p_member_id is null then
        raise exception
            'Member ID is required.'
            using errcode = '22004';
    end if;

    v_source :=
        nullif(
            btrim(p_source),
            ''
        );

    if v_source is null then
        raise exception
            'Participant source is required.'
            using errcode = '22004';
    end if;

    if v_source not in (
        'home_region',
        'regional_activity',
        'session_attendance',
        'q_history',
        'historic_import',
        'manual_add',
        'member_merge',
        'region_transfer'
    ) then
        raise exception
            'Unsupported participant source: %.',
            v_source
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.regions r
        where r.id = p_region_id
    ) then
        raise exception
            'Region % does not exist.',
            p_region_id
            using errcode = 'P0002';
    end if;

    if not exists (
        select 1
        from public.members m
        where m.id = p_member_id
    ) then
        raise exception
            'Member % does not exist.',
            p_member_id
            using errcode = 'P0002';
    end if;

    insert into public.region_participants (
        region_id,
        member_id,
        status,
        sources,
        first_participated_on,
        last_participated_on,
        created_by_user_id
    )
    values (
        p_region_id,
        p_member_id,
        'active',
        array[v_source]::text[],
        p_participated_on,
        p_participated_on,
        p_created_by_user_id
    )
    on conflict (
        region_id,
        member_id
    )
    do update
    set
        status = 'active',

        sources =
            case
                when v_source = any(
                    public.region_participants.sources
                )
                    then public.region_participants.sources

                else array_append(
                    public.region_participants.sources,
                    v_source
                )
            end,

        first_participated_on =
            case
                when excluded.first_participated_on is null
                    then public.region_participants
                        .first_participated_on

                when public.region_participants
                        .first_participated_on is null
                    then excluded.first_participated_on

                else least(
                    public.region_participants
                        .first_participated_on,
                    excluded.first_participated_on
                )
            end,

        last_participated_on =
            case
                when excluded.last_participated_on is null
                    then public.region_participants
                        .last_participated_on

                when public.region_participants
                        .last_participated_on is null
                    then excluded.last_participated_on

                else greatest(
                    public.region_participants
                        .last_participated_on,
                    excluded.last_participated_on
                )
            end,

        updated_at = now()

    returning *
    into v_result;

    return v_result;
end;
$function$;


comment on function public.upsert_region_participant(
    uuid,
    uuid,
    date,
    text,
    uuid
) is
    'Creates or updates one canonical member relationship with a region, accumulating provenance and participation date bounds.';


-- =========================================================
-- SYNC PARTICIPANTS FROM ONE SAVED SESSION
--
-- The saved session row is the canonical input.
--
-- Attendees receive:
--   session_attendance
--
-- Primary Q and co-Qs receive:
--   q_history
--
-- Qs are already included in session attendance by
-- save_session_command, but both sources are preserved.
-- =========================================================

create or replace function public.sync_region_participants_for_session(
    p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_session public.sessions%rowtype;
    v_session_date date;

    v_member_id uuid;

    v_attendance_sync_count integer := 0;
    v_q_sync_count integer := 0;

    v_result jsonb;
begin
    if p_session_id is null then
        raise exception
            'Session ID is required.'
            using errcode = '22004';
    end if;

    select s.*
    into v_session
    from public.sessions s
    where s.id = p_session_id;

    if not found then
        raise exception
            'Session % does not exist.',
            p_session_id
            using errcode = 'P0002';
    end if;

    if v_session.region_id is null then
        raise exception
            'Session % has no region.',
            p_session_id
            using errcode = '23514';
    end if;

    if nullif(
        btrim(v_session.date),
        ''
    ) is null then
        raise exception
            'Session % has no date.',
            p_session_id
            using errcode = '23514';
    end if;

    begin
        v_session_date :=
            v_session.date::date;
    exception
        when invalid_datetime_format then
            raise exception
                'Session % has invalid date value %.',
                p_session_id,
                v_session.date
                using errcode = '22007';
    end;

    -- =====================================================
    -- ATTENDANCE
    -- =====================================================

    for v_member_id in
        select distinct
            attendee_id::uuid
        from jsonb_array_elements_text(
            case
                when jsonb_typeof(
                    v_session.attendee_ids
                ) = 'array'
                    then v_session.attendee_ids

                else '[]'::jsonb
            end
        ) as attendee(attendee_id)
        where nullif(
            btrim(attendee_id),
            ''
        ) is not null
        order by attendee_id::uuid
    loop
        perform public.upsert_region_participant(
            v_session.region_id,
            v_member_id,
            v_session_date,
            'session_attendance',
            v_session.created_by_user_id
        );

        v_attendance_sync_count :=
            v_attendance_sync_count + 1;
    end loop;

    -- =====================================================
    -- Q HISTORY
    --
    -- Prefer q_ids. Fall back to q_id for legacy sessions.
    -- =====================================================

    for v_member_id in
        select distinct q_member_id
        from (
            select unnest(
                coalesce(
                    v_session.q_ids,
                    '{}'::uuid[]
                )
            ) as q_member_id

            union

            select v_session.q_id
            where cardinality(
                coalesce(
                    v_session.q_ids,
                    '{}'::uuid[]
                )
            ) = 0
              and v_session.q_id is not null
        ) q_members
        where q_member_id is not null
        order by q_member_id
    loop
        perform public.upsert_region_participant(
            v_session.region_id,
            v_member_id,
            v_session_date,
            'q_history',
            v_session.created_by_user_id
        );

        v_q_sync_count :=
            v_q_sync_count + 1;
    end loop;

    v_result :=
        jsonb_build_object(
            'sessionId',
                v_session.id,

            'regionId',
                v_session.region_id,

            'sessionDate',
                v_session_date,

            'attendanceParticipantsSynced',
                v_attendance_sync_count,

            'qParticipantsSynced',
                v_q_sync_count
        );

    return v_result;
end;
$function$;


comment on function public.sync_region_participants_for_session(
    uuid
) is
    'Synchronizes region participant relationships from one saved session, including attendance and Q history.';


-- =========================================================
-- OWNERSHIP AND GRANTS
--
-- These are internal domain functions. The application does
-- not need to invoke them directly.
-- =========================================================

alter function public.upsert_region_participant(
    uuid,
    uuid,
    date,
    text,
    uuid
)
owner to postgres;

alter function public.sync_region_participants_for_session(
    uuid
)
owner to postgres;


revoke all
on function public.upsert_region_participant(
    uuid,
    uuid,
    date,
    text,
    uuid
)
from public, anon, authenticated;

revoke all
on function public.sync_region_participants_for_session(
    uuid
)
from public, anon, authenticated;


grant execute
on function public.upsert_region_participant(
    uuid,
    uuid,
    date,
    text,
    uuid
)
to service_role;

grant execute
on function public.sync_region_participants_for_session(
    uuid
)
to service_role;


notify pgrst, 'reload schema';

commit;