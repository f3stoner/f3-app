-- Reconcile the two function definitions applied directly to production on 2026-10-09.
-- Definitions captured from production via pg_get_functiondef; no additional logic changes.

CREATE OR REPLACE FUNCTION public.is_region_leader(p_region_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and (
              p.role = 'superadmin'
              or (
                  p.region_id = p_region_id
                  and p.role = 'slt'
              )
          )
    )
    or exists (
        select 1
        from public.profile_region_positions prp
        where prp.profile_id = auth.uid()
          and prp.region_id = p_region_id
          and prp.region_position is not null
          and btrim(prp.region_position) <> ''
    );
$function$;

CREATE OR REPLACE FUNCTION public.set_member_roster_status(p_member_id uuid, p_is_active boolean)
 RETURNS TABLE(id uuid, region_id uuid, pax_name text, real_name text, home_ao text, invited_by_id uuid, first_post_date text, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    target_member public.members%rowtype;
    caller_profile public.profiles%rowtype;
    next_status text;
begin
    if auth.uid() is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication required';
    end if;

    if p_member_id is null then
        raise exception using
            errcode = '22004',
            message = 'Member id is required';
    end if;

    if p_is_active is null then
        raise exception using
            errcode = '22004',
            message = 'Roster status is required';
    end if;

    select *
    into caller_profile
    from public.profiles
    where profiles.id = auth.uid();

    if caller_profile.id is null then
        raise exception using
            errcode = '42501',
            message = 'Authenticated profile not found';
    end if;

    select *
    into target_member
    from public.members
    where members.id = p_member_id
    for update;

    if target_member.id is null then
        raise exception using
            errcode = 'P0002',
            message = 'Member not found';
    end if;

    if not (
        caller_profile.role = 'superadmin'
        or (
            caller_profile.role in ('slt', 'dataq')
            and caller_profile.region_id = target_member.region_id
        )
        or exists (
            select 1
            from public.profile_region_positions prp
            where prp.profile_id = auth.uid()
              and prp.region_id = target_member.region_id
              and prp.region_position is not null
              and btrim(prp.region_position) <> ''
        )
    ) then
        raise exception using
            errcode = '42501',
            message = 'Not authorized to manage this regional roster';
    end if;

    next_status :=
        case
            when p_is_active then 'active'
            else 'inactive'
        end;

    if target_member.status is distinct from next_status then
        update public.members
        set status = next_status
        where members.id = p_member_id;

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
            'roster_status',
            target_member.status,
            next_status
        );
    end if;

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
