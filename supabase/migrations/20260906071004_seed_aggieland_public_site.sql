insert into public.region_public_site_config (
    region_id,
    is_enabled,
    short_name,
    tagline,
    description,
    timezone,
    seo_title,
    seo_description
)
values (
    '96c9eef9-3b6e-4365-86cd-51dbeccf231a',
    false,
    'Aggieland',
    'Free men''s workouts in Bryan and College Station.',
    'F3 Aggieland is a free, peer-led men''s workout community serving Bryan, College Station, and the surrounding area.',
    'America/Chicago',
    'F3 Aggieland | Free Men''s Workouts in Bryan & College Station',
    'Find free, outdoor, peer-led F3 workouts across Bryan, College Station, and the Aggieland region.'
)
on conflict (region_id) do update
set
    short_name = excluded.short_name,
    tagline = excluded.tagline,
    description = excluded.description,
    timezone = excluded.timezone,
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    updated_at = now();