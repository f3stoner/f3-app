# West Houston post-human-review canonical dry run

## Result

DOGE's explicit decisions were applied to the normalized workbook evidence. No import or database write was performed.

## Before and after

| Measure | Before human review | Post-review canonical | Change |
| --- | ---: | ---: | ---: |
| Members | 1261 | 1194 | -67 |
| Identity collisions requiring a decision | 66 | 1 | -65 |
| Primary sessions eligible before human decisions | 3744 | 3742 | -2 |
| Primary attendance eligible before human decisions | 43132 | 43132 | 0 |
| Primary Q/VQ assignments eligible before human decisions | 3636 | 3636 | 0 |
| Primary explicit FNG evidence eligible before human decisions | 494 | 494 | 0 |
| Unresolved attendance-before-FNG cases | 19 | 19 | 0 |

The complete normalized source layer still contains 4734 BD/DD sessions and 45324 attendance records. The comparable before column above excludes DD and unresolved DR before measuring the effects of human decisions.

## Identity reconciliation

- MERGE: 64 review groups.
- KEEP_SEPARATE: 2 review groups.
- UNRESOLVED: 1 review group.
- WH-ID-034 and WH-ID-035 were joined by the explicit cross-group note `Same as above` and their shared approved name `lightningrod`.
- Canonical member count: 1194.
- DOGE remains a distinct canonical member with a `match_existing` hint for eventual adapter matching.

## Workout reconciliation

- The Knot on 2026-06-13 is one Bootcamp including Java.
- The Knot on 2026-06-25 is one Bootcamp including Gladiator.
- The 2025-07-12 rows whose source location is `Convergence` are represented as `The Corridor 4-year anniversary` at The Corridor. The original location and workbook rows remain in provenance.
- No permanent Convergence AO is created.

## FNG handling

All 19 decisions remain `Unsure`. For every case, the earlier verified attendance date remains canonical first-post history. The later explicit FNG record remains separate evidence with its original AO and workbook-row provenance.

| Review ID | F3 name | Earliest attendance | Later explicit FNG | Canonical first post |
| --- | --- | --- | --- | --- |
| WH-FNG-001 | Anime | 2022-07-23 at The Point | 2026-04-18 at The Iron Gate | 2022-07-23 |
| WH-FNG-002 | Bob the Builder | 2025-11-10 at The HOP | 2025-12-18 at The Point | 2025-11-10 |
| WH-FNG-003 | Cappuccino | 2024-10-01 at The Corridor | 2024-12-03 at The Corridor | 2024-10-01 |
| WH-FNG-004 | Chum | 2024-09-07 at The Corridor | 2026-08-14 at The HOP | 2024-09-07 |
| WH-FNG-005 | Fireball | 2024-10-05 at The Corridor | 2026-01-20 at The Oasis | 2024-10-05 |
| WH-FNG-006 | Fosters | 2024-05-08 at The HOP | 2024-08-19 at The HOP | 2024-05-08 |
| WH-FNG-007 | Haggis | 2021-11-20 at The Point | 2026-07-21 at The Iron Gate | 2021-11-20 |
| WH-FNG-008 | Jasmine | 2022-08-31 at The HOP | 2025-02-04 at The Point | 2022-08-31 |
| WH-FNG-009 | Lasso | 2023-07-18 at The Point | 2025-03-25 at The Point | 2023-07-18 |
| WH-FNG-010 | Moneyball | 2022-09-02 at The HOP | 2025-08-07 at The Point | 2022-09-02 |
| WH-FNG-011 | Parks and Rec | 2023-01-30 at The Branch | 2025-12-18 at The Point | 2023-01-30 |
| WH-FNG-012 | Prince | 2022-10-05 at The HOP | 2023-09-25 at The Branch | 2022-10-05 |
| WH-FNG-013 | Showcase | 2023-02-07 at The Tower | 2025-05-20 at The Corridor | 2023-02-07 |
| WH-FNG-014 | SpaceX | 2024-08-19 at The Branch | 2026-05-30 at The Point | 2024-08-19 |
| WH-FNG-015 | T-Bone | 2021-09-11 at The Point | 2024-11-12 at The Point | 2021-09-11 |
| WH-FNG-016 | Torch | 2025-04-30 at Valhalla | 2025-10-16 at The Valley | 2025-04-30 |
| WH-FNG-017 | Tulip | 2022-09-21 at The HOP | 2025-11-08 at The Corridor | 2022-09-21 |
| WH-FNG-018 | Wasabi | 2025-10-23 at The Tower | 2026-04-28 at The Iron Gate | 2025-10-23 |
| WH-FNG-019 | lightningrod | 2025-06-12 at The Corridor | 2026-08-25 at The Oasis | 2025-06-12 |

## DD and DR exclusion checks

- Excluded DD source sessions: 874.
- Excluded DR source sessions: 116.
- Excluded DD attendance records: 1951; excluded DR attendance records: 241.
- Excluded DD/DR Q assignments: 1; excluded DD/DR FNG records: 0.
- Canonical sessions, attendance, Q assignments, FNG totals, and aggregate-ready records contain neither DD nor DR.
- DD and DR source sessions remain listed with row provenance in `excludedSourceSessions`.

## Validation

- Unique canonical member keys: 1194.
- Unique canonical session keys: 3742.
- Canonical Q/FNG contradictions: 0.
- Every canonical attendance, Q, and FNG record retains source session keys, source member keys, workbook rows, and applicable human review IDs.

## Preserved unresolved decisions (not import blockers)

- WH-ID-009 (Cheese Sticks / Cheesesticks): DOGE selected UNRESOLVED. Preserve the identities independently; no merge is approved.
- WH-FNG-001 through WH-FNG-019: DOGE selected Unsure. Earlier verified attendance remains first-post history and later explicit FNG evidence remains preserved; no further inference is approved.
- WH-KNOW-001 (DR): AOQ confirmation is pending. DR remains outside this approved canonical import and does not block it.
