create or replace function public.search_global_members(
    p_search_term text,
    p_limit integer default 20
)
returns table (
    member_id uuid,
    pax_name text,
    real_name text,
    home_ao text,
    status text,
    home_region_id uuid,
    home_region_name text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_search_term text;
    v_limit integer;
begin
    if auth.uid() is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    v_search_term :=
        nullif(
            btrim(p_search_term),
            ''
        );

    if v_search_term is null
       or length(v_search_term) < 2
    then
        return;
    end if;

    v_limit :=
        least(
            greatest(
                coalesce(p_limit, 20),
                1
            ),
            50
        );

    return query
    select
        m.id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        m.status,
        m.region_id,
        r.name
    from public.members m
    join public.regions r
        on r.id = m.region_id
    where m.status = 'active'
      and (
            m.pax_name ilike
                '%' || v_search_term || '%'

            or m.real_name ilike
                '%' || v_search_term || '%'

            or regexp_replace(
                lower(
                    coalesce(
                        m.pax_name,
                        ''
                    )
                ),
                '[^a-z0-9]',
                '',
                'g'
            ) like
                '%' ||
                regexp_replace(
                    lower(v_search_term),
                    '[^a-z0-9]',
                    '',
                    'g'
                ) ||
                '%'
      )
    order by
        case
            when lower(m.pax_name) =
                lower(v_search_term)
                then 0

            when lower(m.pax_name) like
                lower(v_search_term) || '%'
                then 1

            else 2
        end,

        m.pax_name,
        r.name

    limit v_limit;
end;
$function$;

revoke all
on function public.search_global_members(
    text,
    integer
)
from public, anon;

grant execute
on function public.search_global_members(
    text,
    integer
)
to authenticated;

alter function public.search_global_members(
    text,
    integer
)
owner to postgres;

revoke all
on function public.search_global_members(
    text,
    integer
)
from public, anon, authenticated;

grant execute
on function public.search_global_members(
    text,
    integer
)
to authenticated;