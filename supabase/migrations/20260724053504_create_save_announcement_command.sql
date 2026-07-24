BEGIN;

CREATE OR REPLACE FUNCTION public.save_announcement_command(
    p_action text,
    p_region_id uuid,
    p_announcement_id uuid DEFAULT NULL,
    p_title text DEFAULT NULL,
    p_body text DEFAULT NULL,
    p_scope text DEFAULT NULL,
    p_ao_id uuid DEFAULT NULL,
    p_starts_on date DEFAULT NULL,
    p_ends_on date DEFAULT NULL,
    p_is_active boolean DEFAULT NULL,
    p_include_in_backblast boolean DEFAULT NULL,
    p_link_url text DEFAULT NULL,
    p_link_label text DEFAULT NULL,
    p_reorder_items jsonb DEFAULT NULL,
    p_update_fields text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text := auth.role();

    normalized_action text :=
        lower(btrim(coalesce(p_action, '')));

    saved_announcement public.announcements%ROWTYPE;
    existing_announcement public.announcements%ROWTYPE;

    normalized_title text;
    normalized_body text;
    normalized_link_url text;
    normalized_link_label text;

    next_display_order integer;
    reorder_item_count integer;
    matched_reorder_count integer;

    result_payload jsonb;
BEGIN
    /*
     * Authentication and authorization.
     *
     * service_role remains trusted for operational use. Every other caller
     * must be authenticated and satisfy the existing region-content contract.
     */
    IF caller_role IS DISTINCT FROM 'service_role' THEN
        IF caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required'
                USING ERRCODE = '42501';
        END IF;

        IF p_region_id IS NULL
           OR NOT public.can_manage_region_content(p_region_id)
        THEN
            RAISE EXCEPTION 'Not authorized to manage announcements in this region'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_region_id IS NULL THEN
        RAISE EXCEPTION 'Region id is required'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.regions AS r
        WHERE r.id = p_region_id
    ) THEN
        RAISE EXCEPTION 'Region not found'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_action NOT IN (
        'create',
        'update',
        'delete',
        'reorder'
    ) THEN
        RAISE EXCEPTION 'Unsupported announcement action'
            USING ERRCODE = '22023';
    END IF;

    /*
     * CREATE
     */
    IF normalized_action = 'create' THEN
        IF p_announcement_id IS NULL THEN
            RAISE EXCEPTION 'Announcement id is required'
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.announcements AS a
            WHERE a.id = p_announcement_id
        ) THEN
            RAISE EXCEPTION 'Announcement id is already in use'
                USING ERRCODE = '23505';
        END IF;

        IF p_scope IS DISTINCT FROM 'region' THEN
            RAISE EXCEPTION 'Only region-scoped announcements are supported'
                USING ERRCODE = '22023';
        END IF;

        IF p_ao_id IS NOT NULL THEN
            RAISE EXCEPTION 'AO must be null for region-scoped announcements'
                USING ERRCODE = '22023';
        END IF;

        normalized_title := btrim(coalesce(p_title, ''));
        normalized_body := btrim(coalesce(p_body, ''));

        IF normalized_title = '' THEN
            RAISE EXCEPTION 'Announcement title is required'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_body = '' THEN
            RAISE EXCEPTION 'Announcement body is required'
                USING ERRCODE = '22023';
        END IF;

        IF p_starts_on IS NOT NULL
           AND p_ends_on IS NOT NULL
           AND p_starts_on > p_ends_on
        THEN
            RAISE EXCEPTION 'Announcement start date must not be after its end date'
                USING ERRCODE = '22023';
        END IF;

        normalized_link_url :=
            nullif(btrim(coalesce(p_link_url, '')), '');

        normalized_link_label :=
            nullif(btrim(coalesce(p_link_label, '')), '');

        /*
         * Serialize initial-order calculation within this region so concurrent
         * creates do not calculate the same next order.
         */
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
                p_region_id::text,
                0
            )
        );

        SELECT coalesce(max(a.display_order), 0) + 1
        INTO next_display_order
        FROM public.announcements AS a
        WHERE a.region_id = p_region_id
          AND a.scope = 'region'
          AND a.ao_id IS NULL;

        INSERT INTO public.announcements (
            id,
            region_id,
            scope,
            ao_id,
            title,
            body,
            starts_on,
            ends_on,
            is_active,
            created_by_user_id,
            created_at,
            updated_at,
            include_in_backblast,
            display_order,
            link_url,
            link_label
        )
        VALUES (
            p_announcement_id,
            p_region_id,
            'region',
            NULL,
            normalized_title,
            normalized_body,
            p_starts_on,
            p_ends_on,
            coalesce(p_is_active, true),
            caller_id,
            pg_catalog.now(),
            pg_catalog.now(),
            coalesce(p_include_in_backblast, false),
            next_display_order,
            normalized_link_url,
            normalized_link_label
        )
        RETURNING *
        INTO saved_announcement;

        RETURN jsonb_build_object(
            'action',
            'create',
            'announcement',
            to_jsonb(saved_announcement)
        );
    END IF;

    /*
     * UPDATE, DELETE, and REORDER require different target handling.
     */
    IF normalized_action IN ('update', 'delete') THEN
        IF p_announcement_id IS NULL THEN
            RAISE EXCEPTION 'Announcement id is required'
                USING ERRCODE = '22023';
        END IF;

        SELECT a.*
        INTO existing_announcement
        FROM public.announcements AS a
        WHERE a.id = p_announcement_id
          AND a.region_id = p_region_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Announcement not found or unavailable'
                USING ERRCODE = '22023';
        END IF;

        IF existing_announcement.scope IS DISTINCT FROM 'region'
           OR existing_announcement.ao_id IS NOT NULL
        THEN
            RAISE EXCEPTION 'AO-scoped announcements are unsupported in Phase 1'
                USING ERRCODE = '0A000';
        END IF;
    END IF;

    /*
     * UPDATE
     *
     * p_update_fields distinguishes an explicit null from an unchanged field.
     */
    IF normalized_action = 'update' THEN
        IF p_scope IS NOT NULL
           AND p_scope IS DISTINCT FROM 'region'
        THEN
            RAISE EXCEPTION 'Only region-scoped announcements are supported'
                USING ERRCODE = '22023';
        END IF;

        IF p_ao_id IS NOT NULL THEN
            RAISE EXCEPTION 'AO must remain null for region-scoped announcements'
                USING ERRCODE = '22023';
        END IF;

        IF p_update_fields IS NULL
           OR cardinality(p_update_fields) = 0
        THEN
            RAISE EXCEPTION 'At least one update field is required'
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM unnest(p_update_fields) AS submitted(field_name)
            WHERE submitted.field_name IS NULL
               OR submitted.field_name NOT IN (
                    'title',
                    'body',
                    'starts_on',
                    'ends_on',
                    'is_active',
                    'include_in_backblast',
                    'link_url',
                    'link_label'
               )
        ) THEN
            RAISE EXCEPTION 'One or more update fields are unsupported'
                USING ERRCODE = '22023';
        END IF;

        IF (
            SELECT count(*)
            FROM unnest(p_update_fields) AS submitted(field_name)
        ) IS DISTINCT FROM (
            SELECT count(DISTINCT submitted.field_name)
            FROM unnest(p_update_fields) AS submitted(field_name)
        ) THEN
            RAISE EXCEPTION 'Update fields must be distinct'
                USING ERRCODE = '22023';
        END IF;

        normalized_title :=
            CASE
                WHEN 'title' = ANY(p_update_fields)
                    THEN btrim(coalesce(p_title, ''))
                ELSE existing_announcement.title
            END;

        normalized_body :=
            CASE
                WHEN 'body' = ANY(p_update_fields)
                    THEN btrim(coalesce(p_body, ''))
                ELSE existing_announcement.body
            END;

        IF normalized_title = '' THEN
            RAISE EXCEPTION 'Announcement title is required'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_body = '' THEN
            RAISE EXCEPTION 'Announcement body is required'
                USING ERRCODE = '22023';
        END IF;

        IF (
            CASE
                WHEN 'starts_on' = ANY(p_update_fields)
                    THEN p_starts_on
                ELSE existing_announcement.starts_on
            END
        ) IS NOT NULL
        AND (
            CASE
                WHEN 'ends_on' = ANY(p_update_fields)
                    THEN p_ends_on
                ELSE existing_announcement.ends_on
            END
        ) IS NOT NULL
        AND (
            CASE
                WHEN 'starts_on' = ANY(p_update_fields)
                    THEN p_starts_on
                ELSE existing_announcement.starts_on
            END
        ) > (
            CASE
                WHEN 'ends_on' = ANY(p_update_fields)
                    THEN p_ends_on
                ELSE existing_announcement.ends_on
            END
        ) THEN
            RAISE EXCEPTION 'Announcement start date must not be after its end date'
                USING ERRCODE = '22023';
        END IF;

        normalized_link_url :=
            CASE
                WHEN 'link_url' = ANY(p_update_fields)
                    THEN nullif(
                        btrim(coalesce(p_link_url, '')),
                        ''
                    )
                ELSE existing_announcement.link_url
            END;

        normalized_link_label :=
            CASE
                WHEN 'link_label' = ANY(p_update_fields)
                    THEN nullif(
                        btrim(coalesce(p_link_label, '')),
                        ''
                    )
                ELSE existing_announcement.link_label
            END;

        UPDATE public.announcements AS a
        SET
            title = normalized_title,
            body = normalized_body,
            starts_on =
                CASE
                    WHEN 'starts_on' = ANY(p_update_fields)
                        THEN p_starts_on
                    ELSE a.starts_on
                END,
            ends_on =
                CASE
                    WHEN 'ends_on' = ANY(p_update_fields)
                        THEN p_ends_on
                    ELSE a.ends_on
                END,
            is_active =
                CASE
                    WHEN 'is_active' = ANY(p_update_fields)
                        THEN coalesce(
                            p_is_active,
                            a.is_active
                        )
                    ELSE a.is_active
                END,
            include_in_backblast =
                CASE
                    WHEN 'include_in_backblast' = ANY(p_update_fields)
                        THEN coalesce(
                            p_include_in_backblast,
                            a.include_in_backblast
                        )
                    ELSE a.include_in_backblast
                END,
            link_url = normalized_link_url,
            link_label = normalized_link_label,
            updated_at = pg_catalog.now()
        WHERE a.id = p_announcement_id
          AND a.region_id = p_region_id
        RETURNING *
        INTO saved_announcement;

        RETURN jsonb_build_object(
            'action',
            'update',
            'announcement',
            to_jsonb(saved_announcement)
        );
    END IF;

    /*
     * DELETE
     */
    IF normalized_action = 'delete' THEN
        DELETE FROM public.announcements AS a
        WHERE a.id = p_announcement_id
          AND a.region_id = p_region_id;

        RETURN jsonb_build_object(
            'action',
            'delete',
            'deletedId',
            p_announcement_id
        );
    END IF;

    /*
     * REORDER
     */
    IF p_reorder_items IS NULL
       OR jsonb_typeof(p_reorder_items) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_reorder_items) = 0
    THEN
        RAISE EXCEPTION 'Reorder items must be a nonempty JSON array'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Validate each JSON element before performing any casts or mutations.
     */
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_reorder_items) AS submitted(item)
        WHERE jsonb_typeof(submitted.item) IS DISTINCT FROM 'object'
           OR NOT submitted.item ? 'id'
           OR NOT submitted.item ? 'displayOrder'
           OR jsonb_typeof(submitted.item -> 'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(
                submitted.item -> 'displayOrder'
              ) IS DISTINCT FROM 'number'
           OR coalesce(submitted.item ->> 'id', '') !~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR (submitted.item ->> 'displayOrder')::numeric
                <> trunc(
                    (submitted.item ->> 'displayOrder')::numeric
                )
           OR (submitted.item ->> 'displayOrder')::numeric < 0
           OR (submitted.item ->> 'displayOrder')::numeric > 2147483647
    ) THEN
        RAISE EXCEPTION 'Each reorder item must contain a UUID id and a nonnegative integer displayOrder'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
    INTO reorder_item_count
    FROM jsonb_array_elements(p_reorder_items);

    IF (
        SELECT count(DISTINCT (submitted.item ->> 'id')::uuid)
        FROM jsonb_array_elements(p_reorder_items)
            AS submitted(item)
    ) IS DISTINCT FROM reorder_item_count THEN
        RAISE EXCEPTION 'Reorder announcement ids must be distinct'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Serialize reorder operations for this region. Validation and mutation
     * remain in the same function transaction.
     */
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            p_region_id::text,
            0
        )
    );

    SELECT count(*)
    INTO matched_reorder_count
    FROM public.announcements AS a
    JOIN jsonb_array_elements(p_reorder_items)
        AS submitted(item)
      ON a.id = (submitted.item ->> 'id')::uuid
    WHERE a.region_id = p_region_id;

    IF matched_reorder_count IS DISTINCT FROM reorder_item_count THEN
        RAISE EXCEPTION 'One or more announcements were not found in the target region'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.announcements AS a
        JOIN jsonb_array_elements(p_reorder_items)
            AS submitted(item)
          ON a.id = (submitted.item ->> 'id')::uuid
        WHERE a.region_id = p_region_id
          AND (
              a.scope IS DISTINCT FROM 'region'
              OR a.ao_id IS NOT NULL
          )
    ) THEN
        RAISE EXCEPTION 'AO-scoped announcements are unsupported in Phase 1'
            USING ERRCODE = '0A000';
    END IF;

    /*
     * Lock every target row before updating any target row.
     */
    PERFORM 1
    FROM public.announcements AS a
    JOIN jsonb_array_elements(p_reorder_items)
        AS submitted(item)
      ON a.id = (submitted.item ->> 'id')::uuid
    WHERE a.region_id = p_region_id
    FOR UPDATE OF a;

    WITH submitted AS (
        SELECT
            (item ->> 'id')::uuid AS id,
            (item ->> 'displayOrder')::integer
                AS display_order
        FROM jsonb_array_elements(p_reorder_items)
            AS reorder_payload(item)
    )
    UPDATE public.announcements AS a
    SET
        display_order = submitted.display_order,
        updated_at = pg_catalog.now()
    FROM submitted
    WHERE a.id = submitted.id
      AND a.region_id = p_region_id;

    SELECT jsonb_build_object(
        'action',
        'reorder',
        'announcements',
        coalesce(
            jsonb_agg(
                to_jsonb(a)
                ORDER BY
                    a.display_order,
                    a.created_at DESC,
                    a.id
            ),
            '[]'::jsonb
        )
    )
    INTO result_payload
    FROM public.announcements AS a
    JOIN jsonb_array_elements(p_reorder_items)
        AS submitted(item)
      ON a.id = (submitted.item ->> 'id')::uuid
    WHERE a.region_id = p_region_id;

    RETURN result_payload;
END;
$function$;

REVOKE ALL
ON FUNCTION public.save_announcement_command(
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    date,
    date,
    boolean,
    boolean,
    text,
    text,
    jsonb,
    text[]
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.save_announcement_command(
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    date,
    date,
    boolean,
    boolean,
    text,
    text,
    jsonb,
    text[]
)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.save_announcement_command(
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    date,
    date,
    boolean,
    boolean,
    text,
    text,
    jsonb,
    text[]
)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.save_announcement_command(
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    date,
    date,
    boolean,
    boolean,
    text,
    text,
    jsonb,
    text[]
)
TO service_role;

COMMIT;