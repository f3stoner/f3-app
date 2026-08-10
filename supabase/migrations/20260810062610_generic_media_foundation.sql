-- Generic media schema foundation.
-- No storage policy changes or media RPCs in this migration.

-- ============================================================
-- MEDIA ASSETS
-- ============================================================

create table if not exists public.media_assets (
    id uuid primary key default gen_random_uuid(),

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    uploaded_by_user_id uuid not null
        references public.profiles(id),

    uploaded_by_member_id uuid null
        references public.members(id),

    storage_path text not null unique,

    media_kind text not null,

    mime_type text not null,

    file_size_bytes bigint null,

    width integer null,
    height integer null,

    status text not null default 'pending',

    created_at timestamp with time zone not null default now(),
    ready_at timestamp with time zone null,
    deleted_at timestamp with time zone null,

    constraint media_assets_media_kind_check
        check (
            media_kind in (
                'image',
                'gif'
            )
        ),

    constraint media_assets_status_check
        check (
            status in (
                'pending',
                'ready',
                'deleted',
                'delete_failed'
            )
        ),

    constraint media_assets_file_size_check
        check (
            file_size_bytes is null
            or file_size_bytes > 0
        ),

    constraint media_assets_width_check
        check (
            width is null
            or width > 0
        ),

    constraint media_assets_height_check
        check (
            height is null
            or height > 0
        )
);

comment on table public.media_assets is
'Canonical metadata for non-avatar media objects stored in the private media bucket.';

comment on column public.media_assets.storage_path is
'Immutable private Supabase Storage object path; never a signed URL.';

comment on column public.media_assets.uploaded_by_user_id is
'Audit provenance only. Continuing media authority derives from the attached parent record.';

comment on column public.media_assets.uploaded_by_member_id is
'Optional canonical member associated with the uploading user for audit provenance.';


-- ============================================================
-- MEDIA ATTACHMENTS
-- ============================================================

create table if not exists public.media_attachments (
    id uuid primary key default gen_random_uuid(),

    media_asset_id uuid not null
        references public.media_assets(id)
        on delete cascade,

    q_slot_id uuid null
        references public.q_slots(id)
        on delete cascade,

    session_id uuid null
        references public.sessions(id)
        on delete cascade,

    region_feed_comment_id uuid null
        references public.region_feed_comments(id)
        on delete cascade,

    announcement_id uuid null
        references public.announcements(id)
        on delete cascade,

    display_order integer not null default 0,

    created_at timestamp with time zone not null default now(),

    constraint media_attachments_one_parent_check
        check (
            num_nonnulls(
                q_slot_id,
                session_id,
                region_feed_comment_id,
                announcement_id
            ) = 1
        ),

    constraint media_attachments_one_attachment_per_asset
        unique (media_asset_id),

    constraint media_attachments_display_order_check
        check (
            display_order >= 0
        )
);

comment on table public.media_attachments is
'Associates one media asset with exactly one canonical parent record.';


-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists media_assets_region_status_created_idx
on public.media_assets (
    region_id,
    status,
    created_at desc
);

create index if not exists media_assets_uploaded_by_user_idx
on public.media_assets (
    uploaded_by_user_id,
    created_at desc
);

create index if not exists media_attachments_q_slot_idx
on public.media_attachments (
    q_slot_id,
    display_order
)
where q_slot_id is not null;

create index if not exists media_attachments_session_idx
on public.media_attachments (
    session_id,
    display_order
)
where session_id is not null;

create index if not exists media_attachments_comment_idx
on public.media_attachments (
    region_feed_comment_id,
    display_order
)
where region_feed_comment_id is not null;

create index if not exists media_attachments_announcement_idx
on public.media_attachments (
    announcement_id,
    display_order
)
where announcement_id is not null;

alter table public.media_assets enable row level security;
alter table public.media_attachments enable row level security;