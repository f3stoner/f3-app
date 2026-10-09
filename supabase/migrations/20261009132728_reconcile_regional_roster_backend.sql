
-- Regional roster backend reconciliation
-- 1. Correct claimed-member regional filtering
-- 2. Align profile editing with Regional SLT permissions
-- 3. Audit changes to all editable member fields

BEGIN;

-- ============================================================
-- 1. Extend existing member-change audit types
-- ============================================================

ALTER TABLE public.member_change_audit
  DROP CONSTRAINT member_change_audit_change_type_check;

ALTER TABLE public.member_change_audit
  ADD CONSTRAINT member_change_audit_change_type_check
  CHECK (
    change_type IN (
      'roster_status',
      'pax_name',
      'real_name',
      'home_ao',
      'invited_by_id'
    )
  );

-- ============================================================
-- 2. Correct regional claimed-member lookup
-- ============================================================

CREATE OR REPLACE FUNCTION public.load_claimed_member_ids(
  p_region_id uuid
)
RETURNS TABLE(member_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.member_id
  FROM public.profiles p
  JOIN public.members m
    ON m.id = p.member_id
  WHERE m.region_id = p_region_id
    AND p.member_id IS NOT NULL;
$function$;

-- ============================================================
-- 3. Reconcile profile editing and audit coverage
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_member_profile(
  p_member_id uuid,
  p_pax_name text,
  p_real_name text,
  p_invited_by_id uuid,
  p_home_ao text
)
RETURNS SETOF public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before public.members%ROWTYPE;
  v_after public.members%ROWTYPE;
  v_pax_name text;
  v_real_name text;
  v_home_ao text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION
      'You are not authorized to edit member profiles.'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the target member and preserve original values.
  SELECT *
  INTO v_before
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  -- Match the approved Regional SLT authorization model.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.region_id = v_before.region_id
      AND p.role IN ('slt', 'dataq')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profile_region_positions prp
    WHERE prp.profile_id = auth.uid()
      AND prp.region_id = v_before.region_id
      AND NULLIF(BTRIM(prp.region_position), '') IS NOT NULL
  )
  THEN
    RAISE EXCEPTION
      'You are not authorized to edit member profiles in this region.'
      USING ERRCODE = '42501';
  END IF;

  -- Preserve existing normalization.
  v_pax_name := NULLIF(
    REGEXP_REPLACE(
      TRIM(COALESCE(p_pax_name, '')),
      '\s+', ' ', 'g'
    ),
    ''
  );

  v_real_name := NULLIF(
    REGEXP_REPLACE(
      TRIM(COALESCE(p_real_name, '')),
      '\s+', ' ', 'g'
    ),
    ''
  );

  v_home_ao := NULLIF(
    REGEXP_REPLACE(
      TRIM(COALESCE(p_home_ao, '')),
      '\s+', ' ', 'g'
    ),
    ''
  );

  IF v_pax_name IS NULL THEN
    RAISE EXCEPTION 'PAX name is required.';
  END IF;

  -- Preserve Proud Papa validation.
  IF p_invited_by_id IS NOT NULL THEN
    IF p_invited_by_id = p_member_id THEN
      RAISE EXCEPTION
        'A member cannot be their own Proud Papa.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = p_invited_by_id
    ) THEN
      RAISE EXCEPTION 'Proud Papa member not found.';
    END IF;
  END IF;

  UPDATE public.members
  SET
    pax_name = v_pax_name,
    real_name = v_real_name,
    invited_by_id = p_invited_by_id,
    home_ao = v_home_ao
  WHERE id = p_member_id
  RETURNING * INTO v_after;

  -- Audit only fields whose values actually changed.
  INSERT INTO public.member_change_audit (
    member_id,
    region_id,
    changed_by,
    change_type,
    old_value,
    new_value
  )
  SELECT
    v_before.id,
    v_before.region_id,
    auth.uid(),
    changes.change_type,
    changes.old_value,
    changes.new_value
  FROM (
    VALUES
      (
        'pax_name',
        v_before.pax_name,
        v_after.pax_name
      ),
      (
        'real_name',
        v_before.real_name,
        v_after.real_name
      ),
      (
        'home_ao',
        v_before.home_ao,
        v_after.home_ao
      ),
      (
        'invited_by_id',
        v_before.invited_by_id::text,
        v_after.invited_by_id::text
      )
  ) AS changes(change_type, old_value, new_value)
  WHERE changes.old_value
    IS DISTINCT FROM changes.new_value;

  RETURN NEXT v_after;
END;
$function$;

COMMIT;
