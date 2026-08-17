create or replace function public.resolve_region_import_identity(
    p_source_identity_id uuid,
    p_resolution_type text,
    p_canonical_member_id uuid default null,
    p_notes text default null
)
returns public.region_import_identity_resolutions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();
    source_identity public.region_import_source_identities%rowtype;
    previous_resolution public.region_import_identity_resolutions%rowtype;
    created_resolution public.region_import_identity_resolutions%rowtype;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can resolve import identities'
            using errcode = '42501';
    end if;

    if p_source_identity_id is null then
        raise exception 'Source identity is required'
            using errcode = '22023';
    end if;

    if p_resolution_type not in (
        'match_existing',
        'create_new',
        'deferred',
        'ignored',
        'needs_superadmin'
    ) then
        raise exception 'Unsupported identity resolution type'
            using errcode = '22023';
    end if;

    select *
    into source_identity
    from public.region_import_source_identities
    where id = p_source_identity_id
    for update;

    if source_identity.id is null then
        raise exception 'Source identity not found'
            using errcode = '22023';
    end if;

    if p_resolution_type = 'match_existing' then
        if p_canonical_member_id is null then
            raise exception 'Canonical member is required for match_existing'
                using errcode = '22023';
        end if;

        if not exists (
            select 1
            from public.members member
            where member.id = p_canonical_member_id
              and member.status = 'active'
        ) then
            raise exception 'Canonical member must exist and be active'
                using errcode = '22023';
        end if;
    elsif p_canonical_member_id is not null then
        raise exception 'Canonical member is only valid for match_existing'
            using errcode = '22023';
    end if;

    select *
    into previous_resolution
    from public.region_import_identity_resolutions resolution
    where resolution.source_identity_id = p_source_identity_id
    order by resolution.resolved_at desc, resolution.id desc
    limit 1;

    insert into public.region_import_identity_resolutions (
        source_identity_id,
        resolution_type,
        canonical_member_id,
        resolved_by_user_id,
        notes,
        supersedes_resolution_id
    )
    values (
        p_source_identity_id,
        p_resolution_type,
        p_canonical_member_id,
        caller_id,
        nullif(btrim(p_notes), ''),
        previous_resolution.id
    )
    returning *
    into created_resolution;

    update public.region_import_source_identities
    set
        source_identity_status = case
            when p_resolution_type = 'deferred'
                then 'deferred'
            when p_resolution_type = 'ignored'
                then 'ignored'
            else 'resolved'
        end,
        updated_at = now()
    where id = p_source_identity_id;

    return created_resolution;
end;
$function$;