begin;

/*
 * Rebuild regional feed events from July 1, 2026 forward.
 *
 * This removes only session-driven events whose source session
 * occurred during the backfill window, plus announcement events
 * whose announcement was created during the window.
 */

delete from public.region_feed_events feed_event
using public.sessions session_row
where feed_event.session_id = session_row.id
  and session_row.date::date >= date '2026-07-01'
  and feed_event.event_type in (
      'session_completed',
      'member_milestone',
      'fng_welcomed',
      'vq_earned'
  );

delete from public.region_feed_events feed_event
using public.announcements announcement
where feed_event.announcement_id = announcement.id
  and announcement.created_at::date >= date '2026-07-01'
  and feed_event.event_type = 'announcement_published';


/*
 * Session completed events.
 */

insert into public.region_feed_events (
    region_id,
    event_type,
    occurred_at,
    session_id,
    source_key,
    payload
)
select
    session_row.region_id,
    'session_completed',
    to_timestamp(session_row.created_at / 1000.0),
    session_row.id,
    'session_completed:' || session_row.id::text,
    '{}'::jsonb
from public.sessions session_row
where session_row.date::date >= date '2026-07-01'
on conflict (source_key) do nothing;


/*
 * Build one canonical regional post per member/session.
 *
 * This combines standard attendance and linked FNG attendance,
 * then numbers every member's regional posts chronologically.
 */

with regional_post_events as (
    select
        session_row.region_id,
        session_row.id as session_id,
        session_row.date::date as session_date,
        session_row.created_at,
        attendee.member_id_text
    from public.sessions session_row
    cross join lateral jsonb_array_elements_text(
        coalesce(session_row.attendee_ids, '[]'::jsonb)
    ) as attendee(member_id_text)

    union

    select
        session_row.region_id,
        session_row.id as session_id,
        session_row.date::date as session_date,
        session_row.created_at,
        coalesce(
            fng.fng_obj ->> 'memberId',
            fng.fng_obj ->> 'member_id'
        ) as member_id_text
    from public.sessions session_row
    cross join lateral jsonb_array_elements(
        coalesce(session_row.fngs, '[]'::jsonb)
    ) as fng(fng_obj)
    where coalesce(
        fng.fng_obj ->> 'memberId',
        fng.fng_obj ->> 'member_id'
    ) is not null
),

canonical_posts as (
    select distinct
        post_event.region_id,
        post_event.session_id,
        post_event.session_date,
        post_event.created_at,
        member.id as member_id
    from regional_post_events post_event
    join public.members member
      on member.id::text = post_event.member_id_text
),

numbered_posts as (
    select
        canonical_post.*,
        row_number() over (
            partition by
                canonical_post.region_id,
                canonical_post.member_id
            order by
                canonical_post.session_date,
                canonical_post.created_at,
                canonical_post.session_id
        )::integer as post_number
    from canonical_posts canonical_post
),

milestone_posts as (
    select numbered_post.*
    from numbered_posts numbered_post
    where numbered_post.post_number = any(
        array[
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
        ]
    )
      and numbered_post.session_date >= date '2026-07-01'
)

insert into public.region_feed_events (
    region_id,
    event_type,
    occurred_at,
    session_id,
    member_id,
    source_key,
    payload
)
select
    milestone_post.region_id,
    'member_milestone',
    to_timestamp(milestone_post.created_at / 1000.0),
    milestone_post.session_id,
    milestone_post.member_id,
    'member_milestone:' ||
        milestone_post.region_id::text || ':' ||
        milestone_post.member_id::text || ':posts:' ||
        milestone_post.post_number::text,
    jsonb_build_object(
        'metric', 'posts',
        'milestone', milestone_post.post_number,
        'startingTotal', milestone_post.post_number - 1,
        'endingTotal', milestone_post.post_number
    )
from milestone_posts milestone_post
on conflict (source_key) do nothing;


/*
 * FNG welcome events.
 *
 * A welcome is created only when:
 *
 * - the member was stored in the session's FNG collection; and
 * - that session was the member's first credited regional post.
 */

with regional_post_events as (
    select
        session_row.region_id,
        session_row.id as session_id,
        session_row.date::date as session_date,
        session_row.created_at,
        attendee.member_id_text
    from public.sessions session_row
    cross join lateral jsonb_array_elements_text(
        coalesce(session_row.attendee_ids, '[]'::jsonb)
    ) as attendee(member_id_text)

    union

    select
        session_row.region_id,
        session_row.id as session_id,
        session_row.date::date as session_date,
        session_row.created_at,
        coalesce(
            fng.fng_obj ->> 'memberId',
            fng.fng_obj ->> 'member_id'
        ) as member_id_text
    from public.sessions session_row
    cross join lateral jsonb_array_elements(
        coalesce(session_row.fngs, '[]'::jsonb)
    ) as fng(fng_obj)
    where coalesce(
        fng.fng_obj ->> 'memberId',
        fng.fng_obj ->> 'member_id'
    ) is not null
),

canonical_posts as (
    select distinct
        post_event.region_id,
        post_event.session_id,
        post_event.session_date,
        post_event.created_at,
        member.id as member_id
    from regional_post_events post_event
    join public.members member
      on member.id::text = post_event.member_id_text
),

numbered_posts as (
    select
        canonical_post.*,
        row_number() over (
            partition by
                canonical_post.region_id,
                canonical_post.member_id
            order by
                canonical_post.session_date,
                canonical_post.created_at,
                canonical_post.session_id
        )::integer as post_number
    from canonical_posts canonical_post
),

session_fng_members as (
    select distinct
        session_row.region_id,
        session_row.id as session_id,
        member.id as member_id
    from public.sessions session_row
    cross join lateral jsonb_array_elements(
        coalesce(session_row.fngs, '[]'::jsonb)
    ) as fng(fng_obj)
    join public.members member
      on member.id::text = coalesce(
          fng.fng_obj ->> 'memberId',
          fng.fng_obj ->> 'member_id'
      )
)

insert into public.region_feed_events (
    region_id,
    event_type,
    occurred_at,
    session_id,
    member_id,
    source_key,
    payload
)
select
    first_post.region_id,
    'fng_welcomed',
    to_timestamp(first_post.created_at / 1000.0),
    first_post.session_id,
    first_post.member_id,
    'fng_welcomed:' ||
        first_post.region_id::text || ':' ||
        first_post.member_id::text,
    jsonb_build_object(
        'aoName',
        session_row.ao_name
    )
from numbered_posts first_post
join session_fng_members session_fng
  on session_fng.region_id = first_post.region_id
 and session_fng.session_id = first_post.session_id
 and session_fng.member_id = first_post.member_id
join public.sessions session_row
  on session_row.id = first_post.session_id
where first_post.post_number = 1
  and first_post.session_date >= date '2026-07-01'
on conflict (source_key) do nothing;


/*
 * VQ events.
 *
 * Each regional Q session is deduplicated between q_ids and
 * legacy q_id, then numbered chronologically by member.
 */

with regional_q_events as (
    select
        session_row.region_id,
        session_row.id as session_id,
        session_row.date::date as session_date,
        session_row.created_at,
        session_row.ao_name,
        submitted.member_id
    from public.sessions session_row
    cross join lateral unnest(
        coalesce(session_row.q_ids, '{}'::uuid[])
    ) as submitted(member_id)

    union

    select
        session_row.region_id,
        session_row.id as session_id,
        session_row.date::date as session_date,
        session_row.created_at,
        session_row.ao_name,
        session_row.q_id as member_id
    from public.sessions session_row
    where session_row.q_id is not null
),

canonical_q_events as (
    select distinct
        q_event.region_id,
        q_event.session_id,
        q_event.session_date,
        q_event.created_at,
        q_event.ao_name,
        q_event.member_id
    from regional_q_events q_event
    where q_event.member_id is not null
),

numbered_q_events as (
    select
        q_event.*,
        row_number() over (
            partition by
                q_event.region_id,
                q_event.member_id
            order by
                q_event.session_date,
                q_event.created_at,
                q_event.session_id
        )::integer as q_number
    from canonical_q_events q_event
)

insert into public.region_feed_events (
    region_id,
    event_type,
    occurred_at,
    session_id,
    member_id,
    source_key,
    payload
)
select
    first_q.region_id,
    'vq_earned',
    to_timestamp(first_q.created_at / 1000.0),
    first_q.session_id,
    first_q.member_id,
    'vq_earned:' ||
        first_q.region_id::text || ':' ||
        first_q.member_id::text,
    jsonb_build_object(
        'qNumber', 1,
        'aoName', first_q.ao_name
    )
from numbered_q_events first_q
where first_q.q_number = 1
  and first_q.session_date >= date '2026-07-01'
on conflict (source_key) do nothing;


/*
 * Announcement publication events.
 *
 * This includes every announcement record that still exists,
 * regardless of whether it is currently active.
 */

insert into public.region_feed_events (
    region_id,
    event_type,
    occurred_at,
    announcement_id,
    source_key,
    payload
)
select
    announcement.region_id,
    'announcement_published',
    announcement.created_at,
    announcement.id,
    'announcement_published:' || announcement.id::text,
    '{}'::jsonb
from public.announcements announcement
where announcement.created_at::date >= date '2026-07-01'
on conflict (source_key) do nothing;

commit;