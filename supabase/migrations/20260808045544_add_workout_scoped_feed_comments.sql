/*
 * Allow regional feed comments to belong directly to a scheduled
 * workout occurrence.
 *
 * Workout discussion begins while the q-slot is upcoming and
 * continues after the occurrence becomes a completed session/feed
 * event.
 */


/*
 * Existing comments are feed-event scoped and feed_event_id was
 * originally required. Workout-scoped comments may exist before
 * any feed event exists, so make it optional.
 */
alter table public.region_feed_comments
alter column feed_event_id
drop not null;


/*
 * Canonical scheduled workout occurrence.
 */
alter table public.region_feed_comments
add column q_slot_id uuid
references public.q_slots(id)
on delete cascade;


/*
 * Every active comment must belong to at least one real context.
 *
 * Existing non-workout feed comments continue using feed_event_id.
 * Workout discussion uses q_slot_id.
 */
alter table public.region_feed_comments
add constraint region_feed_comments_context_check
check (
    feed_event_id is not null
    or q_slot_id is not null
);


/*
 * Backfill workout identity for existing comments attached to
 * completed-workout feed events.
 *
 * region_feed_event
 *     -> session
 *     -> source_q_slot_id
 */
update public.region_feed_comments comment
set q_slot_id =
    session.source_q_slot_id
from public.region_feed_events feed_event
join public.sessions session
  on session.id = feed_event.session_id
where comment.feed_event_id = feed_event.id
  and comment.q_slot_id is null
  and feed_event.event_type = 'session_completed'
  and session.source_q_slot_id is not null;


/*
 * Upcoming and completed workout threads will normally query by
 * q_slot_id and creation order.
 */
create index
region_feed_comments_q_slot_created_at_idx
on public.region_feed_comments (
    q_slot_id,
    created_at
)
where
    q_slot_id is not null
    and deleted_at is null;


/*
 * Add one comment to a scheduled workout occurrence.
 */
create or replace function public.add_workout_comment(
    p_q_slot_id uuid,
    p_body text
)
returns public.region_feed_comments
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_slot public.q_slots%rowtype;
    clean_body text;
    created_comment public.region_feed_comments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_q_slot_id is null then
        raise exception 'Q slot id is required';
    end if;

    clean_body := trim(
        coalesce(
            p_body,
            ''
        )
    );

    if clean_body = '' then
        raise exception 'Comment body is required';
    end if;

    if length(clean_body) > 1000 then
        raise exception
            'Comment must be 1000 characters or fewer';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception
            'Authenticated profile not found';
    end if;

    if caller_profile.member_id is null then
        raise exception
            'A linked member is required to comment';
    end if;

    select *
    into target_slot
    from public.q_slots
    where id = p_q_slot_id;

    if target_slot.id is null then
        raise exception 'Q slot not found';
    end if;

    if not (
        public.has_region_access(
            target_slot.region_id
        )
        or caller_profile.role = 'superadmin'
    ) then
        raise exception
            'Not authorized for this workout';
    end if;

    insert into public.region_feed_comments (
        q_slot_id,
        member_id,
        body
    )
    values (
        p_q_slot_id,
        caller_profile.member_id,
        clean_body
    )
    returning *
    into created_comment;

    return created_comment;
end;
$function$;


/*
 * RPC access.
 */
revoke all on function
public.add_workout_comment(uuid, text)
from public, anon;

grant execute on function
public.add_workout_comment(uuid, text)
to authenticated;