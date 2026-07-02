-- 20260701_multi_region_rls.sql
-- Update core region-scoped policies to use region_access instead of profiles.region_id.
-- This enables users with explicit region_access to load Sandbox / secondary-region data
-- without changing their home profile region.

-- =========================
-- AOs
-- =========================

DROP POLICY IF EXISTS "aos_select_same_region" ON public.aos;
DROP POLICY IF EXISTS "aos_insert_same_region" ON public.aos;
DROP POLICY IF EXISTS "aos_update_same_region" ON public.aos;
DROP POLICY IF EXISTS "aos_delete_same_region" ON public.aos;

CREATE POLICY "aos_select_accessible_regions"
ON public.aos
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = aos.region_id
    )
);

CREATE POLICY "aos_insert_accessible_regions"
ON public.aos
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = aos.region_id
    )
);

CREATE POLICY "aos_update_accessible_regions"
ON public.aos
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = aos.region_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = aos.region_id
    )
);

CREATE POLICY "aos_delete_accessible_regions"
ON public.aos
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = aos.region_id
    )
);


-- =========================
-- Q Slots
-- =========================

DROP POLICY IF EXISTS "q_slots_select_same_region" ON public.q_slots;
DROP POLICY IF EXISTS "q_slots_insert_same_region" ON public.q_slots;
DROP POLICY IF EXISTS "q_slots_update_same_region" ON public.q_slots;
DROP POLICY IF EXISTS "region_id = (   select region_id   from profiles   where id = a" ON public.q_slots;

CREATE POLICY "q_slots_select_accessible_regions"
ON public.q_slots
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = q_slots.region_id
    )
);

CREATE POLICY "q_slots_insert_accessible_regions"
ON public.q_slots
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = q_slots.region_id
    )
);

CREATE POLICY "q_slots_update_accessible_regions"
ON public.q_slots
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = q_slots.region_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = q_slots.region_id
    )
);

CREATE POLICY "q_slots_delete_accessible_regions"
ON public.q_slots
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = q_slots.region_id
    )
);


-- =========================
-- Planned Workouts
-- =========================

DROP POLICY IF EXISTS "planned_workouts_select_same_region" ON public.planned_workouts;
DROP POLICY IF EXISTS "planned_workouts_insert_same_region" ON public.planned_workouts;
DROP POLICY IF EXISTS "planned_workouts_update_same_region" ON public.planned_workouts;
DROP POLICY IF EXISTS "planned_workouts_delete_same_region" ON public.planned_workouts;

CREATE POLICY "planned_workouts_select_accessible_regions"
ON public.planned_workouts
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = planned_workouts.region_id
    )
);

CREATE POLICY "planned_workouts_insert_accessible_regions"
ON public.planned_workouts
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = planned_workouts.region_id
    )
);

CREATE POLICY "planned_workouts_update_accessible_regions"
ON public.planned_workouts
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = planned_workouts.region_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = planned_workouts.region_id
    )
);

CREATE POLICY "planned_workouts_delete_accessible_regions"
ON public.planned_workouts
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = planned_workouts.region_id
    )
);


-- =========================
-- Sessions
-- =========================

DROP POLICY IF EXISTS "sessions_select_same_region" ON public.sessions;

CREATE POLICY "sessions_select_accessible_regions"
ON public.sessions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.region_access ra
        WHERE ra.user_id = auth.uid()
        AND ra.region_id = sessions.region_id
    )
);