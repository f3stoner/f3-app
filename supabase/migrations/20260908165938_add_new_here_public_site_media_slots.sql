begin;

-- ============================================================
-- Expand controlled Q Site media slots for the New Here page.
--
-- Centralize the supported-slot allowlist so future slot additions
-- do not require keeping several independent lists in sync.
-- ============================================================


-- ============================================================
-- 1. Authoritative slot allowlist
-- ============================================================

create or replace function public.is_supported_region_public_site_media_slot(
    p_slot_key text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
    select btrim(p_slot_key) in (
        'home_community_primary',
        'home_community_secondary',
        'new_here_workout',
        'new_here_coffeeteria'
    );
$function$;

revoke all
on function public.is_supported_region_public_site_media_slot(text)
from public, anon, authenticated;


-- ============================================================
-- 2. Update slot table constraint
-- ============================================================

alter table public.region_public_site_media_slots
    drop constraint if exists
        region_public_site_media_slots_slot_key_check;

alter table public.region_public_site_media_slots
    add constraint
        region_public_site_media_slots_slot_key_check
    check (
        public.is_supported_region_public_site_media_slot(slot_key)
    );


-- ============================================================
-- 3. Update slot assignment command
-- ============================================================

create or replace function public.set_region_public_site_media_slot(
    p_region_id uuid,
    p_slot_key text,
    p_asset_id uuid,
    p_alt_text text,
    p_focal_x numeric,
    p_focal_y numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_asset public.region_public_site_media_assets%rowtype;
    v_slot_key text;
    v_alt_text text;
    v_focal_x numeric;
    v_focal_y numeric;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    v_slot_key := btrim(p_slot_key);
    v_alt_text := nullif(btrim(p_alt_text), '');
    v_focal_x := coalesce(p_focal_x, 0.5);
    v_focal_y := coalesce(p_focal_y, 0.5);

    if not public.is_supported_region_public_site_media_slot(v_slot_key) then
        raise exception 'Unsupported public site media slot';
    end if;

    if v_alt_text is null then
        raise exception 'Alt text is required';
    end if;

    if char_length(v_alt_text) > 300 then
        raise exception 'Alt text must be 300 characters or fewer';
    end if;

    if v_focal_x < 0
       or v_focal_x > 1
       or v_focal_y < 0
       or v_focal_y > 1 then
        raise exception 'Focal point must be between 0 and 1';
    end if;

    select *
    into v_asset
    from public.region_public_site_media_assets
    where id = p_asset_id
      and region_id = p_region_id;

    if not found then
        raise exception 'Public site media asset does not belong to this region';
    end if;

    if v_asset.status <> 'ready' then
        raise exception 'Public site media asset is not ready';
    end if;

    insert into public.region_public_site_media_slots (
        region_id,
        slot_key,
        asset_id,
        alt_text,
        focal_x,
        focal_y,
        updated_at,
        updated_by_user_id
    )
    values (
        p_region_id,
        v_slot_key,
        v_asset.id,
        v_alt_text,
        v_focal_x,
        v_focal_y,
        now(),
        auth.uid()
    )
    on conflict (
        region_id,
        slot_key
    )
    do update
    set
        asset_id = excluded.asset_id,
        alt_text = excluded.alt_text,
        focal_x = excluded.focal_x,
        focal_y = excluded.focal_y,
        updated_at = now(),
        updated_by_user_id = auth.uid();

    return jsonb_build_object(
        'regionId', p_region_id,
        'slotKey', v_slot_key,
        'assetId', v_asset.id,
        'storagePath', v_asset.storage_path,
        'altText', v_alt_text,
        'focalX', v_focal_x,
        'focalY', v_focal_y
    );
end;
$function$;

revoke all
on function public.set_region_public_site_media_slot(
    uuid,
    text,
    uuid,
    text,
    numeric,
    numeric
)
from public, anon;

grant execute
on function public.set_region_public_site_media_slot(
    uuid,
    text,
    uuid,
    text,
    numeric,
    numeric
)
to authenticated;


-- ============================================================
-- 4. Update slot clear command
-- ============================================================

create or replace function public.clear_region_public_site_media_slot(
    p_region_id uuid,
    p_slot_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_slot_key text;
    v_asset_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    v_slot_key := btrim(p_slot_key);

    if not public.is_supported_region_public_site_media_slot(v_slot_key) then
        raise exception 'Unsupported public site media slot';
    end if;

    delete from public.region_public_site_media_slots
    where region_id = p_region_id
      and slot_key = v_slot_key
    returning asset_id
    into v_asset_id;

    return jsonb_build_object(
        'regionId', p_region_id,
        'slotKey', v_slot_key,
        'assetId', v_asset_id
    );
end;
$function$;

revoke all
on function public.clear_region_public_site_media_slot(
    uuid,
    text
)
from public, anon;

grant execute
on function public.clear_region_public_site_media_slot(
    uuid,
    text
)
to authenticated;


-- ============================================================
-- 5. Update public site loader
-- ============================================================

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
      and r.environment = 'production'
      and c.is_enabled = true
    limit 1;

    if v_region_id is null then
        return null;
    end if;

    select jsonb_build_object(
        'version', 2,
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

        'media',
        coalesce(
            (
                select jsonb_object_agg(
                    s.slot_key,
                    jsonb_build_object(
                        'storagePath', a.storage_path,
                        'altText', s.alt_text,
                        'focalX', s.focal_x,
                        'focalY', s.focal_y
                    )
                )
                from public.region_public_site_media_slots s
                join public.region_public_site_media_assets a
                  on a.id = s.asset_id
                 and a.region_id = s.region_id
                 and a.status = 'ready'
                where s.region_id = v_region_id
                  and public.is_supported_region_public_site_media_slot(
                      s.slot_key
                  )
            ),
            '{}'::jsonb
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
    where r.id = v_region_id
      and r.environment = 'production';

    return v_result;
end;
$function$;

revoke all
on function public.load_public_region_site(
    text,
    date,
    date
)
from public;

grant execute
on function public.load_public_region_site(
    text,
    date,
    date
)
to anon, authenticated;

commit;