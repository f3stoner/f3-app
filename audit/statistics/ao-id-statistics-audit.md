# AO ID Statistics Audit

Date: 2026-07-13

Scope: read-only audit of runtime code and migrations for AO-based statistics, aggregations, filters, and insights that could still use AO names as identity instead of canonical AO IDs.

## 1. Executive summary

Total AO-based calculations reviewed: 14

Correct: 5

Incorrect: 6

Mixed: 2

Needs review: 1

Highest-risk findings:

- `member_stats.favorite_ao` is still rebuilt by grouping `public.sessions.ao_name` in both `rebuild_member_stats_for_region` and `rebuild_member_stats_for_member`. This directly affects dashboard/profile favorite AO output and can split historical variants.
- Region Insights `attendanceByAo` and `attendanceByAoByDay` group by normalized `session.aoName`, not `session.aoId`.
- AO Insights selection, month lookup, session loading, and historical calculations are still AO-name driven. The client passes `p_ao_name` to hidden RPCs and also has client-side normalized-name filters.
- Session History AO filtering stores/selects AO names and filters sessions by `session.aoName`.

Confirmed expected behavior:

- `loadMemberCommunityData()` uses normalized `session.aoName` only for exclusion rules, then requires `session.aoId` and groups/unique-counts by `session.aoId`. That implementation is correct for canonical AO identity.

## 2. AO statistics inventory

| # | Classification | File | Function / block | Statistic / filter | Source data | AO grouping/filtering key | AO name display only? | Historical name variants could split? | Null `ao_id` handling | Recommended correction |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | Incorrect | `supabase/migrations/20260712230652_make_member_stats_baseline_aware.sql:145` | `rebuild_member_stats_for_region` | `member_stats.favorite_ao` for every region member | `public.members`, `public.sessions`, `public.member_stats_baselines` | `group by s2.ao_name`; returns `s2.ao_name` | No. AO name is the grouped identity and stored result. | Yes. Aliases/renames split favorite AO counts. | Does not inspect `s2.ao_id`; null IDs are irrelevant because name is always used. | Group by `s2.ao_id`, join `public.aos` for display name, and explicitly handle legacy null `ao_id` rows in a separate fallback bucket or remediation report. |
| 2 | Incorrect | `supabase/migrations/20260712230652_make_member_stats_baseline_aware.sql:365` | `rebuild_member_stats_for_member` | `member_stats.favorite_ao` for one member | `public.members`, `public.sessions`, `public.member_stats_baselines` | `group by s2.ao_name`; returns `s2.ao_name` | No. AO name is the grouped identity and stored result. | Yes. Same risk as regional rebuild, but for targeted refreshes. | Does not inspect `s2.ao_id`. | Same correction as regional rebuild so full and targeted stats stay consistent. |
| 3 | Incorrect | `src/modules/insights.js:152` | `buildRegionInsights()` `attendanceByAo` | Region Insights AO Activity totals: attendance, session count, average attendance, FNG count | `state.sessions` passed from Region Insights view | `normalizeAoName(session.aoName)` | No. `aoName` is the map key. | Yes. Only a hardcoded alias list for Rock/Cave/Keep is merged; other aliases/renames split. | No handling. Sessions without `aoId` are not distinguished because `aoId` is unused. | Key the map by `session.aoId`; retain an AO display label from canonical `state.aos` or first session as fallback. |
| 4 | Incorrect | `src/modules/insights.js:184` | `buildRegionInsights()` `attendanceByAoByDay` | Region Insights AO-by-weekday attendance matrix | `state.sessions` passed from Region Insights view | `normalizeAoName(session.aoName)` | No. `aoName` is the map key. | Yes. AO-by-day trends can be split across historical names. | No handling. | Key by `session.aoId`, store display label separately. |
| 5 | Incorrect | `src/views/aoInsightsView.js:550` | `buildAoInsights()` `allAoSessions` | AO Insights all-time AO session set used by potential-new-Q calculations | `state.sessions` | `normalizeAoName(session.aoName) === normalizeAoName(aoName)` | No. Name is the AO filter identity. | Yes. Historical aliases outside the normalization rule are excluded. | No handling. | Store selected AO as `{ aoId, aoName }` and filter by `session.aoId === aoId`; optionally legacy-fallback only when `session.aoId` is null. |
| 6 | Incorrect | `src/views/aoInsightsView.js:287` | `getAvailableMonthsForAo()` | Local available-month discovery for AO Insights | `state.sessions` | normalized `session.aoName` vs selected `aoName` | No. Name is the AO filter identity. | Yes, if this local helper is used again or as fallback. | No handling. | Filter by selected AO ID. Note: current month picker uses RPC data, but this helper is still an AO-name calculation. |
| 7 | Needs review | `src/services/cloudData.js:1904` | `loadAoInsightMonths()` / `loadAoInsightSessions()` RPC callers | AO Insights month list and selected/historical session loads | Supabase RPCs `get_ao_insight_months`, `get_ao_insight_sessions` | Client passes `p_ao_name`; RPC body not present in migrations | No, likely identity, but SQL body is not available locally. | Likely yes if RPC filters `sessions.ao_name`. | Cannot determine from local code. | Inspect live database function definitions. Prefer `p_ao_id` and `sessions.ao_id`; keep `ao_name` only as returned display data. |
| 8 | Incorrect | `src/views/aoInsightsView.js:827` | `renderAoInsightsView()` selected and history session loading | AO Insights snapshot metrics, attendance momentum, new PAX pipeline | RPC-loaded sessions | Selected AO carried as `selected.aoName`; RPC called with `aoName` | No. AO identity is name-driven at the view boundary. | Yes, depending on RPC implementation. | No client handling. | Change selected AO state to include `aoId`; pass ID to data loader/RPC. |
| 9 | Correct | `src/utils/aoInsights/attendanceInsights.js:102` | `buildAttendanceInsight()` | Attendance momentum for the already-selected AO session set | Caller-provided sessions | No AO grouping inside utility | Yes. It does not use AO name as identity. | No additional split inside this utility; risk belongs to caller session selection. | Not applicable. | No correction in this utility; fix AO selection before sessions reach it. |
| 10 | Correct | `src/utils/aoInsights/newPaxPipelineInsights.js:93` | `buildNewPaxPipelineInsight()` / `calculateNewPaxPipelineMetrics()` | New PAX pipeline for the already-selected AO session set | Caller-provided sessions and member stats | No AO grouping inside utility | Yes. Session AO labels are not used as keys. | No additional split inside this utility; risk belongs to caller session selection. | Not applicable. | No correction in this utility; fix AO selection before sessions reach it. |
| 11 | Correct | `src/services/cloudData.js:2931` | `loadMemberCommunityData()` | PAX community: unique AO count and shared AO post counts | `loadMemberCommunitySessions()` from `public.sessions` | `session.aoId` via `const aoKey = session.aoId` | Yes. `aoName` is used for exclusion checks and display/sort labels only. | No, because counted/grouped AOs use canonical ID. | Null `ao_id` rows are skipped (`if (!session.aoId) return`), avoiding name fallback but undercounting legacy-null rows. | Keep identity behavior. If legacy-null rows matter, backfill them rather than falling back to name. |
| 12 | Correct | `src/services/cloudData.js:2647` | `createSessionAuditLegacyKey()` | Session audit legacy slot/session matching key | Q slots and sessions | `aoId || normalizedAoName` | No. Name is a fallback identity. | Only for legacy rows with no AO ID; could split null-ID historical rows. | Explicit mixed fallback. | Acceptable as a legacy fallback if null `ao_id` rows are expected; prefer source Q-slot ID or `aoId` after backfill. |
| 13 | Mixed | `src/views/sessionView.js:409` and `src/views/sessionView.js:708` | `getLastPostAtAo()` / `buildLastPostMapForAo()` | Session editor roster context: last post at current AO | `state.sessions` | `session.aoId ? session.aoId === aoId : session.aoName === aoName` | No. Name can be fallback identity. | Only null-`ao_id` rows can split. | Explicit fallback for null `session.aoId`. | Acceptable as legacy-null fallback, but canonicalize/backfill null rows so the fallback stops mattering. |
| 14 | Incorrect | `src/views/sessionHistoryView.js:74` and `src/views/sessionHistoryView.js:277` | AO dropdown and `renderSessionList()` filter | Session History AO filter, including AO Insight month navigation filters | `state.sessions` | Dropdown value is `ao.name`; filter is `session.aoName === state.sessionHistoryAoFilter.aoName` | No. Name is the filter identity. | Yes. Renames/aliases can hide historical sessions from filtered history. | No handling. | Store AO filter as `aoId`; filter by `session.aoId`; use name only for label. |

## 3. Notes by high-priority area

### Member profile statistics

Profile views read `stats.favoriteAo` from `state.memberStats` / `member_stats`. The view layer mostly displays the value, but the upstream rebuild SQL calculates it with AO names. This means PAX Profile and dashboard favorite-AO behavior inherits the SQL risk.

Relevant display/read sites:

- `src/services/cloudData.js:1896` maps `row.favorite_ao` to `favoriteAo`.
- `src/modules/stats.js:16` exposes `favoriteAo` from cached stats.
- `src/views/paxProfileView.js:382` displays `stats?.favoriteAo`.
- `src/components/mainMenu.js:27` uses favorite AO name to choose the default AO Insights AO.

### Favorite AO calculations

Incorrect. Both rebuild RPCs group by `s2.ao_name`. Since the AO migration and backfill are complete, these should group by `s2.ao_id` and only use AO name as a display label.

### AO activity counts

Region Insights AO Activity is incorrect because `attendanceByAo` groups by normalized AO name. The Region Insights UI then uses that name to navigate into AO Insights, preserving the name-based identity.

### Member community/shared AO calculations

Correct. `loadMemberCommunityData()` checks `session.aoName` only for exclusion labels such as `other`, `blackops`, `csaup`, and `convergence`, then skips rows with null AO ID and groups by `session.aoId`.

### AO Insights

Incorrect / needs review. Client state and filtering are AO-name based. The two RPC callers pass `p_ao_name`; the SQL definitions are not present in local migrations, so the exact database-side key cannot be confirmed from this repository. The client-side `allAoSessions` filter definitely uses normalized AO name and feeds potential-new-Q logic.

### Attendance momentum

The momentum utility itself is correct because it only calculates over sessions it is handed. Its AO identity risk comes from AO Insights selecting those sessions by AO name.

### New PAX pipeline

The pipeline utility itself is correct for AO identity because it does not group/filter by AO. Its AO identity risk comes from AO Insights selecting those sessions by AO name.

### Dashboard member statistics

Dashboard member stats read `member_stats.favorite_ao`. The dashboard/profile layer is display-only, but it inherits the incorrect SQL favorite-AO grouping.

### Region insights

Incorrect for AO-based aggregations: AO Activity and AO-by-weekday use normalized AO names as map keys.

### Effective member stats / `member_stats`

`effective_member_stats` exists as a table with `favorite_ao text`, but the active app code reads `member_stats`. The current active rebuild functions in `20260712230652_make_member_stats_baseline_aware.sql` populate `member_stats.favorite_ao` by AO name.

### RPCs that group sessions by AO

Found local RPC callers for AO Insights but not their SQL definitions. `get_ao_insight_months` and `get_ao_insight_sessions` need live database definition review because local code passes `p_ao_name`.

## 4. Recommended correction order

1. Fix `rebuild_member_stats_for_region` and `rebuild_member_stats_for_member` to group favorite AO by `sessions.ao_id`, with a canonical AO-name display join.
2. Change AO Insights selected state and RPCs from `aoName` / `p_ao_name` to `aoId` / `p_ao_id`.
3. Change Region Insights AO maps to key by `session.aoId` and carry `aoName` only as a label.
4. Change Session History AO filter state to store AO ID and filter by `session.aoId`.
5. Preserve mixed legacy fallbacks only where explicitly needed for null `ao_id` rows; after backfill, report or skip null IDs rather than silently grouping by name.
