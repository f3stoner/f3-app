# SacTown 2026 YTD dry run — region-local identity policy

Read-only recalculation for January 1–August 30, 2026. No import was executed.

## Revised identity rule

- Each exact source PAX label is a distinct SacTown identity unless the existing SacTown seed already establishes it deterministically.
- Cross-region similarity and activity evidence creates a future merge candidate only.
- DR/location qualifiers are preserved.
- Sea Biscuit and Seabiscuit are separate identities.
- Provisional/FNG labels are importable historical identities and do not block sessions.

## Recalculated totals

- Distinct source identities: 252
- SacTown-local identities to create: 188
- Existing SacTown seed identities reused: 64
- Genuinely unresolved identities: 0
- Final importable sessions: 540
- Attendance relationships: 4436
- Q relationships: 564
- FNG relationships: 134
- Future merge-candidate pairs: 42
- Sessions blocked by identity ambiguity: 0

## Expected database counts

- members: 71 before → 259 after
- sessions: 40 before → 580 after
- attendanceRelationships: 286 before → 4722 after
- qRelationships: 40 before → 604 after
- fngRecords: 7 before → 141 after
- aos: 18 before → 19 after
- sites: 12 before → 12 after
- recurringSchedules: 18 before → 19 after

## Remaining commit blocker

- Target region is currently production/onboarding, not the prior test/active state; approve or correct this classification before any commit.

## Merge-candidate handling

Merge candidates have no effect on member IDs or relationship resolution. They are exported separately for future human adjudication. A later merge must preserve an alias/redirect and migrate references transactionally.
