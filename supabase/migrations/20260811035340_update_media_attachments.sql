alter table public.media_attachments
alter column media_asset_id drop not null;

alter table public.media_attachments
add column if not exists media_source text not null default 'upload',
add column if not exists external_provider text,
add column if not exists external_media_id text,
add column if not exists external_url text,
add column if not exists external_preview_url text,
add column if not exists external_still_url text;

alter table public.media_attachments
add constraint media_attachments_media_source_check
check (media_source in ('upload', 'external'));

alter table public.media_attachments
add constraint media_attachments_source_shape_check
check (
    (
        media_source = 'upload'
        and media_asset_id is not null
        and external_provider is null
        and external_media_id is null
        and external_url is null
    )
    or
    (
        media_source = 'external'
        and media_asset_id is null
        and external_provider is not null
        and external_media_id is not null
        and external_url is not null
    )
);

create index if not exists media_attachments_comment_source_idx
on public.media_attachments (
    region_feed_comment_id,
    media_source,
    display_order
);