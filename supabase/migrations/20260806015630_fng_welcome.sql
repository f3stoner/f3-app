create or replace function public.reconcile_region_feed_fng_welcomes_for_session(
    p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    canonical_session public.sessions%rowtype;
begin
    if p_session_id is null then
        raise exception 'Session id is required';
    end if;

    select *
    into canonical_session
    from public.sessions
    where id = p_session_id;

    if canonical_session.id is null then
        raise exception 'Session not found';
    end if;

    insert into public.region_feed_events (
        region_id,
        event_type,
        occurred_at,
        session_id,
        member_id,
        source_key,
        payload
    )
    with session_fng_members as (
        select distinct member.id as member_id
        from jsonb_array_elements(
            coalesce(canonical_session.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        join public.members member
          on member.id::text = coalesce(
              fng.fng_obj ->> 'memberId',
              fng.fng_obj ->> 'member_id'
          )
    ),

    regional_post_events as (
        select
            session_row.id as session_id,
            attendee.member_id_text
        from public.sessions session_row
        cross join lateral jsonb_array_elements_text(
            coalesce(session_row.attendee_ids, '[]'::jsonb)
        ) as attendee(member_id_text)
        where session_row.region_id = canonical_session.region_id

        union

        select
            session_row.id as session_id,
            coalesce(
                fng.fng_obj ->> 'memberId',
                fng.fng_obj ->> 'member_id'
            ) as member_id_text
        from public.sessions session_row
        cross join lateral jsonb_array_elements(
            coalesce(session_row.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where session_row.region_id = canonical_session.region_id
          and coalesce(
              fng.fng_obj ->> 'memberId',
              fng.fng_obj ->> 'member_id'
          ) is not null
    ),

    first_post_fngs as (
        select session_fng.member_id
        from session_fng_members session_fng
        join regional_post_events event
          on event.member_id_text = session_fng.member_id::text
        group by session_fng.member_id
        having count(distinct event.session_id) = 1
           and bool_or(event.session_id = canonical_session.id)
    )

    select
        canonical_session.region_id,
        'fng_welcomed',
        to_timestamp(
            canonical_session.created_at / 1000.0
        ),
        canonical_session.id,
        first_post.member_id,
        'fng_welcomed:' ||
            canonical_session.region_id::text || ':' ||
            first_post.member_id::text,
        jsonb_build_object(
            'aoName',
            canonical_session.ao_name
        )
    from first_post_fngs first_post
    on conflict (source_key) do nothing;
end;
$function$;

revoke all on function
public.reconcile_region_feed_fng_welcomes_for_session(uuid)
from public, anon, authenticated;

create or replace function public.save_session_command(
    p_mode text,
    p_region_id uuid,
    p_session jsonb,
    p_fngs jsonb default '[]'::jsonb,
    p_visitors jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    existing_session public.sessions%rowtype;
    saved_session public.sessions%rowtype;

    target_session_id uuid;
    target_ao_id uuid;
    target_site_id uuid;
    target_q_slot_id uuid;
    target_planned_workout_id uuid;

    command_fngs jsonb;
    stored_fngs jsonb;
    clean_visitors jsonb;
    clean_attendee_ids jsonb;
    clean_q_ids uuid[];

    fng jsonb;
    visitor jsonb;

    fng_member_id uuid;
    inviter_ids uuid[];

    can_access_region boolean := false;
    can_update_session boolean := false;

    result_payload jsonb;
begin
    /*
     * Authentication and command validation.
     */
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_mode not in ('create', 'update') then
        raise exception 'Mode must be create or update';
    end if;

    if p_region_id is null then
        raise exception 'Region id is required';
    end if;

    if p_session is null
       or jsonb_typeof(p_session) <> 'object'
    then
        raise exception 'Session payload must be an object';
    end if;

    if p_fngs is null then
        p_fngs := '[]'::jsonb;
    end if;

    if jsonb_typeof(p_fngs) <> 'array' then
        raise exception 'FNG payload must be an array';
    end if;

    if p_visitors is null then
        p_visitors := '[]'::jsonb;
    end if;

    if jsonb_typeof(p_visitors) <> 'array' then
        raise exception 'Visitor payload must be an array';
    end if;

    target_session_id :=
        nullif(p_session ->> 'id', '')::uuid;

    target_ao_id :=
        nullif(p_session ->> 'aoId', '')::uuid;

    target_site_id :=
        nullif(p_session ->> 'siteId', '')::uuid;

    target_q_slot_id :=
        nullif(
            p_session ->> 'sourceQSlotId',
            ''
        )::uuid;

    target_planned_workout_id :=
        nullif(
            p_session ->> 'sourcePlannedWorkoutId',
            ''
        )::uuid;

    if target_session_id is null then
        raise exception 'Session id is required';
    end if;

    if nullif(trim(p_session ->> 'date'), '') is null then
        raise exception 'Session date is required';
    end if;

    if nullif(trim(p_session ->> 'aoName'), '') is null then
        raise exception 'AO name is required';
    end if;

    /*
     * Load the authenticated profile.
     */
    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    /*
     * Region access required for all session commands.
     */
    can_access_region :=
        caller_profile.role = 'superadmin'
        or caller_profile.region_id = p_region_id
        or exists (
            select 1
            from public.region_access ra
            where ra.user_id = auth.uid()
              and ra.region_id = p_region_id
        );

    if not can_access_region then
        raise exception 'Not authorized for this region';
    end if;

    /*
     * Validate AO, site, Q-slot, and planned-workout scope.
     */
    if target_ao_id is not null
       and not exists (
            select 1
            from public.aos ao
            where ao.id = target_ao_id
              and ao.region_id = p_region_id
       )
    then
        raise exception 'AO is invalid for this region';
    end if;

    if target_site_id is not null
       and not exists (
            select 1
            from public.sites site
            where site.id = target_site_id
              and site.region_id = p_region_id
       )
    then
        raise exception 'Site is invalid for this region';
    end if;

    if target_q_slot_id is not null
       and not exists (
            select 1
            from public.q_slots slot
            where slot.id = target_q_slot_id
              and slot.region_id = p_region_id
       )
    then
        raise exception 'Q slot is invalid for this region';
    end if;

    if target_planned_workout_id is not null
       and not exists (
            select 1
            from public.planned_workouts workout
            where workout.id =
                target_planned_workout_id
              and workout.region_id = p_region_id
       )
    then
        raise exception
            'Planned workout is invalid for this region';
    end if;

    /*
     * Updates require session-specific authority.
     */
    if p_mode = 'update' then
        select *
        into existing_session
        from public.sessions
        where id = target_session_id
          and region_id = p_region_id
        for update;

        if existing_session.id is null then
            raise exception 'Session not found';
        end if;

        can_update_session :=
            existing_session.created_by_user_id =
                auth.uid()

            or (
                caller_profile.member_id is not null
                and (
                    (
                        cardinality(
                            coalesce(
                                existing_session.q_ids,
                                '{}'::uuid[]
                            )
                        ) > 0
                        and caller_profile.member_id =
                            any(existing_session.q_ids)
                    )
                    or (
                        cardinality(
                            coalesce(
                                existing_session.q_ids,
                                '{}'::uuid[]
                            )
                        ) = 0
                        and existing_session.q_id =
                            caller_profile.member_id
                    )
                )
            )

            or caller_profile.role = 'superadmin'

            or (
                caller_profile.role in (
                    'slt',
                    'dataq'
                )
                and caller_profile.region_id =
                    p_region_id
            )

            or exists (
                select 1
                from public.profile_region_positions prp
                where prp.profile_id = auth.uid()
                  and prp.region_id = p_region_id
                  and prp.region_position in (
                      'nantan',
                      'weasel_shaker',
                      'first_f',
                      'second_f',
                      'third_f'
                  )
            )

            or (
                existing_session.ao_id is not null
                and exists (
                    select 1
                    from public.profile_ao_permissions pap
                    where pap.profile_id = auth.uid()
                      and pap.region_id = p_region_id
                      and pap.ao_id =
                          existing_session.ao_id
                      and pap.ao_position in (
                          'aoq',
                          'ao_coq',
                          'ao_data_q'
                      )
                )
            );

        if not can_update_session then
            raise exception
                'Not authorized to update this session';
        end if;
    else
        if exists (
            select 1
            from public.sessions session_row
            where session_row.id =
                target_session_id
        )
        then
            raise exception 'Session already exists';
        end if;
    end if;

    /*
     * Normalize submitted Q IDs.
     */
    select coalesce(
        array_agg(
            distinct submitted_id
            order by submitted_id
        ),
        '{}'::uuid[]
    )
    into clean_q_ids
    from (
        select value::uuid as submitted_id
        from jsonb_array_elements_text(
            coalesce(
                p_session -> 'qIds',
                '[]'::jsonb
            )
        ) as value
        where nullif(trim(value), '') is not null
    ) submitted;

    if cardinality(clean_q_ids) = 0 then
        raise exception 'At least one Q is required';
    end if;

    command_fngs := p_fngs;
    clean_visitors := p_visitors;

    /*
     * Remove command-only properties before storing FNG JSON
     * on the session row.
     */
    select coalesce(
        jsonb_agg(
            value - 'isNew'
            order by ordinal
        ),
        '[]'::jsonb
    )
    into stored_fngs
    from jsonb_array_elements(command_fngs)
        with ordinality as submitted(value, ordinal);

    /*
     * Create requested FNG member records.
     *
     * New FNG UUIDs must be generated by the client before
     * this RPC is called. That makes the command deterministic.
     */
    for fng in
        select value
        from jsonb_array_elements(command_fngs)
    loop
        fng_member_id :=
            nullif(fng ->> 'memberId', '')::uuid;

        if fng_member_id is null then
            raise exception
                'Every FNG requires a member id';
        end if;

        select coalesce(
            array_agg(
                distinct submitted_id
                order by submitted_id
            ),
            '{}'::uuid[]
        )
        into inviter_ids
        from (
            select value::uuid as submitted_id
            from jsonb_array_elements_text(
                case
                    when jsonb_typeof(
                        fng -> 'inviterIds'
                    ) = 'array'
                    then fng -> 'inviterIds'
                    else '[]'::jsonb
                end
            ) as value
            where nullif(trim(value), '') is not null

            union

            select
                nullif(
                    fng ->> 'invitedById',
                    ''
                )::uuid
            where nullif(
                fng ->> 'invitedById',
                ''
            ) is not null
        ) submitted
        where submitted_id is not null;

        if coalesce(
            (fng ->> 'isNew')::boolean,
            false
        )
        then
            if nullif(
                trim(fng ->> 'realName'),
                ''
            ) is null
               and nullif(
                    trim(fng ->> 'paxName'),
                    ''
               ) is null
            then
                raise exception
                    'New FNG requires a name';
            end if;

            insert into public.members (
                id,
                region_id,
                pax_name,
                real_name,
                home_ao,
                invited_by_id,
                first_post_date,
                status
            )
            values (
                fng_member_id,
                p_region_id,
                nullif(
                    trim(fng ->> 'paxName'),
                    ''
                ),
                nullif(
                    trim(fng ->> 'realName'),
                    ''
                ),
                null,
                inviter_ids[1],
                p_session ->> 'date',
                'active'
            )
            on conflict (id) do nothing;
        end if;

        if not coalesce(
            (fng ->> 'isNew')::boolean,
            false
        )
        then
            update public.members
            set
                pax_name = nullif(
                    trim(fng ->> 'paxName'),
                    ''
                ),
                real_name = nullif(
                    trim(fng ->> 'realName'),
                    ''
                ),
                invited_by_id = inviter_ids[1]
            where id = fng_member_id
            and region_id = p_region_id;

            if not found then
                raise exception
                    'FNG member does not exist in this region';
            end if;
        end if;

        if not exists (
            select 1
            from public.members member
            where member.id = fng_member_id
              and member.region_id = p_region_id
        )
        then
            raise exception
                'FNG member does not exist in this region';
        end if;
    end loop;

    /*
     * Normalize attendance after FNG member creation.
     *
     * Qs and FNG members are always included in attendance.
     */
    select coalesce(
        jsonb_agg(
            submitted_id
            order by submitted_id
        ),
        '[]'::jsonb
    )
    into clean_attendee_ids
    from (
        select distinct value::uuid as submitted_id
        from jsonb_array_elements_text(
            coalesce(
                p_session -> 'attendeeIds',
                '[]'::jsonb
            )
        ) as value
        where nullif(trim(value), '') is not null

        union

        select unnest(clean_q_ids)

        union

        select
            nullif(
                value ->> 'memberId',
                ''
            )::uuid
        from jsonb_array_elements(command_fngs)
        where nullif(
            value ->> 'memberId',
            ''
        ) is not null
    ) submitted
    where submitted_id is not null;

    /*
    * Canonical members may attend workouts in any region.
    *
    * Validate only that every submitted member exists.
    */
    if exists (
        select 1
        from jsonb_array_elements_text(
            clean_attendee_ids
        ) as submitted(member_id)
        left join public.members member
            on member.id =
                submitted.member_id::uuid
        where member.id is null
    )
    then
        raise exception
            'One or more attendees do not exist';
    end if;

    /*
     * Insert or update the session row.
     */
    if p_mode = 'create' then
        insert into public.sessions (
            id,
            region_id,
            date,
            ao_id,
            site_id,
            ao_name,
            q_ids,
            q_id,
            attendee_ids,
            fngs,
            notes,
            workout,
            announcement_text,
            announcement_snapshot,
            source_planned_workout_id,
            source_q_slot_id,
            created_at,
            created_by_user_id,
            backblast_text,
            backblast_hashtags_text,
            backblast_intro_text,
            backblast_body_text,
            backblast_status,
            backblast_posted_at,
            unresolved_pax,
            weather_snapshot,
            start_time,
            attendance_review_status,
            attendance_review_notes
        )
        values (
            target_session_id,
            p_region_id,
            p_session ->> 'date',
            target_ao_id,
            target_site_id,
            trim(p_session ->> 'aoName'),
            clean_q_ids,
            clean_q_ids[1],
            clean_attendee_ids,
            stored_fngs,
            coalesce(
                p_session ->> 'notes',
                ''
            ),
            p_session -> 'workout',
            p_session ->> 'announcementText',
            p_session -> 'announcementSnapshot',
            target_planned_workout_id,
            target_q_slot_id,
            coalesce(
                nullif(
                    p_session ->> 'createdAt',
                    ''
                )::bigint,
                floor(
                    extract(
                        epoch from clock_timestamp()
                    ) * 1000
                )::bigint
            ),
            auth.uid(),

            coalesce(
                p_session ->> 'backblastText',
                ''
            ),

            p_session ->> 'backblastHashtagsText',

            p_session ->> 'backblastIntroText',

            p_session ->> 'backblastBodyText',

            nullif(
                p_session ->> 'backblastStatus',
                ''
            ),
            nullif(
                p_session ->> 'backblastPostedAt',
                ''
            )::timestamptz,
            coalesce(
                p_session -> 'unresolvedPax',
                '[]'::jsonb
            ),
            p_session -> 'weatherSnapshot',
            nullif(
                p_session ->> 'startTime',
                ''
            ),
            coalesce(
                nullif(
                    p_session
                        ->> 'attendanceReviewStatus',
                    ''
                ),
                'not_required'
            ),
            nullif(
                p_session
                    ->> 'attendanceReviewNotes',
                ''
            )
        )
        returning *
        into saved_session;
    else
        update public.sessions
        set
            date = p_session ->> 'date',
            ao_id = target_ao_id,
            site_id = target_site_id,
            ao_name =
                trim(p_session ->> 'aoName'),
            q_ids = clean_q_ids,
            q_id = clean_q_ids[1],
            attendee_ids = clean_attendee_ids,
            fngs = stored_fngs,
            notes = coalesce(
                p_session ->> 'notes',
                ''
            ),
            workout = p_session -> 'workout',
            announcement_text =
                p_session ->> 'announcementText',
            announcement_snapshot =
                p_session -> 'announcementSnapshot',
            source_planned_workout_id =
                target_planned_workout_id,
            source_q_slot_id = target_q_slot_id,
            backblast_text =
                case
                    when p_session ? 'backblastText'
                    then coalesce(
                        p_session ->> 'backblastText',
                        ''
                    )
                    else existing_session.backblast_text
                end,

            backblast_hashtags_text =
                case
                    when p_session ? 'backblastHashtagsText'
                    then p_session ->> 'backblastHashtagsText'
                    else existing_session.backblast_hashtags_text
                end,

            backblast_intro_text =
                case
                    when p_session ? 'backblastIntroText'
                    then p_session ->> 'backblastIntroText'
                    else existing_session.backblast_intro_text
                end,

            backblast_body_text =
                case
                    when p_session ? 'backblastBodyText'
                    then p_session ->> 'backblastBodyText'
                    else existing_session.backblast_body_text
                end,

            backblast_status =
                case
                    when p_session ? 'backblastStatus'
                    then nullif(
                        p_session ->> 'backblastStatus',
                        ''
                    )
                    else existing_session.backblast_status
                end,

            backblast_posted_at =
                case
                    when p_session ? 'backblastPostedAt'
                    then nullif(
                        p_session ->> 'backblastPostedAt',
                        ''
                    )::timestamptz
                    else existing_session.backblast_posted_at
                end,
            unresolved_pax = coalesce(
                p_session -> 'unresolvedPax',
                '[]'::jsonb
            ),
            weather_snapshot =
                p_session -> 'weatherSnapshot',
            start_time = nullif(
                p_session ->> 'startTime',
                ''
            ),
            attendance_review_status = coalesce(
                nullif(
                    p_session
                        ->> 'attendanceReviewStatus',
                    ''
                ),
                'not_required'
            ),
            attendance_review_notes = nullif(
                p_session
                    ->> 'attendanceReviewNotes',
                ''
            )
        where id = target_session_id
          and region_id = p_region_id
        returning *
        into saved_session;

        if saved_session.id is null then
            raise exception 'Session update failed';
        end if;
    end if;

    /*
     * Synchronize regional participant relationships from
     * the canonical saved session inside this transaction.
     */
    perform public.sync_region_participants_for_session(
        target_session_id
    );

    /*
     * Reconcile Proud Papa relationships after the session
     * exists, preserving existing session-scoped authorization.
     */
     
    for fng in
        select value
        from jsonb_array_elements(command_fngs)
    loop
        fng_member_id :=
            nullif(fng ->> 'memberId', '')::uuid;

        select coalesce(
            array_agg(
                distinct submitted_id
                order by submitted_id
            ),
            '{}'::uuid[]
        )
        into inviter_ids
        from (
            select value::uuid as submitted_id
            from jsonb_array_elements_text(
                case
                    when jsonb_typeof(
                        fng -> 'inviterIds'
                    ) = 'array'
                    then fng -> 'inviterIds'
                    else '[]'::jsonb
                end
            ) as value
            where nullif(trim(value), '') is not null

            union

            select
                nullif(
                    fng ->> 'invitedById',
                    ''
                )::uuid
            where nullif(
                fng ->> 'invitedById',
                ''
            ) is not null
        ) submitted
        where submitted_id is not null;

        perform *
        from public.set_member_inviters(
            fng_member_id,
            inviter_ids,
            'session_fng',
            jsonb_build_object(
                'createdDuringSessionLogging',
                true
            ),
            target_session_id
        );
    end loop;

    /*
     * Replace unresolved visitors inside this transaction.
     */
    delete from public.session_visitors visitor_row
    where visitor_row.session_id =
        target_session_id;

    for visitor in
        select value
        from jsonb_array_elements(clean_visitors)
    loop
        if nullif(
            trim(visitor ->> 'f3Name'),
            ''
        ) is null
        then
            continue;
        end if;

        insert into public.session_visitors (
            id,
            session_id,
            f3_name,
            home_region,
            real_name,
            created_by_user_id
        )
        values (
            coalesce(
                nullif(
                    visitor ->> 'id',
                    ''
                )::uuid,
                gen_random_uuid()
            ),
            target_session_id,
            trim(visitor ->> 'f3Name'),
            nullif(
                trim(visitor ->> 'homeRegion'),
                ''
            ),
            nullif(
                trim(visitor ->> 'realName'),
                ''
            ),
            auth.uid()
        );
    end loop;

    /*
    * Regional feed contract:
    *
    * Every successfully created interactive session produces one
    * idempotent session_completed event and reconciles any post
    * milestones crossed by members credited with attendance.
    *
    * This runs after participant, inviter, and visitor reconciliation
    * so feed events represent the completed canonical session.
    *
    * Updates do not create additional events. Historical and batch
    * import paths intentionally bypass this command.
    */
if p_mode = 'create' then
    perform public.reconcile_region_feed_for_session(
        target_session_id
    );

    perform public.reconcile_region_feed_milestones_for_session(
        target_session_id
    );

    perform public.reconcile_region_feed_fng_welcomes_for_session(
        target_session_id
    );
end if;
    
    /*
     * Return the complete canonical result.
     */
    result_payload :=
        jsonb_build_object(
            'mode',
            p_mode,
            'session',
            to_jsonb(saved_session),
            'fngs',
            stored_fngs,
            'visitors',
            coalesce(
                (
                    select jsonb_agg(
                        to_jsonb(visitor_row)
                        order by
                            visitor_row.created_at,
                            visitor_row.id
                    )
                    from public.session_visitors
                        visitor_row
                    where visitor_row.session_id =
                        target_session_id
                ),
                '[]'::jsonb
            )
        );

    return result_payload;
end;
$function$;


revoke all on function public.save_session_command(
    text,
    uuid,
    jsonb,
    jsonb,
    jsonb
)
from public;

grant execute on function public.save_session_command(
    text,
    uuid,
    jsonb,
    jsonb,
    jsonb
)
to authenticated;