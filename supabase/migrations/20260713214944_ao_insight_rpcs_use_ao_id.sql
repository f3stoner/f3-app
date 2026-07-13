create or replace function public.get_ao_insight_months(
    p_region_id uuid,
    p_ao_id uuid
)
returns table (
    month_key text
)
language sql
stable
as $$
    select distinct
        substring(date, 1, 7) as month_key
    from sessions
    where region_id = p_region_id
      and ao_id = p_ao_id
    order by month_key desc;
$$;

create or replace function public.get_ao_insight_sessions(
    p_region_id uuid,
    p_ao_id uuid,
    p_start_date text,
    p_end_date text
)
returns setof sessions
language sql
stable
as $$
    select *
    from sessions
    where region_id = p_region_id
      and ao_id = p_ao_id
      and date >= p_start_date
      and date <= p_end_date
    order by date desc;
$$;