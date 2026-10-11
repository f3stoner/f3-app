begin;

-- A profile's home region remains authoritative. The sole exception is that a
-- production-home profile may administer a test workspace. Test-home profiles
-- can never acquire production leadership through this function.
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
    v_profile_environment text;
    v_target_environment text;
begin
    select
        p.member_id,
        p.region_id,
        home_region.environment
    into
        v_member_id,
        v_profile_region_id,
        v_profile_environment
    from public.profiles p
    join public.regions home_region
      on home_region.id = p.region_id
    where p.id = new.profile_id;

    if not found then
        raise exception
            'Leadership profile % does not exist or has no valid home region',
            new.profile_id
            using errcode = '23503';
    end if;

    if v_member_id is null then
        raise exception
            'Leadership profile % is not linked to a canonical member',
            new.profile_id
            using errcode = '23514';
    end if;

    select r.environment
    into v_target_environment
    from public.regions r
    where r.id = new.region_id;

    if not found then
        raise exception
            'Leadership target region % does not exist',
            new.region_id
            using errcode = '23503';
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

    if v_member_region_id is distinct from v_profile_region_id then
        raise exception
            'Leadership profile and canonical member home regions do not match'
            using errcode = '23514';
    end if;

    if v_profile_region_id is not distinct from new.region_id then
        return new;
    end if;

    if v_profile_environment = 'production'
       and v_target_environment = 'test' then
        return new;
    end if;

    raise exception
        'Cross-home-region leadership is allowed only from a production home region into a test region'
        using errcode = '23514';
end;
$function$;

revoke all
on function public.enforce_region_leadership_member()
from public, anon, authenticated;

alter function public.enforce_region_leadership_member()
owner to postgres;

comment on function public.enforce_region_leadership_member() is
    'Requires home-region leadership except that production-home profiles may administer test regions; never permits test-to-production or production-to-production cross-home leadership.';

commit;
