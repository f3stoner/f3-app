create function public.get_region_pax_leaderboard(
    p_region_id uuid,
    p_metric text default 'posts',
    p_period text default 'month'
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
set search_path = pg_catalog, public
as $$
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
          and s.date <= current_date::text
          and (
              p_period = 'all'
              or (p_period = 'year' and s.date >= to_char(current_date, 'YYYY-01-01'))
              or (p_period = 'month' and s.date >= to_char(current_date, 'YYYY-MM-01'))
          )

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
          and s.date <= current_date::text
          and q.member_id is not null
          and (
              p_period = 'all'
              or (p_period = 'year' and s.date >= to_char(current_date, 'YYYY-01-01'))
              or (p_period = 'month' and s.date >= to_char(current_date, 'YYYY-MM-01'))
          )
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
$$;

revoke all on function public.get_region_pax_leaderboard(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_region_pax_leaderboard(uuid, text, text) to authenticated;