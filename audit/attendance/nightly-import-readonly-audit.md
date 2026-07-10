# Nightly Aggieland Import Read-Only Audit

Date: 2026-07-09  
Scope: read-only source audit of the existing Aggieland nightly/session importer, stats rebuild paths, baseline tables, and runtime read paths. No importer was run, no migrations were run, and no database rows were read or written by this audit.

## Executive Summary

Severity: critical

The current "nightly" Aggieland importer is not baseline-aware. It does not read or write `member_stats_baselines` or `effective_member_stats`. It imports official Aggieland sheet data as session rows, then relies on the existing `member_stats` rebuild pipeline to derive cumulative counts from `sessions`. Because runtime code still reads `member_stats` almost everywhere, the newly imported baseline rows will not affect displayed stats until read paths and rebuild/write logic are changed.

Severity: high

The importer does not appear to import the official cumulative totals sheet that fed the one-time baseline. It reads the live Google Sheet Pax Master and AO log tabs, creates missing `members`, inserts missing `sessions`, records unresolved-name `admin_flags`, and records an `import_runs` row. Therefore the biggest double-counting risk is not from overwriting cumulative totals, but from importing official historical/session rows that overlap with app-created sessions and then adding baseline totals on top in a future `effective_member_stats` implementation without a source/cutover boundary.

Severity: high

Identity matching is normalized PAX-name based. It has some collision protection, but no persistent official-identity mapping table and no use of the manual baseline audit decisions. Renames, duplicate names, suffix variants, and manually reconciled identities can drift unless those decisions are persisted in a first-class identity map before post-baseline automation is enabled.

Severity: medium

The repo does not contain a schedule for `nightly-aggieland-import`. `supabase/config.toml` defines the Edge Function, and `src/services/cloudData.js` exposes a manual/admin caller, but no GitHub Action, Supabase cron, or database cron entry for this function is present in the repository. Hosted Supabase schedule configuration may exist outside the repo.

## Current Data Flow Diagram

```text
External Google Sheet
  - Pax Master tab
  - AO log tabs: Forest, Cave, Iron, Keep, Rock, Mine, Southie, Watch, Dads, BlackOps, CSAUP, Other
        |
        v
supabase/functions/nightly-aggieland-import/index.ts
  - fetchCsv(gid)
  - syncPaxMaster()
  - buildMemberImportLookup()
  - loadExistingSessionKeys()
  - parseAoCsvPreview()
  - insertSessionsBatch()
  - createUnresolvedPaxFlagsForSessions()
  - insertImportRun()
        |
        v
Tables written by importer when apply=true
  - members
  - sessions
  - admin_flags
  - import_runs
        |
        v
Existing app stats maintenance
  - App session insert/update calls rebuild_member_stats_for_member or rebuild_member_stats_for_region
  - Browser batch import path calls rebuildMemberStatsForRegion()
  - Edge Function batch insert does not call stats rebuild in code
        |
        v
member_stats
        |
        v
Runtime UI reads
  - dashboard, roster, member detail, PAX profile, AO insights, main menu

New baseline objects currently off to the side
  - member_stats_baselines populated by one-time import
  - effective_member_stats table exists
  - no runtime reader/writer found for effective_member_stats
```

## Exact Files, Functions, Tables

### Entry points and callers

- `supabase/functions/nightly-aggieland-import/index.ts`
  - `serve()`
  - `buildCsvExportUrl()`
  - `fetchCsv()`
  - `syncPaxMaster()`
  - `buildMemberImportLookup()`
  - `loadExistingSessionKeys()`
  - `parseAoCsvPreview()`
  - `insertSessionsBatch()`
  - `createUnresolvedPaxFlagsForSessions()`
  - `insertImportRun()`
- `supabase/config.toml`
  - `[functions.nightly-aggieland-import]`
- `src/services/cloudData.js`
  - `runAggielandImport()`
  - `runAggielandImportDryRun()`
  - `applyAggielandImport()`
- `src/services/importAggieland.js`
  - browser/manual legacy import helpers: `runAggielandSync()`, `importPaxMasterCsv()`, `runAggielandDeltaAoImports()`, `repairAggielandDeltaSessions()`, `parseAoLogCsvToSessions()`
- `import/refreshAggielandCsvs.mjs`
  - local helper that downloads the same Google Sheet tabs to `import/*.csv`; it writes local CSVs and was not run.

### Tables directly involved

- Written by current Edge Function in apply mode: `members`, `sessions`, `admin_flags`, `import_runs`
- Read by current Edge Function: `members`, `sessions`, `admin_flags`
- Existing app stats table read by runtime: `member_stats`
- New baseline/effective tables: `member_stats_baselines`, `effective_member_stats`
- Related session columns: `sessions.date`, `sessions.ao_name`, `sessions.q_ids`, `sessions.q_id`, `sessions.attendee_ids`, `sessions.fngs`, `sessions.unresolved_pax`, `sessions.created_at`
- Related member columns: `members.region_id`, `members.pax_name`, `members.real_name`, `members.home_ao`, `members.invited_by_id`, `members.first_post_date`, `members.status`

## 1. Entry Point

Severity: medium

The exact function is `nightly-aggieland-import`, implemented at `supabase/functions/nightly-aggieland-import/index.ts` and registered in `supabase/config.toml`. It is invoked as an HTTP Edge Function. `src/services/cloudData.js` builds the URL `${process.env.SUPABASE_URL}/functions/v1/nightly-aggieland-import` and POSTs `{ apply }`.

The function uses environment variables:

- `PROJECT_SUPABASE_URL`
- `PROJECT_SUPABASE_SERVICE_ROLE_KEY`
- `AGGIELAND_REGION_ID`

The function uses service-role Supabase access internally. Its public function config has `verify_jwt = true`, but the browser caller in `runAggielandImport()` does not attach an Authorization header in the code inspected, so the admin caller may fail unless the deployed environment/config differs or invocation is handled elsewhere.

The source data is a hard-coded Google spreadsheet:

- Spreadsheet id: `1wlsKrOF_7sfGi_F2emLQKHfRa5L3AaUIme1nRFcytTA`
- Tabs: `Pax Master`, `Forest`, `Cave`, `Iron`, `Keep`, `Rock`, `Mine`, `Southie`, `Watch`, `Dads`, `BlackOps`, `CSAUP`, `Other`

No repository cron schedule for this Edge Function was found. The only `.github/workflows` schedule found is `push-notifications.yml`, which runs `sendReminders.mjs`, not the Aggieland import.

## 2. Identity Matching

Severity: high

The importer maps official PAX rows to `members.id` by normalized PAX name only.

`normalizeImportPaxKey()` trims, lowercases, removes a leading `Dr.`, removes parenthetical content, and strips non-alphanumeric characters. There is no official external id, no baseline decision id, and no persisted manual identity map used by the Edge Function.

Duplicate names:

- `buildMemberImportLookup()` reads all `members` for the region.
- If a normalized key has exactly one row, it maps to that member.
- If multiple rows share the key but exactly one is `status === "active"`, it maps to the active member.
- Otherwise it records the key as ambiguous.
- AO rows with ambiguous names are added to `unresolvedPax` and skipped from attendee/Q assignment.

Renamed PAX:

- A rename is treated as a new normalized name unless the `members.pax_name` already matches the new official value.
- The importer can create a new member from Pax Master for the renamed name.
- There is no alias table or official identity map to connect old and new names.

Manual baseline audit decisions:

- No code path reads `member_stats_baselines`, baseline match CSVs, or a manual decision table.
- Manual identity resolutions from the baseline audit are not preserved in the nightly importer unless they were expressed as actual `members` rows or session edits.

Wrong-match risk:

- Yes. A unique normalized PAX-name match can still be semantically wrong when two identities differ only by punctuation, suffix, parenthetical text, `Dr.`, case, renamed names, or a collision where only one record is active.
- The active-member tiebreaker reduces blocking but can guess incorrectly for duplicate/renamed identities.

## 3. New FNG/Member Creation

Severity: high

The Edge Function creates members in `syncPaxMaster()` when a Pax Master row's normalized name is not already in `existingMemberKeys`.

Fields populated:

- `id`: `crypto.randomUUID()`
- `region_id`: `AGGIELAND_REGION_ID`
- `pax_name`: Pax Master `Name`
- `real_name`: Pax Master `Hospital Name`
- `home_ao`: Pax Master `First AO`
- `invited_by_id`: always `null`
- `first_post_date`: normalized Pax Master `FNG Date`
- `status`: `"active"`

Fields not handled by the Edge Function:

- Proud Papa is not resolved or stored.
- FNG naming status is not stored.
- Existing app-created unnamed FNGs with no PAX name cannot be matched by this importer.
- `real_name`/hospital name is only set at member creation. Existing members are reused and not updated.

Duplication risks:

- If The Q already created a member with a different or temporary PAX name before that person appears in Pax Master, the importer can create another member.
- If an FNG has no PAX name yet, app code can create a member with `paxName: null`; the importer's Pax Master matching cannot find that unnamed member later.
- Members created during baseline reconciliation are protected only if their normalized `pax_name` matches the Pax Master row.

## 4. Stats Writes

Severity: high

The Edge Function writes no stats tables directly. It does not write:

- `member_stats`
- `member_stats_baselines`
- `effective_member_stats`

It writes session facts:

- `sessions.region_id`
- `sessions.date`
- `sessions.ao_name`
- `sessions.q_ids`
- `sessions.q_id`
- `sessions.attendee_ids`
- `sessions.fngs`
- `sessions.notes`
- `sessions.workout`
- `sessions.source_planned_workout_id`
- `sessions.created_at`
- `sessions.created_by_user_id`
- `sessions.unresolved_pax`

It does not overwrite total posts/Qs with official cumulative values. It does not calculate deltas relative to a prior official snapshot. It imports missing official sessions by `(normalized AO, date)` and lets stats be derived from sessions elsewhere.

Important inconsistency:

- Browser-side `src/services/cloudData.js::insertSessionsBatch()` calls `rebuildMemberStatsForRegion(regionId)` after inserting sessions.
- Edge Function `insertSessionsBatch()` inserts sessions but does not call `rebuild_member_stats_for_region`.
- Therefore a successful hosted nightly import may leave `member_stats` stale unless the database has triggers/functions not present in the repo or a separate rebuild job exists.

Idempotency:

- Session idempotency is approximate via `loadExistingSessionKeys()` and `(normalized AO, date)` duplicate detection plus one hard-coded ignored key: `blackops|2026-05-11`.
- Member idempotency is normalized PAX-name based.
- `import_runs` receives a new row every run, including dry runs.
- There is no import snapshot natural key and no file hash/version.

## 5. Baseline Interaction

Severity: critical

Current behavior:

- `member_stats_baselines` exists and has been populated by the one-time baseline import.
- `effective_member_stats` exists as a table.
- The current nightly importer does not read, write, or reconcile either table.
- Runtime queries still read `member_stats`, not `effective_member_stats`.

Double-counting:

- Today, the baseline is invisible to runtime, so it does not double-count in the current UI.
- Once runtime switches to `effective_member_stats`, double-counting is likely unless post-cutover session stats exclude activity already represented in `member_stats_baselines`.
- If `effective_member_stats.total_posts = baseline_posts + all member_stats.total_posts`, then every already-imported historical session represented by the official baseline will be counted twice.

Desired first nightly import after baseline:

- Freeze baseline values as of a cutover date/snapshot.
- Import only official sessions after the cutover, or import official cumulative snapshots and compute `official_after_cutover_delta = current_official_total - baseline_official_total`.
- Combine as `effective_total = frozen_baseline + app/post-cutover official delta`, with duplicate prevention for app-created sessions that later arrive from the official source.

Exact gap:

- There is no cutover date column consulted by the importer.
- There is no source snapshot/version table.
- There is no code that populates `effective_member_stats.post_cutover_posts` or `post_cutover_qs`.
- There is no code that migrates runtime reads from `member_stats` to `effective_member_stats`.

## 6. App Attendance Interaction

Severity: high

The Q logs sessions via `src/services/appData.js::addSession()` and `updateSession()`.

For FNGs:

- `ensureFngMembersForSession()` creates a `members` row for FNGs without `memberId`.
- It sets `realName`, `paxName`, `status: "active"`, `firstPostDate: session.date`, and `invitedById`.
- The FNG member id is added to `attendeeIds`.

Stats rebuild:

- `insertSession()` rebuilds affected member stats in the background.
- `updateSessionInCloud()` captures old/new affected members and rebuilds stats.
- Browser `insertSessionsBatch()` rebuilds member stats for the whole region.
- Edge Function batch import does not rebuild stats in code.

Double-counting risk:

- The importer skips any official AO/date already present in `sessions`, regardless of attendees. This prevents a full duplicate session for the same AO/date.
- It does not merge official attendees into an app-created same-AO/date session in the Edge Function. The browser repair helper can merge but is manual/legacy.
- If the app-created session has a different AO name variant, a second official session can be inserted.
- If official baseline totals and app-created sessions cover the same date range, future effective totals can double-count unless a cutover/source boundary exists.

Q counts:

- Official AO row `Code` is uppercased and stripped to letters; any normalized code containing `Q` marks that member as a Q for the session.
- The first Q id is also written to legacy `q_id`.

Last post/activity:

- The importer does not update member `last_post` columns directly.
- Runtime last-post fields come from `member_stats.last_post_date` or session-derived helpers.
- Since Edge Function batch imports do not rebuild stats, last-post values may lag after hosted imports.

## 7. Read Paths

Severity: high

Important runtime paths still reading `member_stats` directly:

- `src/services/cloudData.js::loadMemberDashboardStats()` queries `member_stats`.
- `src/services/cloudData.js::loadRegionMemberStats()` queries `member_stats`.
- `src/services/cloudData.js::loadRegionData()` loads `memberStats` from `member_stats` and stores `memberStatsByMemberId`.
- `src/modules/stats.js::getMemberStats()` reads `state.memberStatsByMemberId` / `state.memberStats`, which are fed by `member_stats`.
- `src/views/dashboardView.js` loads dashboard stats through `loadMemberDashboardStats()`.
- `src/views/rosterView.js` renders posts/Qs/last from `getMemberStats()`.
- `src/views/memberDetailView.js` renders posts/Qs/first/last from `getMemberStats()`.
- `src/views/paxProfileView.js` reads `state.memberStats`.
- `src/utils/aoInsights/newPaxPipelineInsights.js` uses passed `memberStats`.
- `src/components/mainMenu.js` reads `state.memberStatsByMemberId` for favorite AO.

Paths already reading `effective_member_stats`:

- None found.

Paths using raw sessions instead of stats:

- AO attendance insights use sessions directly.
- Admin flag/member collision UI uses `getLastPostDate(member, state.sessions)`.
- Stale PAX view appears to call a local `getLastPostDate(member)` over state/session data.
- PAX profile recent activity uses `state.sessions`.

UI/analytics that will show inconsistent pre-baseline values:

- Dashboard "My Stats"
- Roster post/Q totals and last post
- Member detail post/Q totals and first/last post
- PAX profile metric cards where `state.memberStats` exists
- New PAX pipeline classifications that depend on post counts from `memberStats`
- Favorite AO in the main menu

## 8. Failure and Ambiguity Handling

Severity: medium

Unmatched official row:

- The row is not assigned to `attendeeIds` or `qIds`.
- It is stored in the session's `unresolvedPax` array.
- After insertion, `createUnresolvedPaxFlagsForSessions()` creates open `admin_flags` of type `unmatched_member_reference`.

Multiple candidates:

- If ambiguous by normalized name, the row is skipped and an unresolved entry is added with candidate member ids.
- Edge Function reason text is `ambiguous_member_match`; browser helper uses `ambiguous_member_reference` in one path.

Does the importer fail, skip, create, or guess?

- Pax Master member creation creates missing members by normalized name.
- AO attendance parsing skips unresolved/ambiguous rows and continues.
- Duplicate active-member tiebreaking can guess by choosing the only active row.

Audit log/report:

- Each run inserts an `import_runs` row with summary or error.
- Unresolved rows become `admin_flags`.
- There is no durable per-source-row reconciliation table.

Can one bad row block the whole import?

- CSV parse failure, fetch failure, Supabase insert failure, or missing required env vars can fail the whole request.
- Unmatched PAX rows do not block the import.

Can partial writes occur?

- Yes. The Edge Function performs separate operations: possible member inserts, session batch insert, admin flag insert, import run insert. There is no explicit database transaction wrapping the full run.
- If session insertion succeeds and flag creation or import-run insertion fails, mixed state can remain.
- If Pax Master member creation succeeds and a later AO CSV fetch fails, new members can remain without new sessions.

## 9. Idempotency and Transaction Safety

Severity: high

Current natural keys:

- Members: normalized `pax_name` within the in-memory lookup for one run; not enforced as a database unique constraint in inspected code.
- Sessions: normalized resolved `ao_name` + `date`; not enforced as a database unique constraint in inspected code.
- Import runs: no natural key; always inserted.

There is no import batch/source snapshot table for the nightly import. `import_runs` stores run summaries but not source file hashes, sheet revision ids, row-level source ids, or an idempotency key.

The same source can be applied twice mostly safely for sessions if the first run inserted the same AO/date sessions and the second run sees them. However:

- Members created in the first run can survive even if later steps fail.
- Race conditions between two concurrent runs can insert duplicate sessions because duplicate detection happens before insert.
- AO/date is too coarse for legitimate multiple sessions at the same AO/date unless AO names differ or session times are added.
- Session changes in the official source after a session already exists are ignored by the Edge Function rather than reconciled.

Writes are not transactional across all tables. No rollback or verification step exists in the Edge Function.

## 10. Recommended Migration Plan

Severity: critical

Phase 0: Freeze semantics and document the cutover

- Define the baseline as immutable official cumulative totals from the completed Aggieland official totals import.
- Record a single cutover date/snapshot timestamp and source label.
- Do not mutate `member_stats_baselines` after freeze except by explicit corrective migration.

Phase 1: Persist identity mapping

- Create an official identity mapping table keyed by `region_id`, official source identity/name, normalized key, and `member_id`.
- Seed it from the baseline audit/manual decisions.
- Store aliases/renames separately so old and new official names resolve to the same member when intended.
- Mark ambiguous names as blocked until manually resolved.

Phase 2: Add source snapshot/version tracking

- Add an import snapshot table for nightly official data with source name, fetched-at time, sheet id/gid, content hash or revision, mode, status, and row counts.
- Add row-level/import-event records or at least source session keys linked to snapshot id.
- Make snapshot application idempotent by database constraints, not just preflight in memory.

Phase 3: Make importer baseline-aware

- Decide whether nightly official data is session fact import or cumulative-total import. Do not mix silently.
- For cumulative official totals, compute deltas from the frozen baseline: `current_official_total - baseline_total`.
- For official sessions, import only sessions after the cutover date or explicitly tag pre-cutover official sessions as excluded from effective totals.
- Add a source/cutover boundary to prevent official + app double-counting.

Phase 4: Deduplicate app and official sessions

- Add durable source keys to `sessions` or a join table, including source, AO, date, optional start time, official row ids/hash, and snapshot id.
- Define merge rules for existing The Q sessions that match official sessions after cutover.
- Preserve app-entered richer data such as backblast/workout/weather while reconciling attendees/Qs.

Phase 5: Rebuild effective stats

- Implement a database function or server-side job that writes `effective_member_stats`.
- Inputs should be frozen baseline + post-cutover official/app session facts, with a clear exclusion for pre-cutover sessions already represented in baseline.
- Include `posts_30_days`, `posts_90_days`, `qs_30_days`, `qs_90_days`, `favorite_ao`, `first_post_date`, `last_post_date`, `last_q_date`, and `fngs_eh` semantics.

Phase 6: Move read paths behind one stats API

- Change `loadMemberDashboardStats()` and `loadRegionMemberStats()` to read `effective_member_stats`.
- Keep a fallback to `member_stats` only during rollout and clearly label it.
- Update `state.memberStats` shape only once at the service boundary so views do not need churn.

Phase 7: Rollout and rollback

- Run nightly in dry-run/reconcile-only mode first.
- Produce reconciliation reports: new members, duplicate/renamed PAX, unresolved official rows, existing session matches, skipped pre-cutover rows, expected effective stat deltas.
- Compare current `member_stats`, baseline totals, and candidate `effective_member_stats` for high-risk PAX.
- Roll out read-path switch behind a config flag.
- Roll back by switching reads back to `member_stats`; do not delete frozen baselines.

Phase 8: Tests

- Unit-test normalization and identity matching, including duplicate active/inactive names, parenthetical suffixes, `Dr.` prefixes, punctuation, and renamed PAX.
- Unit-test cutover math: baseline only, post-cutover app session only, post-cutover official session only, and overlapping official/app session.
- Integration-test importer idempotency with repeated snapshots and partial-failure retry.
- Test FNG deduplication from unnamed app-created FNG to later official named PAX.
- Test unresolved/ambiguous rows do not block safe rows and create reconciliation output.

## Assumptions and Unknowns

- The hosted schedule for `nightly-aggieland-import` may exist outside this repo; it was not found in repository files.
- The definitions of `member_stats`, `rebuild_member_stats_for_member`, and `rebuild_member_stats_for_region` were not present in the inspected migrations. They may exist in the remote database from older migrations not committed here.
- No live database reads were performed, so this audit cannot verify remote triggers, constraints, RLS beyond committed migrations, or existing cron jobs.
- The one-time baseline source is assumed to be the completed official totals import described in the request, not the current nightly AO-log tabs.
- The Edge Function's JWT behavior may differ in deployment; code shows `verify_jwt = true` but the browser caller does not set auth headers.

## Recommended Next Implementation Step

Severity: critical

Create the identity/source foundation before changing runtime behavior: add a migration for official identity mappings and source snapshots, seed the mapping from the completed baseline audit decisions, and write a dry-run reconciliation job that computes candidate post-cutover deltas without touching runtime stats. Only after that should `effective_member_stats` be populated and read paths move from `member_stats`.
