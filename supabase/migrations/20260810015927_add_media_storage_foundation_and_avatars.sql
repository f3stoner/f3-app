-- Add media storage foundation and member avatars.

-- ============================================================
-- MEMBERS
-- ============================================================

alter table public.members
add column if not exists avatar_path text;

comment on column public.members.avatar_path is
    'Private Supabase Storage object path for the member avatar; never a signed URL.';


-- ============================================================
-- AUTH HELPERS
-- ============================================================

create or replace function public.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select profile.member_id
    from public.profiles profile
    where profile.id = auth.uid()
    limit 1;
$$;

revoke all on function public.my_member_id() from public, anon;
grant execute on function public.my_member_id() to authenticated;


create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.role = 'superadmin'
    );
$$;

revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;


-- ============================================================
-- STORAGE BUCKET
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'media',
    'media',
    false,
    1048576,
    array['image/webp']::text[]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- AVATAR PATH VALIDATION
--
-- Important because members can already UPDATE their own row.
-- This prevents direct table updates from bypassing avatar rules.
-- ============================================================

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
        '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.webp$'
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

drop trigger if exists validate_member_avatar_path
on public.members;

create trigger validate_member_avatar_path
before update of avatar_path on public.members
for each row
execute function public.validate_member_avatar_path();


-- ============================================================
-- AVATAR MUTATION RPC
-- ============================================================

create or replace function public.set_member_avatar(
    p_member_id uuid,
    p_avatar_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_member_id uuid;
    caller_is_superadmin boolean;
    previous_path text;
    updated_member public.members;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    caller_member_id := public.my_member_id();
    caller_is_superadmin := public.is_superadmin();

    if caller_member_id is distinct from p_member_id
       and not caller_is_superadmin then
        raise exception 'Not authorized to manage this avatar';
    end if;

    select member.avatar_path
    into previous_path
    from public.members member
    where member.id = p_member_id
    for update;

    if not found then
        raise exception 'Member not found';
    end if;

    update public.members
    set avatar_path = p_avatar_path
    where id = p_member_id
    returning *
    into updated_member;

    return jsonb_build_object(
        'member',
        to_jsonb(updated_member),
        'previous_avatar_path',
        previous_path
    );
end;
$$;

revoke all on function public.set_member_avatar(uuid, text)
from public, anon;

grant execute on function public.set_member_avatar(uuid, text)
to authenticated;


-- ============================================================
-- STORAGE POLICIES
-- ============================================================

drop policy if exists media_avatar_read_authenticated
on storage.objects;

create policy media_avatar_read_authenticated
on storage.objects
for select
to authenticated
using (
    bucket_id = 'media'
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = 'avatars'
);


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
    and storage.extension(name) = 'webp'
    and storage.filename(name) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    and (
        (storage.foldername(name))[2] = public.my_member_id()::text
        or public.is_superadmin()
    )
);


drop policy if exists media_avatar_delete_own_or_superadmin
on storage.objects;

create policy media_avatar_delete_own_or_superadmin
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'media'
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = 'avatars'
    and (
        (storage.foldername(name))[2] = public.my_member_id()::text
        or public.is_superadmin()
    )
);

-- Intentionally no UPDATE policy.
-- Avatar objects are immutable and uploads should use upsert: false.