create or replace function public.admin_update_member_profile(
    p_member_id uuid,
    p_pax_name text,
    p_real_name text,
    p_invited_by_id uuid,
    p_home_ao text
)
returns setof public.members
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pax_name text;
    v_real_name text;
    v_home_ao text;
begin
    /*
     * Superadmin only.
     */
    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'superadmin'
    ) then
        raise exception 'Only a superadmin may edit member profiles.'
            using errcode = '42501';
    end if;

    /*
     * Target must exist.
     */
    if not exists (
        select 1
        from public.members m
        where m.id = p_member_id
    ) then
        raise exception 'Member not found.';
    end if;

    /*
     * Normalize user-entered text.
     */
    v_pax_name :=
        nullif(
            regexp_replace(
                trim(coalesce(p_pax_name, '')),
                '\s+',
                ' ',
                'g'
            ),
            ''
        );

    v_real_name :=
        nullif(
            regexp_replace(
                trim(coalesce(p_real_name, '')),
                '\s+',
                ' ',
                'g'
            ),
            ''
        );

    v_home_ao :=
        nullif(
            regexp_replace(
                trim(coalesce(p_home_ao, '')),
                '\s+',
                ' ',
                'g'
            ),
            ''
        );

    /*
     * Preserve the existing expectation that a named member
     * has a PAX name.
     */
    if v_pax_name is null then
        raise exception 'PAX name is required.';
    end if;

    /*
     * Proud Papa must point to another valid member when supplied.
     */
    if p_invited_by_id is not null then
        if p_invited_by_id = p_member_id then
            raise exception 'A member cannot be their own Proud Papa.';
        end if;

        if not exists (
            select 1
            from public.members m
            where m.id = p_invited_by_id
        ) then
            raise exception 'Proud Papa member not found.';
        end if;
    end if;

    update public.members
    set
        pax_name = v_pax_name,
        real_name = v_real_name,
        invited_by_id = p_invited_by_id,
        home_ao = v_home_ao
    where id = p_member_id;

    return query
    select m.*
    from public.members m
    where m.id = p_member_id;
end;
$$;

revoke all
on function public.admin_update_member_profile(
    uuid,
    text,
    text,
    uuid,
    text
)
from public;

grant execute
on function public.admin_update_member_profile(
    uuid,
    text,
    text,
    uuid,
    text
)
to authenticated;