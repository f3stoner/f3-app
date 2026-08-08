/*
 * Allow reactions to belong directly to a scheduled workout
 * occurrence as well as to an existing regional feed event.
 */

alter table public.region_feed_reactions
alter column feed_event_id
drop not null;

alter table public.region_feed_reactions
add column q_slot_id uuid
references public.q_slots(id)
on delete cascade;


/*
 * Every reaction must belong to a feed event or a q-slot.
 */
alter table public.region_feed_reactions
add constraint region_feed_reactions_context_check
check (
    feed_event_id is not null
    or q_slot_id is not null
);


/*
 * Backfill workout identity for reactions on completed workout
 * feed events.
 */
update public.region_feed_reactions reaction
set q_slot_id =
    session.source_q_slot_id
from public.region_feed_events feed_event
join public.sessions session
  on session.id = feed_event.session_id
where reaction.feed_event_id = feed_event.id
  and reaction.q_slot_id is null
  and feed_event.event_type = 'session_completed'
  and session.source_q_slot_id is not null;


/*
 * One reaction per member per workout occurrence.
 */
create unique index
region_feed_reactions_q_slot_member_unique
on public.region_feed_reactions (
    q_slot_id,
    member_id
)
where q_slot_id is not null;


/*
 * Efficient workout reaction reads.
 */
create index
region_feed_reactions_q_slot_idx
on public.region_feed_reactions (
    q_slot_id
)
where q_slot_id is not null;


/*
 * Toggle/set the authenticated member's reaction to a workout.
 */
create or replace function public.set_workout_reaction(
    p_q_slot_id uuid,
    p_reaction_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_slot public.q_slots%rowtype;
    existing_reaction public.region_feed_reactions%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_q_slot_id is null then
        raise exception 'Q slot id is required';
    end if;

    if p_reaction_type not in (
        'like',
        'strong',
        'fire',
        'applause',
        'heart'
    ) then
        raise exception 'Invalid reaction type';
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
            'A linked member is required to react';
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

    select *
    into existing_reaction
    from public.region_feed_reactions
    where q_slot_id = p_q_slot_id
      and member_id =
          caller_profile.member_id
    for update;

    if existing_reaction.id is not null then
        if existing_reaction.reaction_type =
            p_reaction_type
        then
            delete from public.region_feed_reactions
            where id = existing_reaction.id;

            return jsonb_build_object(
                'action',
                'removed'
            );
        end if;

        update public.region_feed_reactions
        set reaction_type =
            p_reaction_type
        where id = existing_reaction.id;

        return jsonb_build_object(
            'action',
            'updated'
        );
    end if;

    insert into public.region_feed_reactions (
        q_slot_id,
        member_id,
        reaction_type
    )
    values (
        p_q_slot_id,
        caller_profile.member_id,
        p_reaction_type
    );

    return jsonb_build_object(
        'action',
        'added'
    );
end;
$function$;

revoke all on function
public.set_workout_reaction(uuid, text)
from public, anon;

grant execute on function
public.set_workout_reaction(uuid, text)
to authenticated;