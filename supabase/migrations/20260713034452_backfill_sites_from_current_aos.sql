begin;

with ranked_site_sources as (
    select
        a.region_id,
        trim(a.location_name) as site_name,
        a.address,
        a.map_url,
        a.latitude,
        a.longitude,
        a.weather_location_label,
        a.weather_enabled,

        row_number() over (
            partition by
                a.region_id,
                lower(trim(a.location_name))
            order by
                -- Prefer these canonical AO records when multiple
                -- AOs currently share the same physical Site.
                case
                    when a.id = '7034e108-ddea-43ff-8cb5-1930b65bc711'::uuid
                        then 1 -- The Cave / Wolf Pen Creek
                    when a.id = '1108260a-b8a9-4551-9488-c294c943ee9e'::uuid
                        then 1 -- The Mine / Tiffany Park
                    when a.id = 'b59e5144-fc82-457e-b866-cfa7d6434b5d'::uuid
                        then 1 -- The Moat AM / Castlegate II
                    else 2
                end,
                a.name
        ) as source_rank
    from public.aos a
    where nullif(trim(a.location_name), '') is not null
      and lower(trim(a.location_name)) <> 'various'
)
insert into public.sites (
    region_id,
    name,
    address,
    map_url,
    latitude,
    longitude,
    weather_location_label,
    weather_enabled,
    is_active
)
select
    region_id,
    site_name,
    address,
    map_url,
    latitude,
    longitude,
    weather_location_label,
    weather_enabled,
    true
from ranked_site_sources
where source_rank = 1
on conflict (
    region_id,
    (lower(trim(name)))
)
do nothing;

commit;