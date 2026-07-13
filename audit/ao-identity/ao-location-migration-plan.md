# AO Location and Schedule Migration Plan

This is an implementation plan only. It was drafted from source inspection and local import samples without modifying application logic or database state.

## Recommended Target

Use this identity model:

- AO identity: `aos.id`
- physical place: `ao_locations.id`
- recurring rule: `ao_schedules.id`
- generated Q signup occurrence: `q_slots.id`

For recurring generated Q slots, enforce uniqueness on `ao_schedule_id + date`.

For one-off slots, require a concrete occurrence snapshot and prevent accidental duplicates with `region_id + ao_id + date + start_time + ao_location_id`, subject to an explicit override if intentional duplicate starts are ever needed.

## Why Not AO/Date/Time Only

`ao_id + date + start_time` fails the stated requirement that one AO may have simultaneous starts at different locations.

`ao_id + date + start_time + location_id` is a good concrete occurrence identity, but it is not the best generated-slot provenance key. If a schedule changes location or time, a generated slot still needs to know which schedule created it and whether it should remain as originally snapshotted.

`ao_schedule_id + date` best represents "this recurring schedule row on this date" and supports schedule edit policies cleanly.

## Phase 0: Live Data Inventory

Before migrations, export:

- all AOs with id/name/location/schedule/weather fields
- all references from sessions, q_slots, planned_workouts, profile_ao_permissions
- all distinct session/planned workout `ao_name` values with null or mismatched `ao_id`
- all future q_slots grouped by `region_id, ao_id, date`
- all source_q_slot_id link coverage for planned_workouts and sessions

Stop if multiple current AO records have the same normalized name but unclear identity.

## Phase 1: Add Tables, No Runtime Change

Add:

- `ao_locations`
- `ao_schedules`
- `ao_import_aliases` or `ao_aliases`
- optional `ao_schedule_exceptions`

Backfill one active location and one or more schedules from each current AO. Preserve current `aos` columns temporarily.

## Phase 2: Add Snapshot Columns

Add nullable columns:

- `q_slots.ao_schedule_id`
- `q_slots.ao_location_id`
- `q_slots.start_time`
- `q_slots.duration_minutes`
- `q_slots.status`
- `sessions.ao_location_id`
- optional `planned_workouts.ao_location_id`, `planned_workouts.start_time`

Backfill q_slots from current AO schedule data. Existing future slots are historical signup occurrences and should be snapshotted rather than regenerated blindly.

## Phase 3: Update Generation

Replace AO-based generation with schedule-based generation:

```text
for each active ao_schedule:
  for each date in horizon:
    if date weekday matches schedule.weekday
    and date in schedule effective range
    and no cancellation/suppression exception exists
    and no q_slot exists for ao_schedule_id/date:
      insert q_slot snapshot
```

The generated row should copy `ao_id`, `ao_location_id`, `start_time`, and duration from the schedule at generation time.

## Phase 4: Runtime Read Path Updates

Update UI/services to prefer slot/session snapshots:

- Q Signup and Weekly Calendar display `q_slot.start_time`, location, and schedule label.
- Dashboard My Next Q uses `source_q_slot_id` and slot snapshot fields.
- Planner uses `source_q_slot_id` for all Q-originated workouts.
- Session logging from a Q slot copies `ao_id`, `ao_location_id`, `start_time`, and `source_q_slot_id`.
- Weather lookup takes `ao_location_id` or q_slot/session id.
- Readiness and session audit mark AO/date legacy matches as ambiguous if multiple candidate slots exist.

## Phase 5: Watch Consolidation

1. Export both Watch AO ids and all referencing rows.
2. Select canonical survivor by reference count and permission centrality.
3. Create one canonical AO named `The Watch`.
4. Create D and W locations.
5. Create aliases:
   - `The Watch (D)` -> canonical AO + D location
   - `Watch (D)` -> canonical AO + D location
   - `The Watch (W)` -> canonical AO + W location
   - `Watch (W)` -> canonical AO + W location
   - `The Watch`/`Watch` -> canonical AO + unknown/default only when source cannot prove location
6. Repoint sessions, q_slots, planned_workouts, and profile AO permissions from retired Watch AO ids to canonical AO.
7. Preserve historical location where known; leave unknown explicit where not known.
8. Disable or alias retired AO rows only after all references are moved.

## Schedule Edit Policy

Treat generated q_slots as snapshots.

When editing an `ao_schedule`:

- Past q_slots and sessions are never changed.
- Claimed future q_slots are not silently changed.
- Unclaimed future generated q_slots may be updated only through an explicit admin choice:
  - "apply to future unclaimed slots"
  - "start new schedule effective date and leave existing slots"
  - "cancel old schedule after date and create replacement"
- If start time or location changes materially, prefer closing the old schedule with `effective_end_date` and creating a new schedule row.

## Exceptions

Use explicit exception records instead of mutating the recurring schedule:

- cancelled date: suppress or mark that q_slot as cancelled
- temporary time change: one q_slot override/snapshot change, with audit metadata
- one-off location override: one q_slot with different `ao_location_id`, or an exception row that generates that occurrence
- convergence/CSAUP event: schedule-less one-off q_slot/session unless it becomes recurring

## Emphasis Placement

Default emphasis belongs with the schedule when the same AO can have multiple schedules on a weekday. Slot-level override remains available for one-off changes.

Recommended hierarchy:

1. `q_slots.override_emphasis` or `custom_emphasis_label`
2. `ao_schedules.default_emphasis` or linked emphasis rule
3. AO-level fallback only for legacy rows during migration

This lets one AO have an AM bootcamp and PM ruck on the same weekday without creating fake AOs.

## Deployment Ordering

1. Add schema and backfill tables.
2. Deploy read paths that tolerate both old and new fields.
3. Backfill q_slot snapshots.
4. Deploy schedule-based q_slot generation.
5. Deploy write paths for one-off slots, planner, sessions, weather, and reminders.
6. Consolidate Watch and other reviewed aliases.
7. Tighten constraints and RLS guards.
8. Remove legacy AO location/schedule fields from runtime use.
9. Drop legacy columns only in a later release after monitoring.

## Rollback Strategy

Before each phase:

- take database backup
- export affected rows to audit tables or files
- make migrations additive until final cleanup
- keep legacy `aos` columns populated until all runtime paths are verified

Rollback during additive phases means switching runtime reads back to existing AO fields and leaving new tables unused. After consolidation, rollback requires the exported reference map to restore retired AO ids and their references.

## Verification Checklist

- An AO can have two generated q_slots on the same date.
- An AO can have AM and PM rows on the same weekday.
- An AO can have two AM starts at different locations.
- Weather differs by location when coordinates differ.
- Claimed future slots do not silently change after schedule edit.
- Sessions from Q slots retain `source_q_slot_id`, `ao_id`, `ao_location_id`, and `start_time`.
- Legacy sessions without source slot are flagged ambiguous when multiple candidate slots exist.
- Stats grouped by AO continue to merge location variants.
- Location reports can group by `ao_location_id`.
- The Watch historical rows retain known D/W location where possible and keep unknown where not.
