/*
 * Return compact social metadata for supplied workout occurrences.
 *
 * This powers Upcoming workout cards without loading individual
 * reaction or comment rows.
 */
create or replace function public.get_workout_social_summary(
    p_q_slot_ids uuid[]
)
returns table (
    q_slot_id uuid,
    comment_count bigint,
    like_count bigint,
    strong_count bigint,
    fire_count bigint,
    applause_count bigint,
    heart_count bigint,
    current_reaction text
)
language sql
stable
security definer
set search_path = public
as $function$
    with caller as (
        select profile.member_id
        from public.profiles profile
        where profile.id = auth.uid()
    ),

    requested_slots as (
        select
            slot.id
        from public.q_slots slot
        where slot.id = any(
            coalesce(
                p_q_slot_ids,
                '{}'::uuid[]
            )
        )
          and (
              public.has_region_access(
                  slot.region_id
              )
              or exists (
                  select 1
                  from public.profiles profile
                  where profile.id = auth.uid()
                    and profile.role = 'superadmin'
              )
          )
    ),

    comment_counts as (
        select
            comment.q_slot_id,
            count(*) as comment_count
        from public.region_feed_comments comment
        join requested_slots requested
          on requested.id = comment.q_slot_id
        where comment.deleted_at is null
        group by comment.q_slot_id
    ),

    reaction_counts as (
        select
            reaction.q_slot_id,

            count(*) filter (
                where reaction.reaction_type = 'like'
            ) as like_count,

            count(*) filter (
                where reaction.reaction_type = 'strong'
            ) as strong_count,

            count(*) filter (
                where reaction.reaction_type = 'fire'
            ) as fire_count,

            count(*) filter (
                where reaction.reaction_type = 'applause'
            ) as applause_count,

            count(*) filter (
                where reaction.reaction_type = 'heart'
            ) as heart_count

        from public.region_feed_reactions reaction
        join requested_slots requested
          on requested.id = reaction.q_slot_id
        group by reaction.q_slot_id
    ),

    caller_reactions as (
        select
            reaction.q_slot_id,
            reaction.reaction_type
        from public.region_feed_reactions reaction
        join requested_slots requested
          on requested.id = reaction.q_slot_id
        join caller
          on caller.member_id = reaction.member_id
    )

    select
        requested.id as q_slot_id,

        coalesce(
            comment_counts.comment_count,
            0
        ) as comment_count,

        coalesce(
            reaction_counts.like_count,
            0
        ) as like_count,

        coalesce(
            reaction_counts.strong_count,
            0
        ) as strong_count,

        coalesce(
            reaction_counts.fire_count,
            0
        ) as fire_count,

        coalesce(
            reaction_counts.applause_count,
            0
        ) as applause_count,

        coalesce(
            reaction_counts.heart_count,
            0
        ) as heart_count,

        caller_reactions.reaction_type
            as current_reaction

    from requested_slots requested

    left join comment_counts
      on comment_counts.q_slot_id =
          requested.id

    left join reaction_counts
      on reaction_counts.q_slot_id =
          requested.id

    left join caller_reactions
      on caller_reactions.q_slot_id =
          requested.id;
$function$;

revoke all on function
public.get_workout_social_summary(uuid[])
from public, anon;

grant execute on function
public.get_workout_social_summary(uuid[])
to authenticated;