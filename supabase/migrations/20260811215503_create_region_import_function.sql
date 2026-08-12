create or replace function public.create_region_import_project(
    p_region_id uuid,
    p_name text,
    p_source_system text default null,
    p_expected_member_count integer default null,
    p_expected_session_count integer default null
)
returns public.region_import_projects
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();
    created_project public.region_import_projects%rowtype;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can create region import projects'
            using errcode = '42501';
    end if;

    if p_region_id is null then
        raise exception 'Region is required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.regions r
        where r.id = p_region_id
    ) then
        raise exception 'Region not found'
            using errcode = '22023';
    end if;

    if nullif(btrim(p_name), '') is null then
        raise exception 'Project name is required'
            using errcode = '22023';
    end if;

    if p_expected_member_count is not null
       and p_expected_member_count < 0 then
        raise exception 'Expected member count cannot be negative'
            using errcode = '22023';
    end if;

    if p_expected_session_count is not null
       and p_expected_session_count < 0 then
        raise exception 'Expected session count cannot be negative'
            using errcode = '22023';
    end if;

    insert into public.region_import_projects (
        region_id,
        name,
        source_system,
        expected_member_count,
        expected_session_count,
        created_by_user_id
    )
    values (
        p_region_id,
        btrim(p_name),
        nullif(btrim(p_source_system), ''),
        p_expected_member_count,
        p_expected_session_count,
        caller_id
    )
    returning *
    into created_project;

    return created_project;
end;
$function$;


create or replace function public.create_region_import_batch(
    p_project_id uuid,
    p_batch_type text,
    p_filename text default null,
    p_file_hash text default null,
    p_source_format text default null,
    p_parser_version text default null
)
returns public.region_import_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();
    created_batch public.region_import_batches%rowtype;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can create region import batches'
            using errcode = '42501';
    end if;

    if p_project_id is null then
        raise exception 'Import project is required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.region_import_projects project
        where project.id = p_project_id
    ) then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    if nullif(btrim(p_batch_type), '') is null then
        raise exception 'Batch type is required'
            using errcode = '22023';
    end if;

    if p_file_hash is not null
       and exists (
           select 1
           from public.region_import_batches batch
           where batch.project_id = p_project_id
             and batch.file_hash = p_file_hash
             and batch.status <> 'superseded'
       ) then
        raise exception 'This file has already been uploaded to the project'
            using errcode = '23505';
    end if;

    insert into public.region_import_batches (
        project_id,
        batch_type,
        filename,
        file_hash,
        source_format,
        parser_version,
        uploaded_by_user_id
    )
    values (
        p_project_id,
        btrim(p_batch_type),
        nullif(btrim(p_filename), ''),
        nullif(btrim(p_file_hash), ''),
        nullif(btrim(p_source_format), ''),
        nullif(btrim(p_parser_version), ''),
        caller_id
    )
    returning *
    into created_batch;

    update public.region_import_projects
    set
        status = case
            when status = 'draft'
                then 'source_upload'
            else status
        end,
        updated_at = now()
    where id = p_project_id;

    return created_batch;
end;
$function$;