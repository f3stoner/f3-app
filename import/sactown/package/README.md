# SacTown 2026 YTD historical import package

Generated from the approved region-local v2 manifest. This directory is not a Supabase migration; nothing runs automatically.

## Contract

- Dataset SHA-256: `a768f1ad88cc5329e44b56ad482dde5573ad098a1678b834b7bba03fc4a3264b`
- Source manifest SHA-256: `15d602e8988643934032c497239cdcc2a9b027ef1b199358426b44997b0a11e2`
- Window: 2026-01-01 through 2026-08-30
- Creates 188 members, 540 sessions, retired Rumble AO, and one inactive historical schedule.
- Reuses 64 exact SacTown seed members.
- Preserves 42 cross-region pairs as informational ledger rows only.
- Protects all 40 existing sessions byte-for-byte using JSONB snapshots.
- Keeps SacTown production/onboarding/reporting-disabled/unactivated.

## Execution sequence

1. Re-run the live read-only validator: `node scripts/validateSacTown2026YtdPackage.js --live`.
2. Review `final_dataset.json`, `apply.sql`, and the validator report.
3. Take a database backup or point-in-time recovery marker.
4. Run in a direct PostgreSQL session with `ON_ERROR_STOP`: `psql "$DATABASE_URL" -f import/sactown/package/apply.sql`.
5. Save the complete psql output and run the read-only validator again in applied mode.
6. Follow `RECOVERY.md` if the committed import is later judged incorrect. There is intentionally no generic automated rollback.

The apply file is one transaction. Any failed assertion or SQL statement before commit rolls the entire transaction back.
