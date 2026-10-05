CREATE OR REPLACE FUNCTION public.set_profile_ao_permissions(
    p_profile_id uuid,
    p_region_id uuid,
    p_assignments jsonb
)
RETURNS SETOF profile_ao_permissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
    caller_id uuid := auth.uid();
    caller_role text := auth.role();
    caller_profile_role text;
    target_profile_region_id uuid;
begin
    /*
     * Authorization
     *
     * service_role is trusted.
     *
     * Every other caller must be authenticated and must be either:
     * - a superadmin,
     * - the Nantan for the target region, or
     * - a Regional Admin for the target region.
     */
    if caller_role is distinct from 'service_role' then
        if caller_id is null then
            raise exception 'Authentication required'
                using errcode = '42501';
        end if;

        select p.role
        into caller_profile_role
        from public.profiles as p
        where p.id = caller_id;

        if not found then
            raise exception 'Caller profile not found'
                using errcode = '42501';
        end if;

        if caller_profile_role is distinct from 'superadmin'
           and not exists (
               select 1
               from public.profile_region_positions as prp
               where prp.profile_id = caller_id
                 and prp.region_id = p_region_id
                 and prp.region_position in ('nantan', 'regional_admin')
           ) then
            raise exception
                'Only superadmins, the region Nantan, or a Regional Admin can update AO permission assignments'
                using errcode = '42501';
        end if;
    end if;

    /*
     * Target validation
     */
    if p_profile_id is null then
        raise exception 'Target profile is required'
            using errcode = '22023';
    end if;

    if p_region_id is null then
        raise exception 'Target region is required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.regions as r
        where r.id = p_region_id
    ) then
        raise exception 'Target region not found'
            using errcode = '22023';
    end if;

    select p.region_id
    into target_profile_region_id
    from public.profiles as p
    where p.id = p_profile_id;

    if not found then
        raise exception 'Target profile not found'
            using errcode = '22023';
    end if;

    if target_profile_region_id is distinct from p_region_id then
        raise exception 'Target profile does not belong to the target region'
            using errcode = '22023';
    end if;

    /*
     * Payload validation
     *
     * null and [] both mean "clear all assignments."
     */
    if p_assignments is not null
       and jsonb_typeof(p_assignments) is distinct from 'array' then
        raise exception 'AO assignments must be a JSON array or null'
            using errcode = '22023';
    end if;

    /*
     * Every element must be an object containing a non-empty aoId.
     * position may be omitted, null, or a string.
     */
    if exists (
        select 1
        from jsonb_array_elements(
            coalesce(p_assignments, '[]'::jsonb)
        ) as input(assignment)
        where jsonb_typeof(input.assignment) is distinct from 'object'
           or not (input.assignment ? 'aoId')
           or jsonb_typeof(input.assignment -> 'aoId') is distinct from 'string'
           or nullif(btrim(input.assignment ->> 'aoId'), '') is null
           or (
               input.assignment ? 'position'
               and input.assignment -> 'position' <> 'null'::jsonb
               and jsonb_typeof(input.assignment -> 'position') is distinct from 'string'
           )
    ) then
        raise exception
            'Each AO assignment must contain a valid aoId and optional string position'
            using errcode = '22023';
    end if;

    /*
     * Force UUID parsing before any delete happens.
     */
    begin
        perform (input.assignment ->> 'aoId')::uuid
        from jsonb_array_elements(
            coalesce(p_assignments, '[]'::jsonb)
        ) as input(assignment);
    exception
        when invalid_text_representation then
            raise exception 'Each aoId must be a valid UUID'
                using errcode = '22023';
    end;

    /*
     * Supported AO leadership positions.
     * Missing, null, and blank normalize to aoq.
     */
    if exists (
        select 1
        from jsonb_array_elements(
            coalesce(p_assignments, '[]'::jsonb)
        ) as input(assignment)
        where coalesce(
            nullif(btrim(input.assignment ->> 'position'), ''),
            'aoq'
        ) not in (
            'aoq',
            'ao_coq',
            'ao_data_q',
            'first_f',
            'second_f',
            'third_f'
        )
    ) then
        raise exception 'Unsupported AO position'
            using errcode = '22023';
    end if;

    /*
     * Reject duplicate logical assignments.
     */
    if exists (
        select 1
        from (
            select
                (input.assignment ->> 'aoId')::uuid as ao_id,
                coalesce(
                    nullif(btrim(input.assignment ->> 'position'), ''),
                    'aoq'
                ) as ao_position
            from jsonb_array_elements(
                coalesce(p_assignments, '[]'::jsonb)
            ) as input(assignment)
            group by
                (input.assignment ->> 'aoId')::uuid,
                coalesce(
                    nullif(btrim(input.assignment ->> 'position'), ''),
                    'aoq'
                )
            having count(*) > 1
        ) as duplicates
    ) then
        raise exception 'Duplicate AO permission assignment'
            using errcode = '22023';
    end if;

    /*
     * Every referenced AO must exist.
     */
    if exists (
        select 1
        from jsonb_array_elements(
            coalesce(p_assignments, '[]'::jsonb)
        ) as input(assignment)
        left join public.aos as a
            on a.id = (input.assignment ->> 'aoId')::uuid
        where a.id is null
    ) then
        raise exception 'Referenced AO not found'
            using errcode = '22023';
    end if;

    /*
     * Every referenced AO must belong to the target region.
     */
    if exists (
        select 1
        from jsonb_array_elements(
            coalesce(p_assignments, '[]'::jsonb)
        ) as input(assignment)
        join public.aos as a
            on a.id = (input.assignment ->> 'aoId')::uuid
        where a.region_id is distinct from p_region_id
    ) then
        raise exception 'Referenced AO does not belong to the target region'
            using errcode = '22023';
    end if;

    /*
     * Replace assignments only after all validation passes.
     */
    delete from public.profile_ao_permissions as pap
    where pap.profile_id = p_profile_id
      and pap.region_id = p_region_id;

    insert into public.profile_ao_permissions (
        profile_id,
        region_id,
        ao_id,
        ao_position,
        created_by_user_id
    )
    select
        p_profile_id,
        p_region_id,
        (input.assignment ->> 'aoId')::uuid,
        coalesce(
            nullif(btrim(input.assignment ->> 'position'), ''),
            'aoq'
        ),
        case
            when caller_role = 'service_role' then null
            else caller_id
        end
    from jsonb_array_elements(
        coalesce(p_assignments, '[]'::jsonb)
    ) as input(assignment);

    return query
    select pap.*
    from public.profile_ao_permissions as pap
    where pap.profile_id = p_profile_id
      and pap.region_id = p_region_id
    order by pap.created_at;
end;
$function$;