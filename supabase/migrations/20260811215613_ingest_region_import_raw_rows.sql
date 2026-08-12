create or replace function public.ingest_region_import_raw_rows(
    p_batch_id uuid,
    p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_id uuid := auth.uid();
    input_row jsonb;
    input_row_number integer;
    input_source_key text;
    input_payload jsonb;
    total_count integer := 0;
begin
    if caller_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_superadmin() then
        raise exception 'Only superadmins can ingest region import rows'
            using errcode = '42501';
    end if;

    if p_batch_id is null then
        raise exception 'Import batch is required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.region_import_batches batch
        where batch.id = p_batch_id
    ) then
        raise exception 'Import batch not found'
            using errcode = '22023';
    end if;

    if p_rows is null
       or jsonb_typeof(p_rows) <> 'array' then
        raise exception 'Rows must be a JSON array'
            using errcode = '22023';
    end if;

    for input_row in
        select value
        from jsonb_array_elements(p_rows)
    loop
        if jsonb_typeof(input_row) <> 'object' then
            raise exception 'Every import row must be a JSON object'
                using errcode = '22023';
        end if;

        begin
            input_row_number := (input_row ->> 'rowNumber')::integer;
        exception
            when invalid_text_representation then
                raise exception 'rowNumber must be an integer'
                    using errcode = '22023';
        end;

        if input_row_number is null
           or input_row_number <= 0 then
            raise exception 'rowNumber must be greater than zero'
                using errcode = '22023';
        end if;

        input_source_key :=
            nullif(
                btrim(input_row ->> 'sourceKey'),
                ''
            );

        input_payload := input_row -> 'payload';

        if input_payload is null
           or jsonb_typeof(input_payload) <> 'object' then
            raise exception 'Every import row must contain an object payload'
                using errcode = '22023';
        end if;

        insert into public.region_import_raw_rows (
            batch_id,
            row_number,
            source_key,
            raw_payload,
            parse_status
        )
        values (
            p_batch_id,
            input_row_number,
            input_source_key,
            input_payload,
            'pending'
        )
        on conflict (
            batch_id,
            row_number
        )
        do update
        set
            source_key = excluded.source_key,
            raw_payload = excluded.raw_payload,
            parse_status = 'pending',
            parse_error = null;

        total_count := total_count + 1;
    end loop;

    update public.region_import_batches
    set
        row_count = (
            select count(*)
            from public.region_import_raw_rows row_record
            where row_record.batch_id = p_batch_id
        ),
        status = 'parsed'
    where id = p_batch_id;

    update public.region_import_projects project
    set
        status = case
            when project.status in (
                'draft',
                'source_upload',
                'parsing'
            )
                then 'normalization'
            else project.status
        end,
        updated_at = now()
    where project.id = (
        select batch.project_id
        from public.region_import_batches batch
        where batch.id = p_batch_id
    );

    return jsonb_build_object(
        'batchId', p_batch_id,
        'rowsProcessed', total_count
    );
end;
$function$;