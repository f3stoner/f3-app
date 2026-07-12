# Final Nightly Aggieland Import Read-Only Audit

Generated: 2026-07-12

Scope: source-only audit for one final controlled `nightly-aggieland-import` run on July 12, 2026. This audit did not invoke the Edge Function, did not write Supabase data, did not enable any schedule, and did not run the baseline importer. The only repository write made by this audit is this requested report file.

## Executive Findings

- No repository schedule for `nightly-aggieland-import` was found in Supabase config, committed migrations, GitHub Actions, package scripts, local scripts, application startup, or admin startup code.
- The Edge Function is still registered and enabled in source: `supabase/config.toml` has `[functions.nightly-aggieland-import]`, `enabled = true`, and `verify_jwt = true`.
- The current app exposes a manual admin UI caller through `Import Runs`, but the `dataq` role has `VIEW_IMPORTS` and `RUN_IMPORTS` commented out. `superadmin` still has every permission.
- The browser service caller posts directly to `/functions/v1/nightly-aggieland-import` with only `Content-Type: application/json`; it does not attach `Authorization` or `apikey` headers in the inspected source, so it may fail against the committed `verify_jwt = true` function config unless hosted config or runtime behavior differs.
- The Edge Function does not check a user role or admin permission. With `verify_jwt = true`, the platform JWT check is the only source-level request authentication guard found.
- `apply=false` is not read-only. It avoids member/session/admin-flag inserts, but it always inserts an `import_runs` row on success and attempts to insert an error `import_runs` row on failure.
- `apply=true` can create `members`, `sessions`, `admin_flags`, and `import_runs`.
- The Edge Function does not call `rebuild_member_stats_for_region` or any member stats RPC. No committed migration trigger was found that automatically rebuilds stats after `sessions` inserts.
- The app/browser batch insert helper does rebuild stats after batch inserts, but that helper is not used by the deployed Edge Function.
- Cached local `import/Pax_Master.csv` compared against `audit/attendance/members_rows.csv` found 0 cached Pax Master names that would be newly created. This does not prove the live Google Sheet dry-run will propose 0 creates.

## 1. Schedule Audit

No source-controlled automatic schedule for `nightly-aggieland-import` was found.

Checked paths and findings:

- Supabase config: `supabase/config.toml` registers the function but has no cron schedule.
- Supabase migrations: no `pg_cron`, `cron.schedule`, `pg_net`, `http_post`, or Edge Function invocation for `nightly-aggieland-import` was found.
- GitHub Actions: `.github/workflows/push-notifications.yml` has scheduled push reminders only and runs `node sendReminders.mjs`.
- Package scripts: `package.json` has `refresh:aggieland-csvs` and `import:exicon`, but no nightly import script.
- Local scripts: no non-empty script invokes `nightly-aggieland-import`; `import/runAggielandSync.mjs` is empty.
- App startup/admin code: no startup invocation was found. The only app route is the manual `Import Runs` admin view.
- Hosted Supabase dashboard schedules cannot be verified from source. Check the Supabase Dashboard separately for Edge Function schedules, database cron jobs, and any external scheduler integrations.

## 2. Current Callers

Current direct Edge Function callers:

- `src/services/cloudData.js`
  - `runAggielandImport({ apply = false })`
  - `runAggielandImportDryRun()`
  - `applyAggielandImport()`

- `src/views/importRunsView.js`
  - `Run Dry Run Now` calls `runAggielandImportDryRun()`
  - `Apply Import` calls `applyAggielandImport()` after two confirms

UI exposure:

- `src/views/adminSettingsView.js` includes an `Import Runs` card without checking `VIEW_IMPORTS` before rendering the card.
- `src/components/mainMenu.js` includes `Import Runs` with `VIEW_IMPORTS` permission.
- `src/views/importRunsView.js` blocks access if `VIEW_IMPORTS` is absent.
- `src/utils/permissions.js` gives `VIEW_IMPORTS` and `RUN_IMPORTS` only to `superadmin`; they are commented out for `dataq`.

Related local/browser import helpers that do not call the Edge Function but can write similar data if used:

- `src/services/importAggieland.js`
  - `runAggielandSync({ apply })`
  - `runAggielandDeltaAoImports({ dryRun })`
  - `importPaxMasterCsv(...)`
  - `repairAggielandDeltaSessions(...)`
  - These use local `/import/*.csv` files and the browser Supabase client, not the deployed Edge Function.

No cron/scheduled caller was found in source.

## 3. Invocation Behavior

Edge Function registration:

- Function name: `nightly-aggieland-import`
- Source: `supabase/functions/nightly-aggieland-import/index.ts`
- Config: `supabase/config.toml`
- `enabled = true`
- `verify_jwt = true`

Request URL used by app source:

```text
${process.env.SUPABASE_URL}/functions/v1/nightly-aggieland-import
```

Request body:

```json
{ "apply": false }
```

or:

```json
{ "apply": true }
```

App service request headers:

```http
Content-Type: application/json
```

The app caller does not attach `Authorization` or `apikey` headers. Because source config has `verify_jwt = true`, a controlled command-line invocation should include a valid JWT and `apikey` header.

Required app/build environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` for normal Supabase client setup, though the direct app fetch currently does not use it for the function call.

Required Edge Function environment variables:

- `PROJECT_SUPABASE_URL`
- `PROJECT_SUPABASE_SERVICE_ROLE_KEY`
- `AGGIELAND_REGION_ID`

Function source data inputs:

- Live Google CSV export for spreadsheet `1wlsKrOF_7sfGi_F2emLQKHfRa5L3AaUIme1nRFcytTA`
- Sheets: `Pax Master`, `Forest`, `Cave`, `Iron`, `Keep`, `Rock`, `Mine`, `Southie`, `Watch`, `Dads`, `BlackOps`, `CSAUP`, `Other`

`apply=false` behavior:

- Reads existing `members`.
- Reads existing `sessions`.
- Fetches live Google Sheet CSVs.
- Parses Pax Master and AO tabs.
- Computes member creates and new sessions.
- Does not insert `members`.
- Does not insert `sessions`.
- Does not create `admin_flags`.
- Does insert an `import_runs` row with `type = "aggieland_sync"`, `mode = "dry_run"`, and summary.
- On error, attempts to insert an `import_runs` row with `status = "error"`.

`apply=true` behavior:

- Performs all dry-run reads and parsing.
- Inserts missing Pax Master members into `members`.
- Inserts new AO/date sessions into `sessions`.
- Creates open `admin_flags` for unresolved inserted-session PAX only.
- Inserts an `import_runs` row with `mode = "apply"` and summary.
- Does not rebuild `member_stats`.

## 4. Stats Rebuild Behavior

The Edge Function does not call either:

- `rebuild_member_stats_for_region`
- `rebuild_member_stats_for_member`

No committed migration trigger was found on `public.sessions` that rebuilds stats after inserts, updates, or deletes. The only committed trigger matches found are Q-slot guard triggers.

Stats rebuild callers found in app service code:

- `insertSession(...)` calls `rebuildMemberStatsForMembers(...)` after a single app-created session insert.
- `updateSessionInCloud(...)` calls `rebuildMemberStatsForMembers(...)` after an app session update.
- `deleteSessionFromCloud(...)` calls `rebuildMemberStatsForMembers(...)` after an app session delete.
- `insertSessionsBatch(...)` calls `rebuildMemberStatsForRegion(regionId)` after browser/client batch inserts.

Important distinction:

- `src/services/cloudData.js` batch inserts rebuild stats.
- `supabase/functions/nightly-aggieland-import/index.ts` has its own `insertSessionsBatch(...)` and does not rebuild stats.

Exact RPC needed after final Edge Function apply:

```sql
select public.rebuild_member_stats_for_region(
  target_region_id := '96c9eef9-3b6e-4365-86cd-51dbeccf231a'
);
```

Equivalent Supabase JS shape:

```js
await supabase.rpc("rebuild_member_stats_for_region", {
  target_region_id: "96c9eef9-3b6e-4365-86cd-51dbeccf231a",
});
```

The `rebuild_member_stats_for_region` function definition was not present in committed migrations, but multiple runtime callers prove the expected RPC name and argument name in app code.

## 5. Idempotency and Overlap

Existing session detection:

- The function reads all existing `sessions` for `AGGIELAND_REGION_ID`.
- Existing keys are built from normalized resolved AO name plus date:

```text
${normalizeAoName(resolveImportedAoName(ao_name, weekday))}|${date}
```

AO/date duplicate handling:

- If the key already exists, the source session is skipped completely.
- It does not compare or reconcile attendee lists.
- It does not add missing attendees to an existing app-created session.
- It does not update Qs, FNGs, notes, workout, unresolved PAX, or admin flags for skipped sessions.

Hard-coded ignored session key:

- `blackops|2026-05-11`

Overlap risk for July 12 through July 31:

- If a session is logged in The Q before the final import and has the same normalized AO/date key, the importer will skip the official session and will not reconcile attendees.
- If an app-created session has a different AO name that normalizes differently than the importer's resolved AO name, the official session can be inserted as a duplicate AO/date in practice.
- If the official sheet contains a July 12 session that was already logged in The Q under the same key, no duplicate row is expected, but missing attendees will not be added.

AO normalization risks:

- `normalizeAoName()` trims, lowercases, and strips leading `the ` only.
- `Watch` is rewritten by weekday:
  - Tuesday -> `Watch (D)`
  - Friday -> `Watch (W)`
  - otherwise -> `Watch`
- `Dads` becomes `Dads (The Mine)`.
- Saturday `Cave` becomes `Convergence (Cave)`.
- Other spelling variants, punctuation variants, renamed AOs, and manually-entered app AO names may not normalize to the same key.

Concurrent invocation:

- No advisory lock, import lock row, unique `import_runs` idempotency key, or in-flight guard was found.
- Two concurrent applies can both read the same existing session key set before either inserts.
- Session IDs are generated randomly per parsed session. Without a database unique constraint on region/date/AO key in source, concurrent applies can duplicate sessions.
- Source has an index on `(region_id, ao_id, date)`, but the importer inserts `ao_name` and does not set `ao_id`; no source unique constraint was found for normalized AO/date.

## 6. FNG and Member Behavior

Member matching:

- Existing members are matched by `normalizeImportPaxKey(pax_name)`.
- Normalization trims, lowercases, removes leading `Dr.`, removes parenthetical content, and strips non-alphanumeric characters.
- If duplicate existing members share the same normalized key, one active member is used only when exactly one row is active; otherwise the key is marked ambiguous and AO references become unresolved.

Member creation:

- Pax Master rows missing from existing members are created only when `apply=true`.
- Created fields:
  - `id`: random UUID
  - `region_id`: `AGGIELAND_REGION_ID`
  - `pax_name`: Pax Master `Name`
  - `real_name`: Pax Master `Hospital Name` or null
  - `home_ao`: Pax Master `First AO` or null
  - `invited_by_id`: always null in the Edge Function
  - `first_post_date`: Pax Master `FNG Date`
  - `status`: `active`

Proud papa:

- The Edge Function does not populate `invited_by_id` from Pax Master `Proud Papa`.
- The older browser helper does a second pass for invited-by updates, but the Edge Function does not.

FNG session flags:

- AO rows with code exactly `FNG` add `{ paxName, memberId }` to the session `fngs` array when the member can be matched.
- `first AO`, `FNG date`, `real name`, and `status` are populated for newly created Pax Master members as above.
- App-created unnamed FNGs can be duplicated later because they often have no matching `pax_name`, while Pax Master matching is normalized PAX-name based.

Admin flags:

- Ambiguous or unmatched AO PAX references are stored on the candidate session as `unresolvedPax`.
- In apply mode, flags are created only after new sessions are inserted.
- If a session is skipped as an existing AO/date duplicate, unresolved PAX for that skipped official row do not create new flags.

Cached-source likely new members:

- Local cached `import/Pax_Master.csv` has 1209 rows.
- Local `audit/attendance/members_rows.csv` has 1422 rows across regions.
- Comparing normalized cached Pax Master names to cached members found 0 missing names.
- Because the Edge Function fetches live Google Sheets, this does not guarantee a live dry-run would propose 0 member creates.

## 7. Shutdown Verification

Repository/source shutdown steps after final run:

- Keep or remove the manual UI entry intentionally. Source currently still has the manual `Import Runs` view and `superadmin` can access it.
- To fully disable source-level manual invocation, future repository work should disable or remove `src/views/importRunsView.js` apply/dry-run controls and/or remove the `nightly-aggieland-import` service caller.
- To disable the Edge Function from source deployment, future repository work should set `[functions.nightly-aggieland-import] enabled = false` or remove the function registration, then deploy Supabase config.
- Do not rely only on UI permissions: the Edge Function itself has no role check.

Hosted Supabase/dashboard shutdown steps that cannot be verified from source:

- Confirm there is no Supabase Dashboard schedule for the Edge Function.
- Confirm there is no database cron job invoking the function through `pg_cron`, `pg_net`, or an HTTP extension in the hosted database.
- Confirm there is no external scheduler, Zapier, GitHub Actions secret workflow, or other hosted automation calling the function URL.
- Confirm Edge Function config in the deployed project still has JWT verification enabled until the function is disabled/deleted.

## Final Runbook

### Preflight Checks

1. Confirm the source audit still holds:
   - No GitHub Action invokes `nightly-aggieland-import`.
   - No committed migration has `pg_cron` or HTTP cron invocation.
   - `supabase/config.toml` has `verify_jwt = true`.
2. In Supabase Dashboard, check Edge Function schedules and database cron jobs. Stop if any automatic schedule is active and cannot be disabled after the final run.
3. Confirm operational date: July 12, 2026.
4. Confirm Aggieland region ID:

```text
96c9eef9-3b6e-4365-86cd-51dbeccf231a
```

5. Confirm Edge Function env vars are present in hosted Supabase:
   - `PROJECT_SUPABASE_URL`
   - `PROJECT_SUPABASE_SERVICE_ROLE_KEY`
   - `AGGIELAND_REGION_ID`
6. Confirm The Q session logging plan for July 12 through July 31 and identify any July 12 sessions already logged in The Q.
7. Have a valid Supabase JWT ready. Prefer an authenticated admin user access token. If using the anon key as JWT, understand the function source does not enforce app admin roles.

### Dry-Run Invocation

Warning: this writes an `import_runs` row. It is not database read-only.

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/nightly-aggieland-import" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --data '{"apply":false}'
```

If using a JWT-compatible anon key instead of a user access token:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/nightly-aggieland-import" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  --data '{"apply":false}'
```

Expected response shape:

```json
{
  "ok": true,
  "applied": false,
  "summary": {
    "paxMasterInserted": 0,
    "totalNewSessions": 0,
    "newSessions": []
  }
}
```

Exact counts may differ.

### Stop Conditions

Stop before apply if any of these are true:

- Dry-run request fails authentication or returns non-200.
- Required Edge Function env vars are missing.
- `paxMasterInserted` is unexpectedly greater than 0.
- `totalNewSessions` includes sessions after July 12 that should be logged in The Q first.
- `newSessions` includes an AO/date already manually logged in The Q but under a different AO spelling.
- Any session has high unresolved PAX that must be handled before import.
- The hosted project has an automatic schedule that cannot be disabled immediately after apply.
- Another operator may be invoking the same function concurrently.

### Apply Invocation

Run once only after dry-run review:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/nightly-aggieland-import" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --data '{"apply":true}'
```

Expected response shape:

```json
{
  "ok": true,
  "applied": true,
  "summary": {
    "inserted": 0,
    "createdAdminFlags": 0
  }
}
```

Exact counts may differ.

### Post-Import Verification

1. Verify the latest `import_runs` row:
   - `type = aggieland_sync`
   - `mode = apply`
   - `status = success`
   - `summary.inserted` matches the apply response.
2. Verify newly inserted sessions by date/AO from `summary.newSessions`.
3. Verify no duplicate AO/date sessions were created for July 12.
4. Review open `admin_flags` created by the apply run.
5. Verify expected new members if `paxMasterInserted > 0`.

### Member Stats Rebuild

Run after final apply:

```sql
select public.rebuild_member_stats_for_region(
  target_region_id := '96c9eef9-3b6e-4365-86cd-51dbeccf231a'
);
```

Then spot-check member stats for:

- PAX in newly inserted sessions.
- Qs in newly inserted sessions.
- FNGs in newly inserted sessions.
- A few unchanged PAX to confirm no broad corruption.

### Shutdown Confirmation

Immediately after apply and stats rebuild:

1. In Supabase Dashboard, disable/delete any Edge Function schedule for `nightly-aggieland-import`.
2. In the hosted database, verify no cron job exists for the function URL or an equivalent HTTP call.
3. Confirm GitHub Actions has no importer workflow enabled.
4. Confirm operators will not use the `Import Runs` apply button again.
5. Plan a source change to remove/disable the manual caller and/or disable the Edge Function registration so future deployments cannot re-enable accidental imports.

### Baseline Refresh Sequence

Do not run this during a read-only audit. After the final import and stats rebuild are verified:

1. Rebuild the baseline plan files from the official baseline inputs:

```bash
node audit/attendance/importAggielandBaseline.js
```

2. Stop unless `audit/attendance/aggieland-baseline-import-plan.md` and `.csv` are clean:
   - all official rows accounted for
   - 0 proposed creates
   - 0 blocked rows
   - 0 duplicate-selected-member-id missing rows
3. Run a baseline import dry-run:

```bash
node audit/attendance/importMemberStatsBaselines.js
```

4. Review:
   - `audit/attendance/member-stats-baseline-import-report.md`
   - `audit/attendance/member-stats-baseline-import-report.csv`
5. If refreshing existing `member_stats_baselines`, use replace mode intentionally:

```bash
node audit/attendance/importMemberStatsBaselines.js --commit --replace
```

6. Re-run or verify effective/member stats behavior after baseline refresh according to the current runtime implementation. Source currently still reads `member_stats` in core paths and has baseline/effective tables off to the side.
