
create or replace function public.name_returning_fng(
    p_session_id uuid,
    p_member_id uuid,
    p_pax_name text
)
returns table (
    id uuid,
    region_id uuid,
    pax_name text,
    real_name text,
    home_ao text,
    invited_by_id uuid,
    first_post_date text,
    status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
    target_session public.sessions%rowtype;
    target_member public.members%rowtype;
    normalized_name text;
    naming_threshold integer;
    post_count integer;
begin
    if auth.uid() is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication required';
    end if;

    if p_session_id is null or p_member_id is null then
        raise exception using
            errcode = '22004',
            message = 'Session and member ids are required';
    end if;

    normalized_name := nullif(
        regexp_replace(btrim(coalesce(p_pax_name, '')), '[[:space:]]+', ' ', 'g'),
        ''
    );

    if normalized_name is null then
        raise exception using
            errcode = '22023',
            message = 'PAX name cannot be empty';
    end if;

    select *
    into target_session
    from public.sessions s
    where s.id = p_session_id
    for update;

    if target_session.id is null then
        raise exception using
            errcode = 'P0002',
            message = 'Session not found';
    end if;

    if not coalesce(public.can_manage_session_media(p_session_id), false) then
        raise exception using
            errcode = '42501',
            message = 'Not authorized to name an FNG for this session';
    end if;

    select r.fng_naming_post_number
    into naming_threshold
    from public.regions r
    where r.id = target_session.region_id;

    if naming_threshold is null or naming_threshold < 1 then
        raise exception using
            errcode = '22023',
            message = 'Invalid regional naming threshold';
    end if;

    select *
    into target_member
    from public.members m
    where m.id = p_member_id
    for update;

    if target_member.id is null then
        raise exception using
            errcode = 'P0002',
            message = 'Member not found';
    end if;

    if not (
        coalesce(target_session.attendee_ids, '[]'::jsonb) ? p_member_id::text
        or exists (
            select 1
            from jsonb_array_elements(coalesce(target_session.fngs, '[]'::jsonb)) f
            where f ->> 'memberId' = p_member_id::text
        )
    ) then
        raise exception using
            errcode = '22023',
            message = 'Member is not recorded as attending this session';
    end if;

    select count(*)::integer
    into post_count
    from public.sessions s
    where s.region_id = target_session.region_id
      and (
          coalesce(s.attendee_ids, '[]'::jsonb) ? p_member_id::text
          or exists (
              select 1
              from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) f
              where f ->> 'memberId' = p_member_id::text
          )
      );

    if post_count < naming_threshold then
        raise exception using
            errcode = '22023',
            message = 'Member has not reached the regional naming threshold';
    end if;

    if nullif(btrim(coalesce(target_member.pax_name, '')), '') is not null then
        raise exception using
            errcode = '22023',
            message = 'Member already has a PAX name';
    end if;

    if exists (
        select 1
        from public.members m
        where m.id <> p_member_id
          and m.region_id = target_member.region_id
          and m.pax_name is not null
          and lower(regexp_replace(btrim(m.pax_name), '[[:space:]]+', ' ', 'g'))
              = lower(normalized_name)
    ) then
        raise exception using
            errcode = '23505',
            message = 'Another member in this region already uses that PAX name';
    end if;

    update public.members m
    set pax_name = normalized_name
    where m.id = p_member_id;

    insert into public.member_change_audit (
        member_id,
        region_id,
        changed_by_user_id,
        change_type,
        old_value,
        new_value
    )
    values (
        target_member.id,
        target_member.region_id,
        auth.uid(),
        'pax_name',
        target_member.pax_name,
        normalized_name
    );

    return query
    select
        m.id,
        m.region_id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        m.invited_by_id,
        m.first_post_date,
        m.status,
        m.created_at
    from public.members m
    where m.id = p_member_id;
end;
$function$;

revoke all on function public.name_returning_fng(uuid, uuid, text)
from public, anon;

grant execute on function public.name_returning_fng(uuid, uuid, text)
to authenticated;
