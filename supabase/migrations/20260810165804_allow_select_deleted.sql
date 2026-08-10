-- Allow Storage delete operations to SELECT deleted media objects
-- long enough for the Storage API to remove them.

drop policy if exists media_generic_select_for_delete
on storage.objects;

create policy media_generic_select_for_delete
on storage.objects
for select
to authenticated
using (
    bucket_id = 'media'
    and storage.allow_only_operation('object.delete')
    and public.can_delete_media_path(name)
);