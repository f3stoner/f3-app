# Announcement Lifecycle Phase 2 Implementation Plan

## 1. Executive Summary

Phase 2 should make planned-workout announcements dynamic until a session is successfully logged, while preserving logged-session and backblast history forever.

The smallest durable implementation is:

- Add an explicit planned-workout announcement mode: `auto` or `custom`.
- Treat `planned_workouts.announcement_text` as authoritative only when `announcement_mode = 'custom'`.
- Resolve auto-mode planned-workout announcements from current active announcement rows for the workout date, AO, and region every time the workout is displayed, previewed, executed, used for preblast generation, or converted into a session.
- Snapshot the exact effective announcement text onto the session at successful session logging.
- Generate backblasts from the session snapshot only, never from live announcements.

This preserves the intended product behavior:

- Planned and finalized workouts weeks in advance keep tracking current announcement edits, additions, deletions, deactivation, expiration, date range changes, and AO scope changes.
- Manual edits become a custom planned-workout override.
- Reset returns a custom planned workout to automatic mode.
- Copying a workout returns the copy to automatic mode for the new date and AO.
- Session logging is the only immutable boundary.

## 2. Confirmed Current Behavior

Current Phase 1 runtime exists in `src/utils/announcements.js`:

- `resolveActiveAnnouncements(announcements, options)` filters by `isActive`, date range, region, AO, and scope.
- `formatAnnouncementsText(announcements)` formats resolved announcements into a text block.
- Date filtering is inclusive across `startsOn` and `endsOn`.
- AO-scoped announcements require the target `aoId`.
- Region-scoped announcements are included when `includeRegionScope` is true.

Current planner behavior is still snapshot-like:

- `src/views/workoutPlannerView.js` builds announcement text from `state.plannerAnnouncements`.
- The generated text is stored directly in `draftWorkout.announcementText`.
- Date and AO changes overwrite `draftWorkout.announcementText` unconditionally.
- Textarea edits only set `announcementText`; there is no explicit automatic/custom state.
- Saving or finalizing persists the current `announcementText`.

Current planned-workout detail behavior is also snapshot-like:

- `src/views/plannedWorkoutDetailView.js` displays `workout.announcementText`.
- Preview and execution use the workout object passed in.
- Starting a session copies `workout.announcementText` into `session.workout.announcementText`.
- Copying a workout copies `announcementText` unchanged.

Current session and backblast behavior:

- `src/services/cloudData.js` persists sessions through the JSON `workout` field and `backblast_text`.
- There is no dedicated session announcement snapshot column.
- `src/modules/backblast.js` reads `session.workout.announcementText`.
- Existing backblast generation is already closer to the desired historical behavior because it uses the session's copied workout text, not live announcement rows.

Current preblast behavior:

- `src/modules/generatePreblast.js` does not include announcements.
- `src/views/preblastView.js` saves preblast draft text on `q_slots.preblast_text`.

## 3. Dynamic-Until-Session Lifecycle

The lifecycle should be:

1. Announcement admins manage live announcement rows.
2. Planned workouts in `auto` mode do not own generated announcement text.
3. Any unlogged planned-workout surface resolves current effective announcement text at read/render/action time.
4. User edits to generated text switch that planned workout to `custom`.
5. Custom planned workouts keep their custom text until reset.
6. Reset switches the planned workout back to `auto` and clears custom text.
7. Copying a workout creates a new planned workout in `auto` mode with no copied custom text.
8. Finalizing a planned workout does not freeze announcements.
9. Starting or executing a workout still uses current effective announcement text.
10. Successful session logging snapshots the exact effective text.
11. Backblasts use the logged-session snapshot forever.

Session logging is the only immutable boundary.

## 4. Proposed Data Model

### Planned Workouts

Keep the existing `planned_workouts.announcement_text` column, but change its meaning:

- `announcement_mode = 'auto'`: `announcement_text` is ignored for effective output and should normally be null.
- `announcement_mode = 'custom'`: `announcement_text` is the authoritative custom text.

Recommended new columns:

```sql
alter table public.planned_workouts
  add column if not exists announcement_mode text not null default 'auto',
  add column if not exists announcement_legacy_text text;

alter table public.planned_workouts
  add constraint planned_workouts_announcement_mode_check
  check (announcement_mode in ('auto', 'custom'));
```

Recommended legacy preservation:

```sql
update public.planned_workouts
set announcement_legacy_text = announcement_text
where announcement_legacy_text is null
  and nullif(trim(announcement_text), '') is not null;
```

For new writes:

- Auto mode: persist `announcement_mode = 'auto'`, `announcement_text = null`.
- Custom mode: persist `announcement_mode = 'custom'`, `announcement_text = custom text`.

`announcement_legacy_text` is not part of the live effective-announcement algorithm. It preserves pre-migration text for audit, recovery, or a later UI affordance.

### Sessions

Add a dedicated immutable session-level snapshot. Do not rely only on `sessions.workout.announcementText`, because that hides critical snapshot semantics inside a broader mutable JSON blob.

Recommended new columns:

```sql
alter table public.sessions
  add column if not exists announcement_text text,
  add column if not exists announcement_snapshot jsonb;
```

Recommended semantics:

- `sessions.announcement_text`: plain text used by backblast generation and simple historical display.
- `sessions.announcement_snapshot`: structured debug and future-proof metadata.

Recommended snapshot shape:

```json
{
  "text": "Announcement text exactly as logged",
  "mode": "auto",
  "source": "planned_workout",
  "resolvedAt": "2026-07-13T12:34:56.000Z",
  "targetDate": "2026-07-20",
  "regionId": "region-id",
  "aoId": "ao-id",
  "announcementIds": ["announcement-id"],
  "announcements": [
    {
      "id": "announcement-id",
      "title": "Title at log time",
      "body": "Body at log time",
      "scope": "ao",
      "aoId": "ao-id",
      "startsOn": "2026-07-01",
      "endsOn": "2026-07-31",
      "displayOrder": 10
    }
  ]
}
```

`announcement_snapshot` should be nullable for legacy sessions so the app can distinguish missing snapshots from intentionally blank announcement text.

## 5. Proposed Migration Design

Recommended first migration:

`supabase/migrations/<timestamp>_add_announcement_mode_and_session_snapshot.sql`

Migration contents:

1. Add `planned_workouts.announcement_mode text not null default 'auto'`.
2. Add `planned_workouts.announcement_legacy_text text`.
3. Add check constraint for `announcement_mode in ('auto', 'custom')`.
4. Copy existing non-empty `planned_workouts.announcement_text` into `announcement_legacy_text`.
5. Set existing planned workouts to `announcement_mode = 'auto'`.
6. Optionally leave existing `announcement_text` in place during the first deploy, but runtime must ignore it in auto mode.
7. Add `sessions.announcement_text text`.
8. Add `sessions.announcement_snapshot jsonb`.

Do not rewrite existing `sessions.backblast_text`.

Optional follow-up cleanup migration after a stable release:

- Null out `planned_workouts.announcement_text` where `announcement_mode = 'auto'` and `announcement_legacy_text` has preserved the prior value.

The first migration should avoid destructive data loss. Runtime semantics, not immediate data deletion, should fix stale auto announcements.

## 6. Effective-Announcement Helper Design

The authoritative helper should live in `src/utils/announcements.js`, alongside the Phase 1 resolver.

Recommended function:

```js
export function getEffectiveWorkoutAnnouncementText({
  workout,
  announcements = [],
  regionId = null,
  targetDate = null,
  aoId = null,
  includeRegionScope = true,
} = {}) {
  // returns { text, mode, resolvedAnnouncements, targetDate, aoId, source }
}
```

Behavior:

- If `workout.announcementMode === 'custom'`, return `workout.announcementText || ''`.
- Otherwise resolve active announcements from the provided candidate list using:
  - `targetDate || workout.date`
  - `aoId || workout.aoId`
  - `regionId`
  - `includeRegionScope`
- Format resolved announcements with `formatAnnouncementsText`.
- Return both `text` and structured data so session logging can build a snapshot without re-resolving.

Recommended companion helper:

```js
export function buildSessionAnnouncementSnapshot({
  workout,
  announcements = [],
  regionId = null,
  resolvedAt = new Date(),
} = {}) {
  // returns { text, snapshot }
}
```

The helper must be pure. It should not query Supabase, mutate state, persist localStorage, or write back to the workout.

## 7. Candidate Loading And Cache Strategy

The runtime should resolve from candidate announcement rows, not from already date-filtered dashboard announcements.

Recommended state fields:

- `state.announcementCandidates`
- `state.announcementCandidatesRegionId`
- `state.announcementCandidatesLoadedAt`
- `state.announcementCandidatesDateKey`

Recommended loading strategy:

- Use `loadPlannerAnnouncements(regionId)` or rename/generalize it to load all active region announcement candidates.
- Refresh candidates on region data load.
- Refresh candidates when entering planner, planned-workout detail, preblast, execution, and session logging flows if missing or stale.
- Invalidate candidates after announcement create, update, delete, deactivate, or scope/date change.
- Refresh on app focus or visibility return if candidates are stale.
- Refresh on local date-key change.

Do not rely on `state.announcements` for planned-workout effective text if it remains filtered to today's active announcements.

## 8. Planner Auto/Custom Behavior

`src/views/workoutPlannerView.js` needs the biggest behavior change.

New planned workout:

- Initialize `announcementMode: 'auto'`.
- Initialize `announcementText: ''` or `null`.
- Display the current effective auto text via the helper.

Existing planned workout:

- If `announcementMode === 'custom'`, display and save stored `announcementText`.
- Otherwise display helper-derived effective text.

Textarea behavior:

- The textarea value should be the effective text.
- On user input, set:
  - `draftWorkout.announcementMode = 'custom'`
  - `draftWorkout.announcementText = event.target.value`
- Persist the draft.

Reset behavior:

- Add a reset control for custom announcements.
- On reset:
  - `draftWorkout.announcementMode = 'auto'`
  - `draftWorkout.announcementText = ''`
  - Re-render with current effective text.

Date and AO changes:

- If mode is `auto`, re-render with newly resolved text.
- If mode is `custom`, preserve custom text.

Save/finalize:

- Finalization must not snapshot automatic text.
- `prepareWorkoutForSave` should persist mode and only persist `announcementText` when mode is custom.

## 9. Planned-Workout Detail And Preview Behavior

`src/views/plannedWorkoutDetailView.js` should never display stale auto-mode `workout.announcementText`.

Recommended pattern:

```js
const effective = getEffectiveWorkoutAnnouncementText({
  workout,
  announcements: state.announcementCandidates,
  regionId: state.currentRegionId,
});

const effectiveWorkout = {
  ...workout,
  announcementText: effective.text,
};
```

Use the derived `effectiveWorkout` for:

- Detail announcement display.
- Preview.
- Execution launch.
- Preblast generation.
- Session draft creation.

Do not mutate or save the planned workout merely because effective auto text changed.

## 10. Preblast Behavior

Preblast generation should include the current effective announcement text for the selected planned workout.

Recommended change:

- Pass an effective workout into `generatePreblast`, or add an options object:

```js
generatePreblast(workout, aos, sites, {
  announcementText: effective.text,
});
```

`src/modules/generatePreblast.js` should append an announcements section only when the effective text is non-empty.

Important distinction:

- The generated preblast should use current effective announcements at generation time.
- A saved preblast draft in `q_slots.preblast_text` remains a user-edited preblast draft and should not be silently rewritten by later announcement changes.
- A regenerate/reset preblast action should pull current effective announcements again.

## 11. Execution Behavior

Execution mode should use current effective announcement text until session logging succeeds.

Recommended behavior:

- On launch, derive `effectiveWorkout` from the latest planned workout and current candidate announcements.
- On execution resume from `activeWorkoutExecution`, locate the latest planned workout by ID and derive effective text again.
- Avoid storing generated auto text in `activeWorkoutExecution` localStorage.
- If candidate announcements cannot be refreshed offline, use the latest loaded candidates and do not mutate the planned workout.

## 12. Session Snapshot Boundary

The snapshot should be built immediately before creating a new session record.

Recommended insertion point:

- `src/views/sessionView.js`, in the new-session save path after final draft fields are collected and before `addSession(sessionToCreate)`.

Rules:

- New session creation computes effective announcements exactly once.
- Set `sessionToCreate.announcementText = snapshot.text`.
- Set `sessionToCreate.announcementSnapshot = snapshot.snapshot`.
- Also set `sessionToCreate.workout.announcementText = snapshot.text` for legacy compatibility.
- Do not recompute announcements when editing an existing session.
- Do not recompute announcements when regenerating a backblast from an already logged session.

This makes successful session logging the immutable boundary.

## 13. Session Edit Behavior

Editing existing sessions must preserve their snapshot.

Recommended rules:

- `mapSessionFromDb` should map:
  - `announcementText` from `row.announcement_text`
  - `announcementSnapshot` from `row.announcement_snapshot`
  - fallback text from `row.workout?.announcementText`
- Existing session edit save should round-trip `announcementText` and `announcementSnapshot`.
- Do not refresh from live announcements in edit mode.
- If an old session has no new columns populated, continue using `session.workout.announcementText` as the historical fallback.

If the app later offers a "change historical announcement text" feature, it should be explicit and audited. It should not be part of Phase 2.

## 14. Backblast Behavior

Backblast generation should use session snapshot text only.

Recommended helper in `src/utils/announcements.js`:

```js
export function getSessionAnnouncementText(session) {
  return (
    session?.announcementText ||
    session?.announcementSnapshot?.text ||
    session?.workout?.announcementText ||
    ''
  );
}
```

`src/modules/backblast.js` should call this helper.

`src/views/backblastView.js` should:

- Continue saving generated/shared text in `sessions.backblast_text`.
- Regenerate backblast text from the session snapshot.
- Remove or ignore any path that falls back to current live announcements for logged sessions.

The existing `appendAnnouncementsToBackblast` helper is risky because it can fall back to live `state.announcements`. It should either be removed or changed to use `getSessionAnnouncementText(session)` only.

## 15. Copy-Workout Behavior

Copying a planned workout must reset announcement state to automatic.

Required copy behavior:

- `announcementMode: 'auto'`
- `announcementText: ''` or `null`
- Do not copy custom text.
- Resolve current effective text for the copy's new date and AO when displayed.

Files with copy paths:

- `src/views/workoutPlannerView.js`
- `src/views/plannedWorkoutDetailView.js`
- `src/views/sessionDetailView.js`

Copying a historical session into a planned workout should also create an automatic planned workout. Historical session snapshots must not become future planned-workout custom text by default.

## 16. Finalized-Workout Behavior

Finalization must remain unrelated to announcement immutability.

Rules:

- Finalized auto workouts resolve live announcements just like draft auto workouts.
- Finalized custom workouts preserve custom text.
- Editing finalization state must not alter `announcementMode`.
- Finalizing must not write generated auto text into `announcement_text`.

## 17. Legacy Planned-Workout Strategy

Recommended policy: migrate legacy planned workouts to `auto`, while preserving their old text in `announcement_legacy_text`.

Why:

- The main product priority is fixing stale generated planned-workout announcements.
- Existing generated text and genuine manual edits are indistinguishable in the current schema.
- Marking every non-empty legacy row as `custom` would preserve manual edits but also preserve stale generated text, failing the primary objective.
- Marking every row as `auto` fixes stale generated text but risks losing manual legacy edits.
- Preserving old text in `announcement_legacy_text` avoids destructive loss while making runtime behavior correct going forward.

Do not expose `announcement_legacy_text` as effective text. It is recovery data only.

If preserving manual legacy edits automatically becomes a hard requirement, the only safer alternative is a temporary `legacy` mode with user resolution. That adds product and UI complexity and delays the dynamic behavior fix.

## 18. Legacy Session Strategy

Existing logged sessions should remain historical.

Recommended policy:

- Do not rewrite existing `backblast_text`.
- Do not require a full backfill.
- Map new session announcement fields with fallbacks:
  1. `sessions.announcement_text`
  2. `sessions.announcement_snapshot.text`
  3. `sessions.workout.announcementText`
  4. empty string

Optional low-risk backfill:

- For sessions with non-empty `workout->>'announcementText'`, copy that value into `announcement_text` and a minimal `announcement_snapshot`.
- Leave blank/missing legacy values null to preserve the distinction between "no snapshot" and "intentionally no announcement."

## 19. Exact Files To Modify

Database:

- `supabase/migrations/<timestamp>_add_announcement_mode_and_session_snapshot.sql`

Announcement utilities:

- `src/utils/announcements.js`

Data mapping and persistence:

- `src/services/cloudData.js`
- `src/services/appData.js`
- `src/utils/storage.js`
- `src/modules/state.js`

Planned-workout model and flows:

- `src/modules/plannedWorkouts.js`
- `src/views/workoutPlannerView.js`
- `src/views/plannedWorkoutDetailView.js`
- `src/views/dashboardView.js`
- `src/views/qSignupView.js`
- `src/views/weeklyQCalendarView.js`

Preblast:

- `src/modules/generatePreblast.js`
- `src/views/preblastView.js`

Session and backblast:

- `src/modules/sessions.js`
- `src/views/sessionView.js`
- `src/utils/sessionNavigation.js`
- `src/modules/backblast.js`
- `src/views/backblastView.js`
- `src/views/sessionDetailView.js`

## 20. Function-By-Function Implementation Plan

`src/utils/announcements.js`:

- Add `getEffectiveWorkoutAnnouncementText`.
- Add `buildSessionAnnouncementSnapshot`.
- Add `getSessionAnnouncementText`.
- Keep `resolveActiveAnnouncements` and `formatAnnouncementsText` as lower-level helpers.

`src/modules/plannedWorkouts.js`:

- Add `announcementMode: 'auto'`.
- Add `announcementText: ''`.

`src/modules/sessions.js`:

- Add `announcementText: ''`.
- Add `announcementSnapshot: null`.

`src/services/cloudData.js`:

- Map `planned_workouts.announcement_mode`.
- Persist planned-workout `announcement_mode`.
- Persist `announcement_text` only as custom text.
- Map `sessions.announcement_text` and `sessions.announcement_snapshot`.
- Persist session snapshot fields on insert and update.
- Keep legacy fallback from `workout.announcementText`.
- Consider generalizing `loadPlannerAnnouncements` to `loadAnnouncementCandidates`.

`src/views/workoutPlannerView.js`:

- Replace direct `buildAnnouncementText` storage with helper-derived display.
- Switch to custom mode on textarea input.
- Add reset-to-automatic control.
- Preserve custom text across date/AO changes.
- Persist auto mode without generated text.

`src/views/plannedWorkoutDetailView.js`:

- Derive effective text for display, preview, execution, preblast, and session launch.
- Reset copied workouts to auto mode.

`src/modules/generatePreblast.js`:

- Include announcements section when effective announcement text is present.

`src/views/preblastView.js`:

- Resolve selected workout's current effective announcement text before generation or regeneration.

`src/views/sessionView.js`:

- On new-session save, build and attach session announcement snapshot immediately before insert.
- Preserve existing snapshots in edit mode.

`src/modules/backblast.js`:

- Use `getSessionAnnouncementText(session)`.
- Never consult live announcement candidates.

`src/views/backblastView.js`:

- Remove or rewrite live-announcement fallback.
- Regenerate from session snapshot only.

`src/views/sessionDetailView.js`:

- Display historical session snapshot.
- When copying session to planned workout, reset announcement mode to auto.

`src/views/dashboardView.js`, `src/views/qSignupView.js`, `src/views/weeklyQCalendarView.js`, `src/utils/sessionNavigation.js`:

- Initialize planned-workout drafts with `announcementMode: 'auto'`.
- Avoid copying stale `announcementText` into new planned workouts.
- Ensure session-launch paths preserve enough source planned-workout identity for snapshot resolution.

## 21. Ordered Migration And Implementation Sequence

1. Add migration for planned-workout mode and session snapshot columns.
2. Extend `src/utils/announcements.js` with effective and snapshot helpers.
3. Update data mappers and persistence in `src/services/cloudData.js`.
4. Update local model defaults in `src/modules/plannedWorkouts.js` and `src/modules/sessions.js`.
5. Add candidate announcement state/cache support.
6. Update planner auto/custom UI and persistence.
7. Update planned-workout detail, preview, execution, and copy paths.
8. Update preblast generation to use effective announcements.
9. Update session logging to snapshot immediately before new session insert.
10. Update backblast generation to use session snapshots only.
11. Update session detail and legacy copy behavior.
12. Update dashboard, Q signup, weekly calendar, and navigation entry points.
13. Add tests.
14. Run manual validation checklist.

## 22. Recommended Tests

Utility tests:

- Auto mode resolves active region announcement.
- Auto mode resolves AO-specific announcement.
- Auto mode excludes announcement outside date range.
- Auto mode reflects edited candidate announcement text.
- Auto mode reflects deactivated candidate announcement removal.
- Custom mode returns stored custom text.
- Reset-to-auto returns resolver text.
- Copy reset behavior produces auto mode and blank text.
- Session snapshot includes exact effective text.
- Session snapshot includes announcement IDs and metadata.
- Backblast helper reads `session.announcementText`.
- Backblast helper falls back to `announcementSnapshot.text`.
- Backblast helper falls back to `workout.announcementText` for legacy sessions.

Planner/view behavior tests, if harness exists or is added:

- User textarea edit switches to custom.
- Date change in auto updates displayed text.
- Date change in custom preserves custom text.
- AO change in auto updates displayed text.
- Save auto planned workout does not persist generated text.
- Save custom planned workout persists custom text.
- Finalize auto workout does not freeze text.
- Planned-workout copy resets to auto.
- Session logging snapshots current effective text.
- Editing an existing session does not recompute snapshot.
- Backblast regeneration ignores live announcement changes.

## 23. Manual Validation Checklist

1. Create an active region announcement for next week.
2. Create a planned workout for next week in auto mode.
3. Confirm planner displays the announcement.
4. Finalize the planned workout.
5. Edit the announcement body.
6. Confirm finalized workout detail displays the edited text.
7. Deactivate the announcement.
8. Confirm the finalized workout no longer displays it.
9. Reactivate or create an AO-specific announcement.
10. Confirm only matching AO workouts display it.
11. Manually edit a planned-workout announcement textarea.
12. Confirm the workout switches to custom and no longer tracks live edits.
13. Reset to automatic.
14. Confirm current live text returns.
15. Copy the workout to a new date.
16. Confirm the copy is automatic and resolves for the new date.
17. Generate a preblast.
18. Confirm generated preblast includes current effective announcement text.
19. Start execution.
20. Confirm execution uses current effective text.
21. Log the session.
22. Change or delete the live announcement.
23. Regenerate the backblast.
24. Confirm the backblast still uses the logged snapshot text.
25. Edit the session.
26. Confirm the snapshot is preserved.

## 24. Risk Analysis

Primary risks:

- Stale generated text remains if any surface reads `workout.announcementText` directly for auto workouts.
- Live announcements can leak into historical backblasts if `backblastView` keeps a live fallback.
- Existing manual planned-workout edits cannot be reliably distinguished from generated legacy text.
- Candidate announcement caches can become stale across admin edits, app focus changes, or date rollover.
- Multiple session creation entry points can miss the snapshot boundary.

Mitigations:

- Centralize all effective planned-workout announcement reads in `getEffectiveWorkoutAnnouncementText`.
- Centralize all logged-session announcement reads in `getSessionAnnouncementText`.
- Preserve legacy planned-workout text in `announcement_legacy_text`.
- Refresh candidate announcements on view entry and invalidation.
- Add focused tests around copy, finalize, session logging, and backblast regeneration.

## 25. Rollback Plan

Runtime rollback:

- Revert runtime helper usage and UI changes.
- Existing new columns are additive and can remain unused.

Data rollback:

- `planned_workouts.announcement_legacy_text` preserves old planned-workout text.
- If auto-mode clearing is introduced later, restore from `announcement_legacy_text` where needed.
- `sessions.announcement_text` and `sessions.announcement_snapshot` are additive and do not require deleting historical JSON workout data.

Backblast rollback:

- Existing `sessions.backblast_text` remains untouched.
- Existing `sessions.workout.announcementText` fallback remains available.

## 26. Explicit Out-Of-Scope Items

Out of scope for Phase 2:

- Rewriting existing backblast text.
- Building a full announcement versioning system.
- Adding realtime Supabase subscriptions for announcement edits.
- Adding a legacy manual-edit resolution workflow.
- Adding audit trails for manual custom announcement changes.
- Changing announcement admin CRUD beyond candidate-cache invalidation.
- Adding preblast draft auto/custom mode.
- Removing legacy `workout.announcementText` compatibility.

## 27. Recommended First Migration

Create:

`supabase/migrations/<timestamp>_add_announcement_mode_and_session_snapshot.sql`

The first migration should add:

- `planned_workouts.announcement_mode text not null default 'auto'`
- check constraint: `announcement_mode in ('auto', 'custom')`
- `planned_workouts.announcement_legacy_text text`
- `sessions.announcement_text text`
- `sessions.announcement_snapshot jsonb`

It should copy existing non-empty planned-workout announcement text into `announcement_legacy_text` and leave existing session/backblast data unchanged.

## 28. Recommended First Runtime File

Start with:

`src/utils/announcements.js`

Reason:

The current code already has the Phase 1 resolver. Adding the effective planned-workout helper and session snapshot helpers there creates one authoritative API before touching planner, session, preblast, and backblast call sites.

## 29. Recommended First Runtime Function

Start with:

`getEffectiveWorkoutAnnouncementText`

Recommended signature:

```js
export function getEffectiveWorkoutAnnouncementText({
  workout,
  announcements = [],
  regionId = null,
  targetDate = null,
  aoId = null,
  includeRegionScope = true,
} = {}) {
  // returns { text, mode, resolvedAnnouncements, targetDate, aoId, source }
}
```

This function should make the automatic/custom decision and be the only planned-workout announcement text source used by UI and workflow code.

## 30. Phase 3 Or Cleanup Handoff Notes

Good Phase 3 candidates:

- Rename `loadPlannerAnnouncements` to `loadAnnouncementCandidates`.
- Add realtime or polling invalidation for announcement candidate cache.
- Add UI to view or recover `announcement_legacy_text`.
- Add audit fields for custom announcement edits, such as `announcement_customized_at` and `announcement_reset_at`.
- Add announcement version IDs if exact admin-row history becomes a compliance requirement.
- Remove legacy `session.workout.announcementText` fallback after all historical sessions have explicit snapshots.
- Add a preblast-level auto/custom model if saved preblast drafts need live announcement updating before sharing.
