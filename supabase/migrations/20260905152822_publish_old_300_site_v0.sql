/*
 * Publish the initial Old 300 Q Site.
 *
 * This migration intentionally publishes only:
 * - the Old 300 region public-site configuration
 * - The Hub
 * - The Melt Shop
 *
 * No other region or AO is made public.
 */


update public.aos
set
    is_public = true,
    public_display_order = 1,
    public_description = 'F3 Old 300 workout location in Brenham.'
where region_id = (
    select id
    from public.regions
    where slug = 'old-300'
)
and slug = 'the-hub';


update public.aos
set
    is_public = true,
    public_display_order = 2,
    public_description = 'F3 Old 300 workout location in Bellville.'
where region_id = (
    select id
    from public.regions
    where slug = 'old-300'
)
and slug = 'the-melt-shop';


update public.region_public_site_config
set
    is_enabled = true,
    short_name = 'Old 300',
    tagline = 'Free men''s workouts in Washington and Austin Counties.',
    description = 'F3 Old 300 is a free, peer-led men''s workout community serving Brenham, Bellville, and the surrounding area.',
    timezone = 'America/Chicago',
    seo_title = 'F3 Old 300 | Free Men''s Workouts in Brenham & Bellville',
    seo_description = 'Find free, outdoor, peer-led F3 workouts in Brenham, Bellville, and the Old 300 region.',
    updated_at = now()
where region_id = (
    select id
    from public.regions
    where slug = 'old-300'
);