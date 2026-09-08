begin;

-- ============================================================
-- Public Q Site media
--
-- Reusable public media assets are stored separately from slot
-- assignments so the same regional photo can later be reused in
-- multiple controlled presentation slots.
--
-- Storage continues to use the existing public
-- region-public-assets bucket.
-- ============================================================


-- ============================================================
-- 1. Public-site media assets
-- ============================================================

create table if not exists public.region_public_site_media_assets (
    id uuid primary key,
    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    storage_path text not null unique,
    mime_type text not null,
    file_size_bytes bigint not null,
    width integer,
    height integer,

    status text not null default 'pending',

    uploaded_by_user_id uuid not null,

    created_at timestamptz not null default now(),
    ready_at timestamptz,
    deleted_at timestamptz,

    constraint region_public_site_media_assets_id_region_unique
        unique (id, region_id),

    constraint region_public_site_media_assets_mime_check
        check (
            mime_type in (
                'image/webp',
                'image/jpeg'
            )
        ),

    constraint region_public_site_media_assets_size_check
        check (
            file_size_bytes > 0
            and file_size_bytes <= 3145728
        ),

    constraint region_public_site_media_assets_width_check
        check (
            width is null
            or (
                width > 0
                and width <= 1600
            )
        ),

    constraint region_public_site_media_assets_height_check
        check (
            height is null
            or (
                height > 0
                and height <= 1600
            )
        ),

    constraint region_public_site_media_assets_status_check
        check (
            status in (
                'pending',
                'ready',
                'deleted'
            )
        )
);

create index if not exists
    region_public_site_media_assets_region_status_idx
on public.region_public_site_media_assets (
    region_id,
    status
);

alter table public.region_public_site_media_assets
    enable row level security;

revoke all
on table public.region_public_site_media_assets
from public, anon, authenticated;

grant all
on table public.region_public_site_media_assets
to service_role;


-- ============================================================
-- 2. Public-site media slot assignments
-- ============================================================

create table if not exists public.region_public_site_media_slots (
    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    slot_key text not null,

    asset_id uuid not null,

    alt_text text not null,

    focal_x numeric not null default 0.5,
    focal_y numeric not null default 0.5,

    updated_at timestamptz not null default now(),
    updated_by_user_id uuid not null,

    primary key (
        region_id,
        slot_key
    ),

    constraint region_public_site_media_slots_asset_region_fk
        foreign key (
            asset_id,
            region_id
        )
        references public.region_public_site_media_assets (
            id,
            region_id
        ),

    constraint region_public_site_media_slots_slot_key_check
        check (
            slot_key in (
                'home_community_primary',
                'home_community_secondary'
            )
        ),

    constraint region_public_site_media_slots_alt_text_check
        check (
            char_length(btrim(alt_text)) between 1 and 300
        ),

    constraint region_public_site_media_slots_focal_x_check
        check (
            focal_x >= 0
            and focal_x <= 1
        ),

    constraint region_public_site_media_slots_focal_y_check
        check (
            focal_y >= 0
            and focal_y <= 1
        )
);

create index if not exists
    region_public_site_media_slots_asset_idx
on public.region_public_site_media_slots (
    asset_id
);

alter table public.region_public_site_media_slots
    enable row level security;

revoke all
on table public.region_public_site_media_slots
from public, anon, authenticated;

grant all
on table public.region_public_site_media_slots
to service_role;


-- ============================================================
-- 3. Storage authorization helpers
--
-- These functions allow Storage policies to verify that a media
-- upload was first reserved through the controlled RPC.
--
-- A delete is allowed only after the asset has been marked
-- deleted through the controlled RPC.
-- ============================================================

create or replace function public.can_upload_region_public_site_media_object(
    p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select
        auth.uid() is not null
        and exists (
            select 1
            from public.region_public_site_media_assets a
            where a.storage_path = p_storage_path
              and a.status = 'pending'
              and a.uploaded_by_user_id = auth.uid()
              and public.is_region_leader(a.region_id)
        );
$function$;

revoke all
on function public.can_upload_region_public_site_media_object(text)
from public, anon;

grant execute
on function public.can_upload_region_public_site_media_object(text)
to authenticated;


create or replace function public.can_delete_region_public_site_media_object(
    p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select
        auth.uid() is not null
        and exists (
            select 1
            from public.region_public_site_media_assets a
            where a.storage_path = p_storage_path
              and a.status = 'deleted'
              and public.is_region_leader(a.region_id)
        );
$function$;

revoke all
on function public.can_delete_region_public_site_media_object(text)
from public, anon;

grant execute
on function public.can_delete_region_public_site_media_object(text)
to authenticated;


-- ============================================================
-- 4. Storage policies for general public-site media
--
-- Existing logo/hero policies remain unchanged.
-- ============================================================

drop policy if exists
    "region leaders can upload public site media"
    on storage.objects;

create policy
    "region leaders can upload public site media"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'region-public-assets'
    and name ~ '^regions/[0-9a-fA-F-]{36}/public-site/media/[0-9a-fA-F-]{36}\.(webp|jpg)$'
    and public.can_upload_region_public_site_media_object(name)
);


drop policy if exists
    "region leaders can delete public site media"
    on storage.objects;

create policy
    "region leaders can delete public site media"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'region-public-assets'
    and name ~ '^regions/[0-9a-fA-F-]{36}/public-site/media/[0-9a-fA-F-]{36}\.(webp|jpg)$'
    and public.can_delete_region_public_site_media_object(name)
);


-- ============================================================
-- 5. Reserve public-site media asset
-- ============================================================

create or replace function public.reserve_region_public_site_media_asset(
    p_region_id uuid,
    p_mime_type text,
    p_file_size_bytes bigint,
    p_width integer,
    p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_asset_id uuid;
    v_extension text;
    v_storage_path text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    if p_mime_type not in (
        'image/webp',
        'image/jpeg'
    ) then
        raise exception 'Unsupported public site media MIME type';
    end if;

    if p_file_size_bytes is null
       or p_file_size_bytes <= 0
       or p_file_size_bytes > 3145728 then
        raise exception 'Public site media exceeds size limit';
    end if;

    if p_width is not null
       and (
           p_width <= 0
           or p_width > 1600
       ) then
        raise exception 'Invalid public site media width';
    end if;

    if p_height is not null
       and (
           p_height <= 0
           or p_height > 1600
       ) then
        raise exception 'Invalid public site media height';
    end if;

    v_asset_id := gen_random_uuid();

    v_extension :=
        case
            when p_mime_type = 'image/webp' then 'webp'
            when p_mime_type = 'image/jpeg' then 'jpg'
        end;

    v_storage_path :=
        'regions/' ||
        p_region_id::text ||
        '/public-site/media/' ||
        v_asset_id::text ||
        '.' ||
        v_extension;

    insert into public.region_public_site_media_assets (
        id,
        region_id,
        storage_path,
        mime_type,
        file_size_bytes,
        width,
        height,
        status,
        uploaded_by_user_id
    )
    values (
        v_asset_id,
        p_region_id,
        v_storage_path,
        p_mime_type,
        p_file_size_bytes,
        p_width,
        p_height,
        'pending',
        auth.uid()
    );

    return jsonb_build_object(
        'assetId', v_asset_id,
        'storagePath', v_storage_path,
        'mimeType', p_mime_type
    );
end;
$function$;

revoke all
on function public.reserve_region_public_site_media_asset(
    uuid,
    text,
    bigint,
    integer,
    integer
)
from public, anon;

grant execute
on function public.reserve_region_public_site_media_asset(
    uuid,
    text,
    bigint,
    integer,
    integer
)
to authenticated;


-- ============================================================
-- 6. Finalize public-site media asset
-- ============================================================

create or replace function public.finalize_region_public_site_media_asset(
    p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_asset public.region_public_site_media_assets%rowtype;
    v_object storage.objects%rowtype;

    v_actual_mime text;
    v_actual_size bigint;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select *
    into v_asset
    from public.region_public_site_media_assets
    where id = p_asset_id
    for update;

    if not found then
        raise exception 'Public site media asset does not exist';
    end if;

    if not public.is_region_leader(v_asset.region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    if v_asset.status = 'deleted' then
        raise exception 'Public site media asset has been deleted';
    end if;

    if v_asset.status = 'ready' then
        return jsonb_build_object(
            'assetId', v_asset.id,
            'regionId', v_asset.region_id,
            'storagePath', v_asset.storage_path,
            'mimeType', v_asset.mime_type,
            'fileSizeBytes', v_asset.file_size_bytes,
            'width', v_asset.width,
            'height', v_asset.height,
            'status', v_asset.status
        );
    end if;

    if v_asset.storage_path !~
        (
            '^regions/' ||
            v_asset.region_id::text ||
            '/public-site/media/' ||
            v_asset.id::text ||
            '\.(webp|jpg)$'
        ) then
        raise exception 'Invalid public site media asset path';
    end if;

    select *
    into v_object
    from storage.objects
    where bucket_id = 'region-public-assets'
      and name = v_asset.storage_path;

    if not found then
        raise exception 'Uploaded public site media object does not exist';
    end if;

    v_actual_mime :=
        coalesce(
            v_object.metadata->>'mimetype',
            ''
        );

    v_actual_size :=
        coalesce(
            (v_object.metadata->>'size')::bigint,
            0
        );

    if v_actual_mime not in (
        'image/webp',
        'image/jpeg'
    ) then
        raise exception 'Invalid public site media MIME type';
    end if;

    if v_actual_mime <> v_asset.mime_type then
        raise exception 'Public site media MIME type does not match reservation';
    end if;

    if v_actual_size <= 0
       or v_actual_size > 3145728 then
        raise exception 'Public site media object exceeds size limit';
    end if;

    if v_actual_mime = 'image/webp'
       and v_asset.storage_path !~ '\.webp$' then
        raise exception 'Public site media extension does not match MIME type';
    end if;

    if v_actual_mime = 'image/jpeg'
       and v_asset.storage_path !~ '\.jpg$' then
        raise exception 'Public site media extension does not match MIME type';
    end if;

    update public.region_public_site_media_assets
    set
        file_size_bytes = v_actual_size,
        status = 'ready',
        ready_at = now()
    where id = v_asset.id
    returning *
    into v_asset;

    return jsonb_build_object(
        'assetId', v_asset.id,
        'regionId', v_asset.region_id,
        'storagePath', v_asset.storage_path,
        'mimeType', v_asset.mime_type,
        'fileSizeBytes', v_asset.file_size_bytes,
        'width', v_asset.width,
        'height', v_asset.height,
        'status', v_asset.status
    );
end;
$function$;

revoke all
on function public.finalize_region_public_site_media_asset(uuid)
from public, anon;

grant execute
on function public.finalize_region_public_site_media_asset(uuid)
to authenticated;


-- ============================================================
-- 7. Set public-site media slot
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

    if v_slot_key not in (
        'home_community_primary',
        'home_community_secondary'
    ) then
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
-- 8. Clear public-site media slot
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

    if v_slot_key not in (
        'home_community_primary',
        'home_community_secondary'
    ) then
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
-- 9. Remove reusable media asset
--
-- Assets cannot be removed while assigned to any slot.
--
-- The row is intentionally retained with status=deleted so the
-- Storage DELETE policy can still authorize removal of the
-- physical object after this RPC succeeds.
-- ============================================================

create or replace function public.remove_region_public_site_media_asset(
    p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_asset public.region_public_site_media_assets%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select *
    into v_asset
    from public.region_public_site_media_assets
    where id = p_asset_id
    for update;

    if not found then
        raise exception 'Public site media asset does not exist';
    end if;

    if not public.is_region_leader(v_asset.region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    if exists (
        select 1
        from public.region_public_site_media_slots s
        where s.asset_id = v_asset.id
    ) then
        raise exception 'Public site media asset is still assigned to a slot';
    end if;

    if v_asset.status <> 'deleted' then
        update public.region_public_site_media_assets
        set
            status = 'deleted',
            deleted_at = now()
        where id = v_asset.id
        returning *
        into v_asset;
    end if;

    return jsonb_build_object(
        'assetId', v_asset.id,
        'regionId', v_asset.region_id,
        'storagePath', v_asset.storage_path,
        'status', v_asset.status
    );
end;
$function$;

revoke all
on function public.remove_region_public_site_media_asset(uuid)
from public, anon;

grant execute
on function public.remove_region_public_site_media_asset(uuid)
to authenticated;


-- ============================================================
-- 10. Admin loader
-- ============================================================

create or replace function public.load_region_public_site_media(
    p_region_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception 'Not authorized to manage this region';
    end if;

    return jsonb_build_object(
        'assets',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'assetId', a.id,
                        'storagePath', a.storage_path,
                        'mimeType', a.mime_type,
                        'fileSizeBytes', a.file_size_bytes,
                        'width', a.width,
                        'height', a.height,
                        'createdAt', a.created_at,
                        'readyAt', a.ready_at
                    )
                    order by a.created_at desc
                )
                from public.region_public_site_media_assets a
                where a.region_id = p_region_id
                  and a.status = 'ready'
            ),
            '[]'::jsonb
        ),

        'slots',
        coalesce(
            (
                select jsonb_object_agg(
                    s.slot_key,
                    jsonb_build_object(
                        'assetId', a.id,
                        'storagePath', a.storage_path,
                        'altText', s.alt_text,
                        'focalX', s.focal_x,
                        'focalY', s.focal_y,
                        'updatedAt', s.updated_at
                    )
                )
                from public.region_public_site_media_slots s
                join public.region_public_site_media_assets a
                  on a.id = s.asset_id
                 and a.region_id = s.region_id
                 and a.status = 'ready'
                where s.region_id = p_region_id
            ),
            '{}'::jsonb
        )
    );
end;
$function$;

revoke all
on function public.load_region_public_site_media(uuid)
from public, anon;

grant execute
on function public.load_region_public_site_media(uuid)
to authenticated;


-- ============================================================
-- 11. Extend public Q Site payload
--
-- Only assigned, ready, allowlisted media leaves the database.
-- The asset library itself is never exposed anonymously.
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
                  and s.slot_key in (
                      'home_community_primary',
                      'home_community_secondary'
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


comment on table public.region_public_site_media_assets is
    'Reusable public image assets uploaded for Q Sites.';

comment on table public.region_public_site_media_slots is
    'Controlled presentation-slot assignments for Q Site public media.';

comment on column public.region_public_site_media_slots.alt_text is
    'Context-specific accessible description for this media placement.';

comment on column public.region_public_site_media_slots.focal_x is
    'Horizontal image focal point from 0 to 1.';

comment on column public.region_public_site_media_slots.focal_y is
    'Vertical image focal point from 0 to 1.';


commit;