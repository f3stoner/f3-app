begin;

-- ============================================================
-- 1. PROFILE <-> CANONICAL MEMBER HOME REGION
--
-- profiles.region_id is the user's HOME region.
-- Secondary workspace access belongs in region_access.
--
-- Therefore, when a profile is linked to a canonical member,
-- the profile and member must have the exact same home region.
-- A NULL member_id remains valid.
-- ============================================================

create or replace function public.enforce_profile_member_home_region()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_member_region_id uuid;
begin
    if new.member_id is null then
        return new;
    end if;

    select m.region_id
    into v_member_region_id
    from public.members m
    where m.id = new.member_id;

    if not found then
        raise exception
            'Profile member % does not exist',
            new.member_id
            using errcode = '23503';
    end if;

    if v_member_region_id is distinct from new.region_id then
        raise exception
            'Profile home region % does not match canonical member home region %',
            new.region_id,
            v_member_region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    profiles_member_home_region_guard
on public.profiles;

create trigger profiles_member_home_region_guard
before insert or update of member_id, region_id
on public.profiles
for each row
execute function public.enforce_profile_member_home_region();


-- ============================================================
-- 2. REGION LEADERSHIP
--
-- A leadership assignment must belong to a profile whose
-- canonical member is HOME in the leadership region.
-- ============================================================

create or replace function public.enforce_region_leadership_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_member_id uuid;
    v_profile_region_id uuid;
    v_member_region_id uuid;
begin
    select
        p.member_id,
        p.region_id
    into
        v_member_id,
        v_profile_region_id
    from public.profiles p
    where p.id = new.profile_id;

    if not found then
        raise exception
            'Leadership profile % does not exist',
            new.profile_id
            using errcode = '23503';
    end if;

    if v_member_id is null then
        raise exception
            'Leadership profile % is not linked to a canonical member',
            new.profile_id
            using errcode = '23514';
    end if;

    if v_profile_region_id is distinct from new.region_id then
        raise exception
            'Leadership profile home region does not match assignment region'
            using errcode = '23514';
    end if;

    select m.region_id
    into v_member_region_id
    from public.members m
    where m.id = v_member_id;

    if not found then
        raise exception
            'Canonical member % does not exist',
            v_member_id
            using errcode = '23503';
    end if;

    if v_member_region_id is distinct from new.region_id then
        raise exception
            'Leadership canonical member is not home in assignment region'
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    profile_region_positions_member_guard
on public.profile_region_positions;

create trigger profile_region_positions_member_guard
before insert or update of profile_id, region_id
on public.profile_region_positions
for each row
execute function public.enforce_region_leadership_member();


-- ============================================================
-- 3. AO LEADERSHIP
--
-- Same invariant as regional leadership.
-- ============================================================

drop trigger if exists
    profile_ao_permissions_member_guard
on public.profile_ao_permissions;

create trigger profile_ao_permissions_member_guard
before insert or update of profile_id, region_id
on public.profile_ao_permissions
for each row
execute function public.enforce_region_leadership_member();


-- ============================================================
-- 4. PROUD PAPA / INVITED_BY
--
-- Proud Papa may belong to another REGION, but may not cross
-- environments. Production -> production is valid.
-- Test -> test is valid.
-- Production <-> test is rejected.
-- ============================================================

create or replace function public.enforce_member_inviter_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_member_environment text;
    v_inviter_environment text;
begin
    if new.invited_by_id is null then
        return new;
    end if;

    if new.invited_by_id = new.id then
        raise exception
            'A member cannot be their own Proud Papa'
            using errcode = '23514';
    end if;

    select r.environment
    into v_member_environment
    from public.regions r
    where r.id = new.region_id;

    if not found then
        raise exception
            'Member home region % does not exist',
            new.region_id
            using errcode = '23503';
    end if;

    select r.environment
    into v_inviter_environment
    from public.members m
    join public.regions r
      on r.id = m.region_id
    where m.id = new.invited_by_id;

    if not found then
        raise exception
            'Proud Papa member % does not exist',
            new.invited_by_id
            using errcode = '23503';
    end if;

    if v_member_environment is distinct from v_inviter_environment then
        raise exception
            'Proud Papa cannot cross environments: member %, Proud Papa %',
            v_member_environment,
            v_inviter_environment
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    members_inviter_environment_guard
on public.members;

create trigger members_inviter_environment_guard
before insert or update of invited_by_id, region_id
on public.members
for each row
execute function public.enforce_member_inviter_environment();

commit;