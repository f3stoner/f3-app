-- Allow Storage DELETE policy to validate generic media cleanup
-- without requiring deleted media_assets rows to be visible
-- through normal SELECT RLS.

-- ============================================================
-- GENERIC MEDIA STORAGE DELETE CHECK
-- ============================================================

create or replace function public.can_delete_media_path(
    p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.media_assets asset
        where asset.storage_path = p_storage_path
          and asset.storage_path like 'regions/%'
          and (
              (
                  asset.status = 'pending'
                  and asset.uploaded_by_user_id = auth.uid()
              )
              or
              (
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
    );
$$;

revoke all on function public.can_delete_media_path(text)
from public, anon;

grant execute on function public.can_delete_media_path(text)
to authenticated;


-- ============================================================
-- GENERIC MEDIA STORAGE DELETE
-- ============================================================

drop policy if exists media_generic_delete_authorized
on storage.objects;

create policy media_generic_delete_authorized
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'media'
    and public.can_delete_media_path(name)
);