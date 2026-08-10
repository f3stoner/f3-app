-- Harden media parent region resolution for comments that may
-- legitimately reference both a feed event and its source Q slot.

create or replace function public.media_parent_region_id(
    p_q_slot_id uuid default null,
    p_session_id uuid default null,
    p_region_feed_comment_id uuid default null,
    p_announcement_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    resolved_region_id uuid;
    feed_region_id uuid;
    slot_region_id uuid;
begin
    if num_nonnulls(
        p_q_slot_id,
        p_session_id,
        p_region_feed_comment_id,
        p_announcement_id
    ) <> 1 then
        raise exception 'Exactly one media parent is required';
    end if;

    if p_q_slot_id is not null then
        select slot.region_id
        into resolved_region_id
        from public.q_slots slot
        where slot.id = p_q_slot_id;

    elsif p_session_id is not null then
        select session_row.region_id
        into resolved_region_id
        from public.sessions session_row
        where session_row.id = p_session_id;

    elsif p_region_feed_comment_id is not null then
        select
            feed_event.region_id,
            slot.region_id
        into
            feed_region_id,
            slot_region_id
        from public.region_feed_comments comment_row
        left join public.region_feed_events feed_event
            on feed_event.id = comment_row.feed_event_id
        left join public.q_slots slot
            on slot.id = comment_row.q_slot_id
        where comment_row.id = p_region_feed_comment_id;

        if feed_region_id is not null
           and slot_region_id is not null
           and feed_region_id is distinct from slot_region_id then
            raise exception
                'Comment media contexts belong to different regions';
        end if;

        resolved_region_id = coalesce(
            feed_region_id,
            slot_region_id
        );

    elsif p_announcement_id is not null then
        select announcement.region_id
        into resolved_region_id
        from public.announcements announcement
        where announcement.id = p_announcement_id;
    end if;

    if resolved_region_id is null then
        raise exception 'Media parent not found';
    end if;

    return resolved_region_id;
end;
$$;

revoke all on function public.media_parent_region_id(
    uuid,
    uuid,
    uuid,
    uuid
)
from public, anon;

grant execute on function public.media_parent_region_id(
    uuid,
    uuid,
    uuid,
    uuid
)
to authenticated;