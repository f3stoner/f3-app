drop policy if exists media_attachments_read_accessible_regions
on public.media_attachments;

create policy media_attachments_read_accessible_regions
on public.media_attachments
for select
using (
    (
        media_source = 'upload'
        and exists (
            select 1
            from public.media_assets asset
            where asset.id = media_attachments.media_asset_id
              and asset.status = 'ready'
              and (
                  public.has_region_access(asset.region_id)
                  or public.is_superadmin()
              )
        )
    )
    or
    (
        media_source = 'external'
        and region_feed_comment_id is not null
        and exists (
            select 1
            from public.region_feed_comments comment
            left join public.region_feed_events event
                on event.id = comment.feed_event_id
            left join public.q_slots slot
                on slot.id = comment.q_slot_id
            where comment.id = media_attachments.region_feed_comment_id
              and comment.deleted_at is null
              and (
                  public.is_superadmin()
                  or public.has_region_access(
                      coalesce(
                          event.region_id,
                          slot.region_id
                      )
                  )
              )
        )
    )
);