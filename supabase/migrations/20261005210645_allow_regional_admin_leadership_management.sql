CREATE OR REPLACE FUNCTION public.set_profile_region_positions(
    p_profile_id uuid,
    p_region_id uuid,
    p_positions jsonb
)
RETURNS SETOF profile_region_positions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    caller_id uuid := auth.uid();
    caller_role text := auth.role();
    caller_profile_role text;
    target_profile_region_id uuid;
    caller_is_regional_admin boolean := false;
    target_is_regional_admin boolean := false;
    requested_regional_admin boolean := false;
BEGIN
    /*
     * Authorization
     *
     * service_role:
     *   unrestricted
     *
     * superadmin:
     *   unrestricted, including assigning/removing regional_admin
     *
     * regional_admin:
     *   may manage ordinary regional leadership positions only
     *   within the region where they hold regional_admin
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
            SELECT EXISTS (
                SELECT 1
                FROM public.profile_region_positions AS prp
                WHERE prp.profile_id = caller_id
                  AND prp.region_id = p_region_id
                  AND prp.region_position = 'regional_admin'
            )
            INTO caller_is_regional_admin;

            IF NOT caller_is_regional_admin THEN
                RAISE EXCEPTION
                    'Only superadmins or Regional Admins for this region can update regional position assignments'
                    USING ERRCODE = '42501';
            END IF;
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
            'regional_admin',
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
     * Privilege protection.
     *
     * Only service_role or superadmin may add, remove, or otherwise
     * alter a regional_admin assignment.
     *
     * Because this RPC replaces all assignments for the target,
     * a Regional Admin may not modify a target who already holds
     * regional_admin, even if regional_admin is included in the
     * replacement payload.
     */
    IF caller_role IS DISTINCT FROM 'service_role'
       AND caller_profile_role IS DISTINCT FROM 'superadmin' THEN

        SELECT EXISTS (
            SELECT 1
            FROM public.profile_region_positions AS prp
            WHERE prp.profile_id = p_profile_id
              AND prp.region_id = p_region_id
              AND prp.region_position = 'regional_admin'
        )
        INTO target_is_regional_admin;

        SELECT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                COALESCE(p_positions, '[]'::jsonb)
            ) AS input(position_value)
            WHERE btrim(input.position_value) = 'regional_admin'
        )
        INTO requested_regional_admin;

        IF target_is_regional_admin OR requested_regional_admin THEN
            RAISE EXCEPTION
                'Only superadmins can assign or modify Regional Admin authority'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    /*
     * Replacement starts only after all validation and authorization
     * checks succeed.
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