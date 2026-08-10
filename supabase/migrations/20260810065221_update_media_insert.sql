-- Allow Storage INSERT policy to validate pending media reservations
-- without exposing pending media_assets rows through normal SELECT RLS.

-- ============================================================
-- RESERVED MEDIA UPLOAD CHECK
-- ============================================================

create or replace function public.can_upload_reserved_media_path(
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
          and asset.status = 'pending'
          and asset.uploaded_by_user_id = auth.uid()
          and asset.storage_path like 'regions/%'
    );
$$;

revoke all on function public.can_upload_reserved_media_path(text)
from public, anon;

grant execute on function public.can_upload_reserved_media_path(text)
to authenticated;


-- ============================================================
-- GENERIC MEDIA STORAGE INSERT
-- ============================================================

drop policy if exists media_generic_insert_reserved
on storage.objects;

create policy media_generic_insert_reserved
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'media'
    and public.can_upload_reserved_media_path(name)
);