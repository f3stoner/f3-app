create or replace function public.provision_new_profile(
    p_display_name text,
    p_region_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_email text;
    v_profile public.profiles;
    v_region_environment text;
    v_region_lifecycle text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required';
    end if;

    select u.email
    into v_email
    from auth.users u
    where u.id = v_user_id;

    if v_email is null then
        raise exception 'Authenticated user could not be resolved';
    end if;

    select
        r.environment,
        r.lifecycle_status
    into
        v_region_environment,
        v_region_lifecycle
    from public.regions r
    where r.id = p_region_id;

    if not found then
        raise exception 'Invalid region';
    end if;

    /*
     * Public account signup may provision only production
     * regions that are currently usable.
     *
     * Onboarding regions are intentionally usable by their
     * authorized users before public launch.
     */
    if v_region_environment <> 'production' then
        raise exception 'Region is not available for signup';
    end if;

    if v_region_lifecycle not in ('onboarding', 'active') then
        raise exception 'Region is not available for signup';
    end if;

    /*
     * Support recovery from a partially provisioned account:
     * Auth + profile may already exist while region_access
     * does not.
     */
    select p.*
    into v_profile
    from public.profiles p
    where p.id = v_user_id;

    if found then
        if v_profile.region_id is distinct from p_region_id then
            raise exception
                'Existing profile belongs to a different home region';
        end if;
    else
        insert into public.profiles (
            id,
            email,
            display_name,
            region_id,
            role,
            member_id
        )
        values (
            v_user_id,
            v_email,
            nullif(trim(p_display_name), ''),
            p_region_id,
            'pax',
            null
        )
        returning *
        into v_profile;
    end if;

    /*
     * Establish the authorization grant if it does not
     * already exist.
     */
    if not exists (
        select 1
        from public.region_access ra
        where ra.user_id = v_user_id
          and ra.region_id = p_region_id
    ) then
        insert into public.region_access (
            user_id,
            region_id
        )
        values (
            v_user_id,
            p_region_id
        );
    end if;

    return v_profile;
end;
$$;

revoke all
on function public.provision_new_profile(text, uuid)
from public;

grant execute
on function public.provision_new_profile(text, uuid)
to authenticated;