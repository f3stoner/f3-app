create or replace function public.load_public_region_site(
    p_region_slug text,
    p_from_date date default current_date,
    p_to_date date default (current_date + 42)
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    v_region_id uuid;
    v_from_date date;
    v_to_date date;
    v_result jsonb;
begin
    v_from_date := greatest(p_from_date, current_date);
    v_to_date := least(p_to_date, v_from_date + 90);

    if v_to_date < v_from_date then
        raise exception 'Invalid public site date range.';
    end if;

    select r.id
    into v_region_id
    from public.regions r
    join public.region_public_site_config c
      on c.region_id = r.id
    where r.slug = lower(trim(p_region_slug))
      and c.is_enabled = true
    limit 1;

    if v_region_id is null then
        return null;
    end if;

    select jsonb_build_object(
        'version', 1,
        'generatedAt', now(),

        'region',
        jsonb_build_object(
            'slug', r.slug,
            'name', r.name,
            'shortName', c.short_name,
            'tagline', c.tagline,
            'description', c.description,
            'timezone', c.timezone,
            'logoAssetPath', c.logo_asset_path,
            'heroAssetPath', c.hero_asset_path,
            'brand', jsonb_build_object(
                'primaryColor', c.primary_color,
                'secondaryColor', c.secondary_color
            ),
            'links', jsonb_build_object(
                'contact', c.contact_url,
                'join', c.join_url,
                'social', c.social_links
            ),
            'seo', jsonb_build_object(
                'title', c.seo_title,
                'description', c.seo_description
            )
        ),

        'aos',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'slug', ao.slug,
                        'name', ao.name,
                        'description', ao.public_description,
                        'displayOrder', ao.public_display_order,

                        'site',
                        case
                            when s.id is null then null
                            else jsonb_build_object(
                                'name', s.name,
                                'address', s.address,
                                'mapUrl', s.map_url
                            )
                        end,

                        'schedules',
                        coalesce(
                            (
                                select jsonb_agg(
                                    jsonb_build_object(
                                        'weekday', ars.weekday,
                                        'startTime', ars.start_time::text,
                                        'durationMinutes', ars.duration_minutes,
                                        'label', ars.schedule_label,

                                        'site',
                                        case
                                            when schedule_site.id is null then null
                                            else jsonb_build_object(
                                                'name', schedule_site.name,
                                                'address', schedule_site.address,
                                                'mapUrl', schedule_site.map_url
                                            )
                                        end
                                    )
                                    order by
                                        ars.weekday,
                                        ars.start_time
                                )
                                from public.ao_recurring_schedules ars
                                left join public.sites schedule_site
                                  on schedule_site.id = ars.site_id
                                 and schedule_site.region_id = v_region_id
                                where ars.region_id = v_region_id
                                  and ars.ao_id = ao.id
                                  and ars.is_active = true
                                  and (
                                      ars.effective_start_date is null
                                      or ars.effective_start_date <= v_to_date
                                  )
                                  and (
                                      ars.effective_end_date is null
                                      or ars.effective_end_date >= v_from_date
                                  )
                            ),
                            '[]'::jsonb
                        )
                    )
                    order by
                        ao.public_display_order nulls last,
                        ao.name
                )
                from public.aos ao
                left join public.sites s
                  on s.id = ao.default_site_id
                 and s.region_id = v_region_id
                where ao.region_id = v_region_id
                  and ao.is_active = true
                  and ao.is_public = true
            ),
            '[]'::jsonb
        ),

        'calendar',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id', qs.id,
                        'date', qs.date,

                        'startTime',
                        coalesce(
                            nullif(trim(qs.override_time), ''),
                            nullif(trim(qs.start_time::text), ''),
                            nullif(
                                trim(
                                    ao.time_schedule
                                        ->> (extract(dow from qs.date)::integer)::text
                                ),
                                ''
                            ),
                            nullif(trim(ao.time), '')
                        ),

                        'durationMinutes',
                        qs.duration_minutes,

                        'title',
                        qs.override_title,

                        'emphasis',
                        coalesce(
                            qs.custom_emphasis_label,
                            qs.override_emphasis
                        ),

                        'ao',
                        jsonb_build_object(
                            'slug', ao.slug,
                            'name', ao.name
                        ),

                        'site',
                        case
                            when effective_site.id is null then null
                            else jsonb_build_object(
                                'name', effective_site.name,
                                'address', effective_site.address,
                                'mapUrl', effective_site.map_url
                            )
                        end,

                        'qName',
                        m.pax_name
                    )
                    order by
                        qs.date,
                        coalesce(
                            nullif(trim(qs.override_time), ''),
                            nullif(trim(qs.start_time::text), ''),
                            nullif(
                                trim(
                                    ao.time_schedule
                                        ->> (extract(dow from qs.date)::integer)::text
                                ),
                                ''
                            ),
                            nullif(trim(ao.time), '')
                        ) nulls last,
                        ao.name
                )

                from public.q_slots qs

                join public.aos ao
                  on ao.id = qs.ao_id
                 and ao.region_id = v_region_id
                 and ao.is_active = true
                 and ao.is_public = true

                left join public.sites effective_site
                  on effective_site.id = coalesce(
                      qs.site_id,
                      ao.default_site_id
                  )
                 and effective_site.region_id = v_region_id

                left join public.members m
                  on m.id = qs.q_user_id

                where qs.region_id = v_region_id
                  and qs.date between v_from_date and v_to_date
            ),
            '[]'::jsonb
        )
    )
    into v_result
    from public.regions r
    join public.region_public_site_config c
      on c.region_id = r.id
    where r.id = v_region_id;

    return v_result;
end;
$function$;

revoke all on function public.load_public_region_site(text, date, date) from public;

grant execute
on function public.load_public_region_site(text, date, date)
to anon, authenticated;