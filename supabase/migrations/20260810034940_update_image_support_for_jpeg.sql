update storage.buckets
set allowed_mime_types = array[
    'image/webp',
    'image/jpeg'
]::text[]
where id = 'media';


create or replace function public.validate_member_avatar_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.avatar_path is not distinct from old.avatar_path then
        return new;
    end if;

    if new.avatar_path is null then
        return new;
    end if;

    if new.avatar_path !~ (
        '^avatars/' ||
        new.id::text ||
        '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.(webp|jpg)$'
    ) then
        raise exception 'Invalid avatar path';
    end if;

    if not exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'media'
          and object.name = new.avatar_path
    ) then
        raise exception 'Avatar object does not exist';
    end if;

    return new;
end;
$$;


drop policy if exists media_avatar_insert_own_or_superadmin
on storage.objects;

create policy media_avatar_insert_own_or_superadmin
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'media'
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = 'avatars'
    and storage.extension(name) in ('webp', 'jpg')
    and storage.filename(name) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$'
    and (
        (storage.foldername(name))[2] = public.my_member_id()::text
        or public.is_superadmin()
    )
);