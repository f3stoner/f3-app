create or replace function public.save_site_command(
    p_action text,
    p_region_id uuid,
    p_site_id uuid,
    p_name text,
    p_address text default null,
    p_map_url text default null,
    p_latitude numeric default null,
    p_longitude numeric default null,
    p_weather_location_label text default null,
    p_weather_enabled boolean default true,
    p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_profile_id uuid;
    v_is_superadmin boolean := false;
    v_is_regional_slt boolean := false;
    v_site public.sites;
    v_normalized_name text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'authentication_required';
    end if;

    if p_region_id is null then
        raise exception 'region_id_required';
    end if;

    if p_site_id is null then
        raise exception 'site_id_required';
    end if;

    v_normalized_name :=
        regexp_replace(
            trim(coalesce(p_name, '')),
            '\s+',
            ' ',
            'g'
        );

    if v_normalized_name = '' then
        raise exception 'site_name_required';
    end if;

    select
        p.id,
        p.role = 'superadmin'
    into
        v_profile_id,
        v_is_superadmin
    from public.profiles p
    where p.id = v_user_id;

    if v_profile_id is null then
        raise exception 'profile_not_found';
    end if;

    select exists (
        select 1
        from public.profile_region_positions prp
        where prp.profile_id = v_profile_id
        and prp.region_id = p_region_id
    )
    into v_is_regional_slt;

    if not (
        v_is_superadmin or
        v_is_regional_slt
    ) then
        raise exception 'site_management_forbidden';
    end if;

    if p_action = 'create' then
        insert into public.sites (
            id,
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
        values (
            p_site_id,
            p_region_id,
            v_normalized_name,
            nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_map_url, '')), ''),
            p_latitude,
            p_longitude,
            nullif(
                trim(
                    coalesce(
                        p_weather_location_label,
                        ''
                    )
                ),
                ''
            ),
            coalesce(p_weather_enabled, true),
            coalesce(p_is_active, true)
        )
        returning *
        into v_site;

    elsif p_action = 'update' then
        update public.sites
        set
            name = v_normalized_name,
            address =
                nullif(
                    trim(coalesce(p_address, '')),
                    ''
                ),
            map_url =
                nullif(
                    trim(coalesce(p_map_url, '')),
                    ''
                ),
            latitude = p_latitude,
            longitude = p_longitude,
            weather_location_label =
                nullif(
                    trim(
                        coalesce(
                            p_weather_location_label,
                            ''
                        )
                    ),
                    ''
                ),
            weather_enabled =
                coalesce(p_weather_enabled, true),
            is_active =
                coalesce(p_is_active, true),
            updated_at = now()
        where id = p_site_id
          and region_id = p_region_id
        returning *
        into v_site;

        if v_site.id is null then
            raise exception 'site_not_found';
        end if;

    else
        raise exception 'invalid_site_action';
    end if;

    return jsonb_build_object(
        'site',
        to_jsonb(v_site)
    );
end;
$$;

revoke all
on function public.save_site_command(
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    numeric,
    numeric,
    text,
    boolean,
    boolean
)
from public;

grant execute
on function public.save_site_command(
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    numeric,
    numeric,
    text,
    boolean,
    boolean
)
to authenticated;