begin;

create or replace function
public.claim_participant_region_access(
    p_region_id uuid
)
returns table (
    region_id uuid,
    region_name text,
    granted_at timestamptz,
    already_had_access boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_user_id uuid;
    v_member_id uuid;
    v_region_name text;
    v_existing_granted_at timestamptz;
    v_granted_at timestamptz;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    if p_region_id is null then
        raise exception
            'Region ID is required.'
            using errcode = '22004';
    end if;

    select
        p.member_id
    into
        v_member_id
    from public.profiles p
    where p.id = v_user_id;

    if v_member_id is null then
        raise exception
            'Your account is not linked to a canonical member.'
            using errcode = '23514';
    end if;

    select
        r.name
    into
        v_region_name
    from public.regions r
    where r.id = p_region_id;

    if v_region_name is null then
        raise exception
            'Region % does not exist.',
            p_region_id
            using errcode = 'P0002';
    end if;

    select
        ra.granted_at
    into
        v_existing_granted_at
    from public.region_access ra
    where ra.user_id = v_user_id
      and ra.region_id = p_region_id;

    if found then
        return query
        select
            p_region_id,
            v_region_name,
            v_existing_granted_at,
            true;

        return;
    end if;

    if not exists (
        select 1
        from public.region_participants rp
        where rp.region_id = p_region_id
          and rp.member_id = v_member_id
          and rp.status = 'active'
    ) then
        raise exception
            'Your member identity is not an active participant in this region.'
            using errcode = '42501';
    end if;

    insert into public.region_access as inserted_access (
        user_id,
        region_id
    )
    values (
        v_user_id,
        p_region_id
    )
    on conflict (
        user_id,
        region_id
    )
    do nothing
    returning
        inserted_access.granted_at
    into
        v_granted_at;

    /*
     * Another request may have inserted the row first.
     * Re-read the authoritative access record when needed.
     */
    if v_granted_at is null then
        select
            ra.granted_at
        into
            v_granted_at
        from public.region_access ra
        where ra.user_id = v_user_id
          and ra.region_id = p_region_id;
    end if;

    if v_granted_at is null then
        raise exception
            'Region access could not be confirmed.'
            using errcode = '23514';
    end if;

    return query
    select
        p_region_id,
        v_region_name,
        v_granted_at,
        false;
end;
$function$;

alter function
public.claim_participant_region_access(uuid)
owner to postgres;

revoke all
on function
public.claim_participant_region_access(uuid)
from public, anon, authenticated;

grant execute
on function
public.claim_participant_region_access(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;