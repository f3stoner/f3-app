create or replace function public.normalize_region_import_roster_batch(
    p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();
    target_batch public.region_import_batches%rowtype;
    target_project public.region_import_projects%rowtype;

    raw_row public.region_import_raw_rows%rowtype;

    source_f3_name text;
    source_real_name text;
    source_email text;
    source_phone text;
    source_home_region text;

    normalized_f3_name text;
    normalized_real_name text;
    normalized_email text;
    normalized_phone text;

    display_name text;
    v_source_identity_key text;

    processed_count integer := 0;
    ignored_count integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can normalize region import batches'
            using errcode = '42501';
    end if;

    if p_batch_id is null then
        raise exception 'Import batch is required'
            using errcode = '22023';
    end if;

    select *
    into target_batch
    from public.region_import_batches
    where id = p_batch_id
    for update;

    if target_batch.id is null then
        raise exception 'Import batch not found'
            using errcode = '22023';
    end if;

    if target_batch.batch_type <> 'roster' then
        raise exception 'This normalizer currently supports roster batches only'
            using errcode = '22023';
    end if;

    select *
    into target_project
    from public.region_import_projects
    where id = target_batch.project_id
    for update;

    if target_project.id is null then
        raise exception 'Import project not found'
            using errcode = '22023';
    end if;

    for raw_row in
        select *
        from public.region_import_raw_rows
        where batch_id = p_batch_id
        order by row_number
    loop
        source_f3_name :=
            nullif(
                btrim(raw_row.raw_payload ->> 'f3Name'),
                ''
            );

        source_real_name :=
            nullif(
                regexp_replace(
                    btrim(
                        coalesce(
                            raw_row.raw_payload ->> 'realName',
                            ''
                        )
                    ),
                    '\s+',
                    ' ',
                    'g'
                ),
                ''
            );

        source_email :=
            nullif(
                lower(
                    btrim(
                        coalesce(
                            raw_row.raw_payload ->> 'email',
                            ''
                        )
                    )
                ),
                ''
            );

        source_phone :=
            nullif(
                regexp_replace(
                    coalesce(
                        raw_row.raw_payload ->> 'phone',
                        ''
                    ),
                    '[^0-9]',
                    '',
                    'g'
                ),
                ''
            );

        source_home_region :=
            nullif(
                btrim(
                    coalesce(
                        raw_row.raw_payload ->> 'homeRegion',
                        ''
                    )
                ),
                ''
            );

        normalized_f3_name :=
            nullif(
                regexp_replace(
                    lower(
                        coalesce(
                            source_f3_name,
                            ''
                        )
                    ),
                    '[^a-z0-9]+',
                    '',
                    'g'
                ),
                ''
            );

        normalized_real_name :=
            nullif(
                regexp_replace(
                    lower(
                        coalesce(
                            source_real_name,
                            ''
                        )
                    ),
                    '[^a-z0-9]+',
                    '',
                    'g'
                ),
                ''
            );

        normalized_email := source_email;
        normalized_phone := source_phone;

        display_name :=
            coalesce(
                source_f3_name,
                source_real_name,
                source_email,
                'Unknown'
            );

        v_source_identity_key :=
            coalesce(
                nullif(raw_row.source_key, ''),
                'row:' || raw_row.row_number::text
            );

        if normalized_f3_name is null
           and normalized_real_name is null
           and normalized_email is null
           and normalized_phone is null then

            update public.region_import_raw_rows
            set
                parse_status = 'ignored',
                parse_error = null
            where id = raw_row.id;

            ignored_count := ignored_count + 1;

            continue;
        end if;

        insert into public.region_import_source_identities (
            project_id,
            source_identity_key,
            display_name,

            source_f3_name,
            source_real_name,
            source_email,
            source_phone,
            source_home_region,

            normalized_f3_name,
            normalized_real_name,
            normalized_email,
            normalized_phone,

            source_identity_status,

            source_summary
        )
        values (
            target_project.id,
            v_source_identity_key,
            display_name,

            source_f3_name,
            source_real_name,
            source_email,
            source_phone,
            source_home_region,

            normalized_f3_name,
            normalized_real_name,
            normalized_email,
            normalized_phone,

            'ready_for_matching',

            jsonb_build_object(
                'sourceBatchId', p_batch_id,
                'sourceRawRowId', raw_row.id,
                'sourceRowNumber', raw_row.row_number
            )
        )
        on conflict (
            project_id,
            source_identity_key
        )
        do update
        set
            display_name = excluded.display_name,

            source_f3_name = excluded.source_f3_name,
            source_real_name = excluded.source_real_name,
            source_email = excluded.source_email,
            source_phone = excluded.source_phone,
            source_home_region = excluded.source_home_region,

            normalized_f3_name = excluded.normalized_f3_name,
            normalized_real_name = excluded.normalized_real_name,
            normalized_email = excluded.normalized_email,
            normalized_phone = excluded.normalized_phone,

            source_identity_status =
                case
                    when public.region_import_source_identities
                        .source_identity_status in (
                            'resolved',
                            'deferred',
                            'ignored'
                        )
                        then public.region_import_source_identities
                            .source_identity_status
                    else 'ready_for_matching'
                end,

            source_summary = excluded.source_summary,
            updated_at = now();

        update public.region_import_raw_rows
        set
            parse_status = 'parsed',
            parse_error = null
        where id = raw_row.id;

        processed_count := processed_count + 1;
    end loop;

    update public.region_import_batches
    set
        status = 'normalized'
    where id = p_batch_id;

    update public.region_import_projects
    set
        status = case
            when status in (
                'draft',
                'source_upload',
                'parsing',
                'normalization'
            )
                then 'identity_clustering'
            else status
        end,
        updated_at = now()
    where id = target_project.id;

    return jsonb_build_object(
        'batchId', p_batch_id,
        'projectId', target_project.id,
        'identitiesProcessed', processed_count,
        'rowsIgnored', ignored_count
    );
end;
$function$;