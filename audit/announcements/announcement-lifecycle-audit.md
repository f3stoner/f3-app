# Announcement Lifecycle Audit

Date: 2026-07-13

## 1. Executive Summary

Expiration dates are not respected consistently across the announcement system. The dashboard active-announcement load checks `starts_on`, `ends_on`, and `is_active`, but planner loading only checks `ends_on` and `is_active`, omitting `starts_on` and using a different date basis. Once announcements enter a planned workout, they become plain text in `planned_workouts.announcement_text`; that snapshot is later copied into `sessions.workout.announcementText` and generated into `sessions.backblast_text`. Those downstream copies do not retain announcement IDs, dates, active status, scope, or any way to revalidate against the current `announcements` table.

The most likely reason stale announcements appear in backblasts is that backblast generation reads `session.workout.announcementText`, which was copied from the planned workout snapshot, not from current announcement records. A saved or shared backblast then persists as `sessions.backblast_text` and is preserved for posted/shared sessions.

The current code does not implement AO-scoped filtering despite the announcement model containing `scope` and `ao_id`. Region-scoped records are effectively global within a region for dashboard/planner/backblast fallback paths.

## 2. Direct Answers

1. Are expiration dates respected everywhere? No. `loadAnnouncements()` checks expiration, but `loadPlannerAnnouncements()` omits start-date filtering, uses UTC date generation, and planned workouts/sessions/backblasts never recheck expiration after snapshotting.
2. Why do backblasts show stale announcements? They usually use copied text from `planned_workouts.announcement_text` via `session.workout.announcementText`, then persist generated text in `sessions.backblast_text`.
3. When do announcements become embedded? First in the planner textarea as `draftWorkout.announcementText`; then in `planned_workouts.announcement_text`; then in `session.workout.announcementText`; then in generated/saved/shared `sessions.backblast_text`.
4. Dynamic or snapshot? Dashboard/admin copy are dynamic-ish. Planner/backblast/session paths are snapshots after insertion.
5. Inconsistent filtering/date/caching? Yes: local-date vs UTC date basis, missing start-date check in planner query, no AO filtering, no realtime refresh, no expiration timer, and localStorage snapshots.

## 3. System Inventory

| Object | Location | Role |
| --- | --- | --- |
| `announcements` table | Supabase table inferred from `src/services/cloudData.js:1693-1849` | Authoritative announcement records. Full base DDL is not present in checked migrations. |
| `planned_workouts.announcement_text` | `src/services/cloudData.js:541-545`, `807-889` | Plain-text snapshot inserted/updated with planned workout. |
| `sessions.workout` JSON | `src/services/cloudData.js:503`, `700-788` | Stores copied planned workout, including `announcementText`, inside the session. |
| `sessions.backblast_text` | `src/services/cloudData.js:508`, `721`, `780` | Saved/shared generated backblast text. |
| `q_slots.preblast_text` | `src/services/cloudData.js:627-629`, `1129-1131`; `src/views/preblastView.js:577-605` | Preblast draft/share text. Does not include announcement logic directly. |
| `loadAnnouncements()` | `src/services/cloudData.js:1710-1735` | Loads active dashboard announcements and deactivates expired records. |
| `loadPlannerAnnouncements()` | `src/services/cloudData.js:2923-2937` | Loads planner announcements; missing `starts_on` filter. |
| `loadAllAnnouncements()` | `src/services/cloudData.js:1737-1751` | Admin list load, no active/date filtering. |
| `insertAnnouncement()` / `updateAnnouncementInCloud()` / delete / reorder | `src/services/cloudData.js:1754-1849` | CRUD and ordering. |
| `renderAnnouncementManagementView()` | `src/views/announcementManagementView.js:18-460` | Creation/editing/admin copy UI. |
| `renderAnnouncementsSection()` | `src/views/dashboardView.js:1102-1192` | Dashboard render from `state.announcements`. |
| `buildAnnouncementText()` | `src/views/workoutPlannerView.js:1208-1216` | Converts loaded planner records to plain text. |
| `appendAnnouncementsToBackblast()` | `src/views/backblastView.js:77-98` | Dead/fallback code; no call site found. |
| `generateBackblast()` | `src/modules/backblast.js:51-245` | Inserts `workout.announcementText` into generated backblast. |
| Local storage keys | `src/utils/storage.js:1-4`; `src/views/workoutPlannerView.js:87`; `src/views/plannedWorkoutDetailView.js:27-30` | Persists app state, navigation, planner drafts, execution metadata. |
| Service worker | `public/sw.js:1-45` | Push notification only; no announcement API caching. |
| Realtime | `src/services/cloudData.js:1570-1589` | Q-slot-only subscription; no announcements subscription. |

## 4. Announcement Data Model

Authoritative fields inferred from mapper and CRUD:

| App field | DB field | Notes |
| --- | --- | --- |
| `id` | `id` | Primary identifier. |
| `regionId` | `region_id` | Required by all queries. |
| `scope` | `scope` | Created as `"region"`; no UI for AO/global scope found. |
| `aoId` | `ao_id` | Stored/mapped, but not filtered in load paths. |
| `title` | `title` | Required by UI. |
| `body` | `body` | Required by UI. |
| `startsOn` | `starts_on` | Date-only from `<input type="date">`. |
| `endsOn` | `ends_on` | Date-only from `<input type="date">`, labeled "Expires After Optional". |
| `isActive` | `is_active` | CRUD active flag; auto-set false after `ends_on < today` in `loadAnnouncements()`. |
| `createdByUserId` | `created_by_user_id` | Set at create. |
| `createdAt` | `created_at` | DB-managed/inferred. |
| `updatedAt` | `updated_at` | Set manually on update/deactivation. |
| `includeInBackblast` | `include_in_backblast` | Stored/mapped but not used in rendering/generation. |
| `displayOrder` | `display_order` | Ordering and reorder RPC. |
| `linkUrl`, `linkLabel` | `link_url`, `link_label` | Display/copy links. |

Derived/snapshot fields:

| Field | Source | Behavior |
| --- | --- | --- |
| `planned_workouts.announcement_text` / `workout.announcementText` | Planner `buildAnnouncementText()` and manual edits | Plain text. No IDs or validity metadata. |
| `sessions.workout.announcementText` | Copied planned workout in session launch/log flows | Plain text snapshot. |
| `sessions.backblast_text` | Backblast editor/share/save | Full generated text. |

## 5. End-to-End Flow

`announcements` rows -> `loadAnnouncements()` for dashboard or `loadPlannerAnnouncements()` for planner -> planner `buildAnnouncementText()` -> `draftWorkout.announcementText` textarea -> `planned_workouts.announcement_text` -> session `workout.announcementText` -> `generateBackblast()` -> editable `state.draftBackblastText` -> `sessions.backblast_text` on done/share.

At every arrow after planner text creation, announcement data is copied as plain text and expiration cannot be evaluated.

## 6. Creation and Editing Flow

Creation/editing is restricted to users with `MANAGE_ANNOUNCEMENTS`, granted to `slt` and `superadmin` roles in `src/utils/permissions.js:40-52` and `67`. The UI only creates `scope: "region"` records at `src/views/announcementManagementView.js:161-173`; there is no visible scope selector or AO selector. Dates are entered as browser date-only values at `src/views/announcementManagementView.js:74-79`, saved as strings or `null` at `src/views/announcementManagementView.js:148-149`, `168-169`.

Validation only requires title and body (`src/views/announcementManagementView.js:131-135`). Expiration is optional. Blank expiration means no `ends_on` filter applies, so it is treated as never expiring. Deletion is hard delete via `.delete().eq("id", announcementId)` at `src/services/cloudData.js:1811-1818`.

Edits/deletes/deactivation do not propagate to existing `planned_workouts.announcement_text`, `sessions.workout.announcementText`, `q_slots.preblast_text`, or `sessions.backblast_text`.

## 7. Retrieval and Filtering Matrix

| Surface | Source function/query | Dynamic or snapshot | Checks start date | Checks expiration date | Checks active flag | Checks region scope | Checks AO scope | Date/time basis | Cache involved | Refresh trigger | Stale-data risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard announcements | `loadAnnouncements()` | Dynamic at region load | Yes, JS | Yes, JS and deactivation | Yes SQL | Yes SQL | No | `getTodayDate()` local date | `state.announcements` | app/region load, admin save | Medium |
| Admin list | `loadAllAnnouncements()` | Dynamic at admin load | No | No | No | Yes SQL | No | none | `state.allAnnouncements` | first admin open, CRUD | Low for admin, high if mistaken as active |
| Admin "Copy Announcements" | `buildAnnouncementsCopyText()` | Dynamic from admin cache | Yes via `filterDateAwareContent` | Yes | Yes | inherited | No | UTC `toISOString()` for default `new Date()` | `state.allAnnouncements` | admin load/CRUD | Medium |
| Planner source load | `loadPlannerAnnouncements()` | Dynamic once per region | No | Yes SQL | Yes SQL | Yes SQL | No | UTC `new Date().toISOString().slice(0,10)` | `state.plannerAnnouncements` | first planner open/region change | High |
| Planner textarea | `buildAnnouncementText()` | Snapshot | Yes via `filterDateAwareContent` against workout date | Yes | Yes | inherited | No | workout date string | local `draftPlannedWorkout` | empty field or date change | High |
| Planned workout detail | `workout.announcementText` | Snapshot | No | No | No | N/A | N/A | none | `state.plannedWorkouts`/localStorage | data load/save | High |
| Execution detail | `workout.announcementText`, hidden in execution mode | Snapshot | No | No | No | N/A | N/A | none | local execution metadata | launch/restore | Low visible risk, high snapshot persistence |
| Session workout display | `session.workout.announcementText` | Snapshot | No | No | No | N/A | N/A | none | `state.sessions`/localStorage | session load/save | High |
| Generated backblast | `generateBackblast()` | Snapshot | No | No | No | N/A | N/A | none | `state.draftBackblastText` | session save/reset | Critical |
| Backblast editor fallback | `appendAnnouncementsToBackblast()` | Dynamic but unused | Yes | Yes | no explicit active filter | inherited | No | session date or UTC today | `state.announcements` | no call site | Informational |
| Saved/shared backblast | `sessions.backblast_text` | Snapshot | No | No | No | N/A | N/A | none | DB/session state | done/share | Critical |
| Preblast generation | `generatePreblast()` | Dynamic from workout details, not announcements | N/A | N/A | N/A | N/A | N/A | none | `state.draftPreblastText`, q-slot draft | create/share/save | Low announcement-specific |
| Service worker/PWA | `public/sw.js` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | no API cache | N/A | Low |

## 8. Planned Workout Behavior

New planner opens fetch planner announcements once per region (`src/views/workoutPlannerView.js:58-81`). If no draft exists, a new workout is created (`src/views/workoutPlannerView.js:121-143`). The announcements textarea is populated only if `draftWorkout.announcementText` is empty (`src/views/workoutPlannerView.js:1218-1220`). User edits are saved to the draft at `src/views/workoutPlannerView.js:1231-1234`.

Changing the workout date rebuilds announcement text (`src/views/workoutPlannerView.js:645-650`). Changing AO does not rebuild or AO-filter announcements (`src/views/workoutPlannerView.js:710-720`). Saving/finalizing persists the plain text through `insertPlannedWorkout()` / `updatePlannedWorkoutInCloud()` (`src/services/cloudData.js:807-889`).

Copy-to-new-plan preserves `announcementText` from the source workout because it spreads `...workout` into `newWorkout` (`src/views/plannedWorkoutDetailView.js:1233-1264`). This can preserve stale text indefinitely.

## 9. Preblast Behavior

Preblast generation uses `generatePreblast(workout, state.aos, state.sites)` at `src/views/plannedWorkoutDetailView.js:1325-1327`; that generator does not reference announcements (`src/modules/generatePreblast.js:3-65`). If a matching Q slot already has `preblastText`, the saved Q-slot text wins. Draft/share persists `q_slots.preblast_text` at `src/views/preblastView.js:577-605`, `671-699`.

Therefore, expired announcements do not appear in preblasts through the formal announcement system unless a user manually pasted them into a preblast template/draft.

## 10. Execution Behavior

Execution stores metadata in localStorage key `activeWorkoutExecution` (`src/views/plannedWorkoutDetailView.js:29-40`) and nav restore in `theQNavState` (`src/utils/storage.js:18-33`). The planned workout detail creates an announcement section from `workout.announcementText`, but hides it in execution mode (`src/views/plannedWorkoutDetailView.js:1068-1072`). Execution does not refresh or validate announcements. When logging from execution, the workout snapshot is copied into the session at `src/views/plannedWorkoutDetailView.js:1143-1152`.

## 11. Session and Backblast Behavior

When launching a session from a planned workout, `session.workout.announcementText` is set from `workout.announcementText` (`src/views/plannedWorkoutDetailView.js:1143-1152`). Dashboard log-session shortcuts also attach the matching planned workout wholesale (`src/views/dashboardView.js:692-718`, `913-939`).

`generateBackblast()` reads `session.workout.announcementText`, strips a leading heading, and pushes an `ANNOUNCEMENTS` block if text exists (`src/modules/backblast.js:170-206`). It does not query current announcements, check `endsOn`, check `includeInBackblast`, or remove expired text. After session save, new sessions immediately navigate to backblast with generated text (`src/views/sessionView.js:1259-1272`).

Backblast editor saves draft text on back (`src/views/backblastView.js:32-57`), shares and marks it as `shared` (`src/views/backblastView.js:535-552`), and preserves already shared/posted text when re-entering from session save (`src/views/sessionView.js:1261-1268`). Reset regenerates from the same session snapshot (`src/views/backblastView.js:579-595`), so reset does not necessarily remove stale announcements.

Highest-priority root cause: `planned_workouts.announcement_text` and `sessions.workout.announcementText` are historical text snapshots with no revalidation policy.

## 12. Date and Timezone Analysis

`getTodayDate()` returns browser-local `YYYY-MM-DD` (`src/utils/date.js:25-31`). `loadAnnouncements()` uses that local date and treats `starts_on <= today` and `ends_on >= today` as active (`src/services/cloudData.js:1710-1734`). It auto-deactivates only when `ends_on < today`, so an announcement with `ends_on = 2026-07-13` remains active through the local calendar day of July 13 and is deactivated on July 14 local date, on the next `loadAnnouncements()` call.

`loadPlannerAnnouncements()` instead uses `new Date().toISOString().slice(0,10)` (`src/services/cloudData.js:2923-2931`), which is UTC. In US evening hours, UTC may already be tomorrow, causing planner loads to expire announcements earlier than dashboard loads. `filterDateAwareContent()` also defaults to UTC for `new Date()` (`src/utils/dateAwareContent.js:3-7`), but uses a passed date string directly.

Invalid date strings are not validated. String comparison only works reliably for `YYYY-MM-DD`.

## 13. Cache and Stale-State Analysis

`state.announcements` is loaded on region data load (`src/services/cloudData.js:333-455`) and reset through `replacePersistedData()` (`src/services/appData.js:252-300`). No timer re-runs expiration when midnight passes. No announcements realtime subscription exists; realtime is only wired for `q_slots` (`src/services/cloudData.js:1570-1589`).

`saveState()` persists `sessions` and `plannedWorkouts` to localStorage (`src/utils/storage.js:6-15`), including stale announcement snapshots. Planner drafts also persist under `draftPlannedWorkout` (`src/views/workoutPlannerView.js:87-93`, `167-195`). Navigation/execution restore can resume a workout/session without refreshing announcement validity.

Service workers do not cache app data or Supabase responses (`public/sw.js:1-45`).

## 14. Scope and Deduplication Analysis

The data model supports `scope` and `ao_id`, but no retrieval path filters by `scope`, `ao_id`, or global scope. The create UI always writes `scope: "region"` and provides no AO/global selector (`src/views/announcementManagementView.js:161-173`). As a result, AO-specific rows, if inserted by another tool, would load for the whole region.

There is no deduplication. Region and AO announcements with same/similar text, or current announcements plus stale snapshot text, can appear together if a path ever combines them. `include_in_backblast` is stored but unused, so all planner-snapshotted announcements can appear in backblasts.

## 15. Confirmed Defects

### Critical: Backblasts Preserve Expired Announcement Snapshots

User-visible symptom: backblasts include announcements after expiration/deactivation/delete.

Root cause: `generateBackblast()` uses `session.workout.announcementText` and never validates current records (`src/modules/backblast.js:200-206`). That field originates from `planned_workouts.announcement_text` (`src/services/cloudData.js:541-545`, `835`, `888`) and session launch copies (`src/views/plannedWorkoutDetailView.js:1143-1152`).

Affected flow: planned workout -> session -> generated/saved/shared backblast. Persists across refresh and devices once saved to DB. Data integrity impact: historical communications can contain stale operational info.

Fix direction: store selected announcement IDs/snapshots with explicit policy, or regenerate from current active records at backblast time. Add migration/backfill decision before changing historical sessions.

Regression test: create an expiring announcement, create/finalize workout, expire/deactivate announcement, launch/log session and generate backblast; assert expired text absent unless product policy says snapshots are intentional.

### High: Planner Loads Future Announcements

Symptom: future `starts_on` announcements can be inserted into planned workout snapshots early.

Root cause: `loadPlannerAnnouncements()` filters only `ends_on`, not `starts_on` (`src/services/cloudData.js:2923-2937`).

Affected flow: first planner load for a region, planned workout creation. Persists through planned workout/session/backblast once saved.

Fix direction: align planner query with `loadAnnouncements()` or centralize active-date filtering.

Regression test: create announcement with `starts_on` tomorrow, open planner today, assert absent.

### High: AO Scope Is Not Enforced

Symptom: AO-scoped announcements can appear region-wide.

Root cause: all announcement queries filter only `region_id` and active/date fields, never `scope` or `ao_id` (`src/services/cloudData.js:1719-1725`, `2926-2932`).

Affected flow: dashboard, planner, snapshot, backblast fallback/dead code, admin copy. Persists if snapshotted.

Fix direction: define scope semantics and filter by selected AO/workout AO.

Regression test: AO A and AO B announcements, create workouts for each AO, assert only matching/global/region rows appear.

### Medium: Date Basis Is Inconsistent

Symptom: announcement appears active on dashboard but absent from planner near UTC/local midnight.

Root cause: `loadAnnouncements()` uses local `getTodayDate()`; `loadPlannerAnnouncements()` and default `filterDateAwareContent()` use UTC ISO date (`src/services/cloudData.js:1710-1734`, `2923-2931`; `src/utils/dateAwareContent.js:3-7`).

Fix direction: centralize app-region date calculation and inclusive boundary rules.

Regression test: mock local timezone and UTC date crossing; compare dashboard/planner/admin copy outputs.

### Medium: Expiration Does Not Invalidate Open App State

Symptom: app left open across midnight still shows yesterday-expired announcements.

Root cause: no timer/realtime/event re-runs `loadAnnouncements()` or `deactivateExpiredAnnouncements()` after date changes.

Fix direction: refresh announcement state on visibility/focus/date tick and avoid mutation-based expiration as sole mechanism.

Regression test: fake clock across midnight, assert active announcements refresh.

## 16. Likely Defects Requiring Reproduction

1. Existing planned workout opened after expiration keeps old text because `draftWorkout.announcementText` is non-empty and not rebuilt (`src/views/workoutPlannerView.js:110-120`, `1218-1220`). Repro: create workout while active, expire announcement, reopen edit.
2. Copy-to-new-plan carries old announcements via object spread (`src/views/plannedWorkoutDetailView.js:1233-1264`). Repro: copy historical workout after expiration.
3. Backblast reset regenerates stale block from unchanged session snapshot (`src/views/backblastView.js:579-595`). Repro: share/save stale backblast, reset after expiration.

## 17. Product-Policy Ambiguities

The code does not define whether announcements in a historical workout/backblast should represent:

- What was active when planned.
- What was active when the workout occurred.
- What was actually communicated in preblast/COT.
- What is active when the backblast is generated.

This needs a product decision before implementation. A defensible policy may intentionally snapshot backblasts after sharing, but generated drafts should probably have clearer refresh/regenerate semantics.

## 18. Risk-Ranked Findings

| Severity | Finding |
| --- | --- |
| Critical | Backblasts use stale planned/session announcement snapshots. |
| High | Planner omits `starts_on` filtering and can snapshot future announcements. |
| High | AO/global/region scope fields are not enforced. |
| Medium | Date comparisons use inconsistent local vs UTC basis. |
| Medium | Open app state is not invalidated when expiration passes. |
| Medium | Copy-to-new-plan preserves old announcement text. |
| Low | `include_in_backblast` is unused. |
| Informational | `appendAnnouncementsToBackblast()` is dead code. |

## 19. Recommended Remediation Plan

1. Centralize active announcement filtering in one function/query: region, active, start, end, scope, AO, inclusive date basis.
2. Decide product policy for snapshots vs dynamic announcements in planned workouts, sessions, and backblasts.
3. Stop storing only free-text snapshots; store announcement IDs plus rendered snapshot if historical preservation is desired.
4. On backblast generation, either fetch current valid announcements for session date/AO or explicitly label/use historical snapshots.
5. Refresh announcement state on app focus/date rollover and add realtime subscription or invalidation for announcement CRUD.
6. Use `include_in_backblast` or remove it.

## 20. Recommended Tests

- `loadAnnouncements()` and planner loader return identical active sets for start/end/null boundaries.
- `ends_on` is inclusive through the intended local region day.
- Future `starts_on` announcements do not enter planner snapshots.
- AO-scoped announcement appears only for matching AO.
- Expired/deactivated/deleted announcement does not appear in a newly generated backblast unless policy says historical snapshots are preserved.
- Saved/shared historical backblast behavior matches product policy.
- Copy-to-new-plan refreshes or intentionally preserves announcements.
- App open across midnight refreshes visible announcements.

## 21. Open Questions

1. Should `ends_on` mean "active through this day" or "expires at start of this day"? Current behavior is active through the local day in `loadAnnouncements()`.
2. Should backblasts reflect current active announcements, workout-date announcements, or what the Q actually communicated?
3. What are the intended semantics of `scope`, `ao_id`, `include_in_backblast`, and global announcements?
4. Should admins be able to create AO-scoped/global announcements in the UI?
5. Should deleting/deactivating an announcement purge existing planned workout snapshots?

## Specific Scenarios

| Scenario | Current behavior |
| --- | --- |
| A. Announcement expires today; Q opens workout created three days ago | Existing `announcementText` remains. It is not rebuilt unless the date changes or text is cleared. |
| B. Preblast draft generated while active, shared after expiration | Formal announcement system is not in preblast generator. If announcement text was manually present in `q_slots.preblast_text`, it remains. |
| C. Workout finalized while active; backblast generated two days after expiration | Backblast includes stale `workout.announcementText`. |
| D. Backblast draft contains announcement, user regenerates/edits after expiration | Editing preserves draft. Reset regenerates from stale session snapshot, so stale text can remain. |
| E. Announcement edited after inclusion in planned workout/preblast | Existing planned workout/session/backblast/preblast text does not update. |
| F. Announcement deleted/deactivated after workout planned | Existing snapshots remain. New dashboard load hides it; planner may still have cached source until refresh. |
| G. App remains open across expiration | `state.announcements` remains until reload/admin mutation/region reload. |
| H. Same workout opened on second device after expiration | DB `planned_workouts.announcement_text` still contains old text; second device sees it. |
| I. Historical session reopened and backblast copied weeks later | If `backblast_text` was saved/shared, copied text persists; reset regenerates from session snapshot. |
| J. AO and region announcement contain same/similar text | No AO filtering or deduplication; duplicates can appear if both are loaded/snapshotted. |

## Prioritized Conclusion

1. Expiration dates are not respected everywhere.
2. The most likely stale-backblast cause is copied `announcement_text` snapshots flowing from planned workouts into sessions and generated backblast text.
3. Fix first: `generateBackblast()`/session snapshot policy, `loadPlannerAnnouncements()` filtering, and AO/scope filtering.
4. Product decision needed: whether historical workout/session/backblast announcements should preserve what was known then or refresh to current active announcement state.
