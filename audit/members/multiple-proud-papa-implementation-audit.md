# Multiple Proud Papa / Invited By Implementation Audit

Date: 2026-07-13  
Scope: read-only source audit. No runtime code, migrations, schemas, RLS policies, functions, tests, or database objects were changed. No database commands were run.

## 1. Executive Summary

Confirmed: the current implementation is scalar. A member has one `members.invited_by_id`, mapped in app code as `member.invitedById`. A session stores FNGs in `sessions.fngs` JSON, and each FNG object carries at most one `invitedById` / `invited_by_id`. The UI offers one search field and one hidden selected id for Invited By. Stats count Proud Papa credit by scanning each FNG JSON object for one inviter id.

Confirmed: the Aggieland cached Pax Master source contains multi-name `Proud Papa` values. A read-only local parse of `import/Pax_Master.csv` found 1,209 rows, 893 nonblank Proud Papa cells, and 14 delimiter-looking values, including `Acme => Texags, Dinger`, `Burn Ban => Hot Wheels, Hot Rod, Skillet`, `Frodo => Detention/Hawk`, and `Waluigi => Stoner, Dinger`.

Likely implication: prior imports either failed to resolve multi-name cells, left `invited_by_id` null, or stored only one manually selected/legacy value. The browser Aggieland importer treats the entire cell as one name; the Edge Function ignores Proud Papa entirely.

Recommendation: add a normalized join table for durable inviter relationships, backfill it from `members.invited_by_id`, then migrate read/write paths to arrays at the service/UI boundary. Keep `sessions.fngs.invitedById` temporarily as event snapshot/backward compatibility, but do not make arrays or JSON the canonical relationship store.

## 2. Confirmed Current Schema

Confirmed current representations:

- `members.invited_by_id`: nullable scalar UUID-like member reference exposed as `invitedById` by `mapMemberFromDb()` in `src/services/cloudData.js:468-477`.
- `sessions.fngs`: JSON array on `sessions`; each FNG object may include scalar `invitedById` or legacy/snake-case `invited_by_id`. `mapSessionFromDb()` returns it unchanged in `src/services/cloudData.js:480-503`.
- `member_stats.fngs_eh`: scalar count of FNG objects where one inviter id matches the member, rebuilt by `rebuild_member_stats_for_region()` and `rebuild_member_stats_for_member()` in `supabase/migrations/20260712230652_make_member_stats_baseline_aware.sql:121-128` and `337-346`.
- `effective_member_stats.fngs_eh`: integer column exists in `supabase/migrations/20260709195750_create_effective_member_stats.sql:1-46`, but prior audits and source show runtime still reads `member_stats`.

Confirmed constraints/RLS visible in committed migrations:

- No committed migration in this repo creates the base `members`, `sessions`, or `member_stats` tables, so the exact FK/index definition for `members.invited_by_id` is unresolved from source alone.
- Region-scoped select RLS for `sessions` is defined in `supabase/migrations/20260702_multi_region_rls.sql:220-233`.
- `member_stats_baselines.member_id` and `effective_member_stats.member_id` reference `public.members(id)` with cascade in `supabase/migrations/20260709193626_create_member_stats_baselines_v2.sql:1-8` and `supabase/migrations/20260709195750_create_effective_member_stats.sql:1-4`.

Likely implication: if `members.invited_by_id` lacks an FK in the remote base schema, current data can reference deleted or cross-region members without database enforcement. If it has an FK, it still cannot represent more than one inviter.

## 3. Complete Write-Path Inventory

### Session logging and editing

- `src/views/sessionView.js:addFngRow()` creates one `createInvitedByField(fng?.invitedById || "")` per FNG row at `896-924`.
- `src/views/sessionView.js:collectFngsFromUi()` reads one `.fng-invited-by-select` value and stores `{ realName, paxName, invitedById, memberId }` at `1095-1119`.
- `src/services/appData.js:ensureFngMembersForSession()` creates a new member for unrostered FNGs with one `invitedById: fng.invitedById || null` at `65-105`.
- `src/services/appData.js:addSession()` calls `ensureFngMembersForSession()` then `insertSession()` at `108-133`.
- `src/services/appData.js:updateSession()` calls `ensureFngMembersForSession()` then `updateSessionInCloud()` at `136-164`.
- `src/services/cloudData.js:insertSession()` writes `sessions.fngs: session.fngs || []` at `666-693`.
- `src/services/cloudData.js:updateSessionInCloud()` replaces the whole `sessions.fngs` JSON value with `session.fngs || []` at `725-752`.

Assumptions/risks: session edits are whole-row JSON replacement, not per-inviter diffs. Editing an existing FNG can overwrite the prior scalar. Member creation and session insert/update are not wrapped in one database transaction from the browser.

### Member creation and editing

- `src/services/cloudData.js:insertMember()` writes one `invited_by_id` at `622-642`.
- `src/services/cloudData.js:updateMemberInCloud()` replaces one `invited_by_id` at `644-664`.
- `src/services/appData.js:addMember()` and `updateMember()` wrap those cloud calls at `222-244`.
- `src/views/memberEditView.js:renderMemberEdit()` renders one Invited By field and saves one `invitedById` at `70-87`.
- `src/views/rosterView.js` quick add creates new PAX with `invitedById: null` at `349-358`.
- `src/views/sessionDetailView.js` Add to Roster creates one new member from FNG with `invitedById: fng.invitedById` at `214-223`.

Assumptions/risks: member editing can null out an existing inviter if the search text changes without selecting a result. No self-reference prevention is visible in UI/service code.

### Imports and audit scripts

- `src/services/importAggieland.js:importPaxMasterCsv()` creates members with `invitedById: null`, then pass 2 reads `row["Proud Papa"]` as one string and resolves exactly one inviter by normalized name at `82-140`.
- `src/services/importAggieland.js:runAggielandSync()` reports `paxMasterInvitedByUpdates` from that scalar pass at `1339-1378`.
- `supabase/functions/nightly-aggieland-import/index.ts:syncPaxMaster()` creates members with `invited_by_id: null` and does not parse `Proud Papa` at `312-370`; summary hard-codes `paxMasterInvitedByUpdates: 0` at `591-596`.
- `src/services/importOld300.js` resolves one `proudPapaName` to one inviter and writes `invitedById` at `158-177` and `226-245`; FNG session JSON copies that one id at `308-319`.
- `import/importAttendance.js` similarly resolves one Proud Papa value into `item.member.invitedById` at `89-124`.
- `audit/attendance/createProposedMembers.js:resolveProudPapa()` accepts one value and throws on ambiguous/unsupported matches at `142-153`; it writes one `payload.invited_by_id` at `187-189`.

Permissions/RLS: browser writes use authenticated Supabase client and region-scoped `.eq("region_id", regionId)` for updates. The Edge Function uses service role credentials (`supabase/functions/nightly-aggieland-import/index.ts:10-12`), bypassing normal client RLS.

## 4. Complete Read / Display-Path Inventory

- `src/components/invitedByField.js:createInvitedByField()` expects one selected id, stores it in one hidden input, and searches active members at `4-84`.
- `src/views/sessionView.js` expects one FNG `invitedById` on load and save at `913` and `1095-1119`.
- `src/views/sessionDetailView.js` displays one inviter per FNG and passes one id to Add to Roster at `185-223`.
- `src/modules/backblast.js:generateBackblast()` renders one `(Invited by @name)` suffix per FNG at `102-118`.
- `src/views/memberDetailView.js` displays one `Invited By` member from `member.invitedById` at `41-72`.
- `src/views/memberEditView.js` reads/writes one id at `70-87`.
- `src/views/paxCommunity.js` displays one Proud Papa and finds EH'd PAX by `candidate.invitedById === member.id` at `331-339`.
- `src/modules/insights.js` counts `fngsBrought` by `fng.invitedById === qId` at `245-261`.
- `src/services/cloudData.js:getAffectedMemberIdsFromSession()` adds one invitedBy id per FNG for stats rebuild fanout at `1559-1579`.
- `audit/attendance/compareAttendance.js` reads official `Proud Papa`, member `invited_by_id`, and session FNG scalar inviter ids at `320`, `350`, and `580`.

Not found: notifications, telemetry event metadata, and CSV/export helpers appear not to include inviter identities directly, except session log telemetry includes only `fngCount` in `src/services/cloudData.js:700-713`.

## 5. Aggieland Import Findings

Confirmed source columns:

- Cached Pax Master header is `Name,Hospital Name,First AO,Proud Papa,FNG Date,Attendance FNG,FNG Date Error` in `import/Pax_Master.csv:1`.
- There is also `audit/attendance/Simple Overall Totals v1 - Raw_Pax_Master.csv` with `CleanPP`, suggesting a prior cleaned Proud Papa artifact exists.
- Edge Function live source is Google Sheet id `1wlsKrOF_7sfGi_F2emLQKHfRa5L3AaUIme1nRFcytTA`, Pax Master gid `1285473699`, in `supabase/functions/nightly-aggieland-import/index.ts:14-18`.

Confirmed handling:

- Browser importer reads `Proud Papa` as a raw scalar string and does not split delimiters. Multi-name cells normalize into one impossible lookup key.
- Nightly Edge Function does not resolve or store Proud Papa at all.
- Prior baseline reports explicitly note the Edge Function leaves `invited_by_id` null and does not populate Proud Papa (`audit/attendance/nightly-import-readonly-audit.md:169-176`, `audit/attendance/final-nightly-import-readonly-audit.md:241-247`).

Evidence source artifacts are sufficient for a first reconstruction pass:

- `import/Pax_Master.csv` contains raw multi-name Proud Papa values.
- `audit/attendance/members_rows.csv` contains current member ids and `invited_by_id`.
- `audit/attendance/official-baseline-match-report.md` and related CSVs contain prior identity decisions and duplicate-name risks.

Unresolved: whether the live Google Sheet has changed since the cached CSV; a future audit should fetch a frozen snapshot and compare hashes. Some values such as `Wife, Signs` may include non-member or ambiguous inviters and need human review.

## 6. Statistics and Business-Logic Impact

Current meanings:

- `session.fngs.length` means number of FNG appearances in session UI/insights (`src/modules/insights.js:72-74`).
- `member_stats.fngs_eh` currently means number of FNG JSON objects where the member is the single inviter (`supabase/migrations/20260712230652_make_member_stats_baseline_aware.sql:121-128`, `337-346`).
- `AO insights fngsBrought` currently means number of FNGs in sessions Q'd by the member where that Q id is the single inviter (`src/modules/insights.js:259-261`).
- `paxCommunity` EH'd PAX means members whose scalar `invitedById` equals this member (`src/views/paxCommunity.js:336-339`).

Semantic decision required: after many inviters, reports must distinguish unique FNGs with at least one inviter, total inviter relationships, and unique FNGs credited to a given inviter. For Proud Papa credit, this audit recommends counting relationship rows for member-level credit, and separately exposing unique FNG counts where needed to avoid double-counting recruiting pipeline totals.

## 7. Recommended Data Model

Recommended: normalized join table, for example `member_inviters` or `member_proud_papas`.

Suggested columns: `id`, `region_id`, `invited_member_id`, `inviter_member_id`, `source` (`manual`, `fng_session`, `aggieland_import`, etc.), optional `session_id`, optional `official_raw_value`, optional `notes`, `created_at`, `created_by_user_id`.

Recommended constraints: FK `invited_member_id -> members(id)`, FK `inviter_member_id -> members(id)`, unique `(invited_member_id, inviter_member_id)`, check `invited_member_id <> inviter_member_id`, indexes on `invited_member_id`, `inviter_member_id`, `(region_id, inviter_member_id)`.

Options compared:

- Normalized join table: best referential integrity, duplicate prevention, targeted add/remove, import auditability, merge/delete handling, and query performance. Most compatible with RLS and future source metadata.
- UUID array column: compact but weak FK enforcement, awkward duplicate/self-reference constraints, harder RLS and deletion/merge semantics.
- JSON/JSONB: flexible for source notes but poor as canonical relational data; duplicates/FKs/self-reference require custom code.
- Extend `sessions.fngs`: preserves event provenance but cannot represent non-session official relationships cleanly and keeps canonical facts inside JSON snapshots.

Relationship placement: canonical relationships should belong to the permanent invited member. Session FNG JSON may retain event-time inviter snapshots during migration and for backblast/history, but should not be the source of truth for current Proud Papa relationships.

## 8. RLS and Permissions Considerations

Use region-scoped RLS mirroring members/session access. Reads should require region access to the invited member's region. Writes should require member-management permission or the same authority currently needed to edit members/sessions.

Cross-region relationships need an explicit decision. Safest initial rule: allow inviter_member_id from any accessible region only for privileged/admin writes, but store `region_id` as the invited member's region for reporting. If cross-region inviters should be common, RLS policies must avoid hiding the inviter display name from users who can view the invited member relationship.

Edge Function/service-role imports must classify and stage recommendations first; production application should use a controlled script or RPC with duplicate/self-reference checks rather than direct arbitrary inserts.

## 9. Phased Implementation Plan

1. Schema: add normalized inviter join table, constraints, indexes, optional audit/source columns, and RLS. Do not remove `members.invited_by_id`.
2. Backfill: insert one relationship for every non-null `members.invited_by_id`; classify self-reference, missing member, duplicate, and cross-region anomalies before applying.
3. Service reads: add relationship loaders that return `inviterIds`/`inviters` arrays while retaining scalar fallback during rollout.
4. Service writes: update member and FNG save flows to upsert/delete relationship rows transactionally through an RPC or server-side service.
5. UI: replace `createInvitedByField()` with a multi-select component for FNG forms and member edit, with chips and remove controls.
6. Session logging/editing: store selected inviter ids in the canonical join table when FNG member id exists; keep a denormalized snapshot in `sessions.fngs` only for display/backward compatibility if needed.
7. Member conversion: when an FNG becomes/creates a member, attach all selected inviters to the member relationship table and preserve source session metadata.
8. Rendering: update session detail, backblast, member detail, PAX community, and backblast generation to render multiple names.
9. Stats: rebuild `fngs_eh` from relationship rows or a clearly named relationship-count metric; add separate unique-FNG metrics if product wants them.
10. Aggieland audit: produce read-only CSV classifications, human decisions, and then an import-ready relationship CSV.
11. Production update: apply reviewed inserts through an idempotent script/RPC, then run verification queries and stats rebuilds.
12. Deprecation: after dual-read period and verification, stop writing `members.invited_by_id`; later remove or mark it legacy in a separate migration.

## 10. Proposed Aggieland Audit / Report Format

Future read-only script inputs: frozen Pax Master CSV, members export, current inviter relationships, existing `members.invited_by_id`, official baseline/manual decision CSVs, and optional backblast parsed artifacts.

Classifications: `single_relationship_already_correct`, `multiple_relationships_missing`, `existing_relationship_conflict`, `inviter_resolved`, `inviter_not_found`, `ambiguous_inviter_match`, `duplicate_inviter`, `self_reference`, `cross_region_inviter`, `ready_for_insert`, `needs_human_review`.

Proposed CSV columns:

- `classification`
- `official_invited_member_name`
- `official_invited_member_identifier`
- `official_invited_member_real_name`
- `selected_current_member_id`
- `selected_current_member_pax_name`
- `existing_inviter_ids`
- `existing_inviter_names`
- `official_inviter_raw_value`
- `parsed_inviter_name`
- `parsed_inviter_index`
- `matched_inviter_member_id`
- `matched_inviter_pax_name`
- `match_method`
- `match_confidence`
- `recommended_action`
- `would_insert`
- `would_delete_or_replace`
- `source_file`
- `source_row_number`
- `notes`

Delimiter parsing should split comma, slash, semicolon, ampersand, and ` and ` only after preserving parenthetical suffixes such as `(DR)` and `(2.0)`.

## 11. Risks and Unresolved Questions

- Base schema for `members.invited_by_id`, including FK, index, and delete behavior, is not present in committed migrations.
- Current session updates replace the entire `fngs` JSON array, so dual-write rollout must avoid losing relationships on stale clients.
- Existing source artifacts appear sufficient for a first Aggieland reconstruction, but the live official sheet may have changed.
- Imported values may include non-member inviters or descriptive text, for example `Wife, Signs`, so automated insert must be conservative.
- Cross-region inviter visibility and credit semantics need product confirmation.
- Member merge/delete behavior must update both invited and inviter sides.
- Stats names should be clarified before migration: relationship count versus unique FNG count.

## 12. File-by-File Impact Matrix

| File | Current role | Impact |
| --- | --- | --- |
| `src/services/cloudData.js` | Maps `members.invited_by_id`, writes member/session scalar data, rebuilds stats for one inviter id. | High: add relationship reads/writes/RPCs, update affected-member fanout. |
| `src/services/appData.js` | Creates FNG members from session FNGs with one inviter. | High: attach many inviters transactionally during add/update session. |
| `src/components/invitedByField.js` | Single-select inviter field. | High: replace or extend to multi-select. |
| `src/views/sessionView.js` | FNG form reads/writes one `invitedById`. | High: multi-select UI and serialization. |
| `src/views/memberEditView.js` | Member edit reads/writes one inviter. | High: multi-select relationship editor. |
| `src/views/memberDetailView.js` | Displays one Invited By. | Medium: render list. |
| `src/views/sessionDetailView.js` | Displays one FNG inviter and creates roster member with one id. | High: render/convert multiple inviters. |
| `src/modules/backblast.js` | Generates one invited-by suffix. | Medium: render multiple names. |
| `src/views/paxCommunity.js` | Displays one Proud Papa and scalar EH'd PAX. | High: update relationship graph. |
| `src/modules/insights.js` | Counts `fngsBrought` from scalar session FNG inviter. | High: define many-inviter aggregation. |
| `supabase/migrations/20260712230652_make_member_stats_baseline_aware.sql` | SQL stats functions count scalar inviter in FNG JSON. | High: future migration must count join rows. |
| `supabase/functions/nightly-aggieland-import/index.ts` | Creates members with `invited_by_id: null`; ignores Proud Papa. | Medium/high: keep importer read-only/staging until audit workflow exists. |
| `src/services/importAggieland.js` | Browser importer resolves one `Proud Papa` value. | Medium: replace with audit/staged import or multi-parser. |
| `src/services/importOld300.js` and `import/importAttendance.js` | Legacy imports resolve one Proud Papa. | Low/medium: update only if reused. |
| `audit/attendance/createProposedMembers.js` | Proposed member creation resolves one Proud Papa. | Medium: adapt to relationship CSV instead of scalar field. |
| `audit/attendance/compareAttendance.js` | Reads official Proud Papa and scalar inviters for reports. | Medium: extend to many-inviter classifications. |
| `import/Pax_Master.csv` | Cached official source includes raw `Proud Papa`. | High: sufficient seed for future audit, subject to freshness. |

## Closing Findings

Recommended schema direction: normalized join table with `invited_member_id` and `inviter_member_id`, plus source/audit metadata.

Highest-risk write paths: session create/edit FNG conversion (`src/services/appData.js:65-164`, `src/views/sessionView.js:896-1119`), member edit (`src/views/memberEditView.js:70-87`), and Aggieland import (`src/services/importAggieland.js:122-140`, `supabase/functions/nightly-aggieland-import/index.ts:312-370`).

Aggieland source sufficiency: existing cached artifacts appear sufficient to reconstruct many missing relationships for a first dry-run audit, because raw multi-name `Proud Papa` values are present. A live/frozen source refresh is still required before production application.

Next recommended implementation step: write a read-only Aggieland Proud Papa audit script that parses multi-name values, matches inviters against current members, and emits the proposed CSV classifications above. Do that before writing any migration or mutating production relationship data.
