create or replace function public.validate_member_avatar_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    avatar_object storage.objects;
    avatar_mime_type text;
    avatar_size bigint;
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

    select object.*
    into avatar_object
    from storage.objects object
    where object.bucket_id = 'media'
      and object.name = new.avatar_path
    limit 1;

    if not found then
        raise exception 'Avatar object does not exist';
    end if;

    avatar_mime_type =
        avatar_object.metadata->>'mimetype';

    avatar_size =
        nullif(
            avatar_object.metadata->>'size',
            ''
        )::bigint;

    if avatar_mime_type not in (
        'image/webp',
        'image/jpeg'
    ) then
        raise exception 'Avatar object has an invalid MIME type';
    end if;

    if avatar_size is null then
        raise exception 'Avatar object size could not be verified';
    end if;

    if avatar_size > 1048576 then
        raise exception 'Avatar object exceeds the 1 MiB limit';
    end if;

    return new;
end;
$$;