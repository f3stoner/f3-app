begin;

alter table public.q_slots
    disable trigger guard_q_slot_user_update_trigger;

-- =========================================================
-- Canonical Watch identity
--
-- Surviving AO:
--   5f9713bf-d172-4841-b66d-d552ea09c912
--
-- Retiring AO:
--   228cf961-1df3-49ed-a864-3f5ea94c4bef
--
-- Sites:
--   The Dominion:
--     997aa408-0401-4ffc-84ea-677f36a14eb6
--
--   The Watchtower:
--     d16223a2-da75-4894-9e5e-0f60dc236a37
-- =========================================================


-- =========================================================
-- 1. Snapshot concrete Site and time on all Watch Q slots
--
-- This must happen before the AO IDs are combined so the
-- concrete occurrence unique index can distinguish the two
-- schedules by Site.
-- =========================================================

update public.q_slots
set
    site_id = '997aa408-0401-4ffc-84ea-677f36a14eb6'::uuid,
    start_time = coalesce(start_time, override_time, '05:30')
where ao_id = '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid;

update public.q_slots
set
    site_id = 'd16223a2-da75-4894-9e5e-0f60dc236a37'::uuid,
    start_time = coalesce(start_time, override_time, '05:30')
where ao_id = '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;


-- =========================================================
-- 2. Snapshot Site and time on historical Watch sessions
-- =========================================================

update public.sessions
set
    site_id = '997aa408-0401-4ffc-84ea-677f36a14eb6'::uuid,
    start_time = coalesce(start_time, '05:30')
where ao_id = '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid;

update public.sessions
set
    site_id = 'd16223a2-da75-4894-9e5e-0f60dc236a37'::uuid,
    start_time = coalesce(start_time, '05:30')
where ao_id = '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;


-- =========================================================
-- 3. Snapshot Site on planned workouts
-- =========================================================

update public.planned_workouts
set site_id =
    '997aa408-0401-4ffc-84ea-677f36a14eb6'::uuid
where ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid;

update public.planned_workouts
set site_id =
    'd16223a2-da75-4894-9e5e-0f60dc236a37'::uuid
where ao_id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;


-- =========================================================
-- 4. Remove the duplicate AO permission
--
-- The same profile is AOQ for both current Watch AO rows.
-- Keep the permission attached to the surviving AO and remove
-- the duplicate attached to the retiring AO.
-- =========================================================

delete from public.profile_ao_permissions
where profile_id =
        'c47c4c65-7d55-4d6b-b148-d1c79ec37b7b'::uuid
  and ao_id =
        '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid
  and ao_position = 'aoq';

-- =========================================================
-- 6. Move all remaining foreign-key references to the
-- canonical Watch AO
-- =========================================================

update public.ao_recurring_schedules
set ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
where ao_id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;

update public.q_slots
set ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
where ao_id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;

update public.sessions
set ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
where ao_id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;

update public.planned_workouts
set ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
where ao_id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;

update public.announcements
set ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
where ao_id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;

update public.profile_ao_permissions
set ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
where ao_id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;


-- =========================================================
-- 7. Normalize Watch display snapshots
--
-- AO ID is authoritative, but normalizing these snapshots
-- prevents UI paths that still display session/workout names
-- from showing Watch (D) or Watch (W) after consolidation.
-- =========================================================

update public.sessions
set ao_name = 'The Watch'
where ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
  and ao_name in (
      'The Watch',
      'The Watch (D)',
      'The Watch (W)',
      'Watch (D)',
      'Watch (W)'
  );

update public.planned_workouts
set ao_name = 'The Watch'
where ao_id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid
  and ao_name in (
      'The Watch',
      'The Watch (D)',
      'The Watch (W)',
      'Watch (D)',
      'Watch (W)'
  );


-- =========================================================
-- 8. Rename the surviving AO
--
-- The old AO-level location fields remain temporarily for
-- backward compatibility. Use Dominion as the legacy/default
-- value until runtime reads move to schedules and Sites.
-- =========================================================

update public.aos
set
    name = 'The Watch',
    location_name = 'The Dominion',
    address = '2050 W Villa Maria Rd, Bryan TX 77807',
    latitude = 30.624446543367135,
    longitude = -96.39088743281837,
    weather_location_label = 'College Station, TX',
    weather_enabled = true,

    -- Temporary compatibility representation only.
    -- The authoritative recurring structure now lives in
    -- ao_recurring_schedules.
    days_of_week = array[2, 5]::integer[],
    time = '05:30',
    time_schedule = '{}'::jsonb,

    -- Preserve both weekday rules while legacy runtime still
    -- reads emphasis from the AO record.
    emphasis_schedule = jsonb_build_object(
        '2',
        jsonb_build_object(
            'values',
            jsonb_build_array('bootcamp'),
            'pattern',
            'fixed',
            'startsOnDate',
            null
        ),
        '5',
        jsonb_build_object(
            'values',
            jsonb_build_array('stairs'),
            'pattern',
            'fixed',
            'startsOnDate',
            null
        )
    )
where id =
    '5f9713bf-d172-4841-b66d-d552ea09c912'::uuid;


-- =========================================================
-- 9. Verify that no operational references remain on the
-- retiring AO.
--
-- ao_weather_cache is intentionally excluded. Those cache
-- rows may remain attached to the inactive historical AO
-- until weather is migrated to Site-based identity.
-- =========================================================

do $$
declare
    remaining_operational_references integer;
begin
    select
        (
            select count(*)
            from public.sessions
            where ao_id =
                '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid
        )
        +
        (
            select count(*)
            from public.q_slots
            where ao_id =
                '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid
        )
        +
        (
            select count(*)
            from public.planned_workouts
            where ao_id =
                '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid
        )
        +
        (
            select count(*)
            from public.profile_ao_permissions
            where ao_id =
                '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid
        )
        +
        (
            select count(*)
            from public.announcements
            where ao_id =
                '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid
        )
        +
        (
            select count(*)
            from public.ao_recurring_schedules
            where ao_id =
                '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid
        )
    into remaining_operational_references;

    if remaining_operational_references <> 0 then
        raise exception
            'Cannot retire Watchtower AO: % operational references remain.',
            remaining_operational_references;
    end if;
end;
$$;

-- =========================================================
-- 10. Soft-retire the former Watchtower AO identity.
--
-- Keep the original AO row and ID available for rollback and
-- historical traceability. It is no longer used by operational
-- schedules, slots, sessions, workouts, permissions, or
-- announcements.
-- =========================================================

update public.aos
set
    name = 'The Watchtower (retired)',
    is_active = false
where id =
    '228cf961-1df3-49ed-a864-3f5ea94c4bef'::uuid;

alter table public.q_slots
    enable trigger guard_q_slot_user_update_trigger;

commit;