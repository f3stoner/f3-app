# AO Identity, Location, Schedule, and Q Slot Architecture Audit

Read-only source audit performed from `/Users/jkazmierski/Developer/f3-app`. No app code, migrations, commits, database state, or remote services were modified.

## Executive Summary

The current application still treats an AO as a combined identity, location, weather target, and recurring schedule. That prevents a stable AO identity from surviving location changes and prevents one AO from having multiple same-day starts.

The highest-risk current assumption is Q slot identity. `buildMissingQSlots` deduplicates generated slots by `ao_id + date` in `src/services/qSlotGeneration.js:7`, which makes these valid cases impossible:

- one AO with AM and PM schedules on the same weekday
- one AO with multiple AM starts on the same weekday
- one AO with simultaneous starts at different locations
- recurring rows where each row is one weekday/start-time/location combination

The safest replacement is:

- generated recurring slot uniqueness: `ao_schedule_id + date`
- slot snapshot columns: `ao_id`, `ao_location_id`, `start_time`, `duration_minutes`, and optional display/emphasis metadata
- one-off slot uniqueness/collision guard: explicit occurrence identity with `ao_id + date + start_time + ao_location_id`, while allowing intentional exceptions

`ao_id + date + start_time` is not sufficient because simultaneous starts at different locations are a stated requirement. `ao_id + date + start_time + location_id` works for concrete occurrences but is less stable than `ao_schedule_id + date` for generated recurring slots because it loses schedule provenance and makes schedule edits harder to reason about.

## Current Data Flow

```text
aos
  id, name, location_name, address/map/lat/lon/weather, days_of_week, time, time_schedule, emphasis_schedule
    |
    | loaded by cloudData.mapAoFromDb
    v
state.aos
    |
    +-- qSlotGeneration.buildMissingQSlots: aos.daysOfWeek -> q_slots(ao_id, date)
    +-- Q Signup / Weekly Calendar / Dashboard: q_slots + current AO record -> display time, emphasis, weather target
    +-- Session form: selected AO -> sessions(ao_id, ao_name, start_time from ao.time)
    +-- Weather: get-ao-weather(ao_id, targetDateTime) -> coordinates from aos
    +-- Stats and insights: sessions.ao_id where present, otherwise ao_name fallbacks

q_slots
  id, region_id, ao_id, date, q_user_id, override_time, override_emphasis, override_title
    |
    +-- planned_workouts.source_q_slot_id
    +-- sessions.source_q_slot_id
    +-- legacy fallbacks by date + ao_id/ao_name
```

## Proposed Data Model

### aos

Stable logical identity only:

- `id`
- `region_id`
- protected canonical `name`
- status/launch metadata
- optional identity metadata

Do not store mutable physical location, coordinates, weather configuration, days of week, start time, or emphasis schedule here.

### ao_locations

Reusable physical places:

- `id`, `region_id`
- `name`, `address`, `map_url`, `latitude`, `longitude`
- `weather_location_label`, `weather_enabled`, optional weather provider config
- `status`

### ao_schedules

Recurring occurrence definitions. One row must represent exactly one weekday/start-time/location combination:

- `id`, `region_id`
- `ao_id`
- `ao_location_id`
- `weekday`
- `start_time`
- `duration_minutes`
- optional `schedule_label` such as AM, PM, Ruck, Bootcamp
- optional `default_emphasis` or emphasis rule id
- `effective_start_date`, `effective_end_date`
- `status`

AM/PM must not be AO identity. It should be schedule metadata or a derived display label.

### q_slots

Authoritative signup occurrence:

- `id`, `region_id`
- `ao_schedule_id` nullable for one-off slots but present for generated recurring slots
- snapshot `ao_id`, `ao_location_id`, `date`, `start_time`, `duration_minutes`
- `q_user_id`
- `status`: open, claimed, cancelled, suppressed, logged_elsewhere
- `override_title`, `override_emphasis`, `custom_emphasis_label`, `preblast_*`
- optional one-off/exception metadata

`ao_schedule_id` should be retained as provenance. `ao_id`, `ao_location_id`, `start_time`, and duration should be snapshot on `q_slots` so future schedule/location edits do not rewrite already-generated occurrences.

### sessions

`sessions.ao_id` remains authoritative for identity. Add:

- `ao_location_id`
- `start_time`
- optional historical `location_name_snapshot` if needed during migration

Past session location must not change when a future AO schedule changes.

### planned_workouts

For normal Q flow, `source_q_slot_id` can safely provide location/time through the slot. For standalone/ad hoc planned workouts, add optional `ao_location_id` and `start_time` or require the planner to pick a concrete slot/schedule occurrence.

## Proposed Constraints and Indexes

Recommended constraints:

- `aos(region_id, lower(trim(name)))` unique for canonical active AO identity.
- `ao_locations(region_id, lower(trim(name)))` unique where active, with human review for duplicate physical places.
- `ao_schedules(ao_id, weekday, start_time, ao_location_id, effective_start_date)` unique or exclusion-constrained to prevent duplicate active recurring rows.
- `q_slots(ao_schedule_id, date)` unique where `ao_schedule_id is not null`.
- one-off guard on `q_slots(region_id, ao_id, date, start_time, ao_location_id)` where `ao_schedule_id is null and status <> 'cancelled'`, unless intentional duplicate starts are allowed through a separate occurrence key.
- `sessions(source_q_slot_id)` indexed and optionally unique if exactly one session should result from one slot.
- `planned_workouts(source_q_slot_id, created_by_user_id)` indexed or unique if one BD per Q per slot is desired.

Add lookup indexes:

- `q_slots(region_id, date, start_time)`
- `q_slots(region_id, ao_id, date, start_time)`
- `q_slots(region_id, ao_location_id, date, start_time)`
- `sessions(region_id, ao_id, date, start_time)`
- `sessions(region_id, ao_location_id, date)`

## Affected Read and Write Paths

Critical paths are inventoried in `audit/ao-identity/ao-location-reference-inventory.csv`.

Key files:

- `src/services/qSlotGeneration.js:7`: generated slots currently dedupe by `ao_id + date`.
- `src/services/cloudData.js:562`: AO mapper reads location/schedule/weather from `aos`.
- `src/services/cloudData.js:666`: session insert writes `ao_id`/`ao_name` but no location id.
- `src/services/cloudData.js:771`: planned workout insert writes `ao_id`/`ao_name` and `source_q_slot_id`.
- `src/services/cloudData.js:1051`: Q slot insert writes no schedule/location/start snapshot.
- `src/views/qSignupView.js:249`: one-off slot modal has no location selector and treats time as an override.
- `src/views/dashboardView.js:340`: logged-session lookup falls back to AO/date/Q instead of `source_q_slot_id`.
- `src/views/sessionView.js:1004`: duplicate session guard lacks location.
- `supabase/functions/send-reminders/index.ts:337`: reminders read `q_slots` and `aos.time`.
- `supabase/functions/get-ao-weather/index.ts:268`: weather reads coordinates from `aos`.

## Stats and Aggregation Paths

Stats must group by `ao_id`, not location or `ao_name`. Current risks:

- `supabase/migrations/20260712230652_make_member_stats_baseline_aware.sql:146` computes `favorite_ao` from `sessions.ao_name`.
- Several UI and import paths still match by `ao_name` when `ao_id` is missing.
- Existing indexes in `supabase/migrations/20260707135802_add_ao_id_to_sessions_and_planned_workouts_v2.sql:15` optimize `region_id, ao_id, date`, which is useful but incomplete for multi-start/location reporting.

Location-specific reporting should group by `ao_location_id` separately from AO stats.

## Weather Dependencies

Current weather behavior is AO-centered:

- `supabase/functions/get-ao-weather/index.ts:268` loads `latitude`, `longitude`, `weather_location_label`, and `weather_enabled` from `aos`.
- `src/views/weeklyQCalendarView.js:74` keys weather cache by AO id plus target datetime.
- `src/views/dashboardView.js:423` does the same for My Next Q.
- `src/views/sessionView.js:1021` captures session weather using AO id and `ao.time`.

Target behavior:

- weather config lives on `ao_locations`
- Q slot and session weather use `ao_location_id + start_time`
- cache keys use `ao_location_id + datetime` or concrete weather coordinate id + datetime
- sessions retain `weather_snapshot` so historical display is stable

## UI Workflows Affected

- AO Management/Edit: split identity editing from location and schedule management.
- Q Signup: show multiple same-day rows for one AO; include time, location, schedule label, and emphasis.
- One-off slot creation: require location and start time; allow schedule-less exceptions.
- Weekly Q Calendar: sort by date/time/AO/location; do not collapse same AO/date.
- Dashboard My Next Q: display slot snapshot time/location and match sessions by `source_q_slot_id`.
- Workout Planner: preserve `source_q_slot_id`; use slot snapshot for intro/location/preblast.
- Session logging/editing: store AO identity plus physical location; duplicate detection includes location/start.
- Preblast/backblast: use slot/session location snapshot rather than current AO location.

## Explicit Answers

Can an AO currently be relocated without corrupting historical location?

No. The AO record contains the current location, address, map URL, coordinates, weather label, and schedule. Historical sessions only have `ao_id`/`ao_name` plus weather snapshot, not `ao_location_id`, so any UI deriving location from AO will show the new location for old sessions.

Which tables assume an AO has exactly one location?

At source level, `aos` itself does. `sessions`, `planned_workouts`, and `q_slots` have no separate location id and therefore depend on the AO record or free text. Weather cache/logical paths also assume location is found from AO.

Which tables assume an AO has exactly one schedule?

`aos` carries `days_of_week`, `time`, `time_schedule`, and `emphasis_schedule`. `q_slots` stores no schedule id and generated slots are deduped by AO/date. `sessions` has a single `start_time`, but no schedule provenance. `planned_workouts` has no schedule fields.

Which runtime paths can create sessions without `ao_id`?

`src/modules/sessions.js:3` allows `aoId = null`. `src/views/sessionView.js:139` and `src/views/sessionView.js:162` create empty sessions with `aoId: null`; the UI later auto-selects the first AO if available. `src/services/cloudData.js:666` inserts `ao_id: session.aoId || null`. Importers also insert by `ao_name` in several paths.

Which runtime paths currently derive location only from the AO record?

AO edit/load, planner intro address, weather lookup, dashboard/weekly weather, and session weather snapshot all derive from `state.aos`/`aos` fields rather than a location id.

How should weather caching work when an AO has multiple locations?

Cache by `ao_location_id + target datetime` or by normalized coordinate/weather config id + target datetime. AO id alone must not be part of weather identity except as display context.

How should Q slot generation select a location?

It should iterate active `ao_schedules`, not AOs. Each schedule row already points to one location/start/weekday combination, so generation creates `q_slots(ao_schedule_id, date, ao_id, ao_location_id, start_time, duration)` when the date falls inside the effective range and is not cancelled/suppressed.

How should one-off Convergence and CSAUP locations work?

Use stable AO identity plus schedule-less one-off `q_slots` and `sessions` with explicit `ao_location_id` and `start_time`. If an event recurs predictably, create a dated/temporary `ao_schedule`; otherwise use one-off occurrence records.

What is the safest way to consolidate The Watch (D) and The Watch (W)?

Inventory live DB references to both AO ids first. Pick the surviving canonical ID based on highest production references and permissions, not name preference. Create two `ao_locations`; map aliases `The Watch (D)` and `The Watch (W)` to canonical `ao_id` plus location. For historical `The Watch` rows with no D/W marker, keep AO identity and set location unknown until content/date evidence identifies it.

Which current AO records should probably become locations rather than AOs?

The brief explicitly identifies `The Watch (D)` and `The Watch (W)`. Candidate variants include `Dads (The Mine)` as Dads at The Mine and possibly some BlackOps sublabels, but BlackOps/Other must not be auto-merged without review.

Where must `ao_name` remain as historical/display text?

Keep `ao_name` on sessions/planned workouts as a display snapshot and import trace, but not as authoritative identity. Import aliases should preserve raw source labels separately.

What database guards should be added after migration?

Add non-null `sessions.ao_id` after backfill; add `sessions.ao_location_id` where sessions are at tracked locations; add `q_slots` schedule/snapshot uniqueness; expand Q slot RLS guard for identity snapshot fields; add alias uniqueness; add FK and status checks for schedules/locations.

## Schedule Requirement Conclusions

- One AO may have any number of starts on one date.
- AM/PM is not identity.
- A recurring schedule row is the atomic source of generated Q slots.
- Q slot identity must never be only `ao_id + date`.
- `ao_schedule_id + date` is safest for recurring slots.
- `ao_id + date + start_time + location_id` is the right concrete occurrence collision shape.
- `ao_id + date + start_time` is insufficient.

## Historical-Data Risks

- Old sessions may have only `ao_name`; merging by fuzzy name can corrupt identity.
- Old Watch rows may not distinguish D versus W.
- Changing AO location today can change displayed location for historical sessions if UI keeps deriving from AO.
- Stats grouped by `ao_name` will split aliases and variants.
- Legacy Q-slot/workout/session fallback by AO/date becomes unsafe once multi-start slots exist.

## Verification Queries

Examples for a future database audit:

```sql
select region_id, lower(trim(name)) as normalized_name, count(*)
from public.aos
group by region_id, lower(trim(name))
having count(*) > 1;

select region_id, ao_id, date, count(*)
from public.q_slots
group by region_id, ao_id, date
having count(*) > 1;

select region_id, ao_name, count(*)
from public.sessions
where ao_id is null
group by region_id, ao_name
order by count(*) desc;

select source_q_slot_id, count(*)
from public.sessions
where source_q_slot_id is not null
group by source_q_slot_id
having count(*) > 1;
```

## Prioritized Implementation Sequence

1. Add read-only audit queries and export current AO/session/Q/workout/permission reference counts.
2. Create `ao_locations`, `ao_schedules`, and alias tables without changing runtime behavior.
3. Backfill canonical locations and schedules from current AO fields.
4. Add q_slot schedule/snapshot columns and backfill from current AO state.
5. Update Q slot generation to iterate schedules and use `ao_schedule_id + date`.
6. Update weather, dashboard, weekly calendar, Q Signup, and planner to read slot snapshots.
7. Backfill sessions with `ao_location_id` where confidence is high; leave unknowns explicit.
8. Consolidate The Watch and other reviewed aliases.
9. Move AO edit UI into identity/location/schedule editors.
10. Add final non-null/unique guards only after reports show no ambiguous rows.
