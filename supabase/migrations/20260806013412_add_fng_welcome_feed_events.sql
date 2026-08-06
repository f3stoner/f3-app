/*
 * Add first-post FNG welcomes to the regional activity feed.
 */

alter table public.region_feed_events
drop constraint region_feed_events_event_type_check;

alter table public.region_feed_events
add constraint region_feed_events_event_type_check
check (
    event_type in (
        'session_completed',
        'member_milestone',
        'announcement_published',
        'fng_welcomed'
    )
);

alter table public.region_feed_events
add constraint region_feed_events_fng_welcome_shape
check (
    event_type <> 'fng_welcomed'
    or (
        session_id is not null
        and member_id is not null
    )
);


/*
 * Create one welcome event for each linked FNG whose first
 * credited regional post is the supplied session.
 */
create or replace function public.reconcile_region_feed_fng_welcomes_for_session(
    p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    canonical_session public.sessions%rowtype;
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
    with session_fng_members as (
        select distinct member.id as member_id
        from jsonb_array_elements(
            coalesce(canonical_session.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        join public.members member
          on member.id::text = coalesce(
              fng.fng_obj ->> 'memberId',
              fng.fng_obj ->> 'member_id'
          )
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

    first_post_fngs as (
        select session_fng.member_id
        from session_fng_members session_fng
        join regional_post_events event
          on event.member_id_text = session_fng.member_id::text
        group by session_fng.member_id
        having count(distinct event.session_id) = 1
           and max(event.session_id) = canonical_session.id
    )

    select
        canonical_session.region_id,
        'fng_welcomed',
        transaction_timestamp(),
        canonical_session.id,
        first_post.member_id,
        'fng_welcomed:' ||
            canonical_session.region_id::text || ':' ||
            first_post.member_id::text,
        jsonb_build_object(
            'postNumber', 1
        )
    from first_post_fngs first_post
    on conflict (source_key) do nothing;
end;
$function$;

revoke all on function
public.reconcile_region_feed_fng_welcomes_for_session(uuid)
from public, anon, authenticated;