CREATE OR REPLACE FUNCTION public.set_profile_ao_permissions(
    p_profile_id uuid,
    p_region_id uuid,
    p_assignments jsonb
)
RETURNS SETOF public.profile_ao_permissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text := auth.role();
    caller_profile_role text;
    target_profile_region_id uuid;
BEGIN
    /*
     * Authorization
     *
     * service_role is trusted.
     * Every other caller must be authenticated and currently hold the
     * superadmin role in public.profiles.
     */
    IF caller_role IS DISTINCT FROM 'service_role' THEN
        IF caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required'
                USING ERRCODE = '42501';
        END IF;

        SELECT p.role
        INTO caller_profile_role
        FROM public.profiles AS p
        WHERE p.id = caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found'
                USING ERRCODE = '42501';
        END IF;

        IF caller_profile_role IS DISTINCT FROM 'superadmin' THEN
            RAISE EXCEPTION 'Only superadmins can update AO permission assignments'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    /*
     * Target validation
     */
    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'Target profile is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_region_id IS NULL THEN
        RAISE EXCEPTION 'Target region is required'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.regions AS r
        WHERE r.id = p_region_id
    ) THEN
        RAISE EXCEPTION 'Target region not found'
            USING ERRCODE = '22023';
    END IF;

    SELECT p.region_id
    INTO target_profile_region_id
    FROM public.profiles AS p
    WHERE p.id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target profile not found'
            USING ERRCODE = '22023';
    END IF;

    IF target_profile_region_id IS DISTINCT FROM p_region_id THEN
        RAISE EXCEPTION 'Target profile does not belong to the target region'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Payload validation
     *
     * NULL and [] both mean "clear all assignments."
     */
    IF p_assignments IS NOT NULL
       AND jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'AO assignments must be a JSON array or null'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Every element must be an object containing a non-empty aoId.
     * position may be omitted, null, or a string.
     */
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            COALESCE(p_assignments, '[]'::jsonb)
        ) AS input(assignment)
        WHERE jsonb_typeof(input.assignment) IS DISTINCT FROM 'object'
           OR NOT (input.assignment ? 'aoId')
           OR jsonb_typeof(input.assignment -> 'aoId') IS DISTINCT FROM 'string'
           OR NULLIF(btrim(input.assignment ->> 'aoId'), '') IS NULL
           OR (
               input.assignment ? 'position'
               AND input.assignment -> 'position' <> 'null'::jsonb
               AND jsonb_typeof(input.assignment -> 'position') IS DISTINCT FROM 'string'
           )
    ) THEN
        RAISE EXCEPTION 'Each AO assignment must contain a valid aoId and optional string position'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Force UUID parsing during validation, before any deletion.
     * PostgreSQL performs the actual UUID validation.
     */
    BEGIN
        PERFORM (input.assignment ->> 'aoId')::uuid
        FROM jsonb_array_elements(
            COALESCE(p_assignments, '[]'::jsonb)
        ) AS input(assignment);
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Each aoId must be a valid UUID'
                USING ERRCODE = '22023';
    END;

    /*
     * Validate supported position values.
     * Missing, null, and blank values normalize to aoq.
     */
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            COALESCE(p_assignments, '[]'::jsonb)
        ) AS input(assignment)
        WHERE COALESCE(
            NULLIF(btrim(input.assignment ->> 'position'), ''),
            'aoq'
        ) NOT IN (
            'aoq',
            'ao_coq',
            'ao_data_q',
            'first_f',
            'second_f',
            'third_f'
        )
    ) THEN
        RAISE EXCEPTION 'Unsupported AO position'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Reject duplicate logical assignments after normalization.
     */
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                (input.assignment ->> 'aoId')::uuid AS ao_id,
                COALESCE(
                    NULLIF(btrim(input.assignment ->> 'position'), ''),
                    'aoq'
                ) AS ao_position
            FROM jsonb_array_elements(
                COALESCE(p_assignments, '[]'::jsonb)
            ) AS input(assignment)
            GROUP BY
                (input.assignment ->> 'aoId')::uuid,
                COALESCE(
                    NULLIF(btrim(input.assignment ->> 'position'), ''),
                    'aoq'
                )
            HAVING COUNT(*) > 1
        ) AS duplicates
    ) THEN
        RAISE EXCEPTION 'Duplicate AO permission assignment'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Every AO must exist.
     */
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            COALESCE(p_assignments, '[]'::jsonb)
        ) AS input(assignment)
        LEFT JOIN public.aos AS a
            ON a.id = (input.assignment ->> 'aoId')::uuid
        WHERE a.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Referenced AO not found'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Every AO must belong to the requested region.
     */
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            COALESCE(p_assignments, '[]'::jsonb)
        ) AS input(assignment)
        JOIN public.aos AS a
            ON a.id = (input.assignment ->> 'aoId')::uuid
        WHERE a.region_id IS DISTINCT FROM p_region_id
    ) THEN
        RAISE EXCEPTION 'Referenced AO does not belong to the target region'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Replacement begins only after every validation has passed.
     * The function runs in one transaction, so any insert failure
     * rolls the delete back automatically.
     */
    DELETE FROM public.profile_ao_permissions AS pap
    WHERE pap.profile_id = p_profile_id
      AND pap.region_id = p_region_id;

    INSERT INTO public.profile_ao_permissions (
        profile_id,
        region_id,
        ao_id,
        ao_position,
        created_by_user_id
    )
    SELECT
        p_profile_id,
        p_region_id,
        (input.assignment ->> 'aoId')::uuid,
        COALESCE(
            NULLIF(btrim(input.assignment ->> 'position'), ''),
            'aoq'
        ),
        CASE
            WHEN caller_role = 'service_role' THEN NULL
            ELSE caller_id
        END
    FROM jsonb_array_elements(
        COALESCE(p_assignments, '[]'::jsonb)
    ) AS input(assignment);

    RETURN QUERY
    SELECT pap.*
    FROM public.profile_ao_permissions AS pap
    WHERE pap.profile_id = p_profile_id
      AND pap.region_id = p_region_id
    ORDER BY pap.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_profile_region_positions(
    p_profile_id uuid,
    p_region_id uuid,
    p_positions jsonb
)
RETURNS SETOF public.profile_region_positions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text := auth.role();
    caller_profile_role text;
    target_profile_region_id uuid;
BEGIN
    /*
     * Authorization
     */
    IF caller_role IS DISTINCT FROM 'service_role' THEN
        IF caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required'
                USING ERRCODE = '42501';
        END IF;

        SELECT p.role
        INTO caller_profile_role
        FROM public.profiles AS p
        WHERE p.id = caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found'
                USING ERRCODE = '42501';
        END IF;

        IF caller_profile_role IS DISTINCT FROM 'superadmin' THEN
            RAISE EXCEPTION 'Only superadmins can update regional position assignments'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    /*
     * Target validation
     */
    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'Target profile is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_region_id IS NULL THEN
        RAISE EXCEPTION 'Target region is required'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.regions AS r
        WHERE r.id = p_region_id
    ) THEN
        RAISE EXCEPTION 'Target region not found'
            USING ERRCODE = '22023';
    END IF;

    SELECT p.region_id
    INTO target_profile_region_id
    FROM public.profiles AS p
    WHERE p.id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target profile not found'
            USING ERRCODE = '22023';
    END IF;

    IF target_profile_region_id IS DISTINCT FROM p_region_id THEN
        RAISE EXCEPTION 'Target profile does not belong to the target region'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Payload validation
     *
     * NULL and [] both mean "clear all assignments."
     */
    IF p_positions IS NOT NULL
       AND jsonb_typeof(p_positions) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Regional positions must be a JSON array or null'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Every array element must be a non-empty string.
     */
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            COALESCE(p_positions, '[]'::jsonb)
        ) AS input(position_value)
        WHERE jsonb_typeof(input.position_value) IS DISTINCT FROM 'string'
           OR NULLIF(btrim(input.position_value #>> '{}'), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Each regional position must be a non-empty string'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Validate supported values after trimming.
     */
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
            COALESCE(p_positions, '[]'::jsonb)
        ) AS input(position_value)
        WHERE btrim(input.position_value) NOT IN (
            'nantan',
            'weasel_shaker',
            'first_f',
            'second_f',
            'third_f',
            'rucking_q',
            'csaup_q',
            'internal_commz_q',
            'external_commz_q'
        )
    ) THEN
        RAISE EXCEPTION 'Unsupported regional position'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Reject duplicates after normalization.
     */
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT btrim(input.position_value) AS normalized_position
            FROM jsonb_array_elements_text(
                COALESCE(p_positions, '[]'::jsonb)
            ) AS input(position_value)
            GROUP BY btrim(input.position_value)
            HAVING COUNT(*) > 1
        ) AS duplicates
    ) THEN
        RAISE EXCEPTION 'Duplicate regional position assignment'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Replacement starts only after validation succeeds.
     */
    DELETE FROM public.profile_region_positions AS prp
    WHERE prp.profile_id = p_profile_id
      AND prp.region_id = p_region_id;

    INSERT INTO public.profile_region_positions (
        profile_id,
        region_id,
        region_position,
        created_by_user_id
    )
    SELECT
        p_profile_id,
        p_region_id,
        btrim(input.position_value),
        CASE
            WHEN caller_role = 'service_role' THEN NULL
            ELSE caller_id
        END
    FROM jsonb_array_elements_text(
        COALESCE(p_positions, '[]'::jsonb)
    ) AS input(position_value);

    RETURN QUERY
    SELECT prp.*
    FROM public.profile_region_positions AS prp
    WHERE prp.profile_id = p_profile_id
      AND prp.region_id = p_region_id
    ORDER BY prp.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.load_profile_ao_permissions(
    p_region_id uuid
)
RETURNS TABLE (
    id uuid,
    profile_id uuid,
    region_id uuid,
    ao_id uuid,
    ao_position text,
    created_at timestamp with time zone,
    created_by_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text := auth.role();
    caller_profile_role text;
BEGIN
    IF p_region_id IS NULL THEN
        RAISE EXCEPTION 'Region is required'
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

    IF caller_role IS DISTINCT FROM 'service_role' THEN
        IF caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required'
                USING ERRCODE = '42501';
        END IF;

        SELECT p.role
        INTO caller_profile_role
        FROM public.profiles AS p
        WHERE p.id = caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found'
                USING ERRCODE = '42501';
        END IF;

        IF caller_profile_role IS DISTINCT FROM 'superadmin'
           AND NOT EXISTS (
               SELECT 1
               FROM public.region_access AS ra
               WHERE ra.user_id = caller_id
                 AND ra.region_id = p_region_id
           ) THEN
            RAISE EXCEPTION 'Region access required'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        pap.id,
        pap.profile_id,
        pap.region_id,
        pap.ao_id,
        pap.ao_position,
        pap.created_at,
        pap.created_by_user_id
    FROM public.profile_ao_permissions AS pap
    WHERE pap.region_id = p_region_id
    ORDER BY pap.created_at;
END;
$function$;


CREATE OR REPLACE FUNCTION public.load_profile_region_positions(
    p_region_id uuid
)
RETURNS TABLE (
    id uuid,
    profile_id uuid,
    region_id uuid,
    region_position text,
    created_at timestamp with time zone,
    created_by_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text := auth.role();
    caller_profile_role text;
BEGIN
    IF p_region_id IS NULL THEN
        RAISE EXCEPTION 'Region is required'
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

    IF caller_role IS DISTINCT FROM 'service_role' THEN
        IF caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required'
                USING ERRCODE = '42501';
        END IF;

        SELECT p.role
        INTO caller_profile_role
        FROM public.profiles AS p
        WHERE p.id = caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found'
                USING ERRCODE = '42501';
        END IF;

        IF caller_profile_role IS DISTINCT FROM 'superadmin'
           AND NOT EXISTS (
               SELECT 1
               FROM public.region_access AS ra
               WHERE ra.user_id = caller_id
                 AND ra.region_id = p_region_id
           ) THEN
            RAISE EXCEPTION 'Region access required'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        prp.id,
        prp.profile_id,
        prp.region_id,
        prp.region_position,
        prp.created_at,
        prp.created_by_user_id
    FROM public.profile_region_positions AS prp
    WHERE prp.region_id = p_region_id
    ORDER BY prp.created_at;
END;
$function$;


CREATE OR REPLACE FUNCTION public.load_ao_leadership_contacts(
    p_region_id uuid
)
RETURNS TABLE (
    ao_id uuid,
    ao_name text,
    ao_position text,
    profile_id uuid,
    display_name text,
    email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text := auth.role();
    caller_profile_role text;
BEGIN
    IF p_region_id IS NULL THEN
        RAISE EXCEPTION 'Region is required'
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

    IF caller_role IS DISTINCT FROM 'service_role' THEN
        IF caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required'
                USING ERRCODE = '42501';
        END IF;

        SELECT p.role
        INTO caller_profile_role
        FROM public.profiles AS p
        WHERE p.id = caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found'
                USING ERRCODE = '42501';
        END IF;

        IF caller_profile_role IS DISTINCT FROM 'superadmin'
           AND NOT EXISTS (
               SELECT 1
               FROM public.region_access AS ra
               WHERE ra.user_id = caller_id
                 AND ra.region_id = p_region_id
           ) THEN
            RAISE EXCEPTION 'Region access required'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        pap.ao_id,
        a.name AS ao_name,
        pap.ao_position,
        p.id AS profile_id,
        p.display_name,
        p.email
    FROM public.profile_ao_permissions AS pap
    JOIN public.profiles AS p
        ON p.id = pap.profile_id
    JOIN public.aos AS a
        ON a.id = pap.ao_id
    WHERE pap.region_id = p_region_id
    ORDER BY
        a.name,
        pap.ao_position,
        p.display_name;
END;
$function$;

REVOKE ALL
ON FUNCTION public.set_profile_ao_permissions(uuid, uuid, jsonb)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.set_profile_ao_permissions(uuid, uuid, jsonb)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.set_profile_ao_permissions(uuid, uuid, jsonb)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.set_profile_ao_permissions(uuid, uuid, jsonb)
TO service_role;


REVOKE ALL
ON FUNCTION public.set_profile_region_positions(uuid, uuid, jsonb)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.set_profile_region_positions(uuid, uuid, jsonb)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.set_profile_region_positions(uuid, uuid, jsonb)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.set_profile_region_positions(uuid, uuid, jsonb)
TO service_role;


REVOKE ALL
ON FUNCTION public.load_profile_ao_permissions(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.load_profile_ao_permissions(uuid)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.load_profile_ao_permissions(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.load_profile_ao_permissions(uuid)
TO service_role;


REVOKE ALL
ON FUNCTION public.load_profile_region_positions(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.load_profile_region_positions(uuid)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.load_profile_region_positions(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.load_profile_region_positions(uuid)
TO service_role;


REVOKE ALL
ON FUNCTION public.load_ao_leadership_contacts(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.load_ao_leadership_contacts(uuid)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.load_ao_leadership_contacts(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.load_ao_leadership_contacts(uuid)
TO service_role;