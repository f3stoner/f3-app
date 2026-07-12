# Telemetry Coverage Audit

Date: 2026-07-12

Scope: read-only inspection of The Q telemetry implementation in `src/`, Supabase functions/migrations, and supporting scripts. This audit does not modify source behavior, add events, rename events, create migrations, or create commits.

## 1. Executive Summary

The Q currently has a small, centralized telemetry layer that inserts rows into `app_events` through `src/services/appEvents.js`. Runtime telemetry is concentrated around app boot, planned workout create/update, session create, Q slot claim/unclaim, workout execution start, preblast/backblast generation entry points, and selected failure cases.

The implementation is intentionally lightweight and mostly non-blocking: `logAppEvent` is awaited nowhere in the observed success paths, catches its own failures, and enriches all events with `region_id`, `user_id`, `metadata.view`, `metadata.userAgent`, and `metadata.timestampClient`.

Coverage is enough to answer some endpoint/product questions, such as approximate app opens, planned workout saves, Q claims, execution starts, new sessions logged, and selected error rates. It is not enough to reliably answer screen-level engagement, funnel starts/abandons, edit/delete/share completion rates, notification adoption, library usage, AO insights usage, Pax profile usage, or admin activity.

The largest quality issues are:

- `view-opened` is defined and has a call site in `src/index.js`, but the call is commented out.
- `PREBLAST_GENERATED` and `BACKBLAST_GENERATED` measure opening/generating the draft view, not save, copy, share, or posting success.
- `SESSION_LOGGED` only fires on insert, not session edits.
- `PLANNED_WORKOUT_UPDATED` fires on every planned workout update, including draft saves and finalization changes, without an explicit action/finalized metadata field.
- Some constants are defined but unused: `timer_started`, `push_enabled`, `push_disabled`, `share_started`, `share_completed`.
- Metadata is inconsistent across similar actions. For example, execution start uses `source` in dashboard but `launchSource` in detail view, and AO identifiers often include `aoName` but not `aoId`.

## 2. Current Event Inventory

All observed runtime telemetry calls route through `logAppEvent`, `logSaveFailure`, or `logActionFailure`.

Shared event enrichment from `src/services/appEvents.js`:

| Field | Source |
| --- | --- |
| `region_id` | `state.currentRegionId || null` |
| `user_id` | `state.currentUserId || supabase.auth.getUser().id || null` |
| `type` | caller supplied |
| `severity` | caller supplied, default `info`; failures use `error` |
| `message` | caller supplied; failures use error message |
| `metadata.view` | `state.currentView || null` |
| `metadata.userAgent` | `navigator.userAgent` |
| `metadata.timestampClient` | client timestamp |

### app_opened

| Attribute | Details |
| --- | --- |
| File | `src/index.js` |
| Function | `bootApp` |
| Trigger | Authenticated boot after profile, region data, AO permissions, and region positions load successfully, before navigation restoration/render |
| Metadata | `role`, `hasLinkedMember`, `restoredFromSharedWorkout` plus shared enrichment |
| Success/failure | Success/informational |
| Multiple fire risk | Fires once per successful boot/reload. Repeated page reloads create repeated events. |
| Notes | Does not fire for auth-only users before successful app boot. Boot failures emit `action_failure`. |

### view-opened

| Attribute | Details |
| --- | --- |
| File | `src/index.js` |
| Function | `renderApp` |
| Trigger | Intended trigger is `state.currentView !== lastRenderedView` |
| Metadata | Intended `view`, `previousView` plus shared enrichment |
| Success/failure | Informational |
| Multiple fire risk | Would fire once per view change if enabled |
| Notes | The call is commented out, so this event is currently not emitted despite being listed in constants. |

### planned_workout_created

| Attribute | Details |
| --- | --- |
| File | `src/services/cloudData.js` |
| Function | `insertPlannedWorkout` |
| Trigger | Successful insert into `planned_workouts` |
| Metadata | `plannedWorkoutId`, `workoutDate`, `aoName`, `title`, `isShared`, `timerCount`, `sourceWorkoutId`, `sourceSessionId` |
| Success/failure | Success after database insert |
| Multiple fire risk | Fires once per inserted planned workout. Retry after partial UI uncertainty could create separate workout/event if the save operation creates another row. |
| Notes | `sourceWorkoutId` is logged but the insert mapping writes `source_session_id`/`source_q_slot_id`; no `sourceWorkoutId` was observed in the saved workout mapping context. `sourceQSlotId` is not included. |

### planned_workout_updated

| Attribute | Details |
| --- | --- |
| File | `src/services/cloudData.js` |
| Function | `updatePlannedWorkoutInCloud` |
| Trigger | Successful update of `planned_workouts` |
| Metadata | `plannedWorkoutId`, `workoutDate`, `aoName`, `title`, `isShared`, `timerCount`, `sourceWorkoutId`, `sourceSessionId` |
| Success/failure | Success after database update |
| Multiple fire risk | Can fire many times for the same workout across draft saves, finalization, preblast draft saves, share-state changes, and any other planned workout update path. |
| Notes | Does not distinguish edit type, draft save versus finalize, content area changed, or user intent. |

### q_slot_claimed

| Attribute | Details |
| --- | --- |
| Files | `src/views/qSignupView.js`, `src/views/weeklyQCalendarView.js` |
| Functions | `claimQSlot`, weekly calendar claim button handler |
| Trigger | Successful `updateQSlotInCloud` assigning the current member as Q |
| Metadata | Q Signup: `qSlotId`, `aoId`, `aoName`, `date`, `qUserId`. Weekly calendar additionally includes `claimSource: "weekly_calendar"`. |
| Success/failure | Success after database update |
| Multiple fire risk | Should fire once per successful claim. Duplicate paths exist for Q Signup and Weekly Calendar; metadata differs by source. |
| Notes | Admin assignment of a Q to another member does not emit this event. Failed claim uses `action_failure`. UserAlreadyHasQ validation return is untracked. |

### q_slot_unclaimed

| Attribute | Details |
| --- | --- |
| File | `src/services/qSlots.js` |
| Function | `unclaimQSlot` |
| Trigger | Successful `updateQSlotInCloud` clearing a Q slot after confirmation |
| Metadata | `qSlotId`, `aoId`, `aoName`, `date`, `previousQUserId`, `bypassDropGuard` |
| Success/failure | Success after database update |
| Multiple fire risk | Should fire once per successful unclaim/clear. Can represent either self-unclaim or admin clear depending on `bypassDropGuard`. |
| Notes | Cancelled confirm and drop-guard blocked attempts are returned as `{ success: false }` and are not tracked. Callers in `qSignupView.js` patch local state even if `success: false`, but that is outside telemetry scope. |

### execution_started

| Attribute | Details |
| --- | --- |
| Files | `src/views/dashboardView.js`, `src/views/plannedWorkoutDetailView.js` |
| Functions | Dashboard "Start Today's Workout" click handler; `startWorkoutExecution` |
| Trigger | Dashboard: after saving active workout execution and navigating to detail. Detail: after saving execution state, switching launch mode, rendering. |
| Metadata | Dashboard: `plannedWorkoutId`, `source`, `aoName`, `workoutDate`. Detail: `plannedWorkoutId`, `launchSource`, `workoutDate`, `aoName`, `isShared`, `timerCount`, `executionDate`. |
| Success/failure | Informational after local state transition, not after session completion |
| Multiple fire risk | Can fire every time the user starts/restarts/opens execution for a workout. Dashboard and detail paths use different metadata. |
| Notes | No event for execution completed, abandoned, timer started/completed, or converted to session, though `timer_started` exists as an unused constant. |

### session_logged

| Attribute | Details |
| --- | --- |
| File | `src/services/cloudData.js` |
| Function | `insertSession` |
| Trigger | Successful insert into `sessions` |
| Metadata | `sessionId`, `sessionDate`, `aoName`, `paxCount`, `fngCount`, `qCount`, `sourcePlannedWorkoutId`, `sourceQSlotId`, `hasWorkout` |
| Success/failure | Success after database insert |
| Multiple fire risk | Fires once per inserted session. Does not fire for session edits. |
| Notes | No `aoId` is captured even though sessions support `ao_id`. Visitor count and unresolved PAX count are not captured. |

### preblast_generated

| Attribute | Details |
| --- | --- |
| File | `src/views/plannedWorkoutDetailView.js` |
| Function | "Create Preblast" click handler |
| Trigger | User clicks "Create Preblast"; draft text is set from saved slot preblast or generated from workout; app navigates to preblast view |
| Metadata | `qSlotId`, `plannedWorkoutId`, `workoutDate`, `aoName`, `title`, `isShared` |
| Success/failure | Informational; not persistence/share success |
| Multiple fire risk | Can fire every time the user opens the preblast builder for the same workout. |
| Notes | Preblast draft save success, copy success, and share success are not tracked. Failures are tracked separately as generic `action_failure`. |

### backblast_generated

| Attribute | Details |
| --- | --- |
| File | `src/views/sessionDetailView.js` |
| Function | Backblast button click handler |
| Trigger | User clicks "Backblast"; draft text is set from saved text or generated from session; app navigates to backblast view |
| Metadata | `sessionId`, `sessionDate`, `aoName`, `paxCount`, `fngCount`, `qCount`, `sourcePlannedWorkoutId`, `hasWorkout`, `usedSavedBackblast` |
| Success/failure | Informational; not persistence/share/post success |
| Multiple fire risk | Can fire every time the user opens the backblast builder for the same session. |
| Notes | New session save navigates directly to backblast without logging `backblast_generated`; only the session detail button path emits it. |

### save_failure

| Attribute | Details |
| --- | --- |
| Files | `src/views/sessionView.js`, `src/views/workoutPlannerView.js` |
| Functions | Session save click handler; planner `saveWorkout` |
| Trigger | Caught error while saving a session or planned workout |
| Metadata | Shared failure fields: `source`, `errorMessage`, `errorName`. Session adds `editingSessionId`, `selectedSessionId`, `draftSessionId`, `sessionDate`, `sessionAoName`, `attendeeCount`, `qCount`, `fngCount`, `sourcePlannedWorkoutId`. Planner adds `editingPlannedWorkoutId`, `selectedPlannedWorkoutId`, `draftWorkoutId`, `plannedWorkoutDate`, `plannedWorkoutAoName`, `plannedWorkoutTitle`, `isShared`. |
| Success/failure | Failure |
| Multiple fire risk | Can fire on every failed save attempt. |
| Notes | Other save-like failures use `action_failure` or are untracked, so this event does not cover all saves. |

### action_failure

| Attribute | Details |
| --- | --- |
| Files | `src/index.js`, `src/views/qSignupView.js`, `src/views/weeklyQCalendarView.js`, `src/views/plannedWorkoutDetailView.js`, `src/views/preblastView.js`, `src/views/backblastView.js` |
| Functions/sources | `bootApp`, `claimQSlot`, `assignQSlot`, `unclaimQSlot`, `clearQSlot`, `weeklyCalendar.claimQSlot`, `timerAudioPlay`, `shareWorkout`, `savePreblast`, `copyPreblast`, `sharePreblast`, `copyBackblast`, `shareBackblast` |
| Trigger | Caught errors in selected non-save or share/copy operations |
| Metadata | Shared failure fields plus source-specific IDs/counts. Common fields include `qSlotId`, `aoId`, `date`, `plannedWorkoutId`, `sessionId`, media counts, current user/member IDs, and boot context. |
| Success/failure | Failure |
| Multiple fire risk | Can fire on every failed action attempt. |
| Notes | Generic event requires `metadata.source` for analysis. Several admin and management failures are not logged. Abort/cancel of native share is intentionally ignored. |

### Defined But Unused Event Constants

These constants exist in `src/constants/appEvents.js` but no runtime call site was found:

| Event | Observation |
| --- | --- |
| `timer_started` | No timer start telemetry despite workout timer UI and timer audio failure logging. |
| `push_enabled` | Notification opt-in success is not tracked. |
| `push_disabled` | No disable flow telemetry observed. |
| `share_started` | Share attempts are not tracked as starts. |
| `share_completed` | Successful share/copy completion is not tracked. |

## 3. Coverage by Feature

### Dashboard

Tracked:

- Successful app boot via `app_opened`.
- Starting today's planned workout from the next-Q dashboard card via `execution_started`.

Untracked:

- Dashboard view open because `view-opened` is disabled.
- Quick-access card clicks, global nav/FAB clicks, menu interactions, dashboard module expansion, Q prompt impressions, and dashboard-driven planner/session/history navigation.
- Dashboard abandonment or return frequency.

### Q Signup

Tracked:

- Self-claim from Q Signup via `q_slot_claimed`.
- Self-unclaim and admin clear through shared `unclaimQSlot` via `q_slot_unclaimed`.
- Claim, assign, unclaim, and clear failures via `action_failure`.
- Weekly calendar self-claim via `q_slot_claimed` with `claimSource: "weekly_calendar"`.

Untracked:

- Q Signup view opened/month changed.
- Slot edit modal opened/saved.
- Admin assignment success.
- Q slot deletion success/failure.
- Drop-guard blocked unclaims, duplicate-Q validation blocks, cancelled unclaim confirmations.
- Plan BD/View BD clicks from slots.

### Workout Planner

Tracked:

- Successful planned workout insert via `planned_workout_created`.
- Successful planned workout update via `planned_workout_updated`.
- Planner save failures via `save_failure`.
- Sharing a workout failure via `action_failure`.
- Preblast builder entry from detail via `preblast_generated`.

Untracked:

- Planner opened, started from scratch, started from Q slot, started from shared workout, copied from library, previewed, cancelled, abandoned, or restored from local draft.
- Successful draft save versus finalization as distinct actions.
- Saved section create/update/delete outcomes.
- Library idea modal opened/search/filter/insert usage.
- Timer add/edit/remove/start, despite `timer_started` constant.
- Successful workout share/copy.
- Planned workout delete success/failure.

### Workout Execution

Tracked:

- Execution start from dashboard and planned workout detail via `execution_started`.
- Timer audio playback failure via `action_failure`.

Untracked:

- Execution view opened without start, execution completed, abandoned, resumed, converted to session, or logged as backblast/session.
- Timer start/pause/resume/complete/skipped.
- Wake lock behavior.
- Workout section progression.

### Session Logging

Tracked:

- Successful new session insert via `session_logged`.
- Session save failure via `save_failure`.
- Backblast draft generated from session detail via `backblast_generated`.

Untracked:

- Session logging view opened/started.
- Attendance toggles, Q selection, FNG/visitor add/remove, source workout loading.
- Successful session edits.
- Session delete success/failure.
- Session save cancellation/abandonment.
- Attendance review status changes as analytics events.

### Preblast

Tracked:

- Opening/generating preblast draft from planned workout detail via `preblast_generated`.
- Save, copy, and share failures via `action_failure`.

Untracked:

- Preblast view opened when reached from other paths.
- Successful preblast draft save.
- Successful copy.
- Successful native share.
- Share started/cancelled/unsupported.
- Media attachment add/remove and weather insertion.

### Backblast

Tracked:

- Opening/generating backblast draft from session detail via `backblast_generated`.
- Copy and share failures via `action_failure`.
- A successful share updates session data, which may indirectly trigger session update persistence, but no explicit share-completed telemetry exists.

Untracked:

- Direct navigation to backblast after new session save does not emit `backblast_generated`.
- Successful copy/share/post status as explicit telemetry.
- Backblast done/cancel/abandon.
- Media attachment add/remove and weather insertion.
- Backblast save/update failures after successful native share may be surfaced through the promise chain but are logged only as generic `shareBackblast` failure.

### Exercise Library

Tracked:

- No explicit telemetry found for exercise library, library workbench, exercise search, saved sections, or idea insertion.

Untracked:

- Library/workbench opened.
- Search/filter/category use.
- Exercise detail viewed.
- Insert name/details into planner.
- Saved planner section create/update/delete success/failure.
- Library import/classification/admin workbench activity.

### AO Insights

Tracked:

- No explicit AO Insights telemetry found.

Untracked:

- AO Insights view opened.
- AO selected.
- Month changed.
- Detail drilldowns for attendance or new PAX pipeline.
- Insight-driven navigation to roster/member/profile.
- Data load failure/success.

### Pax Profiles

Tracked:

- No explicit Pax Profile or Pax Community telemetry found.

Untracked:

- Profile opened.
- Profile tab switches.
- Leadership/community/history interactions.
- Navigation from roster, insights, or session history.
- Permission-limited profile views.

### Notifications

Tracked:

- No explicit notification success/failure telemetry found.

Untracked:

- Reminder prompt shown.
- Prompt dismissed.
- Enable attempted.
- Permission denied.
- Push subscription success/failure.
- Notification settings saved.
- Reminder delivery/open, from client-side perspective.

Notes:

- `push_enabled` and `push_disabled` constants exist but are unused.
- Server-side notification logs may exist separately, but this audit found no client telemetry into `app_events`.

### Admin Features

Tracked:

- Selected boot failures include role/region context.
- Q slot claim/unclaim/clear failures and unclaim success can cover some admin Q operations.

Untracked:

- Admin Management opened.
- Role changes success/failure.
- AO leadership/regional leadership assignment changes success/failure.
- AO create/update/deactivate/delete-generated-slots outcomes.
- Import run, apply import, admin flag updates, third-F management, announcements, templates, Q Source management, library workbench, stale PAX, readiness, audits, and review queues.

### Region Management

Tracked:

- `app_opened` includes active role and linked member status after region load.
- All events get `region_id` from state when available.

Untracked:

- Region gate opened.
- Region selected/switched.
- Region load success/failure except boot failure.
- Region insights opened/drilldowns.
- Region position changes.
- Missing or mismatched profile region issues as user-facing analytics.

## 4. Missing Instrumentation

Recommended additions should stay high-value and avoid noisy field-level logging.

Highest-value missing events:

| Area | Missing event concept | Why it matters |
| --- | --- | --- |
| Navigation | View opened | Enables feature adoption, funnels, retention by feature, and abandonment analysis. Existing `view-opened` can cover this once semantics are finalized. |
| Planner | Planner workflow started/completed/abandoned | Distinguishes intent from saved artifacts and measures conversion from Q slot to finalized BD. |
| Planner | Workout finalized | Current `planned_workout_updated` cannot distinguish draft saves from completed planning. |
| Execution | Execution completed/logged/abandoned | Current `execution_started` only captures starts. Completion rate cannot be measured. |
| Session | Session updated/deleted | Current `session_logged` only captures new inserts. |
| Q Signup | Admin assignment success and slot edit/delete success | Current Q analytics miss important leadership/admin workflows. |
| Preblast/Backblast | Draft saved, copied, shared successfully | Current generated events do not prove communication happened. |
| Notifications | Prompt shown, enabled, dismissed, denied | Useful for reminder adoption and diagnosing push setup. Constants already exist for some of this. |
| Library | Exercise/library search and insert | Shows whether planner assistance is valuable. |
| Insights/Profile | AO Insights opened/drilldown, Pax Profile opened | Measures whether analytics surfaces are actually used. |
| Admin | Role/permission/AO management changed | Critical audit/product analytics for privileged actions. |

Avoid excessive logging:

- Do not log every keystroke in planner/session forms.
- Do not log every attendance toggle unless needed for UX research; session save already captures final attendance count for new sessions.
- Do not log every timer tick.
- Do not duplicate both click and success events for low-risk actions unless the funnel needs attempt/completion separation.

## 5. Event Quality Issues

### Events Emitted After Success

- `planned_workout_created`, `planned_workout_updated`, `session_logged`, `q_slot_claimed`, and `q_slot_unclaimed` emit after successful database persistence.
- These are comparatively reliable for persisted outcomes, though the telemetry insert itself is fire-and-forget from the caller's perspective.

### Events Emitted After Local State Transition, Not Durable Completion

- `execution_started` emits after local execution state/navigation. It does not represent workout completion or session logging.
- `preblast_generated` and `backblast_generated` emit after draft creation/navigation. They do not represent save, copy, share, or post success.
- `app_opened` emits after region/profile load but before final target view is rendered.

### Failure Events

- `save_failure` is limited to session and workout planner save failures.
- `action_failure` covers selected boot/Q/share/copy/timer failures.
- Many admin/management failures only use console/toast and never reach telemetry.

### Duplicate or Divergent Code Paths

- Q slot claim is implemented in both Q Signup and Weekly Calendar. Both emit `q_slot_claimed`, but only Weekly Calendar includes `claimSource`.
- Execution start is emitted from Dashboard and Planned Workout Detail with different metadata key names (`source` versus `launchSource`) and different field coverage.
- Backblast generation from Session Detail is tracked; automatic navigation to Backblast after a new session save is not tracked as `backblast_generated`.

### Multiple Fire Semantics

- `planned_workout_updated` can fire repeatedly for normal autosave-like user behavior.
- `execution_started` can fire each time a user starts/restarts execution.
- `preblast_generated` and `backblast_generated` can fire each time the generator/builder is opened.
- Failure events can fire repeatedly on retries.

## 6. Metadata Review

### Common Strengths

- `region_id` and `user_id` are top-level fields on every event inserted through `logAppEvent`.
- Every event includes client view, user agent, and client timestamp in metadata.
- Core artifact IDs are usually present for planner/session/Q events.

### Common Gaps

- AO metadata often uses `aoName` without `aoId`; session/planner rows already support AO IDs, so analysis by renamed AO may be fragile.
- Member identifiers vary: some Q slot events use `qUserId`, failure metadata uses `currentUserMemberId`, app boot uses top-level `user_id` plus `hasLinkedMember`.
- Source fields are inconsistent: `source`, `launchSource`, `claimSource`, and failure `source` all mean different things.
- Event-specific required metadata is not enforced; all metadata is ad hoc object literals.
- No schema/version field exists for metadata.
- No explicit session/client correlation ID exists, making app-open-to-action funnels approximate.

### Event-Specific Metadata Issues

| Event | Metadata observations |
| --- | --- |
| `app_opened` | Good role/linkage context; no target/restored view after nav resolution except shared workout boolean. |
| `planned_workout_created` | Missing `aoId`, `sourceQSlotId`, finalized/draft state, creation source. Potentially stale/unused `sourceWorkoutId`. |
| `planned_workout_updated` | Missing `aoId`, update intent, `isFinalized` transition, changed fields. |
| `q_slot_claimed` | Q Signup path lacks `claimSource`; Weekly Calendar includes it. Good `aoId` and `qUserId`. |
| `q_slot_unclaimed` | Good `previousQUserId` and `bypassDropGuard`; no explicit actor/member role or unclaim source. |
| `execution_started` | Dashboard/detail field inconsistency; dashboard lacks `isShared`, `timerCount`, `executionDate`. |
| `session_logged` | Good counts and source IDs; missing `aoId`, visitor count, unresolved PAX count, backblast status. |
| `preblast_generated` | Good planned workout context; no generated versus saved-draft distinction except inferred by `qSlotId` and prior text lookup. |
| `backblast_generated` | Good session counts and `usedSavedBackblast`; missing `sourceQSlotId` and `aoId`. |
| `save_failure` | Useful source-specific context; does not cover all saves. Session uses `sessionAoName`, planner uses `plannedWorkoutAoName`, while success events use `aoName`. |
| `action_failure` | Flexible but analysis depends heavily on `metadata.source`; fields vary widely by source. |

## 7. Naming Consistency Review

Current names are mostly snake_case past-tense outcome events, with exceptions.

Observations:

- `view-opened` uses kebab case, while other event types use snake_case.
- `app_opened` and `view-opened` overlap conceptually but differ in delimiter and scope.
- `planned_workout_created`, `planned_workout_updated`, `q_slot_claimed`, `q_slot_unclaimed`, and `session_logged` read as persisted outcomes.
- `execution_started` reads as workflow start, not outcome.
- `preblast_generated` and `backblast_generated` sound like generated content outcomes, but in practice mean builder opened/draft initialized.
- `save_failure` and `action_failure` are broad category events rather than action-specific names.
- Unused constants suggest a partially planned convention for push/share/timer events that has not been implemented.

No renames are recommended in this audit because renaming is outside scope. The key recommendation is to document exact semantics before adding adjacent events.

## 8. Analytics Capability Assessment

### Product Questions Currently Answerable

| Question | Current capability |
| --- | --- |
| Daily/weekly active users | Approximate from `app_opened` distinct `user_id`, assuming authenticated users and successful boot. |
| App opens by role/linked status | Yes, from `app_opened.metadata.role` and `hasLinkedMember`. |
| Planner artifact creation | Yes, from `planned_workout_created`. |
| Planner update volume | Yes, from `planned_workout_updated`, but noisy and not intent-specific. |
| Q claim count/rate numerator | Yes for self-claims from Q Signup/Weekly Calendar. Denominator requires Q slot data outside `app_events`. |
| Q unclaim count | Yes, from `q_slot_unclaimed`. |
| Workout execution starts | Yes, from `execution_started`. |
| New sessions logged | Yes, from `session_logged`. |
| Session attendance/FNG/Q counts at creation | Yes, from `session_logged` metadata. |
| Preblast/backblast builder opens | Partially, from generated events, with path caveats. |
| Selected error rates | Partially, from `save_failure` and `action_failure` by `metadata.source`. |
| Power users | Partially, by counting app opens and core artifact events per `user_id`; incomplete because many features are untracked. |

### Product Questions Not Reliably Answerable

| Question | Gap |
| --- | --- |
| Screen/view adoption | `view-opened` is disabled. |
| Feature adoption across Exercise Library, AO Insights, Pax Profiles, Admin | No explicit events. |
| Planner start-to-finalize conversion | No workflow start/completed/abandoned events; updates lack intent. |
| Q claim conversion from viewing open slots | No view/open-slot impression events. |
| Admin assignment and Q slot edit/delete rates | Success paths mostly untracked. |
| Workout execution completion rate | No completion/abandon/session-conversion event. |
| Session edit/delete rates | Only new inserts tracked. |
| Preblast/backblast share rates | Success is not tracked. |
| Notification opt-in rate | Push constants unused; prompt/enable/dismiss/deny untracked. |
| Retention by feature | No view/session correlation IDs and broad missing feature events. |
| Error rates for admin/import/AO/member management | Failures largely untracked. |
| Funnel abandonment | No workflow started/abandoned semantics. |

## 9. Prioritized Recommendations

### P0: Make Existing Analytics Trustworthy

1. Decide and document event semantics for each existing event: persisted outcome, workflow start, generated draft, or failure.
2. Standardize metadata keys for common concepts: `aoId`, `aoName`, `plannedWorkoutId`, `sessionId`, `qSlotId`, `source`, `actorMemberId`.
3. Add `source` consistently to duplicate paths, especially `q_slot_claimed` and `execution_started`.
4. Include `aoId` wherever `aoName` is captured for AO-scoped events.

### P1: Restore Basic Product Analytics

1. Re-enable or replace `view-opened` with clear throttling/route-change semantics.
2. Add high-level workflow events for planner started/finalized, execution completed, session updated/deleted, and communication shared.
3. Track notification prompt shown/dismissed/enabled/denied using the existing push event constants or a documented equivalent.

### P2: Fill Feature Adoption Gaps

1. Add low-volume adoption events for Exercise Library search/insert, AO Insights opened/drilldown, and Pax Profile opened.
2. Add admin success/failure events for role changes, AO leadership assignments, AO create/update/deactivate, and Q slot admin edits/deletes.
3. Add import/admin review events only at workflow boundaries, not per row.

### P3: Improve Analysis Quality

1. Add metadata schema/versioning for events.
2. Add a client session ID generated at boot to support funnels from app open to actions.
3. Consider distinguishing user/member identifiers explicitly: authenticated `user_id` top-level, `actorMemberId` in metadata, affected member IDs as action-specific fields.
4. Build a lightweight event catalog in the repo so future features choose existing event semantics before creating new names.

