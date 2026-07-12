# Core Telemetry Implementation Audit + Q Slot State Investigation

Date: 2026-07-12

Scope: read-only investigation of Q-slot unclaim/admin clear behavior and exact implementation points for proposed core telemetry events. No runtime code was modified.

## 1. Executive Summary

Confirmed: the previously reported Q-slot state bug is real in `src/views/qSignupView.js`. The shared `unclaimQSlot` helper returns `{ success: false }` for drop-guard rejection and confirmation cancellation, but the Q Signup self-unclaim and admin clear handlers ignore the returned result and still patch local state to `qUserId: null` and rerender. Dashboard callers already check `result?.success` and do not have this bug.

Telemetry implementation points are generally clear, but several desired events should not be emitted from the lowest-level persistence function without an explicit source/action guard. In particular, `session_updated` and `backblast_saved` overlap because Backblast saves are implemented as session updates.

Highest-confidence implementation anchors:

- `view_opened`: `renderApp` view-transition block, replacing the disabled `view-opened` call, with a separate source hint only if navigation helpers are extended.
- `planned_workout_finalized`: `workoutPlannerView.saveWorkout`, after successful `addPlannedWorkout`/`updatePlannedWorkout`, guarded by previous `isFinalized !== true && draftWorkout.isFinalized === true`.
- `execution_completed`: the execution-mode "Finish & Log Session" click path in `plannedWorkoutDetailView`, before/around transition into session logging.
- `session_updated`: after successful existing-session save in `sessionView.js`, or in `appData.updateSession` with an explicit source parameter if broader coverage is desired.
- `preblast_shared`: after awaited `navigator.share(...)` resolves in `preblastView.js`.
- `backblast_opened`: centralized view-transition hook for entering `backblast`, with metadata derived from `state.selectedSessionId` and session state.
- `backblast_saved`: after `updateSession` succeeds in `backblastView.exitBackblastView`; optionally also after share-time persistence, with dedupe semantics.
- `backblast_copied`: immediately after `copyTextToClipboard` resolves truthy in `backblastView.js`.
- `backblast_shared`: after native share promise resolves and the post-share `updateSession` succeeds in `backblastView.js`.

## 2. Q Slot Investigation

### Shared Helper: `unclaimQSlot`

File: `src/services/qSlots.js`

Function: `unclaimQSlot(slot, { bypassDropGuard = false } = [])`

Confirmed behavior:

- Finds AO from `state.aos` by `slot.aoId`.
- If `bypassDropGuard` is false, current user owns the slot, and `isQSlotWithinDropGuard(slot)` is true, it alerts and returns `{ success: false, reason: "drop_guard" }`.
- If user cancels the confirm dialog, it returns `{ success: false, reason: "cancelled" }`.
- Only after those gates does it call `updateQSlotInCloud`.
- If `updateQSlotInCloud` throws, the helper throws; it does not return `{ success: false }`.
- After database success, it updates `state.qSlots[index] = updatedSlot`, logs `q_slot_unclaimed`, and returns `{ success: true, slot: updatedSlot }`.

Database success before local helper state change: yes. The helper updates local state only after `updateQSlotInCloud` resolves.

### Caller: Dashboard Next Q Card

File: `src/views/dashboardView.js`

Handler: Next Q "Unclaim Q" button.

Conditions:

- User has a next claimed Q displayed on Dashboard.
- User clicks "Unclaim Q".

Return handling:

- `const result = await unclaimQSlot(nextQSlot);`
- Rerenders only when `result?.success`.

Local state patch:

- No caller-side patch. The helper patches on success.

Cancelled/failed behavior:

- Drop-guard or cancellation returns false and no rerender happens.
- Persistence failure throws; this handler does not catch locally, so no caller-side local patch happens. User-facing failure behavior is not handled here.

Bug status: not affected by the false-result local patch bug.

### Caller: Dashboard Upcoming Q Row

File: `src/views/dashboardView.js`

Handler: Upcoming Q row "Unclaim" button.

Conditions:

- User has a claimed upcoming Q in the dashboard upcoming-Q list.
- User clicks "Unclaim".

Return handling:

- `const result = await unclaimQSlot(slot);`
- Rerenders only when `result?.success`.

Local state patch:

- No caller-side patch.

Cancelled/failed behavior:

- Drop-guard/cancel leaves local state unchanged.
- Persistence failure throws; no local patch happens.

Bug status: not affected.

### Caller: Q Signup Self-Unclaim

File: `src/views/qSignupView.js`

Handler: Slot card "Unclaim" button.

Conditions:

- Rendered when the slot is claimed by the current user (`isMine` path).
- User clicks "Unclaim".

Return handling:

- Calls `await unclaimQSlot(slot);`
- Ignores returned `{ success, reason }`.

Local state patch:

- Always calls:
  - `patchQSlotInState({ ...slot, qUserId: null })`
  - `renderApp()`
- This happens even when the helper returned `{ success: false, reason: "drop_guard" }` or `{ success: false, reason: "cancelled" }`.

Cancelled/failed behavior:

- Drop-guard rejection: local slot is incorrectly cleared and UI rerenders.
- Confirmation cancellation: local slot is incorrectly cleared and UI rerenders.
- Persistence failure: helper throws before returning; catch block runs, logs `action_failure`, and no caller-side patch occurs.

Database success before local state change:

- Not guaranteed in false-return paths because no database mutation was attempted.
- Guaranteed only in success path, but caller does not check that path explicitly.

Bug status: affected.

### Caller: Q Signup Administrative Clear

File: `src/views/qSignupView.js`

Handler: Admin "Clear Q" button.

Conditions:

- Rendered for users managing the AO.
- Button is disabled if `!slot.qUserId`.
- User clicks "Clear Q".

Return handling:

- Calls `await unclaimQSlot(slot, { bypassDropGuard: true });`
- Ignores returned `{ success, reason }`.

Local state patch:

- Always calls:
  - `patchQSlotInState({ ...slot, qUserId: null })`
  - `renderApp()`

Cancelled/failed behavior:

- Drop guard is bypassed, so no drop-guard false return.
- Confirmation cancellation still returns `{ success: false, reason: "cancelled" }`; caller still clears local slot and rerenders.
- Persistence failure throws; catch block runs, logs `action_failure`, and no caller-side patch occurs.

Database success before local state change:

- Not guaranteed on cancellation because no database mutation was attempted.
- Guaranteed only when helper succeeds, but caller does not check.

Bug status: affected.

### Related Non-Unclaim Paths

`claimQSlot` in `qSignupView.js` patches local state only after `updateQSlotInCloud` resolves. `assignQSlot` refreshes from cloud only after persistence succeeds. `deleteQSlot` refreshes from cloud only after delete succeeds. These are not affected by the specific false-result bug.

## 3. Confirmed or Unconfirmed Bug

Confirmed behavior:

- The bug is real for Q Signup self-unclaim and admin clear.
- The local UI can show a Q slot as open even when the user cancelled or was blocked by the drop guard.
- The database is not changed in those false-return cases.
- The local incorrect state may later be corrected by realtime refresh or manual reload, but the immediate UI state is wrong.

Likely behavior:

- Because Q Signup has a realtime subscription, the stale local clearing may be corrected after another database event or refresh, but cancellation/drop-guard itself does not produce a database event, so no immediate realtime correction is guaranteed.

Unresolved ambiguity:

- The exact user-visible duration of the stale local state depends on realtime refresh timing and any subsequent render/load paths not exercised in this read-only audit.

## 4. Q Slot Root Cause and Recommended Fix

Root cause:

- The shared helper communicates non-exception no-op outcomes through a return object.
- Two `qSignupView.js` callers treat "resolved promise" as success and ignore `result.success`.

Affected files/functions:

- `src/views/qSignupView.js`
  - Self-unclaim button handler around the `await unclaimQSlot(slot)` call.
  - Admin clear button handler around the `await unclaimQSlot(slot, { bypassDropGuard: true })` call.

Affected user flows:

- Current user attempts to unclaim a Q inside the drop-guard window from Q Signup.
- Current user clicks Unclaim from Q Signup, then cancels the confirm dialog.
- AO admin clicks Clear Q from Q Signup, then cancels the confirm dialog.

Expected behavior:

- If the helper returns `{ success: false }`, caller should not patch local Q-slot state and should not rerender as though the clear succeeded.
- If the helper throws, caller should show/log failure and leave local state unchanged.
- If the helper returns `{ success: true, slot }`, caller can rerender, relying on helper-updated state or using `result.slot`.

Smallest safe correction:

- In both Q Signup handlers, capture the helper result:
  - `const result = await unclaimQSlot(...);`
  - `if (!result?.success) return;`
  - Then rerender.
- Remove redundant caller-side `patchQSlotInState({ ...slot, qUserId: null })`, or replace it with `patchQSlotInState(result.slot)` if the local patch is still desired.
- Prefer relying on the helper's successful state update because it includes cleared override fields (`overrideTime`, `overrideEmphasis`, `customEmphasisLabel`, `overrideTitle`) from the persisted row.

Related edge cases:

- Current caller-side patch only clears `qUserId`; the helper also clears slot override fields on success. Keeping caller-side patch with stale `slot` data risks reintroducing cleared override fields locally.
- Dashboard callers already implement the correct `result?.success` check and can be used as reference.

Recommended validation steps:

1. Q Signup self-unclaim, cancel confirmation: slot remains claimed in UI.
2. Q Signup self-unclaim inside drop guard: slot remains claimed in UI.
3. Q Signup self-unclaim, confirm: slot clears, override fields clear, `q_slot_unclaimed` logs.
4. Q Signup admin clear, cancel confirmation: slot remains claimed.
5. Q Signup admin clear, confirm: slot clears.
6. Simulated `updateQSlotInCloud` failure: slot remains claimed and action failure telemetry is logged.
7. Dashboard unclaim still behaves unchanged.

## 5. Event-by-Event Implementation Map

### `view_opened`

Recommended implementation point:

- File: `src/index.js`
- Function: `renderApp`
- Location: existing `if (state.currentView !== lastRenderedView)` block where `view-opened` is currently commented out.

Trigger:

- A distinct application view became active.

Sync/async:

- View transition detection is synchronous; telemetry insert is async but should remain non-blocking.

Success definition:

- The app has selected a different `state.currentView` than the last rendered view.

Persistence:

- No domain persistence.

Cancellation:

- Cancelled navigation should not call `renderApp` with changed `currentView`; no event.

Duplicate-fire paths:

- Rerenders of the same view do not fire due to `lastRenderedView`.
- Direct `state.currentView = "backblast"; renderApp()` media rerenders will not fire if already in `backblast`.

Metadata available:

- `view`, `previousView`; global enrichment supplies active `region_id`, `user_id`, and current view.

Metadata not reliably available:

- `source` is not reliable at `renderApp` today because many paths mutate `state.currentView` directly instead of using `navigateTo`.

Multiple entry paths:

- Covered because all routes render through `renderApp`, including boot restore and direct state changes.

Recommendation:

- Use `renderApp` as the single location for once-per-transition semantics.
- If `source` is required, add a lightweight navigation-source hint set by `navigateTo`, `goBack`, and direct special flows; otherwise omit or use `source: "unknown"`.

### `planned_workout_finalized`

Recommended implementation point:

- File: `src/views/workoutPlannerView.js`
- Function: `saveWorkout({ finalized = false })`
- Location: after successful `await updatePlannedWorkout(...)` or `await addPlannedWorkout(...)`, before state is cleared/navigates to dashboard.

Trigger:

- User clicks "Finalize BD" and the workout is successfully persisted as finalized.

Sync/async:

- Async. Success is after planned workout persistence completes.

Success definition:

- Save succeeds and persisted/locally saved workout has `isFinalized === true`.

Persistence:

- New workout: `addPlannedWorkout` -> `insertPlannedWorkout`.
- Existing workout: `updatePlannedWorkout` -> `updatePlannedWorkoutInCloud`.

Cancellation:

- AO validation alert and failed saves should not emit.

Duplicate-fire paths:

- Current code sets `draftWorkout.isFinalized = Boolean(finalized)`. If an already-finalized workout is edited and finalized again, a naive `finalized` check would duplicate-fire.

Metadata available:

- `plannedWorkoutId`, `workoutDate`, `aoId`, `aoName`, `title`, `isShared`, `timerCount`, `sourcePlannedWorkoutId`/`sourceWorkoutId` if present, `sourceSessionId`, `sourceQSlotId`, `actorMemberId`.

Metadata not currently available:

- A returned saved workout from `updatePlannedWorkout` is not returned to the caller today; `draftWorkout` is available.

Recommended transition check:

- Capture `wasFinalized` before `prepareWorkoutForSave`, from the current existing workout when editing or `false` for new workouts.
- Emit only when `!wasFinalized && draftWorkout.isFinalized === true` and persistence succeeded.

### `execution_completed`

Recommended implementation point:

- File: `src/views/plannedWorkoutDetailView.js`
- Function/handler: `logButton.addEventListener("click", ...)`
- Location: inside `if (isExecutionMode && !isPreviewMode)` branch, before `endWorkoutExecution()` clears execution context or immediately after capturing metadata.

Trigger:

- User intentionally clicks "Finish & Log Session" during execution mode.

Sync/async:

- Current action is synchronous local state transition into session logging; no domain persistence occurs until the user saves the session.

Success definition:

- User intentionally leaves execution by choosing the finish/log action and a draft session is created/navigated to.

Persistence:

- None at completion moment. Session persistence occurs later in `sessionView.js`.

Cancellation:

- Back button "Exit workout view?" should not count.
- Edit workout should not count.
- Preview mode "Back to Edit" should not count.
- Browser close/inferred abandonment should not be tracked for this event.

Duplicate-fire paths:

- Once clicked, `endWorkoutExecution()` clears execution state and navigation moves to `session`, so normal duplicate fire risk is low.
- Double-click protection is not explicit; event should be emitted after/with state transition and button may need disabling during implementation if duplicates are observed.

Metadata available:

- `plannedWorkoutId`, `workoutDate`, `aoId`, `aoName`, `title`, `executionDate`, `launchSource`, `timerCount`, `sourceQSlotId`, `sourcePlannedWorkoutId` not applicable, `actorMemberId`.

Metadata not currently available:

- No durable execution ID. No actual workout completion proof beyond user intent.

Recommended semantics:

- Define as "user intentionally completed execution and moved to session logging," not "session was logged."

### `session_updated`

Recommended implementation point:

Option A, narrow:

- File: `src/views/sessionView.js`
- Function/handler: session save button.
- Location: after `await updateSession(sessionId, draftSession)` succeeds and `savedSession` is available, inside `if (isEditing)`.

Option B, broad:

- File: `src/services/appData.js`
- Function: `updateSession(sessionId, updatedSession)`
- Location: after `replaceSessionVisitors` succeeds, after `state.sessions[index] = savedSession`, before `return true`.
- Requires source metadata to avoid mixing user edit, Backblast save/share, admin flag resolution, dashboard status change, and other system-like updates.

Trigger:

- Existing session successfully updated.

Sync/async:

- Async. Success is after session row update and visitor replacement complete in `appData.updateSession`.

Success definition:

- Existing session update persisted and local state updated.

Persistence:

- `updateSessionInCloud` updates `sessions`.
- `replaceSessionVisitors` separately persists visitor rows.

Cancellation:

- Validation failure, duplicate-session "view existing", unauthorized edit, or save failure should not emit.

Duplicate-fire paths:

- Broad shared-service approach will fire for Backblast saves, Backblast shares, admin flag resolution, dashboard "Already Posted", session detail FNG roster linking, etc.

Metadata available:

- `sessionId`, `sessionDate`, `aoId`, `aoName`, `paxCount`, `fngCount`, `visitorCount`, `qCount`, `sourcePlannedWorkoutId`, `sourceQSlotId`, `hasWorkout`, `actorMemberId`.

Metadata not currently available:

- Change diff is not computed in most paths.
- Update source is not available unless passed down.

Recommendation:

- If desired meaning is "user edited session in session form," use Option A.
- If desired meaning is "any existing session row was updated," use Option B but add `source` parameter/call-site source naming to keep analysis usable.

### `preblast_shared`

Recommended implementation point:

- File: `src/views/preblastView.js`
- Handler: Share Preblast button.
- Location: after awaited `navigator.share(...)` resolves and before `returnToDashboardAfterShare()`.

Trigger:

- User taps "Share Preblast" and Web Share API promise resolves.

Sync/async:

- Async. The handler first awaits `persistPreblastDraft()`, then awaits `navigator.share`.

Success definition:

- Draft save succeeded and Web Share API promise resolved.

Persistence:

- Save-before-share persists Q slot `preblastText` via `updateQSlotInCloud`.

Cancellation:

- `AbortError` is treated as user cancellation and should not emit.
- Unsupported file sharing path shows a toast and returns; should not emit.
- Copy fallback is separate and should not emit `preblast_shared`.

Duplicate-fire paths:

- Each successful share action should emit; repeated shares are legitimate repeated events.

Metadata available:

- `qSlotId`, `plannedWorkoutId`, `aoId`, `aoName`, `workoutDate`, `mediaCount`, `usedFilesShare`, `actorMemberId`.

Metadata not currently available:

- Native share target app is not available.

Reliability limitation:

- The Web Share API promise resolving is the best available signal. Browsers generally reject with `AbortError` on cancellation, but resolution does not prove the user actually posted to BAND or another target.

### `backblast_opened`

Recommended implementation point:

- File: `src/index.js`
- Function: `renderApp`
- Location: view-transition block when `state.currentView === "backblast"` and previous view is different.

Trigger:

- Backblast view was entered for a session.

Sync/async:

- Synchronous view transition; telemetry non-blocking.

Success definition:

- Active view transitions to `backblast`.

Persistence:

- None.

Cancellation:

- Cancelled navigation does not transition to backblast; no event.

Duplicate-fire paths:

- Rerenders inside backblast, including media add/remove setting `state.currentView = "backblast"` and rendering, should not fire because previous rendered view is already `backblast`.

Entry paths covered:

- Automatic navigation after new session is logged.
- Session Detail Backblast button.
- Dashboard Post Backblast button.
- Dashboard card click.
- Restored nav state to `backblast`, if selected session state is present.

Metadata available:

- From `state.selectedSessionId` and `state.sessions`: `sessionId`, `sessionDate`, `aoId`, `aoName`, `paxCount`, `fngCount`, `visitorCount`, `qCount`, `sourcePlannedWorkoutId`, `sourceQSlotId`, `hasWorkout`, `usedSavedBackblast`.
- `source` can be inferred coarsely from `previousView` for common paths: `session`, `sessionDetail`, `dashboard`, `restore/unknown`.

Metadata not currently available:

- Reliable source for every direct state mutation unless navigation source hint is added.
- If restored state lacks `selectedSessionId`, session metadata may be unavailable.

Recommendation:

- Centralize in `renderApp` and derive metadata defensively. Do not rely on `backblast_generated`, because not every entry path emits it.

### `backblast_saved`

Recommended implementation point:

- File: `src/views/backblastView.js`
- Function: `exitBackblastView`
- Location: after `await updateSession(session.id, updatedSession)` succeeds.

Trigger:

- User clicks Back/Done from Backblast view and backblast text is successfully persisted to the session.

Sync/async:

- Async.

Success definition:

- `updateSession` succeeds when saving `backblastText`.

Persistence:

- Backblast text lives directly on the `sessions` row as `backblast_text`, not a linked table.

Cancellation:

- There is no explicit cancel in Backblast view. Reset without leaving should not emit saved until persistence happens.

Duplicate-fire paths:

- Clicking Done/Back repeatedly after no changes could emit if implemented naively.
- Share path also persists backblast text/status.

Metadata available:

- `sessionId`, `sessionDate`, `aoId`, `aoName`, counts, `sourcePlannedWorkoutId`, `sourceQSlotId`, `hasWorkout`, `mediaCount`, `actorMemberId`, `saveSource: "done"`/`"back"`.

Metadata not currently available:

- Dirty flag / original draft snapshot is not explicit. To avoid firing merely because the view exited, compare `state.draftBackblastText` to `session.backblastText` before updating/emitting.

Recommendation:

- Define as "backblast-related session data persisted through Backblast view," not every textarea change.
- For share path, emit `backblast_saved` after share-time `updateSession` succeeds if the implementation wants persistence events independent from share events. Include `saveSource: "share"`.

### `backblast_copied`

Recommended implementation point:

- File: `src/views/backblastView.js`
- Handler: Copy Backblast button.
- Location: immediately after `await copyTextToClipboard(textToCopy)` resolves successfully/truthy and before success toast is acceptable.

Trigger:

- Backblast text successfully written to clipboard.

Sync/async:

- Async, with modern Clipboard API or fallback `document.execCommand("copy")`.

Success definition:

- `copyTextToClipboard` returns true.

Persistence:

- None.

Cancellation:

- Empty text returns false after toast. Current caller does not inspect false; implementation should emit only if return value is true.

Duplicate-fire paths:

- Each successful click emits. Repeated copy clicks are legitimate repeated events.

Metadata available:

- `sessionId`, `sessionDate`, `aoId`, `aoName`, `textLength`, `mediaCount`, `actorMemberId`.

Metadata not currently available:

- Clipboard destination is not available.

### `backblast_shared`

Recommended implementation point:

- File: `src/views/backblastView.js`
- Handler: Share Backblast button.
- Location: inside `sharePromise.then(async () => { ... })`, after `await updateSession(session.id, updatedSession)` succeeds and before `returnToDashboardAfterShare()`.

Trigger:

- Native Backblast share promise resolves and post-share session update succeeds.

Sync/async:

- Async promise chain.

Success definition:

- Web Share API resolved, session was updated with `backblastStatus: "shared"` and `backblastPostedAt`.

Persistence:

- Post-share update persists `backblastText`, `backblastStatus`, and `backblastPostedAt` to `sessions`.

Cancellation:

- `AbortError` should not emit.
- No copy fallback exists in the share handler; copy is separate.

Duplicate-fire paths:

- Each successful share action emits. Repeated shares are legitimate, though they will update posted timestamp each time.

Metadata available:

- `sessionId`, `sessionDate`, `aoId`, `aoName`, counts, `mediaCount`, `sharedFileCount`, `usedFilesShare`, `actorMemberId`, `sourcePlannedWorkoutId`, `sourceQSlotId`.

Metadata not currently available:

- Native target app/post completion cannot be proven.

Reliability limitation:

- As with preblast, resolved Web Share API promise is the most accurate available signal. It does not guarantee the post was completed in BAND.

Event ordering relative to `backblast_saved`:

- If share-time persistence emits both events, emit/save-order should be:
  1. `backblast_saved` after `updateSession` succeeds with `saveSource: "share"`.
  2. `backblast_shared` immediately after, before dashboard return.

## 6. Exact Trigger Semantics

| Event | Exact recommended semantics |
| --- | --- |
| `view_opened` | A new `state.currentView` became the active rendered view. |
| `planned_workout_finalized` | A planned workout persisted with `isFinalized` transitioning from false/not present to true. |
| `execution_completed` | User intentionally clicked execution-mode "Finish & Log Session" and moved into session logging. |
| `session_updated` | An existing session was successfully persisted after edit/update, distinct from `session_logged`. Scope must be chosen: session form only or all session updates. |
| `preblast_shared` | Preblast draft saved, then native share promise resolved. |
| `backblast_opened` | App entered Backblast view for a selected session. |
| `backblast_saved` | Backblast-related session data was successfully persisted from Backblast view. |
| `backblast_copied` | Backblast text was successfully written to clipboard. |
| `backblast_shared` | Native Backblast share promise resolved and session was successfully marked shared. |

## 7. Duplicate and Cancellation Risks

Confirmed duplicate/cancellation risks:

- Q Signup unclaim/clear currently treats cancellation as success locally.
- `planned_workout_finalized` can duplicate if tied only to the finalize button instead of false-to-true transition.
- `backblast_saved` can duplicate if emitted on every Done/Back without checking whether persisted text/status changed.
- `view_opened` source is ambiguous because direct `state.currentView` mutations bypass `navigateTo`.
- `backblast_opened` should not use `renderBackblastView` alone without transition guard, because media add/remove rerenders the same view.
- `preblast_shared` and `backblast_shared` can only know Web Share API promise resolution, not target-app post completion.

Cancellation behavior:

- Share `AbortError`: no share-completed event.
- Confirm dialog cancellation for Q-slot unclaim: no local state patch after fix and no success telemetry.
- Back/exit from execution: no `execution_completed`.
- Preview mode exit: no `execution_completed`.

## 8. Metadata Availability and Standardization

Recommended standard names for affected paths:

| Field | Recommended name | Availability |
| --- | --- | --- |
| AO ID | `aoId` | Available on workouts, sessions, Q slots; sometimes must derive by AO name in Backblast. |
| AO name | `aoName` | Available on workouts/sessions or derivable from AO ID. |
| Source | `source` | Available only where explicit; otherwise add navigation/action source hints. Avoid `launchSource`/`claimSource` drift in new events. |
| Actor member | `actorMemberId` | `state.currentUserMemberId` available. Distinct from top-level auth `user_id`. |
| Planned workout | `plannedWorkoutId` | Available in planner/detail/execution/preblast/session source fields. |
| Q slot | `qSlotId` | Available in Q-slot and preblast paths; Backblast can use `sourceQSlotId` or derived matching slot. |
| Session | `sessionId` | Available in session/backblast paths. |
| Workout date | `workoutDate` | Available on planned workout. |
| Session date | `sessionDate` | Available on session. |
| Execution date | `executionDate` | Available in `state.executionContext` and launch code. |
| Timer count | `timerCount` | Available from `workout.timers?.length || 0`. |
| Media count | `mediaCount` | Available from `state.draftPreblastMediaFiles` / `state.draftBackblastMediaFiles`. |

Current inconsistencies to avoid in new events:

- Existing execution metadata uses both `source` and `launchSource`.
- Existing Q claim metadata uses `claimSource` only on Weekly Calendar path.
- Many existing events include `aoName` without `aoId`.
- Top-level `user_id` is auth user ID; linked PAX/member ID should be explicit as `actorMemberId`.

## 9. Existing Event Compatibility

| Existing event | Recommendation |
| --- | --- |
| `app_opened` | Remain unchanged; optionally add restored target view in future. |
| `view-opened` | Supersede for future analysis with `view_opened` if the new name is required. Keep old constant/event for historical compatibility if ever emitted. |
| `planned_workout_created` | Remain; add standardized metadata in future (`aoId`, `sourceQSlotId`, `actorMemberId`). |
| `planned_workout_updated` | Remain; do not use as finalization metric once `planned_workout_finalized` exists. |
| `execution_started` | Remain; standardize metadata (`source`, `aoId`, `actorMemberId`) later. |
| `session_logged` | Remain as session insert event. Do not emit for edits. |
| `preblast_generated` | Remain for historical builder-open/generation behavior, but future analysis should prefer `preblast_shared` for communication success. |
| `backblast_generated` | Remain, but it does not cover every Backblast entry path. Supersede for future entry analysis with `backblast_opened`. |
| `save_failure` | Remain. Consider using for Backblast save failure only if save-specific failure coverage is expanded. |
| `action_failure` | Remain. Existing share/copy failure sources should continue to pair with new success events. |

## 10. Recommended Implementation Order

1. Fix Q Signup unclaim/admin clear false-result handling.
2. Add event constants and metadata helper conventions.
3. Implement `view_opened` in `renderApp` with transition guard.
4. Implement `backblast_opened` using the same transition guard, or a helper called from it.
5. Implement `planned_workout_finalized` with false-to-true transition check.
6. Implement `execution_completed` at "Finish & Log Session".
7. Implement `session_updated` with chosen scope and source strategy.
8. Implement `preblast_shared`.
9. Implement Backblast lifecycle success events: `backblast_saved`, `backblast_copied`, `backblast_shared`.
10. Standardize metadata on nearby existing events without renaming/removing historical events.

## 11. Manual Validation Checklist

Q-slot fix:

- Cancel self-unclaim in Q Signup; slot remains claimed.
- Trigger drop guard in Q Signup; slot remains claimed.
- Confirm self-unclaim in Q Signup; slot clears after persistence.
- Cancel admin clear; slot remains claimed.
- Confirm admin clear; slot clears after persistence.
- Simulate update failure; slot remains claimed and failure telemetry logs.

Telemetry:

- Navigate Dashboard -> Q Signup -> Dashboard; exactly one `view_opened` per distinct view transition.
- Rerender same view via media add/remove in Backblast; no duplicate `view_opened` or `backblast_opened`.
- Log a new session and auto-enter Backblast; `backblast_opened` emits with session metadata.
- Open Backblast from Session Detail; `backblast_opened` emits with `source`/previous view.
- Open Backblast from Dashboard card; `backblast_opened` emits.
- Save Backblast with Done; `backblast_saved` emits only after persistence.
- Copy Backblast with non-empty text; `backblast_copied` emits. Empty text should not emit.
- Share Backblast and complete native share; `backblast_saved`/`backblast_shared` emit in documented order.
- Cancel native Backblast share; no `backblast_shared`.
- Share Preblast and complete native share; `preblast_shared` emits after pre-share save.
- Cancel native Preblast share; no `preblast_shared`.
- Finalize a draft workout; `planned_workout_finalized` emits once.
- Edit an already-finalized workout; no duplicate `planned_workout_finalized`.
- Click Finish & Log Session during execution; `execution_completed` emits and session form opens.
- Exit execution via Back; no `execution_completed`.
- Edit existing session in Session form; `session_updated` emits after successful save, not on new session insert.

## 12. Files and Functions That Would Need Changes

Q-slot state correction:

- `src/views/qSignupView.js`
  - Self-unclaim button handler.
  - Admin clear button handler.

Telemetry constants:

- `src/constants/appEvents.js`
  - Add the new event constants if implementation uses the constants map.

View and Backblast opened telemetry:

- `src/index.js`
  - `renderApp` transition block.
  - Optional helper for building view/backblast metadata.
- Optional:
  - `src/utils/navigation.js`
  - Direct state-changing call sites, if reliable `source` capture is required.

Planner finalization:

- `src/views/workoutPlannerView.js`
  - `saveWorkout`
  - Possibly `prepareWorkoutForSave` only to preserve/capture previous state cleanly.

Execution completion:

- `src/views/plannedWorkoutDetailView.js`
  - `logButton` click handler.

Session update:

- Narrow scope:
  - `src/views/sessionView.js` save handler.
- Broad scope:
  - `src/services/appData.js` `updateSession`
  - Call sites may need source metadata:
    - `src/views/sessionView.js`
    - `src/views/backblastView.js`
    - `src/views/dashboardView.js`
    - `src/views/sessionDetailView.js`
    - `src/views/adminFlagsView.js`
    - `src/views/backblastReviewView.js`

Preblast share:

- `src/views/preblastView.js`
  - Share Preblast click handler after `navigator.share` resolves.

Backblast lifecycle:

- `src/views/backblastView.js`
  - `exitBackblastView`
  - Copy Backblast handler
  - Share Backblast handler
  - Optional helper to build standard backblast metadata.

