# Supabase Performance Implementation Plan

This plan is based on the completed audit in `audit/performance/supabase-disk-io-and-runtime-query-audit.md` and a fresh read-only reinspection of the current code. It is intentionally implementation-focused, but this document does not make runtime, schema, migration, test, or config changes.

## A. Confirmed Findings

### A1. Duplicate member-stat rebuilds after session saves

Confirmed.

- `insertSession()`, `updateSessionInCloud()`, and `deleteSessionFromCloud()` each compute affected member IDs and fire `rebuildMemberStatsForMembers()` from the data layer.
- The session save view also computes affected member IDs and calls `refreshAffectedMemberStatsInBackground()`, which calls `rebuildMemberStatsForMembers()` again before reloading dashboard stats.
- Result: normal session create/update paths can run the same per-member rebuild twice. Updates are especially expensive because the service layer already has the old session and new session needed to compute the correct affected set.

### A2. Startup loads too much data before first render

Confirmed.

`bootApp()` waits on `loadActiveRegionData()`, which waits on `loadRegionData()`. `loadRegionData()` currently blocks first render on broad region reads:

- region metadata
- all members
- recent sessions, including large fields such as notes, workout JSON, backblast text, weather snapshot, attendance review fields, and announcement snapshot
- planned workouts
- AOs
- sites
- all Q slots
- admin flags
- saved planner sections
- active announcements
- Q sources
- all region member stats
- AO leadership contacts
- profile region positions
- member inviter relationships after members load

Several of these are not needed for the first dashboard render. The current first render is doing data warehouse work before showing a dashboard.

### A3. Historical BAND backblast reads run at session-detail runtime

Confirmed.

`sessionDetailView` calls `getBackblastLinkBySessionId(session.id)` while rendering a session detail. That query reads `session_backblast_links` and can return raw/cleaned imported backblast content for every opened detail. The older region-wide hydrator, `hydrateHistoricalBackblastLinks()`, is present but commented out in `index.js`, so it is not currently the primary runtime cost.

### A4. BAND content destination must be chosen carefully

Confirmed.

`sessions.notes` is used as workout/session notes:

- displayed as the workout when a session has no structured workout
- displayed as a separate notes section when a structured workout exists
- copied into planned workouts for some copy-to-plan paths
- included by `generateBackblast()`
- searched by session history

`sessions.backblast_text` is used as persisted backblast content:

- opened by the Backblast flow instead of generating fresh text
- saved/updated when the user exits, resets, or shares a backblast
- searched by session history
- used by review/import flows as the session's existing backblast text

Therefore, confirmed historical BAND text should materialize to `sessions.backblast_text`, not `sessions.notes`, unless product explicitly wants imported backblasts to become workout notes.

### A5. Member-history queries still depend on session membership predicates

Confirmed.

`loadMemberSessions()` paginates all regional sessions with `select("*")` and filters client-side. `loadMemberSessionByDate()` reads all sessions for a date and filters client-side. Some newer helpers already use server-side membership predicates, but the main member-history paths remain broad.

The relevant predicates are not trivial because attendance can live in `attendee_ids`, Q credit in `q_ids` or legacy `q_id`, and FNG/inviter data in JSON arrays. A server-side RPC is the safest near-term improvement.

## B. Recommended Implementation Order

1. Remove duplicate stats rebuild ownership.
2. Narrow first-render startup data and defer view-specific datasets.
3. Add server-side member-session RPCs and migrate member-history callers.
4. Deploy dual-read BAND behavior using `sessions.backblast_text` plus fallback to links.
5. Backfill confirmed historical BAND text into `sessions.backblast_text`.
6. Remove runtime BAND link reads from normal session-detail rendering after verification.
7. Revisit Supabase plan tier only after code/query reductions and live metrics.

This order gives an immediate write-load reduction first, then reduces boot reads, then removes the biggest remaining runtime historical-content reads without risking data disappearance.

## C. Phase 1: Single Owner For Member-Stats Rebuilds

### Recommendation

Keep stats rebuild ownership in the service/data layer, then make the view layer readback-only.

Why:

- `insertSession()`, `updateSessionInCloud()`, and `deleteSessionFromCloud()` cover create, update, and delete.
- `updateSessionInCloud()` already fetches the old session, so it has the correct old-plus-new affected member set.
- Non-session-view callers and future save paths are less likely to skip stats rebuilds.
- The view's unique job is UI freshness, not deciding durable aggregate ownership.

### Implementation shape

- Change `insertSession()`, `updateSessionInCloud()`, and `deleteSessionFromCloud()` so the rebuild promise is observable by the app layer when needed.
- Keep the save itself non-blocking from the user's perspective. Session persistence should still succeed even if stats rebuild fails.
- Rename/refactor `refreshAffectedMemberStatsInBackground()` so it no longer calls `rebuildMemberStatsForMembers()`. It should only reload `loadMemberDashboardStats()` for affected members after the service-owned rebuild has had a chance to finish.
- For session saves, either:
  - await the service-owned rebuild promise before readback while keeping navigation responsive, or
  - schedule readback after rebuild completion and rerender only affected stat surfaces.

### Rollout safety

This phase has no migration dependency and can ship alone.

### Expected result

Each affected member gets one rebuild per session create/update/delete event instead of duplicate rebuilds from service plus view.

## D. Phase 2: Split Startup Into Critical And Deferred Loads

### Critical first-render data

Keep these blocking for the first dashboard render, but narrow columns wherever practical:

| Dataset | First-render reason | Change |
| --- | --- | --- |
| `regions` | region name, labels, FNG naming setting | keep blocking, already narrow |
| current profile permissions/positions | dashboard access and badges | keep blocking once; avoid duplicating via `loadRegionData()` |
| members | current linked member and names for dashboard/session summaries | keep blocking initially, but select only fields used by `mapMemberFromDb()` |
| recent session summaries | logged-session detection, unposted backblast prompt, recent activity merge | replace broad recent-session load with summary columns |
| AOs | dashboard next-Q display, time schedules, weather/location labels | keep blocking with explicit columns |
| sites | preblast and AO location display | keep blocking with explicit columns |
| Q slot summaries | upcoming Q dashboard card | keep blocking initially, but consider current-user/upcoming window later |
| planned workout summaries | next-Q matching and finalized workout status | keep blocking with summary columns only |
| active announcements | dashboard announcements | keep blocking, but select explicit active-display fields |

### Defer until view entry or explicit action

| Dataset | Current load | Defer target |
| --- | --- | --- |
| `adminFlags` | `loadRegionData()` | admin settings/import review only |
| `savedPlannerSections` | `loadRegionData()` | workout planner/template UI |
| `qSources` | `loadRegionData()` | Q source management/preblast setup |
| all `memberStats` | `loadRegionData()` | roster, region insights, member profile as needed |
| `aoLeadershipContacts` | `loadRegionData()` | AO/leadership management views |
| member inviter relationships | after all members | member profile/roster detail/community paths |
| full session body fields | recent sessions | session detail/history/backblast as needed |
| full planned workout body fields | planned workouts | workout detail/planner as needed |

### Session summary column target

For startup, avoid large text/JSON unless the dashboard directly needs it. A good first summary shape is:

- `id`
- `region_id`
- `date`
- `ao_id`
- `ao_name`
- `start_time`
- `attendee_ids`
- `q_ids`
- `q_id`
- `fngs`
- `source_planned_workout_id`
- `source_q_slot_id`
- `backblast_status`
- `backblast_posted_at`
- `created_at`

Do not include `notes`, `workout`, `backblast_text`, `weather_snapshot`, `attendance_review_notes`, or `announcement_snapshot` in the first-render summary query.

### View loading gates

Add small loader functions with idempotent state flags for deferred datasets:

- `ensureAdminFlagsLoaded()`
- `ensureSavedPlannerSectionsLoaded()`
- `ensureQSourcesLoaded()`
- `ensureRegionMemberStatsLoaded()`
- `ensureMemberInvitersLoaded()`
- `ensureFullSessionLoaded(sessionId)`
- `ensureFullPlannedWorkoutLoaded(workoutId)`

Restored routes must call the relevant gate before rendering the full view. The loading state should render the view shell quickly instead of blocking all app boot.

## E. Phase 3: Member-History Server-Side Queries

### Recommendation

Add SQL RPCs rather than trying to compose this entirely through PostgREST filters.

Reasons:

- The membership predicate spans JSONB, UUID arrays, legacy scalar columns, and FNG JSON content.
- RPCs can enforce region access once and return a deliberately narrow shape.
- The caller gets one stable contract for pagination, mode filters, and date boundaries.

### Proposed RPCs

1. `load_member_sessions(p_region_id uuid, p_member_id uuid, p_mode text, p_limit integer, p_before_date date)`
2. `load_member_session_by_date(p_region_id uuid, p_member_id uuid, p_date date, p_mode text)`

The first RPC should support the current modes used by the UI, including attended, Q, and combined history. It should return only columns needed by list rows. Session detail should lazy-load the full session by ID.

### Index review before migration

Before adding indexes, verify live plans read-only:

- whether `attendee_ids` has an effective GIN index
- whether `q_ids` has an effective GIN index
- whether `(region_id, date desc)` exists and is used
- whether FNG JSON predicates dominate runtime

Likely indexes to consider after measurement:

- GIN on `sessions.attendee_ids`
- GIN on `sessions.q_ids`
- btree on `(region_id, date desc, created_at desc)`

Do not add speculative indexes without `EXPLAIN` evidence because index writes also add disk I/O.

## F. Phase 4: BAND Historical Backblast Materialization

### Destination decision

Use `sessions.backblast_text` as the canonical materialized destination for confirmed historical BAND content.

Do not use `sessions.notes` for imported backblast text by default. `notes` behaves like workout/session notes throughout the app, and putting historical backblast prose there would change workout display, copy-to-plan behavior, and generated-backblast input.

### Code behavior

Deploy a dual-read version first:

- Session detail shows materialized `session.backblastText` when present.
- If `session.backblastText` is empty, session detail can temporarily fall back to `getBackblastLinkBySessionId()` so old linked content still appears.
- Backblast editor continues to open `session.backblastText || generateBackblast(session, members)`.
- Session history search should prefer `sessions.backblast_text`; keep historical-link search only during migration if needed.

After backfill verification:

- remove `getBackblastLinkBySessionId()` from normal session-detail rendering
- remove the historical-link search fallback from normal user search if `sessions.backblast_text` covers the intended content
- keep review/admin tooling able to inspect link tables as needed

### Backfill rule

Backfill only high-confidence/confirmed links:

- linked review decision exists, or
- confidence score meets the accepted threshold and no conflicting higher-confidence/manual link exists

Write only where `sessions.backblast_text` is empty unless a human-approved overwrite list exists. Produce a report of session IDs updated, skipped due to existing text, skipped due to conflicts, and skipped due to missing clean content.

## G. Phase 5: Runtime BAND Reader Removal

The runtime removal should happen only after dual-read and backfill validation.

Remove from normal paths:

- session-detail call to `getBackblastLinkBySessionId()`
- historical-link content fetches during ordinary session history search
- any dormant region-wide hydration that would reintroduce a broad `session_backblast_links` read on startup

Keep for admin/review paths:

- backblast review reports
- manual linking/unlinking
- import provenance inspection
- thang extraction if it still intentionally works from historical imported content

If thang extraction should use materialized session text, move it deliberately in a later phase so provenance is not lost accidentally.

## H. Phase 6: Supabase Plan And Infrastructure Decision

Do not resize first.

Recommended decision rule:

1. Ship duplicate rebuild removal.
2. Ship startup narrowing/deferment.
3. Ship member-history RPCs where broad reads remain.
4. Materialize and remove normal BAND link reads.
5. Re-measure Supabase disk I/O, slow queries, table/TOAST read volume, and RPC frequency.

Consider Nano-to-Micro only if metrics still show sustained I/O pressure after code/query fixes, or if a planned backfill/index migration needs temporary headroom.

For large backfills or concurrent index creation, run during low-traffic hours. A full app maintenance window should not be necessary if dual-read fallback is deployed first.

## I. Deployment Sequence

### Deploy 1: stats rebuild ownership

- Refactor duplicate rebuild path.
- Run build/manual save checks.
- Deploy independently.

### Deploy 2: startup summaries and deferred loaders

- Add summary loaders.
- Update `loadRegionData()` or replace it with `loadRegionBootstrapData()`.
- Add view-level data gates.
- Preserve restored-route behavior.
- Deploy independently before BAND materialization.

### Deploy 3: member-history RPC migration

- Add measured indexes only if justified.
- Add RPCs.
- Switch `loadMemberSessions()` and `loadMemberSessionByDate()` callers.
- Keep old JS fallback for one deploy if useful.

### Deploy 4: BAND dual-read

- Render/search `sessions.backblast_text`.
- Keep fallback to link tables.
- Deploy before backfill.

### Data job: BAND backfill

- Run read-only preflight counts.
- Run batched update job.
- Save update/skip report.
- Re-measure runtime link reads.

### Deploy 5: remove normal BAND link readers

- Remove session-detail link query.
- Remove ordinary historical-link search fallback.
- Keep admin/review import tooling.

## J. Suggested Commit Sequence

1. `perf: avoid duplicate member stats rebuilds after session saves`
2. `perf: split region bootstrap data from deferred view loads`
3. `perf: load member session history with server-side filters`
4. `feat: read materialized historical backblasts from sessions`
5. `data: backfill confirmed band backblasts into sessions`
6. `perf: remove runtime band link reads from session detail`

Keep the backfill commit separate from runtime code so it has a clear audit trail and rollback report.

## K. Validation Checklist

### Read-only preflight

- Inspect `pg_stat_statements` for top queries by total time, calls, shared block reads, and temp usage.
- Inspect `pg_stat_user_tables` for `sessions`, `members`, `member_stats`, `session_backblast_links`, and large review/import tables.
- Inspect table and TOAST sizes for large text/JSON columns.
- Inspect live indexes from `pg_indexes` and usage from `pg_stat_user_indexes`.
- Count confirmed/manual historical links by region.
- Count sessions with empty `backblast_text` and confirmed historical link content.
- Count sessions with both existing `backblast_text` and confirmed historical link content.
- Count conflicting multiple links per session.
- Confirm scheduled functions/cron jobs and their write frequency.

### App validation

- `npm run build`
- create session with attendees, Qs, FNGs, and visitors
- update a session changing attendee/Q/FNG sets
- delete a session
- verify affected roster/dashboard stats refresh once and eventually reflect changes
- load dashboard from cold start
- restore each major view from persisted navigation: dashboard, session detail, session history, roster, Q signup, planner, admin settings, region insights
- open a historical session with materialized backblast text
- open a historical session without materialized text during dual-read phase
- search session history for text from `backblast_text`
- run member profile/history paths for attended, Q, and combined history

### Production metric validation

- Compare first-render Supabase request count before/after startup split.
- Compare bytes returned by session startup query before/after summary loader.
- Compare member-stat rebuild RPC call count per create/update/delete before/after Phase 1.
- Compare `session_backblast_links` reads before/after backfill and reader removal.
- Compare p95/p99 dashboard boot time and session-detail open time.

## L. Rollback Plan

### Stats rebuild phase

Rollback is code-only. If stats freshness is suspect, temporarily restore the previous view-triggered rebuild while investigating.

### Startup split

Rollback is code-only if the old `loadRegionData()` remains available during the first deploy. Keep deferred loaders additive until restored-route behavior is verified.

### Member-history RPC

Keep the old JavaScript fallback for one release. Roll back callers to the fallback if RPC plans are worse than expected.

### BAND dual-read and backfill

Dual-read is code-only rollback.

Backfill rollback should be based on the generated update report. Since writes should only fill empty `sessions.backblast_text`, rollback can clear exactly those session IDs if required. Do not blanket-clear `backblast_text`.

### Reader removal

Rollback is code-only by restoring fallback readers while investigating missing materialized rows.

## M. Risks And Open Decisions

- Product decision: whether imported historical backblast text should be visibly rendered on session detail, or only available through the Backblast button/search. Recommendation: add a Backblast section when `session.backblastText` exists, distinct from workout notes.
- Data decision: whether manual/confirmed links are the only backfill source, or whether high-confidence automated links also qualify.
- Performance decision: whether to index FNG JSON membership. Measure first; it may be better handled by a normalized attendance/involvement table later.
- UX decision: whether dashboard should render with partial data and hydrate cards progressively. Recommendation: yes, with stable loading states.
- Architecture decision: whether to eventually normalize session participation into a `session_participants` table. Recommendation: defer until RPC/index improvements are measured.

## N. Concise Implementation Checklist

- [ ] Make service/data layer the single member-stats rebuild owner.
- [ ] Convert session-view stats refresh to readback-only.
- [ ] Add narrow bootstrap loaders for dashboard-first data.
- [ ] Add deferred loader gates for admin, planner, stats, inviters, Q sources, and full session/workout bodies.
- [ ] Add member-history RPCs after live read-only index/plan inspection.
- [ ] Switch broad member-history callers to server-side filtered/paginated results.
- [ ] Deploy `sessions.backblast_text` dual-read behavior with link-table fallback.
- [ ] Backfill confirmed BAND content into empty `sessions.backblast_text` with a report.
- [ ] Remove normal session-detail/session-history link-table reads after verification.
- [ ] Re-measure Supabase I/O before considering plan resize.
