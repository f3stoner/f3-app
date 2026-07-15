# Supabase Disk I/O And Runtime Query Audit

Date: 2026-07-15  
Scope: read-only repository inspection of runtime Supabase reads/writes, app-load paths, historical BAND backblast access, rebuild/import jobs, schema/index evidence, and likely causes of Supabase disk I/O warnings. No runtime code, migrations, schema, tests, configuration, or commits were changed.

## A. Executive Summary

The repository does not prove sustained database resource pressure by itself, and the supplied EXPLAIN shows the representative `session_backblast_links` query used shared-buffer hits rather than physical reads. That query can still be an app-load latency contributor when enabled because it scans and sorts reconciliation rows and joins through `sessions`, but the checked-in source currently comments out the startup caller.

The strongest confirmed runtime issues are broader than BAND reconciliation:

- App startup blocks on a large parallel `loadRegionData()` call that fetches full rows or large text/JSON fields from many tables, including recent `sessions.notes`, `sessions.workout`, `sessions.backblast_text`, weather snapshots, and announcement snapshots.
- Session save/edit/delete paths can rebuild member stats more than once for the same affected members. `insertSession()` and `updateSessionInCloud()` already fire `rebuildMemberStatsForMembers()`, while `sessionView` starts another rebuild-and-readback pass after save.
- The member-stat rebuild SQL repeatedly scans `sessions`, evaluates JSONB/array membership predicates, expands `fngs` JSON, and deletes/reinserts `member_stats`. Per-member rebuilds are scoped, but concurrent duplicate rebuilds after saves are unnecessary write and CPU/IO work.
- Admin/import flows can intentionally do heavy work: backblast review loads all `session_backblast_links` and all review decisions, historical thang extraction loads all linked cleaned BAND content, and bulk import inserts sessions then triggers region-wide rebuilds in the browser service path.

The proposed materialization approach, copying confirmed historical BAND backblast text into `sessions.notes` only when empty and removing reconciliation reads from normal runtime, is directionally good for eliminating normal user dependence on `session_backblast_links`. The main compatibility risk is semantic: `sessions.notes` is already displayed as workout/session notes, copied into plans, included in generated backblasts, and searched in session history. Materialized historical backblast text in `notes` would become visible in those flows unless formatting/provenance is deliberate.

## B. App-Load Database Call Map

### Login / Boot

Source path: `src/index.js:421-559`

1. `getCurrentSession()` runs first and retries once after 500 ms if no session is found (`src/index.js:437-443`). Blocking.
2. `ensureMyProfile(session.user.id, session)` loads or creates profile/auth data (`src/index.js:452-454`). Blocking.
3. `loadAllRegions()` loads public/available regions (`src/index.js:466-470`). Blocking.
4. `Promise.all([loadActiveRegionData(), loadProfileAoPermissions(), loadProfileRegionPositions()])` runs (`src/index.js:472-480`). Blocking before first render.
5. `logAppEvent(APP_OPENED)` writes one telemetry row (`src/index.js:490-497`, `src/services/appEvents.js:7-34`). Non-awaited write, but still database work.
6. First render runs (`src/index.js:514-516`).
7. Notification settings load after render (`src/index.js:520-540`). Background.

### Initial Region Data

Source path: `src/services/cloudData.js:376-556`

`loadRegionData(regionId)` starts a broad `Promise.all`:

- `regions`: selected columns (`src/services/cloudData.js:393-405`).
- `members`: all columns, paginated by 1000 (`src/services/cloudData.js:162-185`, `407`).
- `sessions`: last 180 days with large fields (`notes`, `workout`, `backblast_text`, `weather_snapshot`, `announcement_snapshot`) (`src/services/cloudData.js:51-91`, `409`).
- `planned_workouts`: `select("*")` (`src/services/cloudData.js:411-417`).
- `aos`: `select("*")` (`src/services/cloudData.js:419-425`).
- `sites`: `select("*")` (`src/services/cloudData.js:427-434`).
- `q_slots`: all columns, all region rows paginated (`src/services/cloudData.js:225-249`, `436`).
- `admin_flags`, saved planner sections, announcements, Q sources, member stats, AO leadership contacts, profile region positions (`src/services/cloudData.js:438-460`).

After the first `Promise.all`, `loadRegionData()` separately loads `member_inviters` for all members in batches of 500 (`src/services/cloudData.js:473-478`, `188-223`). This is blocking before first render.

### Dashboard Open

Normal dashboard rendering is mostly in-memory after app load. It uses loaded state for current sessions, planned workouts, Q slots, announcements, and member stats.

Two dashboard-triggered database paths matter:

- Debug region switcher reloads the entire region via `loadRegionData(activeRegionId)` (`src/views/dashboardView.js:88-124`). Blocking for that action.
- Clicking user stat tiles can load full member history. `loadMemberSessions()` fetches every session in the region with `select("*")` and filters client-side for attendee/Q membership (`src/views/dashboardView.js:1428-1461`, `src/services/cloudData.js:298-331`). This is on-demand, not every dashboard load.

### Session Data Loads

- Initial app load gets recent sessions only (`loadRecentSessions`, 180 days).
- Session history "load older" calls `loadOlderSessionsPage()` with many large fields but a limit of 100 (`src/services/cloudData.js:94-133`, `src/views/sessionHistoryView.js:464`).
- Session detail loads visitors lazily if missing (`src/views/sessionDetailView.js:41-50`, `src/services/sessionVisitorData.js:3-23`) and always attempts one historical backblast link lookup (`src/views/sessionDetailView.js:621-635`).

### Historical Backblast Hydration

`hydrateHistoricalBackblastLinks(regionId)` would run the representative region-wide join/sort query through `loadBackblastLinks(regionId)` (`src/index.js:321-367`, `src/services/cloudData.js:1709-1728`). In checked-in source, the startup invocation is commented out at `src/index.js:518`. If deployed code has it enabled, it runs after first render and re-renders dashboard/session history/session detail.

## C. Runtime Use Of `session_backblast_links` And BAND Data

### Normal Runtime

1. `getBackblastLinkBySessionId(sessionId)`  
   File/function: `src/services/cloudData.js:1695-1707`  
   Query: `session_backblast_links.select("*").eq("session_id", sessionId).order("confidence_score").order("created_at").limit(1)`  
   Caller: `renderSessionDetail()` at `src/views/sessionDetailView.js:621-635`  
   Frequency: every session detail render.  
   Impact: loads full row, including large `raw_content`, `cleaned_content`, and `parsed_backblast`, even though the UI only needs method/confidence and the displayed text. This can duplicate on re-render because there is no per-session cache in the detail view.

2. `searchHistoricalBackblasts(searchTerm)`  
   File/function: `src/services/cloudData.js:1730-1748`  
   Query: `session_backblast_links.select("session_id").ilike("cleaned_content", "%term%").limit(100)`  
   Caller: `src/views/sessionHistoryView.js:385`  
   Frequency: only when a session-history search term is at least 2 characters.  
   Impact: substring search on large text likely cannot use a plain btree index; live trigram/full-text index status cannot be proven from this repo.

3. `loadBackblastLinks(regionId)`  
   File/function: `src/services/cloudData.js:1709-1728`  
   Query: selects link metadata, inner joins `sessions`, filters `sessions.region_id`, orders by `confidence_score` and `created_at`.  
   Caller: `hydrateHistoricalBackblastLinks()` in `src/index.js:321-367`, but the source invocation is commented out at `src/index.js:518`.  
   Frequency: not active in checked-in source; if enabled, once per app boot after first render.  
   Impact: matches the representative query shape. It may scan all link rows and all sessions, sort links, then re-render. At the supplied scale, 1.045 s with shared hits is slow app work but not direct evidence of physical disk I/O.

### Admin / Import / Review Tools

4. `loadSessionBackblastLinks()`  
   File/function: `src/services/cloudData.js:2166-2188`  
   Caller: `renderBackblastReview()` at `src/views/backblastReviewView.js:54-65`  
   Frequency: each Backblast Review view open.  
   Impact: loads all link rows across all regions, paginated, with no region filter.

5. `loadBackblastReviewDecisions()`  
   File/function: `src/services/cloudData.js:2216-2238`  
   Caller: `renderBackblastReview()` at `src/views/backblastReviewView.js:54-65`  
   Frequency: each Backblast Review view open.  
   Impact: loads all decisions across all regions, paginated.

6. `insertSessionBackblastLink(row)` and `insertBackblastReviewDecision(row)`  
   File/functions: `src/services/cloudData.js:2190-2214`  
   Callers: manual link/create actions in `src/views/backblastReviewView.js:1550-1583`  
   Frequency: manual admin actions.  
   Impact: writes large raw/cleaned/parsed backblast payloads into `session_backblast_links`.

7. `loadHistoricalBackblastsForThangExtraction(regionId)`  
   File/function: `src/services/cloudData.js:2579-2616`  
   Caller: `generateHistoricalThangCandidatesForRegion()` at `src/services/thangExtraction.js:9-23`, triggered by `src/views/thangReviewView.js:83-99`  
   Frequency: manual admin action.  
   Impact: loads all linked `cleaned_content` plus joined session fields for a region, then upserts extracted candidates. This is intentionally heavy and should stay out of normal app paths.

8. Scripts  
   Files: `scripts/insertBackblastLinks.js`, `scripts/createSafeSessionsFromUnmatchedBackblasts.js`, `scripts/matchBackblastsToSessions.js`, `scripts/parseBandBackblasts.js`  
   Frequency: local/import tooling, not browser runtime.  
   Impact: can bulk read/write reconciliation data if run manually.

## D. Rebuild / Import / Cron Audit

### Member Stats Rebuilds

Confirmed duplicated rebuild path:

- `insertSession()` writes the session, logs telemetry, then starts `rebuildMemberStatsForMembers(regionId, affectedIds)` in the background (`src/services/cloudData.js:859-923`).
- `updateSessionInCloud()` first reads the old session with `getSessionById()`, updates the row, then starts `rebuildMemberStatsForMembers()` for old and new affected IDs (`src/services/cloudData.js:925-976`).
- `deleteSessionFromCloud()` first reads old session, deletes, then starts rebuilds (`src/services/cloudData.js:1169-1191`).
- `sessionView` save handling independently calls `refreshAffectedMemberStatsInBackground()`, which calls `rebuildMemberStatsForMembers()` again and then reads each member's `member_stats` (`src/views/sessionView.js:1280-1318`, `1475-1487`).

RPC implementation:

- `rebuild_member_stats_for_member(target_region_id, target_member_id)` deletes one `member_stats` row and reinserts from a query over `members`, `sessions`, `member_stats_baselines`, and `member_inviters` (`supabase/migrations/20260714011119_fix_per_member_proud_papa_stats.sql:1-241`).
- The join predicates repeatedly check `attendee_ids` JSONB membership, `q_ids` arrays, `q_id`, and expand `fngs` JSON arrays (`supabase/migrations/20260714011119_fix_per_member_proud_papa_stats.sql:36-47`, `67-80`, `90-103`, `206-227`).
- `rebuild_member_stats_for_region(target_region_id)` deletes all stats for a region and reinserts for all members (`supabase/migrations/20260713210107_fix_multi_proud_papa_member_stats.sql:228-433`).

Runtime impact: per-member rebuilds are preferable to region rebuilds, but duplicate calls after a save multiply the same scan/delete/insert work. For high-attendance sessions, the number of affected members can be large, so `Promise.allSettled()` can launch many concurrent RPCs (`src/services/cloudData.js:1812-1833`).

### Imports

- Browser service `insertSessionsBatch(regionId, sessions)` bulk inserts sessions and then awaits full region stats rebuild (`src/services/cloudData.js:1100-1145`). This is heavy and blocking for that import path.
- Edge Function `nightly-aggieland-import` loads all members, all existing session keys, fetches many CSVs, optionally inserts all new members one at a time, inserts new sessions in one batch, creates flags, and logs an import run (`supabase/functions/nightly-aggieland-import/index.ts:222-310`, `312-375`, `490-620`). This source function does not call the member-stat rebuild RPC in the inspected lines; browser service imports do.
- `runAggielandImport()` exposes a manual/admin HTTP caller (`src/services/cloudData.js:1667-1693`).

Cron evidence:

- `supabase/config.toml` registers `send-reminders`, `get-ao-weather`, and `nightly-aggieland-import`, but source-controlled Supabase cron entries were not found.
- Prior repository audits also note no source-controlled schedule for `nightly-aggieland-import`; hosted Supabase dashboard schedules cannot be verified from repository inspection alone.
- `send-reminders` reads notification settings, Q slots, AOs, and profiles, inserts `notification_log` rows to claim idempotently, updates sent/failed rows, may update dead notification settings, and inserts a `function_runs` row (`supabase/functions/send-reminders/index.ts:158-286`, `304-343`). This is normal scheduled write work, not related to BAND data.

### Telemetry Writes

`logAppEvent()` calls `supabase.auth.getUser()` and inserts into `app_events` (`src/services/appEvents.js:7-34`). It is used on app open, session logged, planned workout create/update, Q actions, backblast generated, and failure paths. Individual writes are small, but app-open telemetry adds a write on every authenticated boot.

### Visitor Replacement

`replaceSessionVisitors()` deletes all visitors for a session and reinserts the submitted list (`src/services/sessionVisitorData.js:84-113`). This runs after both add and update session (`src/services/appData.js:233-237`, `262-266`). It is simple and scoped, but it is a delete/recreate pattern even when visitors are unchanged.

## E. Index And Query-Shape Review

Repository migrations visible in this checkout add these relevant indexes:

- `sessions_ao_id_idx` and `sessions_region_ao_date_idx` (`supabase/migrations/20260707135802_add_ao_id_to_sessions_and_planned_workouts_v2.sql:8-19`).
- `sessions_site_id_idx` and `sessions_region_site_date_idx` (`supabase/migrations/20260713033532_add_sites_and_q_slot_occurrence_fields.sql:119-127`).
- `idx_sessions_source_q_slot_id` (`supabase/migrations/20260708125936_add_source_q_slot_id_to_workouts_and_sessions.sql:4-11`).
- `q_slots_region_date_start_time_idx` and `q_slots_region_ao_date_start_time_idx` (`supabase/migrations/20260713033532_add_sites_and_q_slot_occurrence_fields.sql:105-112`).
- `member_stats_baselines` indexes by member, region, and import batch (`supabase/migrations/20260709193626_create_member_stats_baselines_v2.sql` from search results).
- `effective_member_stats` indexes by member and region (`supabase/migrations/20260709195750_create_effective_member_stats.sql` from search results), but runtime still reads `member_stats`.

The original migrations defining `sessions`, `member_stats`, `session_backblast_links`, and their primary/unique/foreign-key indexes are not present in this checkout. Therefore this audit cannot prove whether these live indexes exist:

- `session_backblast_links.session_id`
- `session_backblast_links.band_post_key`
- `session_backblast_links(region_id, band_post_key)` unique/index for review upserts
- ordering support for `confidence_score, created_at`
- foreign-key indexes for all join/update paths
- text search/trigram support on `cleaned_content`

Index recommendations should be based on live EXPLAINs, not column presence alone:

- For `getBackblastLinkBySessionId()`, an index on `session_id` plus descending order columns could help only if many links exist per session. If most sessions have 0-1 links, `session_id` alone is likely enough.
- For `loadBackblastLinks(regionId)`, adding an ordering index on `confidence_score, created_at` is unlikely to help much if the query must first find region rows through `sessions`. A better query shape is to store/filter `session_backblast_links.region_id` directly if that column exists and is reliable, then select only needed columns.
- For `searchHistoricalBackblasts()`, a btree index will not support `%term%` ILIKE. Use live query volume to decide whether trigram/full-text indexing is justified; it has write/storage cost and is only useful if search remains a runtime feature.
- For `loadRegionData()`, reducing selected columns and deferring large fields will probably beat adding indexes because many startup reads are broad region fetches rather than selective lookups.

## F. Duplicate-Query And Subscription Risks

Confirmed:

- Session save/edit can trigger duplicate member-stat rebuild RPCs for the same members (`src/services/cloudData.js:915-920`, `968-973`; `src/views/sessionView.js:1483-1487`).
- `sessionDetailView` calls `getBackblastLinkBySessionId()` every render without caching (`src/views/sessionDetailView.js:621-635`). Visitor lazy loading can cause a re-render (`src/views/sessionDetailView.js:41-47`), which can repeat the backblast link request.
- `loadMemberSessions()` reads all region sessions with `select("*")` and client-filters for one member (`src/services/cloudData.js:298-331`). Dashboard caches by `{region, member, mode}`, but separate modes (`attended`, `q`, `all`) can each fetch all sessions (`src/views/dashboardView.js:1428-1461`).
- `loadMemberSessionByDate()` reads all sessions for a region/date and filters client-side for member membership (`src/services/cloudData.js:334-356`). Dashboard first/last post/Q tile clicks can repeat similar reads (`src/views/dashboardView.js:1537-1599`).

Likely but not fully provable:

- Realtime Q-slot subscription can cause duplicate Q-slot reloads in the Q signup view if callbacks fire in bursts. The managed channel wrapper unsubscribes existing same-key channels first (`src/services/realtime.js:5-31`), which reduces duplicate subscription risk. The expensive part is the callback behavior in `qSignupView`, not the subscription count.

Harmless/normal:

- PostgREST requests that return no rows or use `.maybeSingle()` are not inherently concerning.
- Sequential scans on 3,744 and 4,278-row tables with all shared hits are not direct evidence of disk I/O. They are latency and CPU/shared-buffer work, but not physical reads in the supplied EXPLAIN.

## G. Evaluation Of Copying Historical Backblasts Into `sessions.notes`

### Callers To Stop Reading `session_backblast_links`

Normal runtime callers that should be removed or disabled after materialization:

- `renderSessionDetail()` should stop calling `getBackblastLinkBySessionId()` (`src/views/sessionDetailView.js:621-635`).
- `sessionHistoryView` should stop calling `searchHistoricalBackblasts()` unless search over `sessions.notes` or `sessions.backblast_text` replaces it (`src/views/sessionHistoryView.js:385`).
- `hydrateHistoricalBackblastLinks()` and `loadBackblastLinks()` should remain unused or be removed from startup paths (`src/index.js:321-367`, `src/services/cloudData.js:1709-1728`).

Admin/import callers can remain if reconciliation/audit tooling is still needed:

- `backblastReviewView`, thang extraction, and scripts can continue reading reconciliation tables behind admin permissions.

### Compatibility Risks

`sessions.notes` is already used as runtime session/workout text:

- Session detail shows `notes` as the workout text when no structured workout exists and as a separate Notes section when a structured workout exists (`src/views/sessionDetailView.js:102-105`, `421-423`, `472-615`).
- Generated backblasts include session notes (`src/modules/backblast.js:221`, `259-265`).
- Copy-to-plan uses `session.notes` when no structured workout exists (`src/views/sessionDetailView.js:510-524`).
- Session history search includes `session.notes` (`src/views/sessionHistoryView.js:240-243`).
- Session form edits `notes` as a normal freeform textarea (`src/views/sessionView.js:1399-1403`, `1556-1559`).

Therefore, copying BAND text to `sessions.notes` will make historical text visible and searchable as ordinary session notes. That may be desired, but it is not a pure hidden materialization. If preservation of manual/native notes matters, the stated rule "only when notes is empty" is important.

### Source / Provenance Fields

Existing fields that can carry provenance without relying on reconciliation reads:

- `sessions.backblast_text` stores app backblast text and is already displayed/generated around backblast flows (`src/services/cloudData.js:886`, `951`, `612`; `src/views/backblastView.js`).
- `sessions.attendance_review_status` and `attendance_review_notes` already mark review state (`src/services/cloudData.js:957-958`, `2297-2341`).
- `session_backblast_links` retains `band_post_key`, `link_method`, `confidence_score`, `backblast_date`, AO/Q names, author, raw/cleaned content, and parsed payload for audit (`src/views/backblastReviewView.js:1557-1573`).
- `backblast_review_decisions` records manual decision type, session id, user id, and notes (`src/views/backblastReviewView.js:1575-1582`).

### Multiple Linked BAND Posts / Ambiguity

The code assumes multiple links can exist for a session:

- `getBackblastLinkBySessionId()` orders by confidence and created time and limits to 1 (`src/services/cloudData.js:1695-1707`).
- `hydrateHistoricalBackblastLinks()` collapses links by session id, keeping the highest confidence (`src/index.js:326-350`).

Ambiguity and conflicts are represented outside normal session rows:

- Review report JSON has `ambiguousMatches`, `unmatched`, and needs-review states consumed by `backblastReviewView` (`src/views/backblastReviewView.js:94-117`).
- `backblast_review_decisions` stores `ignored`, `needs_review`, and `linked` decisions (`src/views/backblastReviewView.js:78-92`, `1575-1582`).

Materialization should only copy one confirmed link per session, likely the same highest-confidence/manual-linked candidate, and should log/report skipped conflicts where multiple confirmed links exist.

## H. Ranked Findings

### 1. Duplicate Member-Stat Rebuilds After Session Save

Severity: High  
Confidence: High  
Files/functions: `src/services/cloudData.js` `insertSession()`, `updateSessionInCloud()`, `rebuildMemberStatsForMembers()`; `src/views/sessionView.js` `refreshAffectedMemberStatsInBackground()`  
SQL/RPC: `rebuild_member_stats_for_member`  
Impact: A single session save can launch two rebuild batches for the same affected members. Each RPC deletes/reinserts a stat row and scans sessions with JSONB/array predicates.  
Evidence: Service layer starts rebuilds at `src/services/cloudData.js:915-920` and `968-973`; view starts another at `src/views/sessionView.js:1483-1487`.  
Safest remediation: centralize rebuild responsibility. Prefer one post-save path that rebuilds once, then read back changed stats if UI freshness is needed.  
Timing: Before materializing BAND backblasts; this is unrelated and higher impact.

### 2. App Startup Blocks On Broad, Heavy Region Fetch

Severity: High  
Confidence: High  
Files/functions: `src/index.js` `bootApp()`, `loadActiveRegionData()`; `src/services/cloudData.js` `loadRegionData()`, `loadRecentSessions()`  
Impact: First render waits for many table reads, several `select("*")`, all members, all Q slots, member stats, and recent sessions with large text/JSON fields. Slow app loads can result even with low CPU/memory dashboards.  
Evidence: Blocking `Promise.all` at `src/index.js:472-480`; large `loadRegionData` fan-out at `src/services/cloudData.js:376-460`; recent sessions include `notes`, `workout`, `backblast_text`, weather, announcements at `src/services/cloudData.js:57-87`.  
Safest remediation: split boot into critical and deferred data. Load dashboard-critical narrow columns first; lazy-load large session text/workout/backblast fields on detail/history/search.  
Timing: Before or alongside BAND materialization; materialization helps only one slice of startup unless the disabled hydration is re-enabled.

### 3. Session Detail Repeatedly Fetches Full Historical Backblast Link Rows

Severity: Medium  
Confidence: High  
Files/functions: `src/views/sessionDetailView.js` `renderSessionDetail()`; `src/services/cloudData.js` `getBackblastLinkBySessionId()`  
Impact: Every render can query `session_backblast_links` with `select("*")`, loading large BAND content. Visitor load re-render can repeat it.  
Evidence: Detail call at `src/views/sessionDetailView.js:621-635`; service query at `src/services/cloudData.js:1695-1707`.  
Safest remediation: after materialization, remove normal detail lookup. Before materialization, select only needed fields and cache by session id.  
Timing: Address during materialization.

### 4. Historical Backblast Region Hydration Query Exists But Is Commented Out

Severity: Medium if enabled; Low in checked-in source  
Confidence: High for source state; Medium for deployed state  
Files/functions: `src/index.js` `hydrateHistoricalBackblastLinks()`; `src/services/cloudData.js` `loadBackblastLinks()`  
Impact: If enabled, this is the supplied representative query shape: scan/sort links, join sessions for region, then re-render.  
Evidence: Function at `src/index.js:321-367`; invocation commented at `src/index.js:518`; query at `src/services/cloudData.js:1709-1728`.  
Safest remediation: keep disabled and remove from normal runtime after materialization. If needed for admin, filter directly by link `region_id` and select only narrow columns.  
Timing: Address during materialization.

### 5. Member History Loads All Region Sessions And Filters Client-Side

Severity: Medium  
Confidence: High  
Files/functions: `src/services/cloudData.js` `loadMemberSessions()`, `loadMemberSessionByDate()`; `src/views/dashboardView.js` stat tile handlers  
Impact: On-demand dashboard clicks can fetch all sessions with all columns for one member. This is not startup, but it is a slow user flow and unnecessary database/network work.  
Evidence: `select("*").eq("region_id", regionId)` in `loadMemberSessions()` at `src/services/cloudData.js:306-331`; caller at `src/views/dashboardView.js:1446-1456`.  
Safest remediation: add server-side RPC or query shape for member session membership, returning narrow columns. Consider normalized attendance rows longer term.  
Timing: After duplicate rebuild and startup narrowing; independent of BAND materialization.

### 6. Backblast Review Loads All Link And Decision Rows Across Regions

Severity: Medium for admins; Low for normal users  
Confidence: High  
Files/functions: `src/views/backblastReviewView.js` `renderBackblastReview()`; `src/services/cloudData.js` `loadSessionBackblastLinks()`, `loadBackblastReviewDecisions()`  
Impact: Admin view loads all reconciliation link keys and all decisions, paginated but unfiltered by region.  
Evidence: `Promise.all` at `src/views/backblastReviewView.js:54-65`; services at `src/services/cloudData.js:2166-2238`.  
Safest remediation: pass region id and filter by region; keep this behind admin/import permissions.  
Timing: After materialization unless admins use this frequently.

### 7. Historical Thang Extraction Loads All Cleaned Historical BAND Content

Severity: Medium for admin action; Low for normal users  
Confidence: High  
Files/functions: `src/services/thangExtraction.js` `generateHistoricalThangCandidatesForRegion()`; `src/services/cloudData.js` `loadHistoricalBackblastsForThangExtraction()`  
Impact: Manual extraction reads all `cleaned_content` and joined sessions for a region, then upserts candidates. Heavy by design.  
Evidence: Trigger at `src/views/thangReviewView.js:83-99`; query at `src/services/cloudData.js:2579-2616`.  
Safest remediation: batch extraction, record processed link ids, and make it incremental.  
Timing: After normal runtime cleanup.

### 8. Bulk Visitor Replacement Deletes And Reinserts Rows On Every Session Save

Severity: Low  
Confidence: High  
Files/functions: `src/services/sessionVisitorData.js` `replaceSessionVisitors()`; `src/services/appData.js` `addSession()`, `updateSession()`  
Impact: Scoped delete/reinsert even when visitor list is unchanged. Usually small, but unnecessary writes on session edits.  
Evidence: delete then insert at `src/services/sessionVisitorData.js:84-113`; called after add/update at `src/services/appData.js:233-237`, `262-266`.  
Safest remediation: compare existing/new visitor rows or skip replacement when visitor list is empty and unchanged.  
Timing: After higher-impact rebuild/startup work.

### 9. `sessions.notes` Materialization Has User-Visible Semantics

Severity: Medium  
Confidence: High  
Files/functions: `src/views/sessionDetailView.js`, `src/modules/backblast.js`, `src/views/sessionHistoryView.js`, `src/views/sessionView.js`  
Impact: Historical BAND text copied to `notes` will be displayed, searched, copied to plans, and included in generated backblasts as ordinary notes.  
Evidence: notes display/use at `src/views/sessionDetailView.js:102-105`, `421-423`, `510-524`; generated backblast at `src/modules/backblast.js:259-265`; search at `src/views/sessionHistoryView.js:240-243`.  
Safest remediation: only populate empty notes, prefix/format clearly, preserve audit link tables, and produce a dry-run conflict report. Consider `backblast_text` if product semantics prefer "posted backblast" over "workout notes."  
Timing: Core consideration before materialization.

## I. Recommended Order Of Operations

1. Stop duplicate member-stat rebuilds after session save. Pick one rebuild owner and one UI readback path.
2. Narrow app startup reads. Split `loadRegionData()` into critical dashboard data and deferred large fields.
3. Confirm deployed bundle/source parity for `hydrateHistoricalBackblastLinks()`. If any deployed build runs it, disable it before materialization.
4. Implement historical backblast materialization as a dry-run first: one confirmed link per session, only empty `sessions.notes`, no overwrite, report multiple/conflicting links.
5. Remove normal runtime reads of `session_backblast_links`: session detail historical card, session-history historical search, and any startup hydration.
6. Replace member-history dashboard queries with server-side/member-scoped query shapes or RPCs.
7. Region-filter and batch admin reconciliation tools.
8. Make thang extraction incremental.
9. Revisit visitor replacement and telemetry volume if live metrics still show write bursts.

## J. Additional Live Supabase Evidence Needed

Repository inspection cannot prove these items:

- Live indexes and constraints for `session_backblast_links`, `sessions`, `member_stats`, `session_visitors`, `app_events`, and review tables.
- Whether deployed production code matches checked-in `src/index.js` with `hydrateHistoricalBackblastLinks()` commented out.
- Actual Supabase Query Performance / pg_stat_statements rankings for slowest and most frequent queries.
- Query plans with `EXPLAIN (ANALYZE, BUFFERS)` for:
  - `loadRegionData:sessions`
  - `loadRegionData:members`
  - `loadRegionData:qSlots`
  - `loadRegionData:memberStats`
  - `getBackblastLinkBySessionId`
  - `searchHistoricalBackblasts`
  - `rebuild_member_stats_for_member`
  - `rebuild_member_stats_for_region`
- WAL/write volume and row counts for `member_stats`, `app_events`, `notification_log`, `session_visitors`, and import tables during warning windows.
- Hosted Supabase schedules, database cron jobs, Edge Function schedules, and external schedulers not committed to the repo.
- Whether Supabase disk I/O warnings line up with user session-save bursts, admin imports, reminder sends, or a background job.
- Table sizes, TOAST table sizes, bloat, cache hit ratios, and autovacuum activity for large text/JSON tables.
- Number of sessions with multiple confirmed BAND links and number of empty `sessions.notes` rows eligible for materialization.
