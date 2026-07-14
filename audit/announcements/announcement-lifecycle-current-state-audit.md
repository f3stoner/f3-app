# Announcement Lifecycle Current-State Audit

Date: 2026-07-14

## 1. Executive Summary

The announcement lifecycle refactor is partially implemented but not complete. The core resolver and planned-workout auto/custom model exist, and normal planned-workout save paths no longer persist generated auto text. Backblast generation now uses `getSessionAnnouncementText(session)`, which is the right direction.

The feature is not ready to commit or deploy as-is. There are critical gaps:

- `src/utils/announcements.js` exports `invalidatePlannerAnnouncementCache()` but references `state` without importing it. Announcement create/edit/delete/toggle/reorder actions call this function, so admin CRUD can throw after saving and cache invalidation is unreliable.
- Normal session hydration through `loadRecentSessions()` does not select `announcement_text` or `announcement_snapshot`, so the new immutable session snapshot columns are mostly invisible after reload.
- Manual session logging, dashboard quick logging, Q-slot logging, backblast-review session creation, imports, and batch inserts do not build session announcement snapshots.
- Planned-workout detail creates the session snapshot before the session form, not immediately before successful save. Announcement changes between "Log This Workout" and Save are missed.
- Preblast generation still omits announcements because `generatePreblast()` never reads `workout.announcementText`.
- Copy to new plan from planned-workout detail still spreads the source workout without resetting `announcementMode` or `announcementText`.

The likely cause of a recently logged session with `announcement_text` empty, `announcement_snapshot` null, and no announcements in the backblast is a bypass path that does not call `buildSessionAnnouncementSnapshot()`: manual session logging, dashboard quick log, Q-slot log via `startSessionFromQSlot()`, or an import/review insert. A second possible path is planned-workout detail before planner announcements finish loading, which can create an empty snapshot, though that should still populate `announcement_snapshot`.

## 2. Current Architecture

The current implementation has three layers:

- Resolver layer: `src/utils/announcements.js` contains `resolveActiveAnnouncements()`, `getEffectiveWorkoutAnnouncementText()`, `buildSessionAnnouncementSnapshot()`, `getSessionAnnouncementText()`, and `invalidatePlannerAnnouncementCache()`.
- Planned-workout layer: `planned_workouts.announcement_mode` controls whether stored `announcement_text` is custom text or ignored auto text.
- Session layer: `sessions.announcement_text` and `sessions.announcement_snapshot` are intended to be immutable logged-session snapshots.

Runtime sources:

- Dashboard active announcements use `loadAnnouncements()`.
- Planner/detail effective announcements use `loadPlannerAnnouncements()` candidates plus `getEffectiveWorkoutAnnouncementText()`.
- Planned-workout detail creates session snapshots with `buildSessionAnnouncementSnapshot()`.
- Backblast generation uses `getSessionAnnouncementText()`.

The architecture is directionally correct, but the snapshot boundary is not centralized and hydration is incomplete.

## 3. Confirmed Working Behavior

- `src/utils/announcements.js:117` filters active announcements by active flag, date range, region, AO, and scope.
- `src/utils/announcements.js:161` implements auto/custom effective text selection.
- `src/utils/announcements.js:228` builds structured session snapshots.
- `src/utils/announcements.js:269` provides a logged-session text fallback chain.
- `src/services/cloudData.js:1001` and `src/services/cloudData.js:1061` persist planned-workout `announcement_mode`.
- `src/services/cloudData.js:1005` and `src/services/cloudData.js:1065` persist `announcement_text` only for custom planned workouts.
- `src/views/workoutPlannerView.js:1260` switches planner text edits to custom mode.
- `src/views/workoutPlannerView.js:1281` resets custom text to auto mode.
- `src/modules/backblast.js:250` uses `getSessionAnnouncementText(session)` rather than directly using live announcements.
- `src/views/sessionDetailView.js:446` uses `getSessionAnnouncementText(session)` for session detail display.
- `src/views/sessionDetailView.js:526` resets copy-from-session planned workouts to auto mode.

## 4. Confirmed Defects

### Critical: Announcement CRUD Cache Invalidation Can Throw

- File: `src/utils/announcements.js`
- Function: `invalidatePlannerAnnouncementCache`
- Current behavior: lines 289-294 reference `state`, but the module does not import `state`.
- Expected behavior: invalidate planner announcement cache reliably after announcement CRUD.
- Triggering path: `src/views/announcementManagementView.js:183`, `293`, `406`, `440`.
- Severity: Critical.
- Recommended change: import `state` or move invalidation into a state-aware module.
- Callers affected: create, edit, reorder, activate/deactivate, delete.

### Critical: Session Snapshots Are Not Hydrated On Normal Region Load

- File: `src/services/cloudData.js`
- Function: `loadRecentSessions`
- Current behavior: lines 56-81 select session fields but omit `announcement_text` and `announcement_snapshot`; `loadRegionData()` maps those rows at lines 522-533.
- Expected behavior: normal app hydration should load immutable snapshot columns.
- Triggering path: app load, region switch, cross-device reopen.
- Severity: Critical.
- Recommended change: add `announcement_text` and `announcement_snapshot` to every session selector that maps through `mapSessionFromDb()` or can later update a session.
- Callers affected: dashboard, session detail, backblast, session edit, cross-device sessions.

### Critical: Manual Session Logging Does Not Build Snapshot

- File: `src/views/sessionView.js`
- Function: session save click handler
- Current behavior: new-session path at lines 1468-1472 sends `draftSession` to `addSession()` without building `announcementText` or `announcementSnapshot`.
- Expected behavior: every new session save should build a valid snapshot immediately before insert, even when text is intentionally blank.
- Triggering path: manual session logging with no source planned workout.
- Severity: Critical.
- Recommended change: centralize snapshot creation in `sessionView` or `addSession()` before `insertSession()`.
- Callers affected: manual logging, Q-slot logging, dashboard quick logging, any `state.draftSession` path.

### Critical: Dashboard Quick Log Bypasses Snapshot

- File: `src/views/dashboardView.js`
- Function: next-Q log handlers
- Current behavior: lines 692-718 and 913-939 set `state.draftSession.workout = matchingWorkout || null` with no effective announcement resolution or snapshot.
- Expected behavior: draft creation may attach source workout identity, but snapshot must be created at save time from current candidates.
- Triggering path: dashboard "Log Session" and dashboard card click for today's past Q.
- Severity: Critical.
- Recommended change: do not rely on dashboard draft data; snapshot in session save using source planned workout and current candidates.
- Callers affected: dashboard logging, backblast generation after save.

### Critical: Q-Slot Logging Bypasses Snapshot

- File: `src/utils/sessionNavigation.js`
- Function: `startSessionFromQSlot`
- Current behavior: lines 11-28 create a session from a Q slot with no workout and no snapshot.
- Expected behavior: save should create a structured snapshot, even if text is blank.
- Triggering path: Q-slot session logging.
- Severity: Critical.
- Recommended change: snapshot at session save, using session date/AO and current candidate announcements.
- Callers affected: Q Signup or calendar flows using `startSessionFromQSlot()`.

### High: Snapshot Boundary Occurs Too Early

- File: `src/views/plannedWorkoutDetailView.js`
- Function: log button handler
- Current behavior: lines 1195-1213 build the snapshot before navigating to the session form.
- Expected behavior: successful session save is the only immutable boundary; snapshot should be built immediately before `addSession()`.
- Triggering path: user clicks "Log This Workout", admin edits announcements while user is on session form, user saves session.
- Severity: High.
- Recommended change: move snapshot creation to new-session save path.
- Callers affected: planned-workout detail logging and execution logging.

### High: Planned-Workout Detail Copy Carries Custom Announcement State

- File: `src/views/plannedWorkoutDetailView.js`
- Function: copy-to-new-plan handler
- Current behavior: lines 1294-1325 spread `...workout` and do not reset `announcementMode`, `announcementText`, or `announcementLegacyText`.
- Expected behavior: copying a workout resets announcement behavior to auto.
- Triggering path: planned-workout detail "Copy to New Plan".
- Severity: High.
- Recommended change: explicitly set `announcementMode: "auto"`, `announcementText: ""`, `announcementLegacyText: ""`.
- Callers affected: copied draft opened in planner.

### High: Preblast Generation Still Omits Announcements

- File: `src/modules/generatePreblast.js`
- Function: `generatePreblast`
- Current behavior: lines 37-65 never read `workout.announcementText`.
- Expected behavior: generated and regenerated preblasts should include current effective announcements.
- Triggering path: planned-workout detail preblast and dashboard preblast.
- Severity: High.
- Recommended change: append an announcements section when `workout.announcementText` is non-empty.
- Callers affected: `plannedWorkoutDetailView`, `dashboardView`, `preblastView`.

### High: Dashboard Preblast Uses Stale Or Missing Announcement Text

- File: `src/views/dashboardView.js`
- Function: next-Q preblast handler
- Current behavior: lines 833-849 call `generatePreblast(matchingWorkout || fallbackWorkout, ...)` without deriving effective announcements.
- Expected behavior: preblast should use current effective announcement text for the workout date/AO.
- Triggering path: dashboard "Post Preblast".
- Severity: High.
- Recommended change: load candidates and pass an effective workout with `announcementText`.
- Callers affected: dashboard preblast generation.

### High: Empty Explicit Snapshots Fall Back To Legacy Nested Text After Reload

- File: `src/services/cloudData.js`
- Function: `mapSessionFromDb`
- Current behavior: lines 595-600 use `typeof row.announcement_text === "string"`; but normal selectors omit the column, so explicit empty `announcement_text = ''` is not distinguishable from not selected.
- Expected behavior: if top-level snapshot columns exist and were intentionally blank, they must hydrate as blank and prevent fallback to stale nested text.
- Triggering path: app reload after blank snapshot session.
- Severity: High.
- Recommended change: select columns everywhere; consider snapshot presence logic that distinguishes omitted columns from null columns.
- Callers affected: session detail, backblast generation, session edit.

### High: Batch/Import Session Inserts Bypass Snapshot Columns

- File: `src/services/cloudData.js`
- Function: `insertSessionsBatch`
- Current behavior: lines 1101-1117 omit `announcement_text` and `announcement_snapshot`.
- Expected behavior: imported/batch sessions should either write null with explicit legacy classification or provide a structured snapshot if applicable.
- Triggering path: `src/services/importOld300.js`, `src/services/importAggieland.js`, `src/modules/state.js`.
- Severity: High.
- Recommended change: include snapshot fields or clearly classify as legacy; do not later overwrite snapshots through full updates.
- Callers affected: historical import and repair flows.

### High: Backblast Review Session Creation Bypasses Snapshot Columns

- File: `src/services/cloudData.js`
- Function: `insertSessionFromBackblastReview`
- Current behavior: lines 2209-2228 insert sessions without `announcement_text`, `announcement_snapshot`, or `workout`.
- Expected behavior: create explicit blank snapshot or legacy classification.
- Triggering path: `src/views/backblastReviewView.js:1491-1508`.
- Severity: High.
- Recommended change: write `announcement_text: ""` plus structured snapshot when creating reviewed sessions, or document legacy null.
- Callers affected: backblast review session creation.

### Medium: Dead Backblast Fallback Still Reads Live Announcements

- File: `src/views/backblastView.js`
- Function: `appendAnnouncementsToBackblast`
- Current behavior: lines 77-98 directly read `session.workout.announcementText` and fall back to `filterDateAwareContent(state.announcements, session.date)`.
- Expected behavior: no live announcement fallback for logged sessions.
- Triggering path: no current call site found.
- Severity: Medium.
- Recommended change: delete this function or rewrite it to use `getSessionAnnouncementText(session)` only.
- Callers affected: none currently, but future reuse would violate lifecycle rules.

### Medium: Candidate Cache Has No Midnight, Focus, Or Cross-Device Refresh

- Files: `src/views/workoutPlannerView.js`, `src/views/plannedWorkoutDetailView.js`
- Functions: planner/detail announcement loading blocks
- Current behavior: candidates load once per region and after local admin invalidation only.
- Expected behavior: announcement changes and date rollover should propagate to unlogged surfaces without hard refresh.
- Triggering path: app stays open across midnight, app returns from background, another device edits announcements.
- Severity: Medium.
- Recommended change: add stale-time/date-key/focus refresh or realtime announcement subscription.
- Callers affected: planner, detail, execution, preblast, session snapshot.

### Medium: State Cache Fields Are Undeclared

- File: `src/modules/state.js`
- Function: state initialization
- Current behavior: `plannerAnnouncements`, `plannerAnnouncementsRegionId`, `hasLoadedPlannerAnnouncements`, and `isLoadingPlannerAnnouncements` are used but not declared.
- Expected behavior: state schema should declare cache fields.
- Triggering path: planner/detail load.
- Severity: Medium.
- Recommended change: add explicit defaults.
- Callers affected: planner/detail cache handling.

## 5. High-Risk Bypass Paths

- Manual session logging: `src/views/sessionView.js:162` creates a blank session and save does not snapshot.
- Dashboard quick log: `src/views/dashboardView.js:692` and `913` create draft sessions without snapshots.
- Q-slot log: `src/utils/sessionNavigation.js:11` creates draft sessions without snapshots.
- Backblast review creation: `src/views/backblastReviewView.js:1491` plus `insertSessionFromBackblastReview()` omit snapshot fields.
- Batch imports: `insertSessionsBatch()` omits snapshot fields.
- Import repair utilities: `src/services/importAggieland.js:559` and `1311` can call `updateSessionInCloud()` with session objects missing snapshot fields.
- Admin/session update utilities that use partial session objects can null snapshots because `updateSessionInCloud()` writes `announcement_text: null` when missing.

## 6. Canonical Resolver Audit

Current canonical resolver:

- `resolveActiveAnnouncements()` in `src/utils/announcements.js:117`.
- Callers:
  - `loadAnnouncements()` at `src/services/cloudData.js:1891`.
  - `getEffectiveWorkoutAnnouncementText()` at `src/utils/announcements.js:195`.

Effective workout resolver:

- `getEffectiveWorkoutAnnouncementText()` callers:
  - `src/views/workoutPlannerView.js:1239`.
  - `src/views/plannedWorkoutDetailView.js:314`.

Session snapshot helper:

- `buildSessionAnnouncementSnapshot()` caller:
  - `src/views/plannedWorkoutDetailView.js:1196` only.

Session text helper:

- `getSessionAnnouncementText()` callers:
  - `src/modules/backblast.js:250`.
  - `src/views/sessionDetailView.js:446`.

Remaining direct date/scope filters:

- `src/views/announcementManagementView.js:231` uses `filterDateAwareContent()` for copy text, not the canonical resolver.
- `src/views/backblastView.js:84` uses `filterDateAwareContent()` in a dead fallback helper.

Remaining direct reads of stored announcement text:

- `src/views/backblastView.js:78` directly reads `session?.workout?.announcementText` in dead helper.
- `src/services/cloudData.js:599` and `src/utils/announcements.js:281` use nested text as legacy fallback.
- `src/modules/generatePreblast.js` does not read announcement text at all.

Behavior differences:

- Dashboard: uses `loadAnnouncements()` for today only.
- Planner: uses broad candidates and effective resolver.
- Detail/execution: uses effective resolver, but only with current cache.
- Preblast: planned-detail path injects effective text, but generator ignores it; dashboard path does not inject effective text.
- Session logging: planned-detail path precomputes snapshot; manual/dashboard/Q-slot paths do not.

## 7. Cache Lifecycle Audit

Create/edit/delete/activate/deactivate/reorder:

- `announcementManagementView` reloads dashboard/admin announcements then calls `invalidatePlannerAnnouncementCache()`.
- Because invalidation references undefined `state`, these paths can fail after successful DB writes.

Returning to planner:

- Planner loads candidates if `hasLoadedPlannerAnnouncements` is false or region changed.
- It does not check candidate age or date rollover.

Returning to planned-workout detail:

- Detail uses the same cache rules as planner.
- No hard refresh is required if cache was invalidated correctly, but current invalidation can throw.

Execution view open/resume:

- Execution uses planned-workout detail and the same cache.
- `activeWorkoutExecution` localStorage stores metadata only, which is good.
- Candidate cache is not forced fresh on execution open.

Preblast generation:

- Planned-detail preblast uses current detail `effectiveAnnouncements`, subject to stale cache.
- Dashboard preblast does not use effective announcements.

App across midnight:

- No `visibilitychange`, focus, timer, or date-key refresh was found for announcements.

App returning from background:

- No announcement refresh path was found.

Switching regions:

- Planner/detail clear cache on region mismatch.
- `replacePersistedData()` resets `allAnnouncements` but does not explicitly clear planner announcement cache.

Switching devices:

- No realtime announcement subscription was found. Other-device changes require reload, region reload, or a local stale-refresh mechanism that does not yet exist.

Hard refresh still required:

- Cross-device announcement edits.
- App left open across midnight.
- Any admin edit path where invalidation throws before the current view reloads candidates.

## 8. Planned-Workout Lifecycle Audit

- New workouts default to auto at render time in `workoutPlannerView.js:160`; `createPlannedWorkout()` itself does not include announcement defaults.
- Legacy workouts map to auto unless `announcement_mode = 'custom'` at `cloudData.js:645`.
- Custom typing switches mode at `workoutPlannerView.js:1260`.
- Custom text persists through planned-workout insert/update.
- Reset returns to auto at `workoutPlannerView.js:1281`.
- Date changes clear auto text and preserve custom at `workoutPlannerView.js:657`.
- AO changes clear auto text and preserve custom at `workoutPlannerView.js:726`.
- Finalize does not snapshot generated text because insert/update persist auto text as null.
- Reopening finalized workouts resolves current announcements in detail if cache is current.
- Saved auto workouts do not persist generated text on normal save.
- Copy inside planner resets to auto at `workoutPlannerView.js:475`.
- Copy from session resets to auto at `sessionDetailView.js:526`.
- Copy from planned-workout detail does not reset and is defective.

## 9. Preview/Detail/Execution Audit

Preview:

- Planner preview injects effective text at `workoutPlannerView.js:1107`.
- Detail re-resolves `state.previewWorkout` at `plannedWorkoutDetailView.js:313`.
- Risk: preview uses whatever candidate cache is currently loaded.

Detail:

- Announcement section uses `effectiveAnnouncements.text` at `plannedWorkoutDetailView.js:1120`.
- Good when candidates are current.

Execution:

- Execution uses detail view and derives effective text from current candidates.
- Resume localStorage stores only metadata.
- Risk: no forced candidate refresh on execution open/resume.

Log from execution:

- Uses planned-detail log handler and builds snapshot before session form, not before save.

## 10. Preblast Audit

Planned-workout detail:

- `plannedWorkoutDetailView.js:1386` builds `effectiveWorkout` with `announcementText`.
- `generatePreblast()` ignores that field.

Dashboard:

- `dashboardView.js:847` uses saved Q-slot draft or calls `generatePreblast()` with raw `matchingWorkout` or fallback workout.
- It does not resolve current effective announcements.

Saved preblast drafts:

- `q_slots.preblast_text` is preserved intentionally.
- This is acceptable for user-edited preblast drafts.

Regeneration:

- There is no evidence that regenerating from `preblastView` refreshes announcements; the generator lacks announcement support.

## 11. Session Creation Path Matrix

| Path | Source | Candidates fresh at save? | Source workout available? | Snapshot populated? | Nested fallback populated? | Defect |
| --- | --- | --- | --- | --- | --- | --- |
| Planned-workout detail log | `plannedWorkoutDetailView.js:1162` | No; uses existing cache before session form | Yes | Yes, early | Yes | Snapshot too early; cache may be empty/stale |
| Execution finish/log | Same detail handler | No | Yes | Yes, early | Yes | Same as above |
| Manual session logging | `sessionView.js:162` | No | No | No | No | Critical bypass |
| Dashboard quick log | `dashboardView.js:692`, `913` | No | Maybe raw matching workout | No | Maybe stale raw workout text | Critical bypass |
| Q-slot logging | `sessionNavigation.js:11` | No | No | No | No | Critical bypass |
| Backblast review creation | `backblastReviewView.js:1491` | No | No | No | No | Critical bypass |
| Batch imports | `insertSessionsBatch()` | No | Maybe legacy JSON | No | Maybe legacy JSON | Critical bypass |
| Nightly import edge function | `supabase/functions/nightly-aggieland-import/index.ts:107` | No | Maybe legacy JSON | No | Maybe legacy JSON | Critical bypass |

## 12. Session Snapshot Audit

Normal insert:

- `insertSession()` writes `announcement_text` and `announcement_snapshot` at `cloudData.js:871`.
- If the session object lacks these properties, DB fields become null.

Normal update:

- `updateSessionInCloud()` writes those fields at `cloudData.js:937`.
- If a caller passes a partial session object, snapshot fields can be nulled.

Snapshot can be null:

- Yes. Any bypass path leaves it null.

Empty text can be intentional:

- The model supports `announcement_text = ''` and a structured snapshot with empty `text`.
- Current hydration undermines this because normal selectors omit snapshot columns.

Snapshot timing:

- Planned-workout detail creates it before the session form.
- Manual/session save does not create it.
- The implementation does not yet meet the "successful save is the only immutable boundary" rule.

## 13. Session Editing Immutability Audit

`sessionView` edit path:

- Lines 1450-1459 preserve `originalSession.announcementText` and `originalSession.announcementSnapshot`.
- This works only if `originalSession` was hydrated with the snapshot columns.

Risk from hydration:

- `loadRecentSessions()` omits `announcement_text` and `announcement_snapshot`, so `originalSession.announcementSnapshot` is often null after reload.
- If nested workout fallback exists, `announcementText` maps from nested text.
- Explicit blank snapshots are especially unsafe.

Other update paths:

- `backblastView` updates spread the session object and usually preserve whatever is loaded.
- `adminFlagsView` spreads session objects and should preserve loaded fields.
- Import repair utilities can use partial objects and call `updateSessionInCloud()` directly, risking null snapshots.

## 14. Backblast Audit

Working:

- `generateBackblast()` uses `getSessionAnnouncementText(session)`.
- `sessionDetailView` uses `getSessionAnnouncementText(session)`.
- Backblast reset regenerates from session object, not live announcements.
- Saved `backblastText` is preserved unless reset/done/share rewrites it.

Defects:

- If the session object was not hydrated with top-level snapshot fields, generation falls back to nested `workout.announcementText`.
- If a session was created through a bypass path with no snapshot and no nested workout text, no announcements appear.
- `appendAnnouncementsToBackblast()` still has live fallback logic, although unused.

Remaining direct read:

- `src/views/backblastView.js:78` reads `session?.workout?.announcementText` outside canonical fallback logic.

## 15. Data Model And Mapper Audit

Migration:

- `20260714023305_add_announcement_lifecycle_fields.sql` adds `planned_workouts.announcement_mode`, `planned_workouts.announcement_legacy_text`, `sessions.announcement_text`, and `sessions.announcement_snapshot`.
- `announcement_mode` is defaulted to `auto`, set not null, and constrained to `auto` or `custom`.
- Session snapshot columns are nullable.

Mapper coverage:

- `mapPlannedWorkoutFromDb()` maps all planned-workout lifecycle fields.
- `mapSessionFromDb()` maps session snapshot fields when selected.

Insert/update coverage:

- Normal `insertSession()` and `updateSessionInCloud()` cover snapshot fields.
- `insertSessionsBatch()` and `insertSessionFromBackblastReview()` do not.

Selector coverage:

- Normal `loadRecentSessions()` omits snapshot fields.
- `loadOlderSessionsPage()` omits snapshot fields.
- Several specialized session selectors omit snapshot fields.

RPC/trigger/import bypasses:

- No DB trigger was found to enforce snapshot creation.
- Nightly import edge function inserts sessions without snapshot fields.
- Backblast review insert bypasses normal mapper and snapshot fields.

## 16. Legacy Compatibility Audit

Planned workouts:

- Existing non-empty `announcement_text` is preserved in `announcement_legacy_text`.
- Existing planned workouts are set to auto.
- Runtime ignores auto stored text on save/update.

Sessions:

- Fallback order is top-level text, snapshot text, nested workout text, blank.
- This supports legacy nested-workout-only sessions.
- It does not safely support explicit blank snapshots until all selectors hydrate the new columns.

## 17. Production Data Classification SQL

Read-only measurement queries:

```sql
-- Fully snapshotted new sessions.
select count(*) as fully_snapshotted
from public.sessions
where announcement_snapshot is not null
  and announcement_text is not null;

-- Text-only new sessions.
select count(*) as text_only
from public.sessions
where announcement_text is not null
  and announcement_snapshot is null;

-- Legacy nested-workout-only sessions.
select count(*) as nested_workout_only
from public.sessions
where announcement_text is null
  and announcement_snapshot is null
  and nullif(trim(workout->>'announcementText'), '') is not null;

-- Sessions with no announcement data.
select count(*) as no_announcement_data
from public.sessions
where announcement_text is null
  and announcement_snapshot is null
  and nullif(trim(coalesce(workout->>'announcementText', '')), '') is null;

-- Sessions with explicit blank top-level snapshot text.
select count(*) as explicit_blank_text_with_snapshot
from public.sessions
where announcement_text = ''
  and announcement_snapshot is not null;

-- Planned workouts in auto.
select count(*) as planned_auto
from public.planned_workouts
where announcement_mode = 'auto';

-- Planned workouts in custom.
select count(*) as planned_custom
from public.planned_workouts
where announcement_mode = 'custom';

-- Legacy preserved text.
select count(*) as planned_legacy_preserved
from public.planned_workouts
where nullif(trim(announcement_legacy_text), '') is not null;

-- Auto planned workouts still carrying old stored text.
select count(*) as auto_with_stored_text
from public.planned_workouts
where announcement_mode = 'auto'
  and nullif(trim(announcement_text), '') is not null;

-- Sessions likely created through bypass paths after migration.
select id, date, ao_name, source_planned_workout_id, source_q_slot_id, created_at
from public.sessions
where created_at >= timestamp '2026-07-14 02:33:05'
  and announcement_text is null
  and announcement_snapshot is null
order by created_at desc;
```

## 18. Exact Remaining Direct Stale Reads

- `src/views/backblastView.js:78`: direct nested workout announcement read in unused helper.
- `src/views/backblastView.js:84`: live announcement fallback in unused helper.
- `src/services/cloudData.js:599`: legacy fallback from nested workout text.
- `src/utils/announcements.js:281`: legacy fallback from nested workout text.
- `src/views/dashboardView.js:710` and `931`: raw matching workout attached to draft session without effective text.
- `src/modules/generatePreblast.js`: no read of effective text, causing omission rather than stale text.

## 19. Exact Files And Functions Requiring Changes

- `src/utils/announcements.js`: `invalidatePlannerAnnouncementCache`, `getSessionAnnouncementText`.
- `src/services/cloudData.js`: `loadRecentSessions`, `loadOlderSessionsPage`, all session selectors mapped through `mapSessionFromDb`, `insertSessionsBatch`, `insertSessionFromBackblastReview`, `updateSessionInCloud`.
- `src/services/appData.js`: `normalizeSessionForSave`, `addSession`, `updateSession`.
- `src/views/sessionView.js`: new-session save path.
- `src/views/plannedWorkoutDetailView.js`: log handler, copy-to-new-plan handler, preblast handler.
- `src/views/dashboardView.js`: quick log handlers, preblast handler, planned draft constructors.
- `src/utils/sessionNavigation.js`: `startSessionFromQSlot`.
- `src/modules/generatePreblast.js`: `generatePreblast`.
- `src/views/backblastView.js`: remove or rewrite `appendAnnouncementsToBackblast`.
- `src/modules/plannedWorkouts.js`: `createPlannedWorkout`.
- `src/modules/sessions.js`: `createSession`.
- `src/modules/state.js`: declare planner announcement cache fields.
- `src/services/importAggieland.js`, `src/services/importOld300.js`, `supabase/functions/nightly-aggieland-import/index.ts`: classify or populate snapshots.

## 20. Ordered Remediation Plan

1. Fix `invalidatePlannerAnnouncementCache()` so admin CRUD does not throw.
2. Add snapshot columns to all normal session selectors, especially `loadRecentSessions()` and `loadOlderSessionsPage()`.
3. Centralize new-session snapshot creation immediately before `insertSession()` via `addSession()` or `sessionView` save.
4. Make manual/dashboard/Q-slot session paths provide source context but rely on centralized save-time snapshotting.
5. Move planned-workout detail snapshot creation out of the pre-save launch handler.
6. Reset planned-workout detail copy to auto.
7. Update `generatePreblast()` to include `workout.announcementText`.
8. Update dashboard preblast to derive effective announcements.
9. Remove live fallback helper from `backblastView`.
10. Protect `updateSessionInCloud()` from nulling snapshots when callers pass partial session objects.
11. Add cache date-key/focus/realtime refresh.
12. Add tests.

## 21. Recommended Tests

- Auto workout remains dynamic after announcement edit.
- Finalized auto workout reflects announcement edit/deactivate/delete.
- Custom workout remains fixed.
- Reset custom returns to current auto.
- Copy from planned workout resets to auto.
- Copy from custom workout does not carry custom text.
- Copy from session resets to auto.
- Cache invalidates after create/edit/delete/toggle/reorder.
- App open across midnight refreshes candidates.
- Cross-device reopen hydrates snapshot fields.
- Execution resume refreshes candidates.
- Planned-workout logging snapshots at save time.
- Manual logging creates structured blank or resolved snapshot.
- Dashboard quick log creates snapshot.
- Q-slot logging creates snapshot.
- Backblast review creation creates explicit blank snapshot or classified legacy null.
- Session edit preserves `announcement_text`, `announcement_snapshot`, and nested fallback.
- Backblast regeneration uses snapshot only.
- Explicit blank snapshot does not fall back to stale nested text.
- Legacy nested fallback works.
- Preblast generation includes current effective announcements.
- Saved preblast draft remains custom.

## 22. Manual Validation Checklist

1. Create an announcement for tomorrow.
2. Create and finalize an auto planned workout for tomorrow.
3. Edit the announcement and confirm finalized detail updates.
4. Generate preblast and confirm announcement appears.
5. Save a custom announcement edit and confirm live edits no longer affect it.
6. Reset to auto and confirm current live text returns.
7. Copy the workout from detail and confirm copy is auto with no custom text.
8. Log from planned-workout detail, edit announcement before saving session, then save; confirm snapshot uses save-time text.
9. Log manually for a date/AO with announcements; confirm snapshot fields populate.
10. Log from dashboard quick path; confirm snapshot fields populate.
11. Log from Q slot; confirm snapshot fields populate.
12. Reload app and confirm session detail/backblast still use top-level snapshot.
13. Edit attendance/FNG/visitors and confirm snapshot unchanged.
14. Regenerate backblast after live announcement edit/delete and confirm historical text remains.
15. Leave app open across midnight and confirm expired announcements disappear from unlogged surfaces.

## 23. Risk Assessment

Overall risk is high until the snapshot boundary and hydration defects are fixed.

Data-loss risks:

- Partial session updates can null snapshot columns.
- Explicit blank snapshot semantics can be lost after reload.
- Import repair utilities can overwrite new columns with null.

Product risks:

- Users can still create sessions with no snapshot.
- Generated preblasts omit required announcements.
- Admin CRUD may throw after DB save due to broken invalidation.

Operational risks:

- Cross-device announcement updates do not propagate without reload.
- Open apps can retain stale candidates across midnight.

## 24. Whether The Feature Is Ready To Commit

No. The implementation has critical runtime defects and lifecycle bypasses.

## 25. Whether The Feature Is Ready To Deploy

No. Deploying would create new sessions with inconsistent snapshot coverage and could null snapshot fields during certain updates.

## 26. Exact Explanation For The Empty/Null Snapshot Session If Determinable

The exact row cannot be identified without production data, but the most likely code paths are determinable:

- Manual session logging: `sessionView.js:1468-1472` saves a new session without snapshot creation.
- Dashboard quick log: `dashboardView.js:692-718` or `913-939` creates `draftSession` without snapshot fields; session save persists null snapshot fields.
- Q-slot log: `sessionNavigation.js:11-28` creates `draftSession` without snapshot fields; session save persists null snapshot fields.
- Backblast review or import creation: `insertSessionFromBackblastReview()` and `insertSessionsBatch()` omit snapshot columns.

If the session came from planned-workout detail, an empty announcement text with non-null snapshot can occur when `state.plannerAnnouncements` had not loaded yet. That does not explain `announcement_snapshot null`; null points to a bypass path that never called `buildSessionAnnouncementSnapshot()`.

## 27. First Recommended Runtime Change

First file: `src/utils/announcements.js`.

First function: `invalidatePlannerAnnouncementCache()`.

Reason: it is an immediate runtime exception on announcement admin CRUD and blocks reliable propagation to unlogged planner/detail surfaces.

The next change should be `src/services/cloudData.js::loadRecentSessions()` to hydrate `announcement_text` and `announcement_snapshot`.

## 28. Any Unresolved Blocker

No blocker prevents remediation, but production row classification should be run before any cleanup/backfill. The current code audit is sufficient to say the lifecycle is incomplete and deployment should wait.
