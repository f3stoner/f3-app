create or replace function public.load_region_leadership_directory(
    p_region_id uuid
)
returns table (
    scope text,
    region_id uuid,
    ao_id uuid,
    ao_name text,
    position_key text,
    display_order integer,
    profile_id uuid,
    member_id uuid,
    pax_name text
)
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_role text;
    caller_has_access boolean := false;
begin
    if p_region_id is null then
        raise exception 'Region id is required';
    end if;

    /*
     * Service-role calls have no authenticated user context.
     * Authenticated callers must either be superadmin or have access
     * to the requested regional workspace.
     */
    if auth.role() <> 'service_role' then
        if auth.uid() is null then
            raise exception 'Authentication required';
        end if;

        select p.role
        into caller_role
        from public.profiles p
        where p.id = auth.uid();

        select exists (
            select 1
            from public.region_access ra
            where ra.user_id = auth.uid()
              and ra.region_id = p_region_id
        )
        into caller_has_access;

        if coalesce(caller_role, '') <> 'superadmin'
           and not caller_has_access then
            raise exception 'Region access required';
        end if;
    end if;

    /*
     * Region-wide assignments.
     *
     * The profile and canonical member must both belong to the
     * assignment region. This preserves the product invariant that
     * leadership is held only within a PAX's home region.
     */
    return query
    select
        'region'::text as scope,
        prp.region_id,
        null::uuid as ao_id,
        null::text as ao_name,
        prp.region_position as position_key,
        case prp.region_position
            when 'nantan' then 10
            when 'weasel_shaker' then 20
            when 'first_f' then 30
            when 'second_f' then 40
            when 'third_f' then 50
            when 'rucking_q' then 60
            when 'csaup_q' then 70
            when 'internal_commz_q' then 80
            when 'external_commz_q' then 90
            else 999
        end as display_order,
        p.id as profile_id,
        m.id as member_id,
        coalesce(nullif(trim(m.pax_name), ''), 'Unnamed PAX') as pax_name
    from public.profile_region_positions prp
    join public.profiles p
      on p.id = prp.profile_id
     and p.region_id = prp.region_id
    join public.members m
      on m.id = p.member_id
     and m.region_id = prp.region_id
    where prp.region_id = p_region_id;

    /*
     * AO-scoped assignments.
     */
    return query
    select
        'ao'::text as scope,
        pap.region_id,
        pap.ao_id,
        a.name as ao_name,
        pap.ao_position as position_key,
        case pap.ao_position
            when 'aoq' then 10
            when 'ao_coq' then 20
            when 'ao_data_q' then 30
            when 'first_f' then 40
            when 'second_f' then 50
            when 'third_f' then 60
            else 999
        end as display_order,
        p.id as profile_id,
        m.id as member_id,
        coalesce(nullif(trim(m.pax_name), ''), 'Unnamed PAX') as pax_name
    from public.profile_ao_permissions pap
    join public.profiles p
      on p.id = pap.profile_id
     and p.region_id = pap.region_id
    join public.members m
      on m.id = p.member_id
     and m.region_id = pap.region_id
    join public.aos a
      on a.id = pap.ao_id
     and a.region_id = pap.region_id
    where pap.region_id = p_region_id;

    return;
end;
$function$;

revoke all
on function public.load_region_leadership_directory(uuid)
from public;

revoke all
on function public.load_region_leadership_directory(uuid)
from anon;

grant execute
on function public.load_region_leadership_directory(uuid)
to authenticated;

grant execute
on function public.load_region_leadership_directory(uuid)
to service_role;