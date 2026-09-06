-- Authenticated management API for Q Sites public configuration.
--
-- Direct authenticated access to region_public_site_config remains revoked.
-- These functions are the controlled read/write boundary.

create or replace function public.load_region_public_site_config(
    p_region_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_config public.region_public_site_config%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    select *
    into v_config
    from public.region_public_site_config
    where region_id = p_region_id;

    if not found then
        return null;
    end if;

    return jsonb_build_object(
        'regionId', v_config.region_id,
        'isEnabled', v_config.is_enabled,
        'shortName', v_config.short_name,
        'tagline', v_config.tagline,
        'description', v_config.description,
        'timezone', v_config.timezone,
        'logoAssetPath', v_config.logo_asset_path,
        'heroAssetPath', v_config.hero_asset_path,
        'primaryColor', v_config.primary_color,
        'secondaryColor', v_config.secondary_color,
        'updatedAt', v_config.updated_at
    );
end;
$$;

revoke all
on function public.load_region_public_site_config(uuid)
from public;

revoke all
on function public.load_region_public_site_config(uuid)
from anon;

grant execute
on function public.load_region_public_site_config(uuid)
to authenticated;


create or replace function public.save_region_public_site_config(
    p_region_id uuid,
    p_tagline text,
    p_description text,
    p_primary_color text,
    p_secondary_color text,
    p_logo_asset_path text,
    p_hero_asset_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_config public.region_public_site_config%rowtype;
    v_logo_object storage.objects%rowtype;
    v_hero_object storage.objects%rowtype;

    v_previous_logo_path text;
    v_previous_hero_path text;

    v_tagline text;
    v_description text;
    v_primary_color text;
    v_secondary_color text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    v_tagline := nullif(btrim(p_tagline), '');
    v_description := nullif(btrim(p_description), '');
    v_primary_color := nullif(btrim(p_primary_color), '');
    v_secondary_color := nullif(btrim(p_secondary_color), '');

    if v_tagline is not null
       and char_length(v_tagline) > 160 then
        raise exception 'Tagline must be 160 characters or fewer';
    end if;

    if v_description is not null
       and char_length(v_description) > 1000 then
        raise exception 'Description must be 1000 characters or fewer';
    end if;

    if v_primary_color is not null
       and v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
        raise exception 'Primary color must use #RRGGBB format';
    end if;

    if v_secondary_color is not null
       and v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
        raise exception 'Secondary color must use #RRGGBB format';
    end if;

    if p_logo_asset_path is not null then
        if p_logo_asset_path !~
            (
                '^regions/' ||
                p_region_id::text ||
                '/public-site/logo/' ||
                '[0-9a-fA-F-]{36}\.(webp|jpg)$'
            ) then
            raise exception 'Invalid logo asset path';
        end if;

        select *
        into v_logo_object
        from storage.objects
        where bucket_id = 'region-public-assets'
          and name = p_logo_asset_path;

        if not found then
            raise exception 'Logo asset does not exist';
        end if;

        if coalesce(
            v_logo_object.metadata->>'mimetype',
            ''
        ) not in (
            'image/webp',
            'image/jpeg'
        ) then
            raise exception 'Invalid logo MIME type';
        end if;

        if coalesce(
            (v_logo_object.metadata->>'size')::bigint,
            0
        ) > 3145728 then
            raise exception 'Logo asset exceeds size limit';
        end if;
    end if;

    if p_hero_asset_path is not null then
        if p_hero_asset_path !~
            (
                '^regions/' ||
                p_region_id::text ||
                '/public-site/hero/' ||
                '[0-9a-fA-F-]{36}\.(webp|jpg)$'
            ) then
            raise exception 'Invalid hero asset path';
        end if;

        select *
        into v_hero_object
        from storage.objects
        where bucket_id = 'region-public-assets'
          and name = p_hero_asset_path;

        if not found then
            raise exception 'Hero asset does not exist';
        end if;

        if coalesce(
            v_hero_object.metadata->>'mimetype',
            ''
        ) not in (
            'image/webp',
            'image/jpeg'
        ) then
            raise exception 'Invalid hero MIME type';
        end if;

        if coalesce(
            (v_hero_object.metadata->>'size')::bigint,
            0
        ) > 3145728 then
            raise exception 'Hero asset exceeds size limit';
        end if;
    end if;

    select *
    into v_config
    from public.region_public_site_config
    where region_id = p_region_id
    for update;

    if not found then
        raise exception 'Public site configuration does not exist';
    end if;

    v_previous_logo_path := v_config.logo_asset_path;
    v_previous_hero_path := v_config.hero_asset_path;

    update public.region_public_site_config
    set
        tagline = v_tagline,
        description = v_description,
        primary_color = upper(v_primary_color),
        secondary_color = upper(v_secondary_color),
        logo_asset_path = p_logo_asset_path,
        hero_asset_path = p_hero_asset_path,
        updated_at = now()
    where region_id = p_region_id
    returning *
    into v_config;

    return jsonb_build_object(
        'regionId', v_config.region_id,
        'isEnabled', v_config.is_enabled,
        'shortName', v_config.short_name,
        'tagline', v_config.tagline,
        'description', v_config.description,
        'timezone', v_config.timezone,
        'logoAssetPath', v_config.logo_asset_path,
        'heroAssetPath', v_config.hero_asset_path,
        'primaryColor', v_config.primary_color,
        'secondaryColor', v_config.secondary_color,
        'previousLogoAssetPath', v_previous_logo_path,
        'previousHeroAssetPath', v_previous_hero_path,
        'updatedAt', v_config.updated_at
    );
end;
$$;

revoke all
on function public.save_region_public_site_config(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text
)
from public;

revoke all
on function public.save_region_public_site_config(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text
)
from anon;

grant execute
on function public.save_region_public_site_config(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text
)
to authenticated;