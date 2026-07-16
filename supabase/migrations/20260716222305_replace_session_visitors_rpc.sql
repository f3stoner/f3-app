create or replace function public.replace_session_visitors(
    p_session_id uuid,
    p_visitors jsonb default '[]'::jsonb,
    p_created_by_user_id uuid default null
)
returns setof public.session_visitors
language plpgsql
security invoker
set search_path = public
as $function$
begin
    if p_session_id is null then
        raise exception 'Session id is required';
    end if;

    if p_visitors is null then
        p_visitors := '[]'::jsonb;
    end if;

    if jsonb_typeof(p_visitors) <> 'array' then
        raise exception 'Visitors must be a JSON array';
    end if;

    delete from public.session_visitors
    where session_id = p_session_id;

    insert into public.session_visitors (
        id,
        session_id,
        f3_name,
        home_region,
        real_name,
        created_by_user_id
    )
    select
        coalesce(
            nullif(visitor ->> 'id', '')::uuid,
            gen_random_uuid()
        ),
        p_session_id,
        nullif(trim(visitor ->> 'f3Name'), ''),
        nullif(trim(visitor ->> 'homeRegion'), ''),
        nullif(trim(visitor ->> 'realName'), ''),
        coalesce(
            nullif(visitor ->> 'createdByUserId', '')::uuid,
            p_created_by_user_id
        )
    from jsonb_array_elements(p_visitors) as visitor
    where nullif(trim(visitor ->> 'f3Name'), '') is not null;

    return query
    select *
    from public.session_visitors
    where session_id = p_session_id
    order by created_at asc;
end;
$function$;

revoke all on function public.replace_session_visitors(
    uuid,
    jsonb,
    uuid
) from public;

grant execute on function public.replace_session_visitors(
    uuid,
    jsonb,
    uuid
) to authenticated;