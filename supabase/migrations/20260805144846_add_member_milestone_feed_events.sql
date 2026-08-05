/*
 * Add member milestone events to the regional activity feed.
 */

alter table public.region_feed_events
add column member_id uuid
    references public.members(id)
    on delete cascade;

alter table public.region_feed_events
add column payload jsonb not null
    default '{}'::jsonb;

alter table public.region_feed_events
drop constraint region_feed_events_event_type_check;

alter table public.region_feed_events
add constraint region_feed_events_event_type_check
check (
    event_type in (
        'session_completed',
        'member_milestone'
    )
);

alter table public.region_feed_events
add constraint region_feed_events_member_milestone_shape
check (
    event_type <> 'member_milestone'
    or (
        member_id is not null
        and payload ? 'milestone'
        and payload ? 'metric'
    )
);

create index region_feed_events_member_idx
on public.region_feed_events (
    region_id,
    member_id,
    occurred_at desc
);


/*
 * Reconcile post milestones for the canonical members credited
 * with attendance in one newly created session.
 *
 * This deliberately mirrors the milestone thresholds and crossing
 * rule already used by Region Insights.
 */
create or replace function public.reconcile_region_feed_milestones_for_session(
    p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    canonical_session public.sessions%rowtype;

    milestone_values constant integer[] := array[
        10,
        25,
        50,
        75,
        100,
        150,
        200,
        250,
        300,
        400,
        500,
        750,
        1000
    ];
begin
    if p_session_id is null then
        raise exception 'Session id is required';
    end if;

    select *
    into canonical_session
    from public.sessions
    where id = p_session_id;

    if canonical_session.id is null then
        raise exception 'Session not found';
    end if;

    insert into public.region_feed_events (
        region_id,
        event_type,
        occurred_at,
        session_id,
        member_id,
        source_key,
        payload
    )
    with session_member_ids as (
        select attendee.member_id_text
        from jsonb_array_elements_text(
            coalesce(canonical_session.attendee_ids, '[]'::jsonb)
        ) as attendee(member_id_text)

        union

        select coalesce(
            fng.fng_obj ->> 'memberId',
            fng.fng_obj ->> 'member_id'
        )
        from jsonb_array_elements(
            coalesce(canonical_session.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where coalesce(
            fng.fng_obj ->> 'memberId',
            fng.fng_obj ->> 'member_id'
        ) is not null
    ),

    affected_members as (
        select member.id as member_id
        from session_member_ids submitted
        join public.members member
          on member.id::text = submitted.member_id_text
    ),

    regional_post_events as (
        select
            session_row.id as session_id,
            attendee.member_id_text
        from public.sessions session_row
        cross join lateral jsonb_array_elements_text(
            coalesce(session_row.attendee_ids, '[]'::jsonb)
        ) as attendee(member_id_text)
        where session_row.region_id = canonical_session.region_id

        union

        select
            session_row.id as session_id,
            coalesce(
                fng.fng_obj ->> 'memberId',
                fng.fng_obj ->> 'member_id'
            ) as member_id_text
        from public.sessions session_row
        cross join lateral jsonb_array_elements(
            coalesce(session_row.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where session_row.region_id = canonical_session.region_id
          and coalesce(
              fng.fng_obj ->> 'memberId',
              fng.fng_obj ->> 'member_id'
          ) is not null
    ),

    member_post_totals as (
        select
            affected.member_id,
            count(distinct events.session_id)::integer as ending_total
        from affected_members affected
        join regional_post_events events
          on events.member_id_text = affected.member_id::text
        group by affected.member_id
    ),

    crossings as (
        select
            totals.member_id,
            supplied.milestone,
            totals.ending_total - 1 as starting_total,
            totals.ending_total
        from member_post_totals totals
        cross join unnest(milestone_values) as supplied(milestone)
        where totals.ending_total - 1 < supplied.milestone
          and totals.ending_total >= supplied.milestone
    )

    select
        canonical_session.region_id,
        'member_milestone',
        transaction_timestamp(),
        canonical_session.id,
        crossing.member_id,
        'member_milestone:' ||
            canonical_session.region_id::text || ':' ||
            crossing.member_id::text || ':posts:' ||
            crossing.milestone::text,
        jsonb_build_object(
            'metric', 'posts',
            'milestone', crossing.milestone,
            'startingTotal', crossing.starting_total,
            'endingTotal', crossing.ending_total
        )
    from crossings crossing
    on conflict (source_key) do nothing;
end;
$function$;

revoke all on function
public.reconcile_region_feed_milestones_for_session(uuid)
from public, anon, authenticated;