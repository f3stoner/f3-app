-- Generic media read and Storage policies.
-- Bucket MIME/size limits remain unchanged in this migration.

-- ============================================================
-- MEDIA ASSET READ POLICY
-- ============================================================

drop policy if exists media_assets_read_accessible_regions
on public.media_assets;

create policy media_assets_read_accessible_regions
on public.media_assets
for select
to authenticated
using (
    status = 'ready'
    and (
        public.has_region_access(region_id)
        or public.is_superadmin()
    )
);


-- ============================================================
-- MEDIA ATTACHMENT READ POLICY
-- ============================================================

drop policy if exists media_attachments_read_accessible_regions
on public.media_attachments;

create policy media_attachments_read_accessible_regions
on public.media_attachments
for select
to authenticated
using (
    exists (
        select 1
        from public.media_assets asset
        where asset.id = media_attachments.media_asset_id
          and asset.status = 'ready'
          and (
              public.has_region_access(asset.region_id)
              or public.is_superadmin()
          )
    )
);


-- ============================================================
-- GENERIC MEDIA STORAGE INSERT
--
-- Upload is allowed only to an exact path previously reserved
-- by this authenticated user.
-- ============================================================

drop policy if exists media_generic_insert_reserved
on storage.objects;

create policy media_generic_insert_reserved
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'media'
    and exists (
        select 1
        from public.media_assets asset
        where asset.storage_path = name
          and asset.status = 'pending'
          and asset.uploaded_by_user_id = auth.uid()
          and asset.storage_path like 'regions/%'
    )
);


-- ============================================================
-- GENERIC MEDIA STORAGE READ
--
-- Only finalized assets from accessible regions may be read.
-- Avatar reads continue through the existing avatar policy.
-- ============================================================

drop policy if exists media_generic_read_accessible_regions
on storage.objects;

create policy media_generic_read_accessible_regions
on storage.objects
for select
to authenticated
using (
    bucket_id = 'media'
    and exists (
        select 1
        from public.media_assets asset
        where asset.storage_path = name
          and asset.status = 'ready'
          and (
              public.has_region_access(asset.region_id)
              or public.is_superadmin()
          )
    )
);


-- ============================================================
-- GENERIC MEDIA STORAGE DELETE
--
-- Pending assets may be cleaned up by their uploader.
--
-- Deleted/delete_failed assets may be cleaned up by the
-- original uploader, current parent manager, or superadmin.
-- ============================================================

drop policy if exists media_generic_delete_authorized
on storage.objects;

create policy media_generic_delete_authorized
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'media'
    and exists (
        select 1
        from public.media_assets asset
        where asset.storage_path = name
          and asset.storage_path like 'regions/%'
          and (
              (
                  asset.status = 'pending'
                  and asset.uploaded_by_user_id = auth.uid()
              )
              or (
                  asset.status in (
                      'deleted',
                      'delete_failed'
                  )
                  and (
                      asset.uploaded_by_user_id = auth.uid()
                      or public.can_manage_media_asset(asset.id)
                      or public.is_superadmin()
                  )
              )
          )
    )
);

-- Intentionally no generic Storage UPDATE policy.
-- Media objects remain immutable.