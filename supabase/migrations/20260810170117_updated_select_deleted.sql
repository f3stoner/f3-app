-- Let authenticated users SELECT generic media objects when they
-- can either normally read the ready asset or are authorized to
-- clean up the corresponding deleted/pending asset.

drop policy if exists media_generic_select_for_delete
on storage.objects;

drop policy if exists media_generic_read_accessible_regions
on storage.objects;

create policy media_generic_read_or_delete_authorized
on storage.objects
for select
to authenticated
using (
    bucket_id = 'media'
    and (
        exists (
            select 1
            from public.media_assets asset
            where asset.storage_path = name
              and asset.status = 'ready'
              and (
                  public.has_region_access(asset.region_id)
                  or public.is_superadmin()
              )
        )
        or public.can_delete_media_path(name)
    )
);