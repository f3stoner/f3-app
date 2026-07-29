create table if not exists public.site_weather_cache (
    site_id uuid not null
        references public.sites(id)
        on delete cascade,

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    forecast_date date not null,
    forecast_hour integer not null,

    provider text not null,

    normalized_weather jsonb not null,

    fetched_at timestamp with time zone not null
        default now(),

    expires_at timestamp with time zone not null,

    constraint site_weather_cache_pkey
        primary key (
            site_id,
            forecast_date,
            forecast_hour
        ),

    constraint site_weather_cache_forecast_hour_check
        check (
            forecast_hour >= 0
            and forecast_hour <= 23
        )
);

create index if not exists
    site_weather_cache_expires_at_idx
on public.site_weather_cache (expires_at);