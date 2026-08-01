begin;

-- =========================================================
-- LOAD PARTICIPANT-BASED REGION INVITATIONS
--
-- Returns regions where:
--   - the authenticated profile is linked to a member
--   - that member is an active regional participant
--   - the authenticated user does not already have access
--
-- No invitation row is required. The opportunity is derived
-- from canonical participation state.
-- =========================================================

create or replace function public.load_my_participant_region_invitations()
returns table (
    region_id uuid,
    region_name text,
    participant_id uuid,
    first_participated_on date,
    last_participated_on date,
    participant_sources text[]
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_user_id uuid;
    v_member_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    select p.member_id
    into v_member_id
    from public.profiles p
    where p.id = v_user_id;

    if v_member_id is null then
        return;
    end if;

    return query
    select
        r.id,
        r.name,
        rp.id,
        rp.first_participated_on,
        rp.last_participated_on,
        coalesce(
            rp.sources,
            '{}'::text[]
        )
    from public.region_participants rp
    join public.regions r
        on r.id = rp.region_id
    where rp.member_id = v_member_id
      and rp.status = 'active'
      and not exists (
          select 1
          from public.region_access ra
          where ra.user_id = v_user_id
            and ra.region_id = rp.region_id
      )
    order by
        rp.last_participated_on desc nulls last,
        r.name;
end;
$function$;


comment on function
public.load_my_participant_region_invitations()
is
    'Returns regions where the authenticated user''s canonical member is an active participant but the user does not yet have region access.';


-- =========================================================
-- CLAIM PARTICIPANT-BASED REGION ACCESS
--
-- The user must:
--   - be authenticated
--   - have a linked canonical member
--   - have an active participant relationship in the region
--
-- This intentionally does not rely on the region password.
-- Existing canonical participation is the trust signal.
-- =========================================================

create or replace function public.claim_participant_region_access(
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

    select r.name
    into v_region_name
    from public.regions r
    where r.id = p_region_id;

    if v_region_name is null then
        raise exception
            'Region % does not exist.',
            p_region_id
            using errcode = 'P0002';
    end if;

    select ra.granted_at
    into v_existing_granted_at
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

    insert into public.region_access (
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
    returning region_access.granted_at
    into v_granted_at;

    if v_granted_at is null then
        select ra.granted_at
        into v_granted_at
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


comment on function
public.claim_participant_region_access(uuid)
is
    'Grants the authenticated user access to a region when their linked canonical member is already an active participant there.';


-- =========================================================
-- OWNERSHIP AND PRIVILEGES
-- =========================================================

alter function
public.load_my_participant_region_invitations()
owner to postgres;

alter function
public.claim_participant_region_access(uuid)
owner to postgres;


revoke all
on function
public.load_my_participant_region_invitations()
from public, anon, authenticated;

revoke all
on function
public.claim_participant_region_access(uuid)
from public, anon, authenticated;


grant execute
on function
public.load_my_participant_region_invitations()
to authenticated;

grant execute
on function
public.claim_participant_region_access(uuid)
to authenticated;


notify pgrst, 'reload schema';

commit;