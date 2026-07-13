# Announcement Lifecycle Phase 1 Plan

Date: 2026-07-13

## 1. Executive Summary

Phase 1 should create one pure, synchronous announcement resolver and route both dashboard loading and planner source loading through it. Supabase should retrieve mapped candidate rows for a region; JavaScript should apply the canonical product rules for active status, start/end dates, AO scope, and ordering. This keeps the definition testable and prevents dashboard/planner drift.

Recommended first runtime file to edit: `src/utils/announcements.js` as a new utility module.

Recommended first code change: add `resolveActiveAnnouncements()` and `formatAnnouncementsText()` as pure functions, then migrate callers one at a time.

Primary unresolved ambiguity: the repository verifies `scope: "region"` as the only value created by app UI, while `ao_id` exists and is migrated but no UI or data export verifies an `ao` scope string. Phase 1 should enforce AO scope by `aoId` when present, treat `scope: "region"` or blank/null `aoId` as region-wide, and exclude unsupported scope values until explicitly modeled.

## 2. Confirmed Current Behavior

Current active dashboard load:

- `loadRegionData()` calls `loadAnnouncements(regionId)` at `src/services/cloudData.js:370-445`.
- `loadAnnouncements()` calls `deactivateExpiredAnnouncements()`, queries `announcements` with `region_id` and `is_active`, orders by `display_order` then `created_at`, then filters `starts_on <= today` and `ends_on >= today` in JS at `src/services/cloudData.js:1833-1875`.
- Dashboard renders only `state.announcements` in `renderAnnouncementsSection()` at `src/views/dashboardView.js:1102-1194`.

Current planner source load:

- `renderWorkoutPlanner()` loads once per region with `loadPlannerAnnouncements(state.currentRegionId)` into `state.plannerAnnouncements` at `src/views/workoutPlannerView.js:58-82`.
- `loadPlannerAnnouncements()` uses UTC `new Date().toISOString().slice(0, 10)`, filters `region_id`, `is_active`, and `ends_on`, but does not filter `starts_on` or AO scope at `src/services/cloudData.js:3063-3077`.
- `buildAnnouncementText()` locally filters `state.plannerAnnouncements` by workout date through `filterDateAwareContent()` and `isActive`, then joins title/body at `src/views/workoutPlannerView.js:1208-1216`.
- Date changes refresh `draftWorkout.announcementText` at `src/views/workoutPlannerView.js:645-651`; AO changes do not refresh it at `src/views/workoutPlannerView.js:710-720`.

Current date helpers:

- `getTodayDate()` returns browser-local `YYYY-MM-DD` at `src/utils/date.js:25-31`.
- `filterDateAwareContent()` uses `toISOString()` for `Date` inputs, so default `new Date()` is UTC date based at `src/utils/dateAwareContent.js:3-31`.

Current state/cache:

- `state.announcements` and `state.allAnnouncements` are declared at `src/modules/state.js:115-116`.
- `replacePersistedData()` assigns `state.announcements` and clears admin announcement cache at `src/services/appData.js:305-353`.
- Planner source announcements use ad hoc dynamic state fields (`plannerAnnouncements`, `hasLoadedPlannerAnnouncements`, `plannerAnnouncementsRegionId`) even though they are not declared in `state.js`.

Current test infrastructure:

- `package.json` has `npm test` as a placeholder that exits with error.
- No first-party test files or `jest`/`vitest` config were found outside `node_modules`.

## 3. Verified Schema and Scope Semantics

Verified fields from `mapAnnouncementFromDb()` and CRUD at `src/services/cloudData.js:1894-1989`:

| DB field | App field | Phase 1 relevance |
| --- | --- | --- |
| `id` | `id` | Stable identity and dedupe key if needed later. |
| `region_id` | `regionId` | Candidate query and resolver region guard. |
| `scope` | `scope` | Only `region` is created by current UI. |
| `ao_id` | `aoId` | Present in model; AO consolidation migration updates it. |
| `title` | `title` | Rendered text. |
| `body` | `body` | Rendered text. |
| `starts_on` | `startsOn` | Inclusive start date. |
| `ends_on` | `endsOn` | Inclusive expiration date. |
| `is_active` | `isActive` | Must be true. |
| `display_order` | `displayOrder` | Primary stable ordering. |
| `created_at` | `createdAt` | Secondary ordering. |
| `link_url`, `link_label` | `linkUrl`, `linkLabel` | Dashboard/admin display. |
| `include_in_backblast` | `includeInBackblast` | Out of Phase 1; do not use yet. |

Verified scope values:

- `region`: verified in `insertAnnouncement()` default and announcement management create flow (`src/views/announcementManagementView.js:161-173`). Behavior: include for any AO in same region when date/active criteria pass.
- `null` or missing scope: possible through legacy/DB rows because mapper does not normalize `row.scope`. Recommended behavior: treat as region-wide only when `aoId` is null; if `aoId` is present, treat as AO-scoped by `aoId`.
- `global`: not verified in code, migrations, UI, or data. Recommended Phase 1 behavior: do not support; exclude or log as unsupported in tests later.
- `ao`: no literal `scope: "ao"` producer was found. Because `ao_id` is present and migrated, recommend supporting AO filtering by `aoId` presence rather than relying on an unverified scope string. If a row has `scope === "ao"`, include only when `aoId` matches.

`ao_id` can be null: CRUD writes `ao_id: announcement.aoId || null` at `src/services/cloudData.js:1898-1899`, `1926-1927`.

## 4. Proposed Phase 1 Architecture

Add a new pure utility module:

`src/utils/announcements.js`

Responsibilities:

- Normalize calendar date keys without UTC rollover.
- Map raw/mapped announcement shape to canonical app fields if needed.
- Resolve candidate announcements against region, AO, active flag, starts/ends dates, and scope.
- Sort in one stable way.
- Format resolved announcements into planner text.

Keep Supabase responsibilities in `src/services/cloudData.js`:

- Fetch candidate announcements for a region.
- Map DB rows to app shape.
- Preserve admin/all-announcements load.
- Optionally keep expired-record deactivation as a maintenance side effect, but do not rely on it for correctness.

Do not modify schema, planned-workout persistence, automatic/custom mode, preblast, execution, session, or backblast behavior in Phase 1.

## 5. Proposed Canonical Resolver Signature

```js
export function getLocalDateKey(date = new Date()) {
  // Date -> local YYYY-MM-DD; string -> first 10 chars.
}

export function resolveActiveAnnouncements(announcements = [], {
  regionId,
  targetDate,
  aoId = null,
  includeRegionScope = true,
} = {}) {
  // returns sorted announcement app objects
}

export function formatAnnouncementsText(announcements = []) {
  // title/body joined as current planner expects
}
```

Return shape:

- `resolveActiveAnnouncements()` returns an array of mapped announcement objects with the existing shape from `mapAnnouncementFromDb()`.
- It should not mutate candidates.
- It is synchronous and pure.

Canonical logic:

```text
announcement.regionId === regionId
announcement.isActive === true
(startsOn is null OR startsOn <= targetDate)
(endsOn is null OR endsOn >= targetDate)
and scope/AO rule passes
```

Scope/AO rule:

```text
If aoId is present on the announcement:
  include only when target aoId is present and equal.
Else if scope is missing/null/"region":
  include when includeRegionScope is true.
Else if scope is "ao":
  include only when announcement.aoId matches target aoId.
Else:
  exclude unsupported scope.
```

Ordering:

1. `displayOrder` ascending, null/undefined last.
2. `createdAt` descending to preserve current dashboard `created_at desc` tie-breaker.
3. `id` ascending as a deterministic final tie-breaker.

## 6. Exact Files to Modify

| File | Phase 1 action | Risk |
| --- | --- | --- |
| `src/utils/announcements.js` | Add new pure resolver and formatter. | Low |
| `src/services/cloudData.js` | Add/rename candidate loader; update `loadAnnouncements()` and `loadPlannerAnnouncements()` to use resolver. Export resolver-compatible loader. | Medium |
| `src/views/workoutPlannerView.js` | Use resolver for `buildAnnouncementText()`, date change, and AO change. Keep text persistence behavior unchanged. | Medium |
| `src/views/announcementManagementView.js` | Replace copy path date filtering with canonical resolver where practical; refresh state through updated `loadAnnouncements()`. | Low |
| `src/utils/dateAwareContent.js` | Leave in place for Third F/Q Source users or delegate to date helper later. Do not globally change in Phase 1 unless tests cover other consumers. | Medium if changed |
| `src/modules/state.js` | Optionally declare planner announcement cache fields for clarity. | Low |
| `src/services/appData.js` | Optionally reset planner announcement cache on region data replacement. | Low |

## 7. Function-by-Function Change Plan

### `src/utils/announcements.js` / `getLocalDateKey`

Current responsibility: file does not exist.

Proposed responsibility: convert a `Date` or date string to local `YYYY-MM-DD`.

Logic:

- If input is a string, return `input.slice(0, 10)`.
- If input is a `Date`, use `getFullYear()`, `getMonth() + 1`, `getDate()` like `getTodayDate()`.
- If missing/invalid, fall back to `getLocalDateKey(new Date())`.

Callers affected: new resolver, dashboard `loadAnnouncements()`, planner `buildAnnouncementText()`.

Expected behavior: no UTC rollover in dashboard/planner active-date comparisons.

Risk: Low.

### `src/utils/announcements.js` / `resolveActiveAnnouncements`

Current responsibility: duplicated between `loadAnnouncements()`, `loadPlannerAnnouncements()`, and `filterDateAwareContent()`.

Proposed responsibility: single active-announcement definition.

Logic to add:

- Normalize `targetDate` with `getLocalDateKey()`.
- Filter `regionId` when provided.
- Require `isActive === true`; do not treat missing `isActive` as active.
- Apply inclusive start/end rules.
- Apply AO/scope rule above.
- Sort with stable ordering above.

Callers affected: `loadAnnouncements()`, `loadPlannerAnnouncements()`, planner `buildAnnouncementText()`, admin copy if migrated.

Expected behavior: dashboard and planner resolve the same candidate set consistently.

Risk: Medium because unsupported scope rows may be hidden rather than accidentally shown.

### `src/utils/announcements.js` / `formatAnnouncementsText`

Current responsibility: planner local `buildAnnouncementText()` maps title/body inline.

Proposed responsibility: preserve current planner text format from resolved announcements.

Logic:

- For each announcement, join non-empty `title` and `body` with `\n`.
- Join announcements with `\n\n`.
- Do not include links in planner text in Phase 1 unless product asks; current planner does not include links.

Callers affected: `buildAnnouncementText()`.

Expected behavior: same text format, central helper.

Risk: Low.

### `src/services/cloudData.js` / `loadAnnouncementCandidates(regionId)`

Current responsibility: absent; `loadAnnouncements()` and `loadPlannerAnnouncements()` each query `announcements`.

Proposed responsibility: fetch mapped region candidates broad enough for local resolution.

Logic:

- Query `.from("announcements").select("*").eq("region_id", regionId)`.
- For performance, it may keep `.eq("is_active", true)` for active surfaces, but the canonical resolver must still check `isActive`. Recommended: fetch active only for Phase 1 active surfaces; keep `loadAllAnnouncements()` for admin all rows.
- Preserve ordering in query if desired, but resolver should sort anyway.
- Map with `mapAnnouncementFromDb()`.

Callers affected: `loadAnnouncements()`, `loadPlannerAnnouncements()`.

Expected behavior: both surfaces start from the same mapped row shape.

Risk: Low.

### `src/services/cloudData.js` / `loadAnnouncements(regionId, options?)`

Current responsibility: deactivate expired rows, fetch active region rows, filter dates by local today, return dashboard state.

Proposed responsibility: load candidate rows and resolve active announcements for dashboard date/AO context.

Logic to change:

- Keep `deactivateExpiredAnnouncements(regionId)` as best-effort maintenance, but document that correctness comes from resolver.
- Use `getLocalDateKey()` or `getTodayDate()` for dashboard target date.
- Call `resolveActiveAnnouncements(candidates, { regionId, targetDate: getLocalDateKey(), aoId: null })`.
- Because dashboard is region-level with no selected AO, include region-wide rows only; AO-specific rows should not appear on the general dashboard until a product surface selects an AO.

Callers affected:

- `loadRegionData()` at `src/services/cloudData.js:444`.
- Announcement admin save/reorder/toggle/delete at `src/views/announcementManagementView.js:178`, `286`, `394`, `426`.

Expected behavior: expired/future/inactive/AO-specific announcements do not show on dashboard.

Risk: Medium if existing data has `ao_id` rows expected to show on dashboard.

### `src/services/cloudData.js` / `loadPlannerAnnouncements(regionId)`

Current responsibility: fetch active region rows with non-expired `ends_on`, using UTC today.

Proposed responsibility: either become `loadAnnouncementCandidates(regionId)` alias or return mapped active candidate rows without date resolution.

Recommended exact Phase 1 behavior:

- Rename conceptually to `loadPlannerAnnouncementCandidates(regionId)` or keep function name for lower churn but remove date-specific query filtering.
- Query same candidates as dashboard active loader.
- Do not resolve by target date in the service because planner target date and AO are view state.
- Do not use `new Date().toISOString().slice(0, 10)`.

Callers affected: `renderWorkoutPlanner()` at `src/views/workoutPlannerView.js:66`.

Expected behavior: planner can recalculate correctly for date/AO changes without re-querying.

Risk: Low to Medium due to more rows in memory if inactive/future rows are fetched. Can limit to active only while preserving future start rows.

### `src/views/workoutPlannerView.js` / planner announcement cache block

Current responsibility: load planner announcements once per region into `state.plannerAnnouncements`.

Proposed responsibility: load candidate announcements once per region into same state field.

Logic:

- Continue region cache invalidation at `src/views/workoutPlannerView.js:58-61`.
- Call the updated `loadPlannerAnnouncements()` candidate loader.
- Keep async render flow unchanged.

Callers affected: planner render only.

Expected behavior: no UI behavior change except future starts and AO scope now resolve correctly.

Risk: Low.

### `src/views/workoutPlannerView.js` / `buildAnnouncementText`

Current responsibility: `filterDateAwareContent(state.plannerAnnouncements, draftWorkout.date)` plus active filter and title/body join.

Proposed responsibility: resolve candidates with date and AO, then format.

Logic to replace:

```js
const resolved = resolveActiveAnnouncements(state.plannerAnnouncements || [], {
  regionId: state.currentRegionId,
  targetDate: draftWorkout.date || getTodayDate(),
  aoId: draftWorkout.aoId || null,
});
return formatAnnouncementsText(resolved);
```

Callers affected: initial empty-text populate, date change, future AO change hook.

Expected behavior: planner source text respects start/end/active/region/AO consistently.

Risk: Medium because manually edited or existing non-empty text remains untouched by Phase 1.

### `src/views/workoutPlannerView.js` / `updateDraftDate`

Current responsibility: update date, rebuild announcement text, persist draft, render.

Proposed responsibility: same, but through canonical resolver.

Logic: no structural change beyond updated `buildAnnouncementText()`.

Callers affected: date input `change`/`input`.

Expected behavior: copied or new automatic announcement text recalculates for new date.

Risk: Low.

### `src/views/workoutPlannerView.js` / AO select change handler

Current responsibility: update `draftWorkout.aoId` and `aoName`, persist, render.

Proposed responsibility: also refresh `draftWorkout.announcementText` using canonical resolver.

Logic to add before `persistDraftNow()`:

```js
draftWorkout.announcementText = buildAnnouncementText();
```

Caveat: this can overwrite manually edited text. Governing rules require manual custom mode later, but Phase 1 is explicitly not implementing automatic/custom persistence. To avoid premature custom-mode work, limit this to the current behavior surface: only update automatically when the field was empty or equal to the prior generated value if a simple local `lastGeneratedAnnouncementText` variable can be maintained in render. If that is too invasive, document that AO refresh is partially blocked until Phase 2 custom-mode tracking.

Recommended Phase 1 compromise: compute `const generatedAnnouncementText = buildAnnouncementText()` before textarea creation; when AO/date changes, refresh only if `!draftWorkout.announcementText || draftWorkout.announcementText === generatedAnnouncementText`. This is not persisted schema mode; it is a local guard to avoid clobbering manual edits.

Callers affected: AO select.

Expected behavior: no-AO or changed-AO candidate set recalculates when safe.

Risk: Medium because current code cannot reliably know historical manual edits.

### `src/views/announcementManagementView.js` / `buildAnnouncementsCopyText`

Current responsibility: uses `filterDateAwareContent()` and `isActive`.

Proposed responsibility: optional Phase 1 alignment with resolver.

Logic:

- Replace with `resolveActiveAnnouncements(announcements, { regionId: state.currentRegionId, targetDate: getLocalDateKey(), aoId: null })`.
- Keep link inclusion in copy text as current behavior.

Callers affected: admin "Copy Announcements" button.

Expected behavior: admin copy matches dashboard active region announcements.

Risk: Low.

### `src/modules/state.js`

Current responsibility: declares `announcements`/`allAnnouncements`; planner announcement cache fields are dynamic.

Proposed responsibility: optionally declare:

```js
plannerAnnouncements: [],
plannerAnnouncementsRegionId: null,
hasLoadedPlannerAnnouncements: false,
isLoadingPlannerAnnouncements: false,
```

Callers affected: planner.

Expected behavior: clearer state shape; no behavior change.

Risk: Low.

### `src/services/appData.js` / `replacePersistedData`

Current responsibility: sets `state.announcements`, clears admin cache.

Proposed responsibility: optionally also clear planner announcement cache on region data replacement.

Logic:

- Set `state.plannerAnnouncements = []`, `state.plannerAnnouncementsRegionId = null`, `state.hasLoadedPlannerAnnouncements = false`, `state.isLoadingPlannerAnnouncements = false`.

Callers affected: app bootstrap/region switch.

Expected behavior: planner never reuses stale candidate set after region data replacement.

Risk: Low.

## 8. Dashboard Migration Plan

1. Add resolver utilities.
2. Add a candidate loader or refactor `loadAnnouncements()` to use the resolver.
3. Keep `state.announcements` as the dashboard active list.
4. Keep `deactivateExpiredAnnouncements()` temporarily, but make it non-authoritative. Even if it fails, resolver still excludes expired rows.
5. Preserve current ordering using resolver sort: `displayOrder`, `createdAt desc`, `id`.
6. Validate dashboard empty/non-empty render still works because `renderAnnouncementsSection()` only expects title/body/link fields.

Data returned after change: mapped announcement objects, same shape as today.

Callers that could break: admin management refreshes that call `loadAnnouncements()` after CRUD; they should receive the same shape.

## 9. Planner Migration Plan

New workout:

- Load candidates once per region.
- When `draftWorkout.announcementText` is empty, resolve with `draftWorkout.date || getTodayDate()` and `draftWorkout.aoId || null`, then format.

Existing workout:

- Do not force-refresh non-empty `announcementText` in Phase 1 to avoid clobbering manual text without automatic/custom mode.
- Existing stale text remains a Phase 2 concern unless the user changes date/AO and the text still matches the local generated value.

Date change:

- Continue recalculating, but use canonical resolver.
- Prefer preserving manual edits if current text differs from last generated text.

AO change:

- Add recalculation via canonical resolver.
- If no AO is selected, include region-wide announcements only; exclude AO-specific announcements.

Region change:

- Existing invalidation at `src/views/workoutPlannerView.js:58-61` remains.
- Optionally reset planner cache in `replacePersistedData()`.

Reopening draft:

- Draft text currently comes from `localStorage` `draftPlannedWorkout`; Phase 1 should not invent persisted auto/custom mode.
- If draft text is empty, populate from resolver. If non-empty, preserve.

Loading planned workout from database:

- Preserve `planned_workouts.announcement_text` as-is in Phase 1.
- Do not backfill or mutate stored workouts.

## 10. Date and Timezone Plan

Canonical date format: `YYYY-MM-DD`.

Canonical rule:

```text
isActive === true
startsOn is null OR startsOn <= targetDate
endsOn is null OR endsOn >= targetDate
```

`endsOn` is inclusive. An announcement with `endsOn = 2026-07-13` is active for target date `2026-07-13` and inactive for `2026-07-14`.

Dashboard "today": use browser-local date via `getLocalDateKey(new Date())`, matching current `getTodayDate()` behavior.

Planner target date: use `draftWorkout.date`; fallback to browser-local today.

UTC rollover avoidance: never use `Date.prototype.toISOString().slice(0, 10)` for announcement active-date resolution. Use local date components for `Date` objects.

Region timezone support: no region timezone column/config was found. Push notification settings store user timezone, and `send-reminders` hard-codes `America/Chicago`, but announcement resolution has no region timezone model. Phase 1 fallback should be browser-local date, consistent with current UI date inputs and `getTodayDate()`.

## 11. Ordering Plan

Current dashboard query orders by:

1. `display_order` ascending, nulls last.
2. `created_at` descending.

Current planner query orders only by `display_order` ascending.

Canonical resolver should sort by:

1. `displayOrder` ascending, null/undefined last.
2. `createdAt` descending.
3. `id` ascending.

This preserves dashboard behavior and makes planner deterministic.

## 12. State and Cache Implications

Dashboard:

- `state.announcements` remains active dashboard announcements.
- It is refreshed on app/region load and admin CRUD refresh.

Planner:

- `state.plannerAnnouncements` should be treated as candidate rows, not already-active rows.
- Existing region cache invalidation remains.
- Date/AO changes resolve locally without re-querying.

Admin:

- `state.allAnnouncements` remains unfiltered for management.
- Admin copy can use resolver from `state.allAnnouncements`.

Open app across midnight:

- Phase 1 resolver enables correctness when called, but does not add midnight timers. The open-app refresh behavior is not fully solved unless dashboard reload/focus refresh is added. If included in Phase 1, add a small dashboard/app focus refresh that reloads announcements when local date key changes; otherwise document as Phase 1-adjacent.

## 13. Compatibility Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Existing `ao_id` rows were expected on dashboard | They will disappear from region dashboard | Product rule says AO scope must filter; dashboard has no AO context. |
| Unknown `scope` values exist in DB | They may be excluded | Manual read-only DB query recommended before deploy. |
| Planner AO/date refresh overwrites manual text | Violates product rule | Use local generated-text guard; full auto/custom mode is Phase 2. |
| Fetching broader candidate set increases row count | Minor performance risk | Keep `.eq("is_active", true)` in candidate loader; resolver still authoritative. |
| No test framework | Harder to lock behavior | Add Vitest/Jest in later test work, not Phase 1 runtime change unless approved. |

Recommended read-only DB checks before implementation/deploy:

```sql
select scope, count(*) from public.announcements group by scope order by scope;
select count(*) from public.announcements where ao_id is not null;
select scope, ao_id is null as ao_id_is_null, count(*) from public.announcements group by scope, ao_id is null;
```

## 14. Recommended Test Plan

Current test framework: none configured. Recommended future setup: Vitest with unit tests under `src/utils/__tests__/announcements.test.js`, because the resolver is pure ESM and can run without DOM/Supabase.

Exact tests to add later:

1. Null start and end dates: active on target date.
2. Future start date: inactive before start.
3. Start date equal to target date: active.
4. Past end date: inactive after end.
5. End date equal to target date: active.
6. Inactive announcement: inactive regardless of dates.
7. Region mismatch: excluded.
8. Matching region scope: included for same region and no AO.
9. Matching AO scope: included when `aoId` matches.
10. Nonmatching AO scope: excluded.
11. Null AO target: AO-scoped rows excluded; region rows included.
12. Stable ordering: `displayOrder`, `createdAt desc`, `id`.
13. Local date near UTC rollover: Date object at local evening resolves to local date, not UTC tomorrow.
14. Dashboard and planner resolving same candidates consistently: same resolver returns same rows for same region/date/AO context.

Optional integration-ish tests later:

- `loadAnnouncements()` uses resolver and returns mapped rows.
- `buildAnnouncementText()` formats resolver output without links.

## 15. Manual Validation Checklist

- Create a region announcement with no dates; confirm dashboard and planner show it.
- Create a future-start announcement; confirm dashboard and planner do not show it before start.
- Create an announcement ending today; confirm dashboard and planner show it today.
- Change workout date to after end; confirm planner text removes it when safe.
- Change workout AO; confirm AO-specific rows recalculate only for matching AO.
- Leave AO blank; confirm only region-wide rows appear.
- Deactivate an announcement; confirm dashboard and planner exclude after refresh.
- Delete an announcement; confirm dashboard/planner active surfaces exclude after refresh.
- Verify admin list still shows all announcements.
- Verify no runtime change to preblast, execution, session logging, or backblast.

## 16. Explicit Out-of-Scope Items

- Automatic versus custom announcement mode persisted in planned workouts.
- Planned-workout schema changes.
- Preblast announcement integration.
- Execution announcement rendering.
- Session immutable announcement snapshots.
- Backblast generation changes.
- Legacy session/backblast handling.
- Data backfills.
- SQL migrations.
- Test creation in this read-only planning pass.
- Commits, branches, pushes, or PRs.

## 17. Ordered Implementation Sequence

1. Add `src/utils/announcements.js` with `getLocalDateKey`, `resolveActiveAnnouncements`, and `formatAnnouncementsText`.
2. Refactor `loadAnnouncements()` to use resolver for dashboard active rows while preserving return shape.
3. Refactor `loadPlannerAnnouncements()` to load candidate rows without UTC/date filtering.
4. Update `workoutPlannerView.js` imports and `buildAnnouncementText()` to use resolver and formatter.
5. Add safe AO-change refresh in `workoutPlannerView.js`.
6. Optionally update admin copy to use resolver.
7. Optionally declare/reset planner announcement cache fields in state/appData.
8. Run manual validation checklist.
9. Add tests in a later approved test task.

## 18. Recommended First Runtime File to Edit

`src/utils/announcements.js`

Reason: the core of Phase 1 is the authoritative pure resolver. Starting here gives one small, testable unit before touching Supabase or UI code.

## 19. Recommended First Code Change

Create:

```js
export function getLocalDateKey(date = new Date()) { ... }
export function resolveActiveAnnouncements(announcements = [], options = {}) { ... }
export function formatAnnouncementsText(announcements = []) { ... }
```

Then manually exercise the resolver in a temporary local console or future unit tests before wiring callers. Do not change persisted data or schema.

## 20. Phase 2 Handoff Notes

Phase 2 should introduce explicit automatic/custom announcement state for planned workouts. The governing product rule says generated announcement content remains refreshable until a user edits it; the current schema only has plain `announcement_text`, so Phase 1 cannot fully distinguish automatic from custom once text is non-empty.

Likely Phase 2 data model:

- `announcement_mode`: `"auto"` or `"custom"`.
- `announcement_text`: rendered custom or current generated text.
- `announcement_generated_from`: optional IDs/date/AO metadata for debug.
- Session logging snapshots resolved announcements immutably into `sessions.workout.announcementText` or a dedicated session announcement snapshot field.

Phase 2 should then migrate preblast, execution, session logging, and backblast to respect the session log snapshot boundary.

