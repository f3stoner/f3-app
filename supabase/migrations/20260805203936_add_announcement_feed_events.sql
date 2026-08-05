/*
 * Add published announcements to the regional activity feed.
 */

alter table public.region_feed_events
add column announcement_id uuid
    references public.announcements(id)
    on delete cascade;

alter table public.region_feed_events
drop constraint region_feed_events_event_type_check;

alter table public.region_feed_events
add constraint region_feed_events_event_type_check
check (
    event_type in (
        'session_completed',
        'member_milestone',
        'announcement_published'
    )
);

alter table public.region_feed_events
add constraint region_feed_events_announcement_shape
check (
    event_type <> 'announcement_published'
    or announcement_id is not null
);

create index region_feed_events_announcement_idx
on public.region_feed_events (
    region_id,
    announcement_id,
    occurred_at desc
);


/*
 * Ensure one feed event exists for one active announcement.
 *
 * Inactive announcements do not produce feed events.
 * Repeated calls remain idempotent.
 */
create or replace function public.reconcile_region_feed_for_announcement(
    p_announcement_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    canonical_announcement public.announcements%rowtype;
begin
    if p_announcement_id is null then
        raise exception 'Announcement id is required';
    end if;

    select *
    into canonical_announcement
    from public.announcements
    where id = p_announcement_id;

    if canonical_announcement.id is null then
        raise exception 'Announcement not found';
    end if;

    if not canonical_announcement.is_active then
        return;
    end if;

    insert into public.region_feed_events (
        region_id,
        event_type,
        occurred_at,
        announcement_id,
        source_key
    )
    values (
        canonical_announcement.region_id,
        'announcement_published',
        canonical_announcement.created_at,
        canonical_announcement.id,
        'announcement_published:' ||
            canonical_announcement.id::text
    )
    on conflict (source_key) do nothing;
end;
$function$;

revoke all on function public.reconcile_region_feed_for_announcement(uuid)
from public, anon, authenticated;