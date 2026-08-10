-- Reserve one generic media attachment before Storage upload.

create or replace function public.reserve_media_attachment(
    p_q_slot_id uuid default null,
    p_session_id uuid default null,
    p_region_feed_comment_id uuid default null,
    p_announcement_id uuid default null,
    p_media_kind text default null,
    p_mime_type text default null,
    p_file_size_bytes bigint default null,
    p_width integer default null,
    p_height integer default null,
    p_display_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_profile public.profiles%rowtype;
    resolved_region_id uuid;
    asset_id uuid := gen_random_uuid();
    attachment_id uuid := gen_random_uuid();
    extension text;
    storage_path text;
    created_asset public.media_assets%rowtype;
    created_attachment public.media_attachments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if num_nonnulls(
        p_q_slot_id,
        p_session_id,
        p_region_feed_comment_id,
        p_announcement_id
    ) <> 1 then
        raise exception 'Exactly one media parent is required'
            using errcode = '22023';
    end if;

    if p_media_kind not in ('image', 'gif') then
        raise exception 'Unsupported media kind'
            using errcode = '22023';
    end if;

    if p_mime_type not in (
        'image/webp',
        'image/jpeg',
        'image/gif'
    ) then
        raise exception 'Unsupported media MIME type'
            using errcode = '22023';
    end if;

    if p_media_kind = 'gif'
       and p_mime_type <> 'image/gif' then
        raise exception 'GIF media must use image/gif'
            using errcode = '22023';
    end if;

    if p_media_kind = 'image'
       and p_mime_type not in (
            'image/webp',
            'image/jpeg'
       ) then
        raise exception 'Static images must use WebP or JPEG'
            using errcode = '22023';
    end if;

    if p_file_size_bytes is not null
       and p_file_size_bytes <= 0 then
        raise exception 'File size must be positive'
            using errcode = '22023';
    end if;

    if p_width is not null
       and p_width <= 0 then
        raise exception 'Width must be positive'
            using errcode = '22023';
    end if;

    if p_height is not null
       and p_height <= 0 then
        raise exception 'Height must be positive'
            using errcode = '22023';
    end if;

    if p_display_order < 0 then
        raise exception 'Display order must be nonnegative'
            using errcode = '22023';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found'
            using errcode = '42501';
    end if;

    if p_q_slot_id is not null
       and not public.can_manage_q_slot_media(p_q_slot_id) then
        raise exception 'Not authorized to manage Q slot media'
            using errcode = '42501';
    end if;

    if p_session_id is not null
       and not public.can_manage_session_media(p_session_id) then
        raise exception 'Not authorized to manage session media'
            using errcode = '42501';
    end if;

    if p_region_feed_comment_id is not null
       and not public.can_manage_comment_media(
            p_region_feed_comment_id
       ) then
        raise exception 'Not authorized to manage comment media'
            using errcode = '42501';
    end if;

    if p_announcement_id is not null
       and not public.can_manage_announcement_media(
            p_announcement_id
       ) then
        raise exception 'Not authorized to manage announcement media'
            using errcode = '42501';
    end if;

    resolved_region_id = public.media_parent_region_id(
        p_q_slot_id,
        p_session_id,
        p_region_feed_comment_id,
        p_announcement_id
    );

    extension =
        case p_mime_type
            when 'image/webp' then 'webp'
            when 'image/jpeg' then 'jpg'
            when 'image/gif' then 'gif'
            else null
        end;

    if p_q_slot_id is not null then
        storage_path =
            'regions/' ||
            resolved_region_id::text ||
            '/q-slots/' ||
            p_q_slot_id::text ||
            '/' ||
            asset_id::text ||
            '.' ||
            extension;

    elsif p_session_id is not null then
        storage_path =
            'regions/' ||
            resolved_region_id::text ||
            '/sessions/' ||
            p_session_id::text ||
            '/' ||
            asset_id::text ||
            '.' ||
            extension;

    elsif p_region_feed_comment_id is not null then
        storage_path =
            'regions/' ||
            resolved_region_id::text ||
            '/comments/' ||
            p_region_feed_comment_id::text ||
            '/' ||
            asset_id::text ||
            '.' ||
            extension;

    else
        storage_path =
            'regions/' ||
            resolved_region_id::text ||
            '/announcements/' ||
            p_announcement_id::text ||
            '/' ||
            asset_id::text ||
            '.' ||
            extension;
    end if;

    insert into public.media_assets (
        id,
        region_id,
        uploaded_by_user_id,
        uploaded_by_member_id,
        storage_path,
        media_kind,
        mime_type,
        file_size_bytes,
        width,
        height,
        status
    )
    values (
        asset_id,
        resolved_region_id,
        auth.uid(),
        caller_profile.member_id,
        storage_path,
        p_media_kind,
        p_mime_type,
        p_file_size_bytes,
        p_width,
        p_height,
        'pending'
    )
    returning *
    into created_asset;

    insert into public.media_attachments (
        id,
        media_asset_id,
        q_slot_id,
        session_id,
        region_feed_comment_id,
        announcement_id,
        display_order
    )
    values (
        attachment_id,
        asset_id,
        p_q_slot_id,
        p_session_id,
        p_region_feed_comment_id,
        p_announcement_id,
        p_display_order
    )
    returning *
    into created_attachment;

    return jsonb_build_object(
        'asset',
        to_jsonb(created_asset),
        'attachment',
        to_jsonb(created_attachment)
    );
end;
$$;

revoke all on function public.reserve_media_attachment(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    bigint,
    integer,
    integer,
    integer
)
from public, anon;

grant execute on function public.reserve_media_attachment(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    bigint,
    integer,
    integer,
    integer
)
to authenticated;