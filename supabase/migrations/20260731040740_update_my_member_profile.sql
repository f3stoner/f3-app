create or replace function public.update_my_member_profile(
    p_real_name text,
    p_home_ao text
)
returns public.members
language plpgsql
security definer
set search_path = public
as $function$
declare
    authenticated_user_id uuid;
    linked_member_id uuid;
    saved_member public.members;
begin
    authenticated_user_id := auth.uid();

    if authenticated_user_id is null then
        raise exception 'authentication_required';
    end if;

    select profiles.member_id
    into linked_member_id
    from public.profiles
    where profiles.id = authenticated_user_id;

    if linked_member_id is null then
        raise exception 'member_not_linked';
    end if;

    update public.members
    set
        real_name = nullif(
            trim(p_real_name),
            ''
        ),
        home_ao = nullif(
            trim(p_home_ao),
            ''
        )
    where id = linked_member_id
    returning *
    into saved_member;

    if saved_member.id is null then
        raise exception 'member_not_found';
    end if;

    return saved_member;
end;
$function$;

revoke all
on function public.update_my_member_profile(
    text,
    text
)
from public;

grant execute
on function public.update_my_member_profile(
    text,
    text
)
to authenticated;