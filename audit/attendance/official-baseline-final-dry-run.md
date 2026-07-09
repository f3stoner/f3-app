# Official Baseline Final Dry Run

Generated: 2026-07-09T21:42:24.334Z

## Summary

- Region ID: 96c9eef9-3b6e-4365-86cd-51dbeccf231a
- Source: aggieland_official
- Baseline cutover date: 2026-06-29
- Total official rows: 1229
- Existing members import-ready: 1225
- Proposed creates: 0
- Manually accepted metadata conflicts: 4
- Existing matches accepted after related create: 2
- Manually mapped duplicates: 5
- Blocked unresolved rows: 4

## Blocked Row Details

| Official Pax | Classification | Recommended Decision | Selected Member ID | Reason | Notes |
|---|---|---|---|---|---|
| Shaggy | metadata_conflict | verify_metadata_then_import | - | Unsupported or missing recommended_decision: verify_metadata_then_import. | - |
| Sinko | metadata_conflict | verify_metadata_then_import | - | Unsupported or missing recommended_decision: verify_metadata_then_import. | - |
| Circuit | metadata_conflict | verify_metadata_then_import | - | Unsupported or missing recommended_decision: verify_metadata_then_import. | - |
| Hot Wheels | metadata_conflict | verify_metadata_then_import | - | Unsupported or missing recommended_decision: verify_metadata_then_import. | - |

## Decision Notes

- `official-baseline-import-ready.csv` contains automatic exact-match imports only.
- This dry run applies manual decisions from `official-baseline-manual-decisions-template.csv` without performing inserts or updates.
- Rows accepted after related create should be imported only after the corresponding proposed member create is completed.
