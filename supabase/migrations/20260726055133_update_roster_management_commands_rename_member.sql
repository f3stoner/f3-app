create or replace function public.rename_member(
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
    target_member public.members%rowtype;
    caller_profile public.profiles%rowtype;
    normalized_name text;
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

    normalized_name :=
        nullif(
            regexp_replace(
                btrim(coalesce(p_pax_name, '')),
                '[[:space:]]+',
                ' ',
                'g'
            ),
            ''
        );

    if normalized_name is null then
        raise exception using
            errcode = '22023',
            message = 'PAX name cannot be empty';
    end if;

    select *
    into caller_profile
    from public.profiles
    where profiles.id = auth.uid();

    if caller_profile.id is null
       or caller_profile.role <> 'superadmin'
    then
        raise exception using
            errcode = '42501',
            message = 'Only a superadmin may rename a canonical member';
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

    /*
     * PAX-name collisions are checked within the member's
     * home-region roster, not globally across all F3 regions.
     */
    if exists (
        select 1
        from public.members other_member
        where other_member.id <> p_member_id
          and other_member.region_id = target_member.region_id
          and other_member.pax_name is not null
          and lower(
                regexp_replace(
                    btrim(other_member.pax_name),
                    '[[:space:]]+',
                    ' ',
                    'g'
                )
              ) = lower(normalized_name)
    ) then
        raise exception using
            errcode = '23505',
            message = 'Another member in this region already uses that PAX name';
    end if;

    if target_member.pax_name is distinct from normalized_name then
        update public.members
        set pax_name = normalized_name
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
            'pax_name',
            target_member.pax_name,
            normalized_name
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

revoke all on function public.rename_member(uuid, text)
from public;

revoke all on function public.rename_member(uuid, text)
from anon;

grant execute
on function public.rename_member(uuid, text)
to authenticated;