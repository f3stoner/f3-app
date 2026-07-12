# Effective Member Stats Implementation Plan

# Status

Status: Draft
Owner: JK
Last Updated: 2026-07-12

## Scope

This is a read-only audit and implementation plan for `docs/architecture/effective-member-stats.md`.

No runtime code was changed. No SQL was written or executed. No migrations were created. No rebuilds were run.

## Findings Summary

`effective_member_stats` already exists in committed migrations as a table, not a view.

`member_stats_baselines` already exists in committed migrations as a table containing imported immutable baseline totals.

Runtime code does not currently read `effective_member_stats`.

Runtime code still reads `member_stats` through two service-layer functions in `src/services/cloudData.js`, and the rest of the app consumes the mapped in-memory stats objects.

The committed repository does not contain the `member_stats` table definition or the bodies of `rebuild_member_stats_for_member` / `rebuild_member_stats_for_region`. Those objects appear to exist in the live database because app code calls the RPCs and reads the table, but their exact live definitions need to be verified in Supabase before implementation.

## Current Schemas

### `member_stats`

No committed migration defining `public.member_stats` was found.

Runtime code reads it with `select("*")` and maps these columns:

| Column | Inferred type | Runtime use |
| --- | --- | --- |
| `member_id` | uuid | maps to `memberId` |
| `region_id` | uuid | maps to `regionId` |
| `total_posts` | integer | maps to `posts` |
| `total_qs` | integer | maps to `qs` |
| `posts_30_days` | integer | maps to `posts30Days` |
| `qs_30_days` | integer | maps to `qs30Days` |
| `posts_90_days` | integer | maps to `posts90Days` |
| `qs_90_days` | integer | maps to `qs90Days` |
| `fngs_eh` | integer | maps to `fngsEh` |
| `favorite_ao` | text | maps to `favoriteAo` |
| `last_post_date` | date | maps to `lastPostDate` |
| `first_post_date` | date | maps to `firstPostDate` |
| `last_q_date` | date | maps to `lastQDate` |

The primary key, indexes, RLS, constraints, triggers, and any extra columns are unknown from committed source.

### `member_stats_baselines`

Defined by `supabase/migrations/20260709193626_create_member_stats_baselines_v2.sql`.

| Column | Type / default | Notes |
| --- | --- | --- |
| `id` | uuid default `gen_random_uuid()` | primary key |
| `member_id` | uuid not null | references `public.members(id)` on delete cascade |
| `region_id` | uuid not null | references `public.regions(id)` on delete cascade |
| `source` | text not null | baseline source |
| `baseline_date` | date not null | current schema name for the cutover/snapshot date |
| `import_batch_id` | uuid not null | import batch identifier |
| `baseline_posts` | integer not null default 0 | nonnegative |
| `baseline_qs` | integer not null default 0 | nonnegative |
| `baseline_bds` | integer not null default 0 | nonnegative |
| `baseline_csaups` | integer not null default 0 | nonnegative |
| `baseline_dd_only` | integer not null default 0 | nonnegative |
| `baseline_other` | integer not null default 0 | nonnegative |
| `baseline_dr_posts` | integer not null default 0 | nonnegative |
| `baseline_last_post` | date | imported last-post value |
| `created_at` | timestamptz not null default `now()` | created timestamp |
| `created_by` | uuid | references `auth.users(id)` |

Constraints and indexes:

- primary key on `id`
- nonnegative count check across all baseline count fields
- unique key on `(member_id, region_id, source, baseline_date)`
- indexes on `member_id`, `region_id`, and `import_batch_id`
- RLS enabled
- authenticated users can select rows for accessible regions through `region_access`

Notable gap against `effective-member-stats.md`:

- The spec names `baseline_through_date` and active status.
- The current table has `baseline_date` and no active-status column.

### `effective_member_stats`

Defined by `supabase/migrations/20260709195750_create_effective_member_stats.sql`.

| Column | Type / default | Notes |
| --- | --- | --- |
| `region_id` | uuid not null | references `public.regions(id)` on delete cascade |
| `member_id` | uuid not null | references `public.members(id)` on delete cascade |
| `total_posts` | integer not null default 0 | nonnegative |
| `total_qs` | integer not null default 0 | nonnegative |
| `baseline_posts` | integer not null default 0 | nonnegative |
| `baseline_qs` | integer not null default 0 | nonnegative |
| `post_cutover_posts` | integer not null default 0 | nonnegative |
| `post_cutover_qs` | integer not null default 0 | nonnegative |
| `posts_30_days` | integer not null default 0 | nonnegative |
| `qs_30_days` | integer not null default 0 | nonnegative |
| `posts_90_days` | integer not null default 0 | nonnegative |
| `qs_90_days` | integer not null default 0 | nonnegative |
| `first_post_date` | date | effective first post date |
| `last_post_date` | date | effective last post date |
| `last_q_date` | date | effective last Q date |
| `favorite_ao` | text | derived favorite AO |
| `fngs_eh` | integer not null default 0 | nonnegative |
| `baseline_date` | date | copied from baseline row |
| `baseline_source` | text | copied from baseline row |
| `baseline_import_batch_id` | uuid | copied from baseline row |
| `updated_at` | timestamptz not null default `now()` | cache update timestamp |

Constraints and indexes:

- primary key on `(region_id, member_id)`
- nonnegative count check across all count fields
- indexes on `member_id` and `region_id`
- RLS enabled
- authenticated users can select rows for accessible regions through `region_access`

## Column Comparison

`effective_member_stats` intentionally overlaps runtime `member_stats` on all columns currently consumed by the app:

- `region_id`
- `member_id`
- `total_posts`
- `total_qs`
- `posts_30_days`
- `posts_90_days`
- `qs_30_days`
- `qs_90_days`
- `favorite_ao`
- `fngs_eh`
- `first_post_date`
- `last_post_date`
- `last_q_date`

`effective_member_stats` adds baseline/cutover audit columns that are not inferred from `member_stats` runtime usage:

- `baseline_posts`
- `baseline_qs`
- `post_cutover_posts`
- `post_cutover_qs`
- `baseline_date`
- `baseline_source`
- `baseline_import_batch_id`
- `updated_at`

`member_stats_baselines` stores additional official/import-specific fields that are not present in `effective_member_stats`:

- `id`
- `source`
- `baseline_bds`
- `baseline_csaups`
- `baseline_dd_only`
- `baseline_other`
- `baseline_dr_posts`
- `baseline_last_post`
- `created_at`
- `created_by`

`member_stats_baselines` currently does not store `first_post_date`, `last_q_date`, rolling windows, or favorite AO.

## Existing Rebuild Functions

### `rebuild_member_stats_for_member`

No committed function body was found.

Runtime callers:

- `src/services/cloudData.js::rebuildMemberStatsForMembers(regionId, memberIds)` calls `supabase.rpc("rebuild_member_stats_for_member", { target_region_id, target_member_id })`.
- Single-session insert, update, delete, and explicit UI refresh paths call `rebuildMemberStatsForMembers(...)`.

### `rebuild_member_stats_for_region`

No committed function body was found.

Runtime callers:

- `src/services/cloudData.js::rebuildMemberStatsForRegion(regionId)` calls `supabase.rpc("rebuild_member_stats_for_region", { target_region_id })`.
- Browser/client batch session import calls `rebuildMemberStatsForRegion(regionId)` after inserting sessions.

### Triggers

No committed trigger was found on `public.sessions` that rebuilds `member_stats` or `effective_member_stats`.

Committed trigger matches are unrelated Q-slot guard triggers:

- `guard_q_slot_user_update_trigger` on `public.q_slots`

### SQL Views

No committed SQL view or materialized view was found for `member_stats`, `member_stats_baselines`, or `effective_member_stats`.

## Runtime Read Audit

Direct reads of `member_stats`:

- `src/services/cloudData.js::loadMemberDashboardStats(regionId, memberId)`
- `src/services/cloudData.js::loadRegionMemberStats(regionId)`
- `src/services/cloudData.js::loadRegionData(regionId)`, indirectly through `loadRegionMemberStats(regionId)`

Indirect runtime consumers of mapped stats:

- `src/modules/stats.js::getMemberStats(memberId)`
- `src/views/dashboardView.js`, through `loadMemberDashboardStats(...)`
- `src/views/sessionView.js`, through `loadMemberDashboardStats(...)` after background rebuilds
- `src/views/rosterView.js`, through `getMemberStats(...)`
- `src/views/memberDetailView.js`, through `getMemberStats(...)`
- `src/views/paxProfileView.js`, through `state.memberStats`
- `src/views/aoInsightsView.js`, through `state.memberStats`
- `src/components/mainMenu.js`, through `state.memberStatsByMemberId`
- `src/components/aoInsights/newPaxPipelineDetail.js`, through passed `memberStats`
- `src/utils/aoInsights/newPaxPipelineInsights.js`, through passed `memberStats`

Direct reads of `effective_member_stats`:

- None found.

Non-runtime/audit scripts reading `member_stats_baselines`:

- `audit/attendance/importMemberStatsBaselines.js`

## Intended Role of `effective_member_stats`

Based on the committed migration and architecture doc, `effective_member_stats` is intended as a table-backed materialized cache.

It is not currently a SQL view or materialized view.

It is currently unused by runtime code.

The intended behavior is:

- Store one row per `(region_id, member_id)`.
- Add immutable baseline counts to post-cutover session-derived counts.
- Keep the service-layer read shape compatible with existing app stats consumers.
- Avoid region-specific logic in views or application code.

## Smallest Recommended Implementation

The smallest implementation should maximize reuse of existing `member_stats` rebuild logic by treating `member_stats` as the reusable session-derived calculator, but only for sessions in the correct date window.

Recommended sequence:

1. Verify live database definitions for `member_stats`, `rebuild_member_stats_for_member`, and `rebuild_member_stats_for_region`.
2. Add explicit baseline activation/cutover semantics to the baseline model.
3. Implement effective rebuild RPCs that reuse the existing member-stats rebuild logic.
4. Populate `effective_member_stats`.
5. Switch only the service-layer stats reads from `member_stats` to `effective_member_stats`.
6. Keep all downstream app state and view consumers unchanged.

### Baseline Semantics

The architecture doc requires one active baseline snapshot per region and `baseline_through_date`.

The current baseline table has `baseline_date`, not `baseline_through_date`, and has no active flag.

Smallest compatible path:

- Treat `baseline_date` as `baseline_through_date` only if confirmed semantically correct for imported Aggieland totals.
- Add an explicit active-baseline mechanism in the database before runtime cutover. This could be either:
  - an `is_active` column on `member_stats_baselines`, with a partial unique index for one active baseline per `(region_id, source)` or per `region_id`; or
  - a small region-level baseline snapshot table that marks the active `(region_id, source, baseline_date/import_batch_id)`.

Do not hard-code Aggieland or Old 300 in runtime code.

### Reusing `member_stats`

Preferred reuse pattern:

- Keep existing `member_stats` rebuild functions responsible for calculating stats from `sessions`.
- Extend or wrap that logic so it can calculate session stats with an optional lower-bound date:
  - regions without active baseline: include all sessions
  - regions with active baseline: include only sessions where `sessions.date > baseline_through_date`

Then the effective rebuild does:

- find the active baseline for the region, if any
- calculate post-cutover session stats using the same counting rules as `member_stats`
- upsert `effective_member_stats`
- set `total_posts = baseline_posts + post_cutover_posts`
- set `total_qs = baseline_qs + post_cutover_qs`
- set rolling fields from post-cutover/session history only
- set `favorite_ao` from post-cutover/session history only
- set `last_post_date` as the later of `baseline_last_post` and post-cutover last post
- set `first_post_date` from session history when available; if only baseline exists and no baseline first-post field exists, leave null unless a trusted baseline first-post source is added
- set `last_q_date` from post-cutover/session history unless baseline Q date is later added

This keeps the existing runtime shape and avoids duplicating counting logic.

### Effective Rebuild RPCs

Implement the RPCs required by the architecture doc:

- `rebuild_effective_member_stats_for_member(target_region_id, target_member_id)`
- `rebuild_effective_member_stats_for_region(target_region_id)`

The member RPC should rebuild exactly one `(region_id, member_id)` row from baseline plus authoritative sessions.

The region RPC should rebuild all affected rows for a region, including:

- members with baseline rows
- members with post-cutover session attendance
- members with post-cutover Q credit
- members who invited FNGs, if `fngs_eh` remains part of the stats row

For rollout compatibility, existing app hooks can initially call both old and effective rebuild RPCs after session changes. After read paths are fully migrated and validated, old `member_stats` rebuild calls can be deprecated.

### Read Path Cutover

Make the smallest runtime change by changing only:

- `loadMemberDashboardStats(regionId, memberId)`
- `loadRegionMemberStats(regionId)`

Both functions should read `effective_member_stats` and keep returning the same mapped JS object shape.

Do not change `state.memberStats`, `state.memberStatsByMemberId`, `getMemberStats`, or individual views unless the service-layer switch exposes a missing field.

### Rollout Validation

Before switching service-layer reads:

- Populate `effective_member_stats` for Aggieland and Old 300.
- Compare `effective_member_stats` against current `member_stats` for Old 300. They should match because Old 300 has no baseline.
- Compare Aggieland totals against the frozen official baseline plus post-cutover sessions.
- Check repeatability by running the effective region rebuild twice and confirming no data changes except `updated_at`.
- Validate no double-counting for sessions on or before the active baseline date.

### Edge Function Gap

The hosted `supabase/functions/nightly-aggieland-import/index.ts` inserts sessions but does not call either existing member-stats rebuild RPC.

Once effective stats are live, the Edge Function or a database-side trigger/job must rebuild effective stats after applied imports. The smallest explicit implementation is to call the region effective rebuild once after a successful apply that inserts sessions.

## Recommended Minimal Implementation Order

1. Verify live database schema and function bodies.
2. Add/confirm active baseline metadata and cutover semantics.
3. Extract the current `member_stats` calculation into a reusable database routine that accepts an optional post-cutover date, or minimally mirror the existing function with a date filter.
4. Create `rebuild_effective_member_stats_for_member`.
5. Create `rebuild_effective_member_stats_for_region`.
6. Backfill `effective_member_stats` for existing regions.
7. Change `loadMemberDashboardStats` and `loadRegionMemberStats` to read `effective_member_stats`.
8. Add effective rebuild calls beside existing rebuild calls in app session insert/update/delete and batch import paths.
9. Add the same region effective rebuild to the Aggieland Edge Function apply path.
10. After validation, deprecate direct `member_stats` reads and eventually the old rebuild dependency if no longer needed.

## Risks / Open Questions

- The exact live `member_stats` schema and rebuild SQL are not in the repository.
- `member_stats_baselines` lacks `is_active` / active snapshot metadata required by the architecture doc.
- `member_stats_baselines` uses `baseline_date`; the spec uses `baseline_through_date`.
- Baseline rows do not include `first_post_date` or `last_q_date`, so effective dates may be incomplete for baseline-only members unless more baseline fields are imported.
- If post-cutover stats are calculated from all `member_stats` rows without date filtering, Aggieland historical sessions already represented in the official baseline will be double-counted.
- Edge Function imports can currently leave stats stale unless a rebuild is performed elsewhere.

## Recommendation

Implement `effective_member_stats` as the canonical table-backed materialized cache already implied by the committed schema.

Do not make it a view for the initial implementation. A table keeps rollback simple, matches the existing migration, preserves RLS/indexing, and allows rebuilds to remain explicit and repeatable.

Maximize reuse by adapting the existing `member_stats` rebuild calculation to support a post-cutover date filter, then upsert the additive baseline-plus-session result into `effective_member_stats`.

Keep the runtime migration intentionally small: switch only the two service-layer reads to `effective_member_stats` after the cache is populated and validated.
