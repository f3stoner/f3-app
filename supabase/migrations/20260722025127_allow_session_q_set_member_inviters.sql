create or replace function public.set_member_inviters(
    p_member_id uuid,
    p_inviter_member_ids uuid[],
    p_source text default 'app',
    p_source_metadata jsonb default '{}'::jsonb,
    p_session_id uuid default null
)
returns setof public.member_inviters
language plpgsql
security definer
set search_path = public
as $function$
declare
    target_member public.members%rowtype;
    clean_inviter_ids uuid[];
    caller_profile public.profiles%rowtype;
    is_authorized boolean := false;
begin
    if p_member_id is null then
        raise exception 'Member id is required';
    end if;

    select *
    into target_member
    from public.members
    where id = p_member_id;

    if target_member.id is null then
        raise exception 'Member not found';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    /*
     * Normalize the submitted array.
     *
     * Null entries are ignored, but self-reference is rejected explicitly
     * below so a UI bug cannot silently remove bad input.
     */
    select coalesce(
        array_agg(distinct inviter_id order by inviter_id),
        '{}'::uuid[]
    )
    into clean_inviter_ids
    from unnest(
        coalesce(p_inviter_member_ids, '{}'::uuid[])
    ) as inviter_id
    where inviter_id is not null;

    if p_member_id = any(clean_inviter_ids) then
        raise exception 'A member cannot invite himself';
    end if;

    /*
     * Every inviter must exist in the same region.
     *
     * Inactive members remain valid inviters.
     */
    if exists (
        select 1
        from unnest(clean_inviter_ids) as submitted(inviter_id)
        left join public.members inviter
            on inviter.id = submitted.inviter_id
        where inviter.id is null
           or inviter.region_id <> target_member.region_id
    ) then
        raise exception 'One or more inviters are invalid for this region';
    end if;

    /*
     * Region-level authority.
     */
    if caller_profile.role in ('superadmin', 'slt', 'dataq')
       and (
            caller_profile.role = 'superadmin'
            or caller_profile.region_id = target_member.region_id
       )
    then
        is_authorized := true;
    end if;

    /*
     * Current self-profile behavior.
     */
    if caller_profile.member_id = p_member_id then
        is_authorized := true;
    end if;

    /*
     * Named region leadership positions.
     */
    if exists (
        select 1
        from public.profile_region_positions prp
        where prp.profile_id = auth.uid()
          and prp.region_id = target_member.region_id
          and prp.region_position in (
              'nantan',
              'weasel_shaker',
              'first_f',
              'second_f',
              'third_f'
          )
    ) then
        is_authorized := true;
    end if;

    /*
     * Session-scoped authority for FNG creation/editing.
     *
     * This supports:
     * - session creator
     * - AOQ
     * - AO Co-Q
     * - AO Data Q
     */
    if p_session_id is not null
       and exists (
            select 1
            from public.sessions s
            where s.id = p_session_id
              and s.region_id = target_member.region_id
              and (
                s.created_by_user_id = auth.uid()

                or (
                    caller_profile.member_id is not null
                    and (
                        (
                            coalesce(cardinality(s.q_ids), 0) > 0
                            and caller_profile.member_id = any(s.q_ids)
                        )
                        or (
                            coalesce(cardinality(s.q_ids), 0) = 0
                            and s.q_id = caller_profile.member_id
                        )
                    )
                )

                or exists (
                    select 1
                    from public.profile_ao_permissions pap
                    where pap.profile_id = auth.uid()
                    and pap.region_id = s.region_id
                    and pap.ao_id = s.ao_id
                    and pap.ao_position in (
                        'aoq',
                        'ao_coq',
                        'ao_data_q'
                    )
                )
            )
       )
    then
        is_authorized := true;
    end if;

    /*
     * AO-scoped member management based on the member's current home AO.
     * This is secondary to session-scoped authorization because home_ao is
     * currently stored as text rather than an immutable AO id.
     */
    if exists (
        select 1
        from public.aos ao
        join public.profile_ao_permissions pap
            on pap.ao_id = ao.id
           and pap.region_id = ao.region_id
        where pap.profile_id = auth.uid()
          and ao.region_id = target_member.region_id
          and ao.name = target_member.home_ao
          and pap.ao_position in (
              'aoq',
              'ao_coq',
              'ao_data_q'
          )
    ) then
        is_authorized := true;
    end if;

    if not is_authorized then
        raise exception 'Not authorized to update member inviters';
    end if;

    /*
     * Atomic replacement.
     */
    delete from public.member_inviters
    where member_id = p_member_id;

    insert into public.member_inviters (
        member_id,
        inviter_member_id,
        source,
        source_metadata
    )
    select
        p_member_id,
        inviter_id,
        coalesce(nullif(trim(p_source), ''), 'app'),
        coalesce(p_source_metadata, '{}'::jsonb)
            || jsonb_build_object(
                'updated_by_user_id',
                auth.uid(),
                'updated_at',
                now(),
                'session_id',
                p_session_id
            )
    from unnest(clean_inviter_ids) as inviter_id
    on conflict (member_id, inviter_member_id)
    do update set
        source = excluded.source,
        source_metadata =
            public.member_inviters.source_metadata
            || excluded.source_metadata;

    /*
     * Transitional scalar mirror.
     *
     * Keep the first submitted inviter in members.invited_by_id so existing
     * runtime callers continue to work until the migration is complete.
     */
    update public.members
    set invited_by_id = clean_inviter_ids[1]
    where id = p_member_id;

    return query
    select mi.*
    from public.member_inviters mi
    where mi.member_id = p_member_id
    order by mi.created_at, mi.inviter_member_id;
end;
$function$;

revoke all
on function public.set_member_inviters(
    uuid,
    uuid[],
    text,
    jsonb,
    uuid
)
from public;

grant execute
on function public.set_member_inviters(
    uuid,
    uuid[],
    text,
    jsonb,
    uuid
)
to authenticated;