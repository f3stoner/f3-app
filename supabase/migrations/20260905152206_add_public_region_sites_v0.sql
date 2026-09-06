alter table public.regions
add column if not exists slug text;

update public.regions
set slug =
    case id
        when '96c9eef9-3b6e-4365-86cd-51dbeccf231a'::uuid then 'aggieland'
        when 'c05cd413-7171-4017-aacb-61db1e8ca200'::uuid then 'north-katy'
        when '0925d0c8-2c87-4d9c-882a-86efa0ce1c5a'::uuid then 'old-300'
        when '7298b632-4d9a-542f-b65d-d416e5c1e631'::uuid then 'west-houston'
        when '8872e939-5691-450f-ba32-293a8b77d029'::uuid then 'sandbox'
        else regexp_replace(
            regexp_replace(
                lower(trim(name)),
                '[^a-z0-9]+',
                '-',
                'g'
            ),
            '(^-+|-+$)',
            '',
            'g'
        )
    end
where slug is null;

do $$
begin
    if exists (
        select 1
        from public.regions
        where slug is null
           or slug = ''
    ) then
        raise exception 'Every region must have a non-empty slug before constraint creation.';
    end if;

    if exists (
        select slug
        from public.regions
        group by slug
        having count(*) > 1
    ) then
        raise exception 'Duplicate region slugs detected.';
    end if;
end;
$$;

alter table public.regions
alter column slug set not null;

alter table public.regions
add constraint regions_slug_format_check
check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
);

create unique index if not exists regions_slug_unique_idx
on public.regions (slug);


create table if not exists public.region_public_site_config (
    region_id uuid primary key
        references public.regions(id)
        on delete cascade,

    is_enabled boolean not null default false,

    short_name text,
    tagline text,
    description text,
    timezone text not null default 'America/Chicago',

    logo_asset_url text,
    hero_asset_url text,

    primary_color text,
    secondary_color text,

    contact_url text,
    join_url text,

    social_links jsonb not null default '[]'::jsonb,

    seo_title text,
    seo_description text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.region_public_site_config
enable row level security;

revoke all
on table public.region_public_site_config
from anon;

revoke all
on table public.region_public_site_config
from authenticated;

grant all
on table public.region_public_site_config
to service_role;


alter table public.aos
add column if not exists slug text;

alter table public.aos
add column if not exists public_description text;

alter table public.aos
add column if not exists is_public boolean not null default false;

alter table public.aos
add column if not exists public_display_order integer;


update public.aos
set slug = regexp_replace(
    regexp_replace(
        lower(trim(name)),
        '[^a-z0-9]+',
        '-',
        'g'
    ),
    '(^-+|-+$)',
    '',
    'g'
)
where slug is null;

do $$
begin
    if exists (
        select 1
        from public.aos
        where slug is null
           or slug = ''
    ) then
        raise exception 'Every AO must have a non-empty slug before constraint creation.';
    end if;

    if exists (
        select region_id, slug
        from public.aos
        group by region_id, slug
        having count(*) > 1
    ) then
        raise exception 'Duplicate AO slugs detected within a region.';
    end if;
end;
$$;

alter table public.aos
alter column slug set not null;

alter table public.aos
add constraint aos_slug_format_check
check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
);

create unique index if not exists aos_region_slug_unique_idx
on public.aos (region_id, slug);


insert into public.region_public_site_config (
    region_id,
    is_enabled,
    short_name,
    tagline,
    timezone
)
select
    r.id,
    false,
    'Old 300',
    'Free men''s workouts in Washington and Austin Counties.',
    'America/Chicago'
from public.regions r
where r.slug = 'old-300'
on conflict (region_id) do nothing;