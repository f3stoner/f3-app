create or replace function public.get_region_insight_sessions(
    p_region_id uuid,
    p_start_date text,
    p_end_date text
)
returns setof public.sessions
language sql
stable
as $$
    select *
    from public.sessions
    where region_id = p_region_id
      and date >= p_start_date
      and date <= p_end_date
    order by date desc;
$$;