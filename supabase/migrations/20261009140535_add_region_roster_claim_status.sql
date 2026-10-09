
BEGIN;

CREATE OR REPLACE FUNCTION public.load_region_roster_claimed_member_ids(
  p_region_id uuid
)
RETURNS TABLE(member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_region_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to view regional roster adoption.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.region_id = p_region_id
        AND p.role IN ('slt', 'dataq')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profile_region_positions prp
      WHERE prp.profile_id = auth.uid()
        AND prp.region_id = p_region_id
        AND NULLIF(BTRIM(prp.region_position), '') IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view regional roster adoption.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.member_id
  FROM public.profiles p
  JOIN public.members m
    ON m.id = p.member_id
  WHERE m.region_id = p_region_id
    AND p.member_id IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.load_region_roster_claimed_member_ids(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.load_region_roster_claimed_member_ids(uuid)
  TO authenticated;

COMMIT;
