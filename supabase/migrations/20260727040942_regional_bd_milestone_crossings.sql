-- ============================================================
-- Regional BD milestone crossings
--
-- Returns each supplied milestone crossed by a member during
-- the requested reporting period.
--
-- Ending total:
--   member_stats.total_posts
--
-- Starting total:
--   ending total - distinct regional sessions posted in period
--
-- Baseline adjustments remain embedded in total_posts and are
-- not treated as a session-history cutoff.
-- ============================================================

create or replace function public.get_region_milestone_crossings(
    p_region_id uuid,
    p_period_start date,
    p_period_end date,
    p_milestones integer[]
)
returns table (
    member_id uuid,
    pax_name text,
    milestone integer,
    starting_total integer,
    ending_total integer,
    posts_in_period integer
)
language plpgsql
stable
set search_path = public
as $function$
begin
    if p_region_id is null then
        raise exception 'p_region_id is required';
    end if;

    if p_period_start is null then
        raise exception 'p_period_start is required';
    end if;

    if p_period_end is null then
        raise exception 'p_period_end is required';
    end if;

    if p_period_start > p_period_end then
        raise exception
            'p_period_start must be on or before p_period_end';
    end if;

    if (
        p_milestones is null
        or cardinality(p_milestones) = 0
    ) then
        raise exception
            'p_milestones must contain at least one milestone';
    end if;

    if exists (
        select 1
        from unnest(p_milestones) as supplied(milestone)
        where supplied.milestone is null
           or supplied.milestone <= 0
    ) then
        raise exception
            'p_milestones must contain only positive integers';
    end if;

    return query
    with period_post_events as (
        /*
         * Standard rostered attendance.
         *
         * Keep member IDs as text here so malformed historical
         * JSON values cannot cause a UUID cast failure.
         */
        select
            s.id as session_id,
            attendee.member_id_text
        from public.sessions s
        cross join lateral jsonb_array_elements_text(
            coalesce(s.attendee_ids, '[]'::jsonb)
        ) as attendee(member_id_text)
        where s.region_id = p_region_id
          and s.date >= p_period_start::text
          and s.date <= p_period_end::text

        union

        /*
         * Linked FNG attendance.
         *
         * UNION deduplicates a member who appears in both
         * attendee_ids and fngs for the same session.
         */
        select
            s.id as session_id,
            coalesce(
                fng.fng_obj ->> 'memberId',
                fng.fng_obj ->> 'member_id'
            ) as member_id_text
        from public.sessions s
        cross join lateral jsonb_array_elements(
            coalesce(s.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where s.region_id = p_region_id
          and s.date >= p_period_start::text
          and s.date <= p_period_end::text
          and coalesce(
              fng.fng_obj ->> 'memberId',
              fng.fng_obj ->> 'member_id'
          ) is not null
    ),

    period_post_counts as (
        select
            m.id as member_id,
            count(distinct events.session_id)::integer
                as posts_in_period
        from period_post_events events
        join public.members m
          on m.id::text = events.member_id_text
        group by m.id
    ),

    supplied_milestones as (
        select distinct
            supplied.milestone
        from unnest(p_milestones)
            as supplied(milestone)
    ),

    member_totals as (
        select
            ms.member_id,
            m.pax_name,
            coalesce(ms.total_posts, 0)::integer
                as ending_total,
            counts.posts_in_period,
            (
                coalesce(ms.total_posts, 0)
                - counts.posts_in_period
            )::integer as starting_total
        from public.member_stats ms
        join period_post_counts counts
          on counts.member_id = ms.member_id
        join public.members m
          on m.id = ms.member_id
        where ms.region_id = p_region_id
    )

    select
        totals.member_id,
        totals.pax_name,
        milestones.milestone,
        totals.starting_total,
        totals.ending_total,
        totals.posts_in_period
    from member_totals totals
    cross join supplied_milestones milestones
    where totals.starting_total < milestones.milestone
      and totals.ending_total >= milestones.milestone
    order by
        milestones.milestone desc,
        totals.ending_total desc,
        totals.pax_name;
end;
$function$;


revoke all
on function public.get_region_milestone_crossings(
    uuid,
    date,
    date,
    integer[]
)
from public;

grant execute
on function public.get_region_milestone_crossings(
    uuid,
    date,
    date,
    integer[]
)
to authenticated;

grant execute
on function public.get_region_milestone_crossings(
    uuid,
    date,
    date,
    integer[]
)
to service_role;