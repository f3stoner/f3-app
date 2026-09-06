-- Public branding assets for Q Sites.
--
-- These assets are intentionally stored separately from the private
-- operational media bucket because they must be anonymously readable
-- by public region websites.

alter table public.region_public_site_config
    add column if not exists logo_asset_path text,
    add column if not exists hero_asset_path text;

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'region-public-assets',
    'region-public-assets',
    true,
    3145728,
    array[
        'image/webp',
        'image/jpeg'
    ]::text[]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists
    "region leaders can upload public branding"
    on storage.objects;

create policy
    "region leaders can upload public branding"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'region-public-assets'
    and (storage.foldername(name))[1] = 'regions'
    and (storage.foldername(name))[3] = 'public-site'
    and (storage.foldername(name))[4] in ('logo', 'hero')
    and public.is_region_leader(
        ((storage.foldername(name))[2])::uuid
    )
    and name ~ '^regions/[0-9a-fA-F-]{36}/public-site/(logo|hero)/[0-9a-fA-F-]{36}\.(webp|jpg)$'
);

drop policy if exists
    "region leaders can delete public branding"
    on storage.objects;

create policy
    "region leaders can delete public branding"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'region-public-assets'
    and (storage.foldername(name))[1] = 'regions'
    and (storage.foldername(name))[3] = 'public-site'
    and (storage.foldername(name))[4] in ('logo', 'hero')
    and public.is_region_leader(
        ((storage.foldername(name))[2])::uuid
    )
    and name ~ '^regions/[0-9a-fA-F-]{36}/public-site/(logo|hero)/[0-9a-fA-F-]{36}\.(webp|jpg)$'
);

comment on column public.region_public_site_config.logo_asset_path is
    'Immutable object path in the public region-public-assets bucket.';

comment on column public.region_public_site_config.hero_asset_path is
    'Immutable object path in the public region-public-assets bucket.';