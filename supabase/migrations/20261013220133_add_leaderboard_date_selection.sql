
begin;

drop function if exists public.get_region_pax_leaderboard(uuid, text, text, uuid);

create function public.get_region_pax_leaderboard(
    p_region_id uuid,
    p_metric text default 'posts',
    p_period text default 'month',
    p_ao_id uuid default null,
    p_start_date date default null,
    p_end_date date default null
)
returns table (
    rank bigint,
    member_id uuid,
    pax_name text,
    total bigint
)
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
    v_start_date date;
    v_end_date date;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication required';
    end if;

    if p_region_id is null or p_metric not in ('posts', 'qs') or p_period not in ('month', 'year', 'all') or p_metric is null or p_period is null then
        raise exception using errcode = '22023', message = 'Invalid leaderboard parameters';
    end if;

    if not (public.has_region_access(p_region_id) or public.is_region_leader(p_region_id)) then
        raise exception using errcode = '42501', message = 'Region access required';
    end if;

    if not exists (
        select 1 from public.regions r
        where r.id = p_region_id and r.leaderboards_enabled = true
    ) then
        raise exception using errcode = '42501', message = 'Leaderboards are disabled for this region';
    end if;

    if p_ao_id is not null and not exists (
        select 1 from public.aos ao
        where ao.id = p_ao_id and ao.region_id = p_region_id
    ) then
        raise exception using errcode = '22023', message = 'AO does not belong to this region';
    end if;

    if p_period = 'month' then
        v_start_date := coalesce(p_start_date, date_trunc('month', current_date)::date);
        v_end_date := coalesce(p_end_date, (date_trunc('month', v_start_date) + interval '1 month - 1 day')::date);
    elsif p_period = 'year' then
        v_start_date := coalesce(p_start_date, date_trunc('year', current_date)::date);
        v_end_date := coalesce(p_end_date, (date_trunc('year', v_start_date) + interval '1 year - 1 day')::date);
    else
        v_start_date := null;
        v_end_date := current_date;
    end if;

    if v_start_date is not null and (v_start_date > current_date or v_end_date < v_start_date) then
        raise exception using errcode = '22023', message = 'Invalid leaderboard date range';
    end if;

    v_end_date := least(v_end_date, current_date);

    return query
    with activity as (
        select s.id, s.date, a.member_id
        from public.sessions s
        cross join lateral (
            select distinct value::uuid as member_id
            from jsonb_array_elements_text(
                case when jsonb_typeof(s.attendee_ids) = 'array' then s.attendee_ids else '[]'::jsonb end
            )
        ) a
        where p_metric = 'posts'
          and s.region_id = p_region_id
          and (p_ao_id is null or s.ao_id = p_ao_id)
          and s.date <= v_end_date::text
          and (v_start_date is null or s.date >= v_start_date::text)

        union all

        select s.id, s.date, q.member_id
        from public.sessions s
        cross join lateral (
            select distinct unnest(
                case when coalesce(array_length(s.q_ids, 1), 0) > 0 then s.q_ids else array[s.q_id] end
            ) as member_id
        ) q
        where p_metric = 'qs'
          and s.region_id = p_region_id
          and (p_ao_id is null or s.ao_id = p_ao_id)
          and s.date <= v_end_date::text
          and (v_start_date is null or s.date >= v_start_date::text)
          and q.member_id is not null
    ),
    totals as (
        select a.member_id, count(distinct a.id) as total
        from activity a
        join public.members m on m.id = a.member_id
        group by a.member_id
    )
    select rank() over (order by t.total desc) as rank,
           m.id as member_id, m.pax_name, t.total
    from totals t
    join public.members m on m.id = t.member_id
    order by rank, m.pax_name, m.id;
end;
$function$;

grant execute on function public.get_region_pax_leaderboard(uuid, text, text, uuid, date, date) to authenticated;

commit;
