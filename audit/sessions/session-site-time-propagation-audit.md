# Session Site/Time Propagation Audit

Date: 2026-07-13

Scope: read-only audit of runtime session-creation paths for AO -> Site -> recurring schedule propagation. Runtime code, migrations, database rows, and commits were not modified.

## 1. Executive Summary

- Total session-creation paths found: 8
- Already correct for the available source data: 2
- Missing `siteId`: 3
- Missing `startTime`: 7
- Requiring deeper investigation: 1

The normal `addSession()` persistence path maps runtime `siteId` -> database `site_id` and runtime `startTime` -> database `start_time`. `updateSessionInCloud()` also writes both fields, so the main loss points are draft creation and special insert paths before persistence.

The highest-risk path is planned-workout logging in `src/views/plannedWorkoutDetailView.js`. It creates the session draft from a planned workout but omits `siteId` and `startTime`. If the workout came from a Q slot, `sourceQSlotId` is available, so the local `findMatchingQSlotForWorkout(workout)` helper can recover the slot. Dashboard direct-log paths now include `siteId`, but both omit `startTime`.

Planned workouts currently persist `siteId` but not `startTime`; no runtime mapper or planned-workout insert/update includes `startTime`. Any use of `workout.startTime` is therefore only effective for transient draft objects unless planned-workout persistence is extended separately.

## 2. Session-Creation Path Inventory

| File | Function/block | Origin | Current siteId | Current startTime | Recommended change |
| ---- | -------------- | ------ | -------------- | ----------------- | ------------------ |
| `src/modules/sessions.js` | `createSession()` | Generic manual/default session draft factory | Missing/default absent | Missing/default absent | Add optional `siteId` and `startTime` params so callers can preserve source data. |
| `src/views/sessionView.js` | `renderSession()` fallback `createSession()` blocks | Manual logging fallback/no source object | No source available | Falls back during save to `ao?.time` | No required source-specific fix; consider exposing UI/params later. |
| `src/views/sessionView.js` | Save button -> `normalizeSessionForSave()` -> `addSession(sessionToCreate)` | Existing draft/session | Preserved if present | Preserved if present; otherwise falls back to AO time | Correct as persistence handoff, but AO fallback can mask missing slot override time from upstream drafts. |
| `src/views/dashboardView.js` | Next Q CTA "Log Session" `state.draftSession` | Q slot + AO + optional planned workout | Present: `matchingWorkout?.siteId || nextQSlot.siteId || null` | Missing | Add `startTime: matchingWorkout?.startTime || nextQSlot.overrideTime || nextQSlot.startTime || null`. |
| `src/views/dashboardView.js` | Next Q card click `state.draftSession` | Q slot + AO + planned workout | Present: `matchingWorkout?.siteId || nextQSlot.siteId || null` | Missing | Add `startTime: matchingWorkout?.startTime || nextQSlot.overrideTime || nextQSlot.startTime || null`. |
| `src/views/plannedWorkoutDetailView.js` | Log This Workout / Finish & Log Session | Planned workout + optional Q slot | Missing | Missing | Use `workout.siteId || matchingQSlot?.siteId || null` and `workout.startTime || matchingQSlot?.overrideTime || matchingQSlot?.startTime || null`. |
| `src/utils/sessionNavigation.js` | `startSessionFromQSlot(qSlot)` from session audit | Audit row/Q-slot-like object + AO | Missing | Missing | Extend audit rows to include `siteId`, `startTime`, `overrideTime`, then set them in the draft. Also handle raw `qSlot.id` vs audit `qSlot.slotId`. |
| `src/views/backblastReviewView.js` | `createSessionFromReviewMatch()` -> `insertSessionFromBackblastReview()` | Historical backblast + selected AO | Missing | Uses `selectedAo.time || null` | If the review can identify a Q slot/site, use those; otherwise add `siteId: selectedAo.siteId || null` only if AO has that field. Current selected AO source is not site-aware. |

## 3. Exact Recommended Edits

### `src/modules/sessions.js` - `createSession()`

Existing code:

```js
export function createSession(date, { aoId = null, aoName = "" } = {}) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        aoName,
```

Replacement:

```js
export function createSession(date, { aoId = null, aoName = "", siteId = null, startTime = null } = {}) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        siteId,
        aoName,
        startTime,
```

This keeps existing callers working while allowing source-aware callers to pass the fields directly.

### `src/views/dashboardView.js` - Next Q CTA `state.draftSession`

Existing block around lines 692-713:

```js
state.draftSession = {
    id: crypto.randomUUID(),
    date: nextQSlot.date,
    aoId: ao?.id || nextQSlot.aoId || null,
    siteId:
        matchingWorkout?.siteId ||
        nextQSlot.siteId ||
        null,
    aoName: ao?.name || "",
```

Replacement:

```js
state.draftSession = {
    id: crypto.randomUUID(),
    date: nextQSlot.date,
    aoId: ao?.id || nextQSlot.aoId || null,
    siteId:
        matchingWorkout?.siteId ||
        nextQSlot.siteId ||
        null,
    startTime:
        matchingWorkout?.startTime ||
        nextQSlot.overrideTime ||
        nextQSlot.startTime ||
        null,
    aoName: ao?.name || "",
```

Available source objects: `nextQSlot`, `ao`, `matchingWorkout`. Current draft includes `aoId`, `siteId`, `sourceQSlotId`, and `sourcePlannedWorkoutId`; it does not include `startTime`. Without this change, save normalization can store `ao?.time` instead of the Q-slot override/snapshot.

### `src/views/dashboardView.js` - Next Q card click `state.draftSession`

Existing block around lines 908-929:

```js
state.draftSession = {
    id: crypto.randomUUID(),
    date: nextQSlot.date,
    aoId: ao?.id || nextQSlot.aoId || null,
    siteId:
        matchingWorkout?.siteId ||
        nextQSlot.siteId ||
        null,
    aoName: ao?.name || "",
```

Replacement:

```js
state.draftSession = {
    id: crypto.randomUUID(),
    date: nextQSlot.date,
    aoId: ao?.id || nextQSlot.aoId || null,
    siteId:
        matchingWorkout?.siteId ||
        nextQSlot.siteId ||
        null,
    startTime:
        matchingWorkout?.startTime ||
        nextQSlot.overrideTime ||
        nextQSlot.startTime ||
        null,
    aoName: ao?.name || "",
```

Available source objects: `nextQSlot`, `ao`, `matchingWorkout`. Same loss as the CTA path.

### `src/views/plannedWorkoutDetailView.js` - Log This Workout / Finish & Log Session

Existing block around lines 1117-1145:

```js
const sessionDate =
    workout.date ||
    state.executionContext?.executionDate ||
    getTodayDate();

const session = createSession(sessionDate, {
    aoId: workout.aoId || null,
    aoName: workout.aoName || "",
});
```

Replacement:

```js
const sessionDate =
    workout.date ||
    state.executionContext?.executionDate ||
    getTodayDate();

const matchingQSlot = findMatchingQSlotForWorkout(workout);

const session = createSession(sessionDate, {
    aoId: workout.aoId || null,
    aoName: workout.aoName || "",
    siteId:
        workout.siteId ||
        matchingQSlot?.siteId ||
        null,
    startTime:
        workout.startTime ||
        matchingQSlot?.overrideTime ||
        matchingQSlot?.startTime ||
        null,
});
```

Existing source-Q-slot assignment:

```js
session.sourcePlannedWorkoutId = workout.id;
session.sourceQSlotId = workout.sourceQSlotId || null;
```

Replacement:

```js
session.sourcePlannedWorkoutId = workout.id;
session.sourceQSlotId = workout.sourceQSlotId || matchingQSlot?.id || null;
```

Available source objects: `workout`, `state.executionContext`, `matchingQSlot` from local helper `findMatchingQSlotForWorkout(workout)`. Current draft includes `aoId`, `sourcePlannedWorkoutId`, and usually `sourceQSlotId`; it omits `siteId` and `startTime`.

### `src/utils/sessionNavigation.js` - `startSessionFromQSlot(qSlot)`

Existing block:

```js
state.draftSession = createSession(qSlot.date, {
    aoId: qSlot.aoId,
    aoName: ao?.name || qSlot.aoName || "",
});

state.draftSession.sourceQSlotId = qSlot.slotId;
state.draftSession.qIds = qSlot.qId ? [qSlot.qId] : [];
state.draftSession.attendeeIds = qSlot.qId ? [qSlot.qId] : [];
```

Replacement once callers provide full slot fields:

```js
state.draftSession = createSession(qSlot.date, {
    aoId: qSlot.aoId,
    aoName: ao?.name || qSlot.aoName || "",
    siteId: qSlot.siteId || null,
    startTime:
        qSlot.overrideTime ||
        qSlot.startTime ||
        null,
});

state.draftSession.sourceQSlotId = qSlot.slotId || qSlot.id || null;
state.draftSession.qIds = qSlot.qId ? [qSlot.qId] : [];
state.draftSession.attendeeIds = qSlot.qId ? [qSlot.qId] : [];
```

Current caller `src/views/sessionAuditView.js:createAuditRow()` passes audit rows from `loadSessionAuditRows()`, not raw runtime `state.qSlots`. Those rows currently have `slotId`, `date`, `time`, `aoId`, `aoName`, and `qId`, but not `siteId`, `startTime`, or `overrideTime`. The audit query in `src/services/cloudData.js` must first select and return `site_id`, `start_time`, and `override_time` as runtime `siteId`, `startTime`, and `overrideTime`.

### `src/services/cloudData.js` - `loadSessionAuditRows()`

Existing Q-slot select around lines 2522-2540:

```js
.select(`
    id,
    region_id,
    ao_id,
    date,
    q_user_id,
    override_time,
    override_title,
```

Replacement:

```js
.select(`
    id,
    region_id,
    ao_id,
    site_id,
    date,
    start_time,
    q_user_id,
    override_time,
    override_title,
```

Existing returned row around lines 2616-2624:

```js
return {
    slotId: slot.id,
    date: slot.date,
    time: slot.override_time || "",
    title: slot.override_title || "",
    aoId: slot.ao_id,
    aoName,
    qId: slot.q_user_id || null,
```

Replacement:

```js
return {
    slotId: slot.id,
    date: slot.date,
    time: slot.override_time || slot.start_time || "",
    title: slot.override_title || "",
    aoId: slot.ao_id,
    siteId: slot.site_id || null,
    aoName,
    startTime: slot.start_time || null,
    overrideTime: slot.override_time || null,
    qId: slot.q_user_id || null,
```

This is directly responsible for a session-creation path losing source site/time before `startSessionFromQSlot()`.

### `src/views/backblastReviewView.js` - `createSessionFromReviewMatch()`

Existing block around lines 1491-1506:

```js
const session = {
    id: crypto.randomUUID(),
    date: backblast.date,
    aoId: selectedAo.id,
    aoName: selectedAo.name,
    qIds,
    attendeeIds: [...new Set([...attendeeIds, ...qIds])],
    fngs: [],
    notes: "Created from historical Band backblast review.",
    attendanceReviewStatus: "reviewed",
    attendanceReviewNotes: "Session created manually from backblast review.",
    backblastText: backblast.cleanedContent || backblast.rawContent || "",
    startTime: selectedAo.time || null,
    createdByUserId: state.currentUserId || null,
    createdAt: Date.now(),
};
```

If no Q slot exists in this historical-review flow, the most concrete local source is `selectedAo`. Replacement is limited by the available data:

```js
const session = {
    id: crypto.randomUUID(),
    date: backblast.date,
    aoId: selectedAo.id,
    siteId: selectedAo.siteId || null,
    aoName: selectedAo.name,
    qIds,
    attendeeIds: [...new Set([...attendeeIds, ...qIds])],
    fngs: [],
    notes: "Created from historical Band backblast review.",
    attendanceReviewStatus: "reviewed",
    attendanceReviewNotes: "Session created manually from backblast review.",
    backblastText: backblast.cleanedContent || backblast.rawContent || "",
    startTime: selectedAo.time || null,
    createdByUserId: state.currentUserId || null,
    createdAt: Date.now(),
};
```

However, current AO objects are organizational identities in the new architecture. If `selectedAo.siteId` is not present or is not semantically valid, this path needs a UI/review match source for site selection rather than falling back to AO.

Also update `insertSessionFromBackblastReview()` before this can persist:

```js
site_id: session.siteId || null,
```

inserted beside `ao_id`.

## 4. Persistence Audit

### Normal session load

`src/services/cloudData.js:492-516` maps:

- `row.site_id` -> `siteId`
- `row.start_time` -> `startTime`
- `row.source_q_slot_id` -> `sourceQSlotId`
- `row.source_planned_workout_id` -> `sourcePlannedWorkoutId`

No camelCase/snake_case mismatch was found in `mapSessionFromDb()`.

### Normal session insert

`src/services/appData.js:addSession()` calls `ensureFngMembersForSession()` and then `insertSession(activeRegionId, normalizedSession)`. The app-data normalizer preserves arbitrary session fields via spread, so `siteId` and `startTime` survive this layer if present on the input draft.

`src/services/cloudData.js:700-727` sends:

- `site_id: session.siteId || null`
- `source_planned_workout_id: session.sourcePlannedWorkoutId || null`
- `source_q_slot_id: session.sourceQSlotId || null`
- `start_time: session.startTime || null`

Normal insert is correct.

### Normal session update

`src/services/appData.js:updateSession()` also preserves arbitrary fields through its normalizer before calling `updateSessionInCloud()`.

`src/services/cloudData.js:760-788` sends:

- `site_id: session.siteId || null`
- `source_q_slot_id: session.sourceQSlotId || null`
- `start_time: session.startTime || null`

Update is correct for these fields.

### Backblast review insert

`src/services/cloudData.js:2031-2057` sends `start_time: session.startTime || null` but does not send `site_id`. This means even if `backblastReviewView.js` adds `session.siteId`, the special insert path will drop it.

### Bulk/import session payload

`src/services/cloudData.js:925-937` builds a session payload that includes `source_q_slot_id` but not `site_id` or `start_time`. I did not count this in the primary runtime session-creation total because it appears to be import/bulk persistence rather than a user session-creation flow, but it is a persistence mismatch if this function is still used for new sessions.

### Planned workout persistence

`mapPlannedWorkoutFromDb()` maps `site_id` -> `siteId`. `insertPlannedWorkout()` and `updatePlannedWorkoutInCloud()` send `site_id: workout.siteId || null`.

No planned-workout mapper or persistence function maps `start_time`/`startTime`. Planned workouts therefore cannot currently serve as a persisted `startTime` source, even though the intended precedence references `matchingWorkout?.startTime`.

### Q slot persistence

`mapQSlotFromDb()` maps:

- `row.site_id` -> `siteId`
- `row.start_time` -> `startTime`
- `row.override_time` -> `overrideTime`

`insertQSlot()` and `updateQSlotInCloud()` send `site_id`, `start_time`, and `override_time`. Q-slot persistence is correct for the fields in this audit.

## 5. Dashboard-Specific Findings

### `getSlotDisplayTime()`

Current code in `src/views/dashboardView.js:569-581`:

```js
return (
    slot.overrideTime ||
    slot.startTime ||
    ao.timeSchedule?.[dayKey] ||
    ao.time ||
    ""
);
```

This matches the requested fallback order exactly.

### First `state.draftSession` block

`src/views/dashboardView.js:692-713`, "Log Session" CTA for past-today Q:

- Source objects: `nextQSlot`, `ao`, `matchingWorkout`
- Includes `aoId`: yes
- Includes `siteId`: yes
- Includes `startTime`: no
- Includes `sourceQSlotId`: yes, using `matchingWorkout?.sourceQSlotId || nextQSlot.id`
- Includes planned-workout provenance: yes, using `sourcePlannedWorkoutId: matchingWorkout?.id || null`

Recommendation: add `startTime` using `matchingWorkout?.startTime || nextQSlot.overrideTime || nextQSlot.startTime || null`.

### Second `state.draftSession` block

`src/views/dashboardView.js:908-929`, next-Q card click for finalized past-today Q:

- Source objects: `nextQSlot`, `ao`, `matchingWorkout`
- Includes `aoId`: yes
- Includes `siteId`: yes
- Includes `startTime`: no
- Includes `sourceQSlotId`: yes, using `matchingWorkout?.sourceQSlotId || nextQSlot.id`
- Includes planned-workout provenance: yes, using `sourcePlannedWorkoutId: matchingWorkout?.id || null`

Recommendation: add the same `startTime` expression as the CTA block.

### Related dashboard planned-workout source issue

`src/views/dashboardView.js:1217-1245` creates a planned workout while iterating `mySlots.forEach(slot => ...)`, but sets:

```js
siteId: nextQSlot.siteId || null,
```

This should use the loop variable:

```js
siteId: slot.siteId || null,
```

This is not a direct session-creation block, but it can seed the wrong planned-workout `siteId`, which later propagates into the planned-workout-to-session path.

## 6. Search Appendix

Search terms used:

- `state.draftSession =`
- `draftSession =`
- `addSession(`
- `insertSessionFromBackblastReview`
- `createSession(`
- `sourceQSlotId`
- `qSlotId`
- `plannedWorkoutId`
- `siteId`
- `startTime`
- `site_id`
- `start_time`
- `getSlotDisplayTime`
- `draftPlannedWorkout`
- `pendingPlannerDate`
- `pendingPlannerQSlotId`
- `startSessionFromQSlot`
- `Log Session`
- `Log This`

Matching files reviewed:

- `src/modules/sessions.js`: generic session factory; missing optional `siteId`/`startTime`.
- `src/views/sessionView.js`: session editor, draft cloning, save normalization, `addSession()` handoff. Preserves upstream fields but falls back to AO time if `startTime` is missing.
- `src/services/appData.js`: `addSession()` and `updateSession()` normalizers preserve site/time if present.
- `src/services/cloudData.js`: session/planned-workout/Q-slot mappers and inserts/updates; normal session path correct, backblast review insert missing `site_id`, audit rows omit Q-slot site/time.
- `src/views/dashboardView.js`: two `state.draftSession` blocks, multiple planned-workout draft blocks, `getSlotDisplayTime()`, matching/logged helpers.
- `src/views/plannedWorkoutDetailView.js`: planned-workout/execution-mode session draft creation; missing `siteId` and `startTime`.
- `src/utils/sessionNavigation.js`: audit-driven Q-slot session draft helper; missing site/time and uses audit-row-specific `slotId`.
- `src/views/sessionAuditView.js`: calls `startSessionFromQSlot(row)` with audit rows.
- `src/views/backblastReviewView.js`: historical backblast review session creation; uses AO time and omits site.
- `src/views/workoutPlannerView.js`: planned-workout draft and save paths; planned workouts retain `siteId` but no `startTime`.
- `src/views/myPlannerView.js`: seeds planner from Q slot using pending fields, but only date/AO/Q-slot ID are passed.
- `src/views/sessionDetailView.js`: copy session to planned workout; not a direct session creation path, but does not copy `siteId`/`startTime` into the workout.
- `src/components/mainMenu.js`: false positive; clears `state.draftSession`.
- `src/views/sessionAuditView.js`: one true positive via `startSessionFromQSlot()`, plus clearing draft on view action.
- `src/services/qSlots.js`: false positive for session creation; updates Q-slot state and telemetry only.
- `supabase/functions/send-reminders/index.ts` and `sendReminders.mjs`: false positives for session creation; reminder logic reads Q slots only.
- `scripts/createSafeSessionsFromUnmatchedBackblasts.js`, `scripts/matchBackblastsToSessions.js`, and import scripts: not counted as runtime app session-creation paths; should be audited separately if import tooling remains active.

## Terminal Summary

- Report path: `audit/sessions/session-site-time-propagation-audit.md`
- Files reviewed: `src/modules/sessions.js`, `src/views/sessionView.js`, `src/services/appData.js`, `src/services/cloudData.js`, `src/views/dashboardView.js`, `src/views/plannedWorkoutDetailView.js`, `src/utils/sessionNavigation.js`, `src/views/sessionAuditView.js`, `src/views/backblastReviewView.js`, `src/views/workoutPlannerView.js`, `src/views/myPlannerView.js`, `src/views/sessionDetailView.js`
- Deficient session paths: dashboard CTA missing `startTime`; dashboard card click missing `startTime`; planned-workout/execution logging missing `siteId` and `startTime`; session-audit logging missing `siteId` and `startTime` because audit rows omit them; backblast review insert omits `siteId` and uses AO time only.
- Persistence issues found: normal `addSession()` insert/update are correct; `insertSessionFromBackblastReview()` drops `siteId`; planned workouts do not persist `startTime`; session audit row query omits Q-slot `site_id` and `start_time`; bulk/import session payload omits `site_id` and `start_time`.
- Runtime code modified: no.
