-- Finalize a reserved generic media asset after Storage upload.

create or replace function public.finalize_media_asset(
    p_media_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_asset public.media_assets%rowtype;
    target_attachment public.media_attachments%rowtype;
    storage_object storage.objects%rowtype;

    actual_mime_type text;
    actual_file_size bigint;
    expected_extension text;

    can_manage boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if p_media_asset_id is null then
        raise exception 'Media asset id is required'
            using errcode = '22023';
    end if;

    select *
    into target_asset
    from public.media_assets
    where id = p_media_asset_id
    for update;

    if target_asset.id is null then
        raise exception 'Media asset not found'
            using errcode = 'P0002';
    end if;

    if target_asset.status <> 'pending' then
        raise exception 'Only pending media assets may be finalized'
            using errcode = '22023';
    end if;

    if target_asset.uploaded_by_user_id <> auth.uid()
       and not public.is_superadmin() then
        raise exception 'Not authorized to finalize this media asset'
            using errcode = '42501';
    end if;

    select *
    into target_attachment
    from public.media_attachments
    where media_asset_id = target_asset.id;

    if target_attachment.id is null then
        raise exception 'Media attachment not found'
            using errcode = 'P0002';
    end if;

    if target_attachment.q_slot_id is not null then
        can_manage =
            public.can_manage_q_slot_media(
                target_attachment.q_slot_id
            );

    elsif target_attachment.session_id is not null then
        can_manage =
            public.can_manage_session_media(
                target_attachment.session_id
            );

    elsif target_attachment.region_feed_comment_id is not null then
        can_manage =
            public.can_manage_comment_media(
                target_attachment.region_feed_comment_id
            );

    elsif target_attachment.announcement_id is not null then
        can_manage =
            public.can_manage_announcement_media(
                target_attachment.announcement_id
            );
    end if;

    if not can_manage then
        raise exception 'Not authorized to manage this media attachment'
            using errcode = '42501';
    end if;

    select object.*
    into storage_object
    from storage.objects object
    where object.bucket_id = 'media'
      and object.name = target_asset.storage_path
    limit 1;

    if storage_object.id is null then
        raise exception 'Media object does not exist'
            using errcode = 'P0002';
    end if;

    actual_mime_type =
        storage_object.metadata->>'mimetype';

    actual_file_size =
        nullif(
            storage_object.metadata->>'size',
            ''
        )::bigint;

    if actual_mime_type is null then
        raise exception 'Media object MIME type could not be verified'
            using errcode = '22023';
    end if;

    if actual_file_size is null then
        raise exception 'Media object size could not be verified'
            using errcode = '22023';
    end if;

    if actual_mime_type <> target_asset.mime_type then
        raise exception 'Uploaded media MIME type does not match reservation'
            using errcode = '22023';
    end if;

    expected_extension =
        case target_asset.mime_type
            when 'image/webp' then 'webp'
            when 'image/jpeg' then 'jpg'
            when 'image/gif' then 'gif'
            else null
        end;

    if expected_extension is null then
        raise exception 'Unsupported media MIME type'
            using errcode = '22023';
    end if;

    if storage.extension(target_asset.storage_path)
       <> expected_extension then
        raise exception 'Media object extension does not match MIME type'
            using errcode = '22023';
    end if;

    if target_asset.media_kind = 'image'
       and actual_mime_type not in (
            'image/webp',
            'image/jpeg'
       ) then
        raise exception 'Static image has an invalid MIME type'
            using errcode = '22023';
    end if;

    if target_asset.media_kind = 'gif'
       and actual_mime_type <> 'image/gif' then
        raise exception 'GIF asset must use image/gif'
            using errcode = '22023';
    end if;

    if target_asset.media_kind = 'image'
       and actual_file_size > 3145728 then
        raise exception 'Static image exceeds the 3 MiB media limit'
            using errcode = '22023';
    end if;

    if target_asset.media_kind = 'gif'
       and actual_file_size > 10485760 then
        raise exception 'GIF exceeds the 10 MiB media limit'
            using errcode = '22023';
    end if;

    update public.media_assets
    set
        mime_type = actual_mime_type,
        file_size_bytes = actual_file_size,
        status = 'ready',
        ready_at = now()
    where id = target_asset.id
    returning *
    into target_asset;

    return jsonb_build_object(
        'asset',
        to_jsonb(target_asset),
        'attachment',
        to_jsonb(target_attachment)
    );
end;
$$;

revoke all on function public.finalize_media_asset(uuid)
from public, anon;

grant execute on function public.finalize_media_asset(uuid)
to authenticated;