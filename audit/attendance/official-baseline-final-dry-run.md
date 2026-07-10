# Official Baseline Final Dry Run

Generated: 2026-07-09T22:52:20.616Z

## Summary

- Region ID: 96c9eef9-3b6e-4365-86cd-51dbeccf231a
- Source: aggieland_official
- Baseline cutover date: 2026-07-09
- Total official rows: 1236
- Existing members import-ready: 1235
- Proposed creates: 0
- Manually accepted metadata conflicts: 8
- Existing matches accepted after related create: 1
- Manually mapped duplicates: 6
- Blocked unresolved rows: 1

## Blocked Row Details

| Official Pax | Classification | Recommended Decision | Selected Member ID | Reason | Notes |
|---|---|---|---|---|---|
| Tubbs | metadata_conflict | verify_metadata_then_import | 08b44915-9963-4a4d-9d9f-7d25526c28e2 | Unsupported or missing recommended_decision: verify_metadata_then_import. | New FNG member manually verified. |

## Decision Notes

- `official-baseline-import-ready.csv` contains automatic exact-match imports only.
- This dry run applies manual decisions from `official-baseline-manual-decisions-template.csv` without performing inserts or updates.
- Rows accepted after related create should be imported only after the corresponding proposed member create is completed.
