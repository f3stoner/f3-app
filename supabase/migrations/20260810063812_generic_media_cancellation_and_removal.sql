-- Generic media cancellation and removal lifecycle.

-- ============================================================
-- MEDIA ASSET AUTHORIZATION
-- ============================================================

create or replace function public.can_manage_media_asset(
    p_media_asset_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    target_attachment public.media_attachments%rowtype;
begin
    if p_media_asset_id is null then
        return false;
    end if;

    select *
    into target_attachment
    from public.media_attachments
    where media_asset_id = p_media_asset_id;

    if target_attachment.id is null then
        return false;
    end if;

    if target_attachment.q_slot_id is not null then
        return public.can_manage_q_slot_media(
            target_attachment.q_slot_id
        );
    end if;

    if target_attachment.session_id is not null then
        return public.can_manage_session_media(
            target_attachment.session_id
        );
    end if;

    if target_attachment.region_feed_comment_id is not null then
        return public.can_manage_comment_media(
            target_attachment.region_feed_comment_id
        );
    end if;

    if target_attachment.announcement_id is not null then
        return public.can_manage_announcement_media(
            target_attachment.announcement_id
        );
    end if;

    return false;
end;
$$;

revoke all on function public.can_manage_media_asset(uuid)
from public, anon;

grant execute on function public.can_manage_media_asset(uuid)
to authenticated;


-- ============================================================
-- CANCEL PENDING ASSET
-- ============================================================

create or replace function public.cancel_media_asset(
    p_media_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_asset public.media_assets%rowtype;
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
        raise exception 'Only pending media assets may be cancelled'
            using errcode = '22023';
    end if;

    if target_asset.uploaded_by_user_id <> auth.uid()
       and not public.is_superadmin() then
        raise exception 'Not authorized to cancel this media asset'
            using errcode = '42501';
    end if;

    update public.media_assets
    set
        status = 'deleted',
        deleted_at = now()
    where id = target_asset.id
    returning *
    into target_asset;

    return jsonb_build_object(
        'asset',
        to_jsonb(target_asset),
        'storage_path',
        target_asset.storage_path
    );
end;
$$;

revoke all on function public.cancel_media_asset(uuid)
from public, anon;

grant execute on function public.cancel_media_asset(uuid)
to authenticated;


-- ============================================================
-- REMOVE READY ASSET
-- ============================================================

create or replace function public.remove_media_asset(
    p_media_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_asset public.media_assets%rowtype;
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

    if target_asset.status <> 'ready' then
        raise exception 'Only ready media assets may be removed'
            using errcode = '22023';
    end if;

    if not public.can_manage_media_asset(
        target_asset.id
    ) then
        raise exception 'Not authorized to remove this media asset'
            using errcode = '42501';
    end if;

    update public.media_assets
    set
        status = 'deleted',
        deleted_at = now()
    where id = target_asset.id
    returning *
    into target_asset;

    return jsonb_build_object(
        'asset',
        to_jsonb(target_asset),
        'storage_path',
        target_asset.storage_path
    );
end;
$$;

revoke all on function public.remove_media_asset(uuid)
from public, anon;

grant execute on function public.remove_media_asset(uuid)
to authenticated;


-- ============================================================
-- RECORD STORAGE DELETE FAILURE
-- ============================================================

create or replace function public.mark_media_delete_failed(
    p_media_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_asset public.media_assets%rowtype;
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

    if target_asset.status <> 'deleted' then
        raise exception 'Media asset is not awaiting Storage deletion'
            using errcode = '22023';
    end if;

    if not (
        target_asset.uploaded_by_user_id = auth.uid()
        or public.can_manage_media_asset(target_asset.id)
        or public.is_superadmin()
    ) then
        raise exception 'Not authorized to update this media asset'
            using errcode = '42501';
    end if;

    update public.media_assets
    set status = 'delete_failed'
    where id = target_asset.id
    returning *
    into target_asset;

    return jsonb_build_object(
        'asset',
        to_jsonb(target_asset),
        'storage_path',
        target_asset.storage_path
    );
end;
$$;

revoke all on function public.mark_media_delete_failed(uuid)
from public, anon;

grant execute on function public.mark_media_delete_failed(uuid)
to authenticated;