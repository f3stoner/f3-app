# West Houston Identity Collision Review Report

Source: `2024 West Houston Consolidated.xlsx` via normalized analyzer output `import/west-houston/output/west_houston_historical_dry_run.json`.
Workbook SHA-256: `87b9d4d880dc82d01b5ce14e3956793b63f074d27b9c0149b09dc7f6738d684b`. Parser: `west-houston-workbook-v1`.

This is an advisory review artifact. It does not merge, split, rename, or canonically resolve any identity. Human resolution fields remain empty in the machine-readable companion file. False merges should be avoided; use `UNRESOLVED` when workbook evidence is insufficient.

## Summary

- Collision groups: **67**
- Assessment categories: **strong_merge_evidence 6, possible_merge 15, ambiguous 29, possible_separate 16, strong_separate_evidence 1**
- Groups with same-primary-BD conflicts: **0**
- Groups associated with the 18 FNG-date discrepancies: **0**
- Straightforward enough for quick human review: **7**
- Likely requiring West Houston/DOGE/Excel input: **60**

“Quick review” means the workbook has unusually strong evidence, not that the advisory assessment is authoritative. Reviewers should still record `MERGE`, `KEEP_SEPARATE`, or `UNRESOLVED` themselves.

## Collision summary

| Review ID | Candidates | Assessment | Same primary BD | FNG discrepancy | Quick review |
|---|---|---|---:|---:|---:|
| [WH-ID-001](#wh-id-001) | A.1. / A1 | `possible_separate` | no | no | no |
| [WH-ID-002](#wh-id-002) | Baby Shark / BabyShark | `possible_merge` | no | no | no |
| [WH-ID-003](#wh-id-003) | Bill Dance / Billdance | `ambiguous` | no | no | no |
| [WH-ID-004](#wh-id-004) | Bird Shot / Birdshot | `possible_merge` | no | no | no |
| [WH-ID-005](#wh-id-005) | Blue Screen / BlueScreen | `possible_merge` | no | no | no |
| [WH-ID-006](#wh-id-006) | Bob Ross / BobRoss | `possible_merge` | no | no | no |
| [WH-ID-007](#wh-id-007) | Cap It / Capit | `possible_separate` | no | no | no |
| [WH-ID-008](#wh-id-008) | Cat 5 / Cat5 | `ambiguous` | no | no | no |
| [WH-ID-009](#wh-id-009) | Cheese Sticks / Cheesesticks | `ambiguous` | no | no | no |
| [WH-ID-010](#wh-id-010) | Cracker Jack / Crackerjack | `possible_merge` | no | no | no |
| [WH-ID-011](#wh-id-011) | Cross Check / Crosscheck | `possible_merge` | no | no | no |
| [WH-ID-012](#wh-id-012) | Daniel San / Daniel-San / Danielsan | `strong_separate_evidence` | no | no | yes |
| [WH-ID-013](#wh-id-013) | Deep Dish / Deepdish | `ambiguous` | no | no | no |
| [WH-ID-014](#wh-id-014) | @Desperado / Desperado | `possible_merge` | no | no | no |
| [WH-ID-015](#wh-id-015) | Double Double / DoubleDouble | `possible_separate` | no | no | no |
| [WH-ID-016](#wh-id-016) | Down hole / Downhole | `strong_merge_evidence` | no | no | yes |
| [WH-ID-017](#wh-id-017) | Drill Bit / Drillbit | `possible_separate` | no | no | no |
| [WH-ID-018](#wh-id-018) | Farm Boy / Farmboy | `possible_merge` | no | no | no |
| [WH-ID-019](#wh-id-019) | Fix It / FixIt | `ambiguous` | no | no | no |
| [WH-ID-020](#wh-id-020) | Free Fall / Freefall | `possible_separate` | no | no | no |
| [WH-ID-021](#wh-id-021) | Game Boy / Gameboy | `ambiguous` | no | no | no |
| [WH-ID-022](#wh-id-022) | Gator Light / GatorLight | `strong_merge_evidence` | no | no | yes |
| [WH-ID-023](#wh-id-023) | Go Kart / Gokart | `possible_merge` | no | no | no |
| [WH-ID-024](#wh-id-024) | Good Life / GoodLife | `possible_merge` | no | no | no |
| [WH-ID-025](#wh-id-025) | Goose Hunter / Goosehunter | `ambiguous` | no | no | no |
| [WH-ID-026](#wh-id-026) | Hall Pass / Hallpass | `ambiguous` | no | no | no |
| [WH-ID-027](#wh-id-027) | hammer time / Hammertime | `ambiguous` | no | no | no |
| [WH-ID-028](#wh-id-028) | High Rise / High-Rise | `ambiguous` | no | no | no |
| [WH-ID-029](#wh-id-029) | Home slice / Homeslice | `ambiguous` | no | no | no |
| [WH-ID-030](#wh-id-030) | Honey Do / HoneyDo | `possible_separate` | no | no | no |
| [WH-ID-031](#wh-id-031) | Lay Up / LayUp | `ambiguous` | no | no | no |
| [WH-ID-032](#wh-id-032) | Leather Man / Leatherman | `ambiguous` | no | no | no |
| [WH-ID-033](#wh-id-033) | Levi's / Levis | `possible_separate` | no | no | no |
| [WH-ID-034](#wh-id-034) | lighting rod / Lightingrod | `ambiguous` | no | no | no |
| [WH-ID-035](#wh-id-035) | Lightning Rod / Lightningrod | `ambiguous` | no | no | no |
| [WH-ID-036](#wh-id-036) | Lion Heart / Lionheart | `ambiguous` | no | no | no |
| [WH-ID-037](#wh-id-037) | Lost and Find / LOSTandFIND | `ambiguous` | no | no | no |
| [WH-ID-038](#wh-id-038) | Mall Cop / Mallcop | `possible_merge` | no | no | no |
| [WH-ID-039](#wh-id-039) | Man Maker / Manmaker | `possible_separate` | no | no | no |
| [WH-ID-040](#wh-id-040) | Meal Prep / MealPrep | `ambiguous` | no | no | no |
| [WH-ID-041](#wh-id-041) | Mini-Van / Minivan | `ambiguous` | no | no | no |
| [WH-ID-042](#wh-id-042) | Motor City / MotorCity | `possible_merge` | no | no | no |
| [WH-ID-043](#wh-id-043) | Mr Clean / Mr. Clean | `ambiguous` | no | no | no |
| [WH-ID-044](#wh-id-044) | My Space / MySpace | `possible_merge` | no | no | no |
| [WH-ID-045](#wh-id-045) | Nacho Libre / NachoLibre | `strong_merge_evidence` | no | no | yes |
| [WH-ID-046](#wh-id-046) | Night Life / Nightlife | `possible_merge` | no | no | no |
| [WH-ID-047](#wh-id-047) | Nose Plug / NosePlug | `possible_separate` | no | no | no |
| [WH-ID-048](#wh-id-048) | Pac Man / Pac-Man / Pacman | `strong_merge_evidence` | no | no | yes |
| [WH-ID-049](#wh-id-049) | Paper Boy / Paperboy | `possible_separate` | no | no | no |
| [WH-ID-050](#wh-id-050) | Piano Man / Pianoman | `ambiguous` | no | no | no |
| [WH-ID-051](#wh-id-051) | Pit Bull / Pitbull | `possible_separate` | no | no | no |
| [WH-ID-052](#wh-id-052) | Pop Up / Pop-up | `ambiguous` | no | no | no |
| [WH-ID-053](#wh-id-053) | Pre-check / Precheck | `possible_separate` | no | no | no |
| [WH-ID-054](#wh-id-054) | putt Putt / Putt-Putt / PuttPutt | `ambiguous` | no | no | no |
| [WH-ID-055](#wh-id-055) | Rat Rod / Ratrod | `strong_merge_evidence` | no | no | yes |
| [WH-ID-056](#wh-id-056) | Red Eye / Redeye | `ambiguous` | no | no | no |
| [WH-ID-057](#wh-id-057) | Shark Bait / Sharkbait | `ambiguous` | no | no | no |
| [WH-ID-058](#wh-id-058) | Show Boy / Showboy | `possible_separate` | no | no | no |
| [WH-ID-059](#wh-id-059) | Sight Line / Sightline | `ambiguous` | no | no | no |
| [WH-ID-060](#wh-id-060) | Slap shot / Slapshot | `ambiguous` | no | no | no |
| [WH-ID-061](#wh-id-061) | Snow Cap / Snowcap | `possible_separate` | no | no | no |
| [WH-ID-062](#wh-id-062) | Spark Plug / Sparkplug | `possible_merge` | no | no | no |
| [WH-ID-063](#wh-id-063) | Spinal Tap / Spinaltap | `possible_separate` | no | no | no |
| [WH-ID-064](#wh-id-064) | Stir Fry / Stirfry | `strong_merge_evidence` | no | no | yes |
| [WH-ID-065](#wh-id-065) | Super Trooper / SuperTrooper | `ambiguous` | no | no | no |
| [WH-ID-066](#wh-id-066) | Tummy Ache / TummyAche | `ambiguous` | no | no | no |
| [WH-ID-067](#wh-id-067) | White Water / Whitewater | `possible_separate` | no | no | no |

## FNG discrepancy cross-reference

The analyzer lists **18** identities whose attendance predates explicit FNG evidence. **0** of those identities belongs to one of the 67 collision groups. Therefore, none of the currently flagged punctuation/spacing collision groups directly explains an existing FNG-date discrepancy. All 18 discrepancies remain separate review items and are preserved in the JSON file.

| Identity | Key | Earliest attendance | Earliest explicit FNG | Collision group |
|---|---|---|---|---|
| Anime | `wh-member-cccea108673faa0190da` | 2022-07-23 | 2026-04-18 | none |
| Bob the Builder | `wh-member-c6d5bfdf9ba705ce6858` | 2025-11-10 | 2025-12-18 | none |
| Cappuccino | `wh-member-9dd2aca29bda30fcf0a6` | 2024-10-01 | 2024-12-03 | none |
| Chum | `wh-member-24c47fafbc33f51a072b` | 2024-09-07 | 2026-08-14 | none |
| Fireball | `wh-member-53a32cafb40a6f130f95` | 2024-10-05 | 2026-01-20 | none |
| Fosters | `wh-member-d0c78acccd6a64017687` | 2024-05-08 | 2024-08-19 | none |
| Haggis | `wh-member-092f372a435bd7eee916` | 2021-11-20 | 2026-07-21 | none |
| Jasmine | `wh-member-bd848b0b71096b24f61d` | 2022-08-31 | 2025-02-04 | none |
| Lasso | `wh-member-c30d35bb171f0adbce50` | 2023-07-18 | 2025-03-25 | none |
| Moneyball | `wh-member-0dcc3e1fa118621dc3d2` | 2022-09-02 | 2025-08-07 | none |
| Parks and Rec | `wh-member-835f659d9fa19d62d3e2` | 2023-01-30 | 2025-12-18 | none |
| Prince | `wh-member-2a428b5d9a580f561136` | 2022-10-05 | 2023-09-25 | none |
| Showcase | `wh-member-641b0d9c2a656a928470` | 2023-02-07 | 2025-05-20 | none |
| SpaceX | `wh-member-27bbfa4bbd4b856011d6` | 2024-08-19 | 2026-05-30 | none |
| T-Bone | `wh-member-0f4bfe41ae4dfae374de` | 2021-09-11 | 2024-11-12 | none |
| Torch | `wh-member-df11c1ab934efabaf633` | 2025-04-30 | 2025-10-16 | none |
| Tulip | `wh-member-9b29d5b8ababfd7c2450` | 2022-09-21 | 2025-11-08 | none |
| Wasabi | `wh-member-44e5071599f9a28b181d` | 2025-10-23 | 2026-04-28 | none |

## Detailed collision evidence

### WH-ID-001: A.1. / A1

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `a1`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### A.1.

- Identity key: `wh-member-7fbd38753220ff224c89`
- Raw variants: `A.1.` (38)
- Active dates: 2022-08-25 through 2024-04-25
- Attendance: primary BD **38**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 38 (BD 38, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### A1

- Identity key: `wh-member-dd91fcc8adf5dee35fef`
- Raw variants: `A1` (16)
- Active dates: 2022-05-13 through 2024-05-08
- Attendance: primary BD **16**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 9 (BD 9, DD 0), The Corridor 1 (BD 1, DD 0), The HOP 6 (BD 6, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP

#### Comparative evidence

**A.1. vs. A1**

- Name similarity: sequence ratio 0.6667; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-002: Baby Shark / BabyShark

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `babyshark`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Baby Shark

- Identity key: `wh-member-d264714542d37bbd6837`
- Raw variants: `Baby Shark` (653), `Baby shark` (4), `baby Shark` (2)
- Active dates: 2022-01-05 through 2026-09-19
- Attendance: primary BD **491**; DD **167**; DR **4** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 4 (BD 4, DD 0), The Branch 21 (BD 17, DD 4), The Corridor 189 (BD 137, DD 52), The HOP 319 (BD 244, DD 75), The Iron Gate 68 (BD 41, DD 27), The Knot 1 (BD 1, DD 0), The Oasis 3 (BD 3, DD 0), The Point 11 (BD 11, DD 0), The Tower 22 (BD 19, DD 3), The Valley 12 (BD 9, DD 3), Valhalla 8 (BD 5, DD 3)
- Q/VQ: **69**; 2022-02-16 The HOP Q [The HOP!214], 2022-06-10 The HOP Q [The HOP!739], 2022-09-20 The Tower Q [The Tower!33], 2022-12-20 The Point Q [The Point!2692], 2023-01-31 The Tower Q [The Tower!475], 2023-09-27 The HOP Q [The HOP!3011], 2023-10-10 The Corridor Q [The Corridor!203], 2023-10-24 The Tower Q [The Tower!1938], 2023-11-28 The Corridor Q [The Corridor!448], 2024-01-24 The HOP Q [The HOP!3593], 2024-02-12 The HOP Q [The HOP!3698], 2024-02-13 The Point Q [The Point!5109], 2024-02-14 The Branch Q [The Branch!1499], 2024-02-15 The Corridor Q [The Corridor!821], 2024-02-17 The Tower Q [The Tower!2470], 2024-03-05 The Corridor Q [The Corridor!916], 2024-03-13 The HOP Q [The HOP!3852], 2024-05-02 The Corridor Q [The Corridor!1167], 2024-06-27 The Corridor Q [The Corridor!1426], 2024-08-10 The Tower Q [The Tower!3265], 2024-08-23 The HOP Q [The HOP!4658], 2024-09-24 The Valley Q [The Valley!39], 2024-10-01 The Corridor Q [The Corridor!1759], 2024-11-07 The Corridor Q [The Corridor!1930], 2024-11-16 The Corridor Q [The Corridor!1960], 2024-12-17 The Corridor Q [The Corridor!2057], 2025-01-21 The Corridor Q [The Corridor!2153], 2025-02-18 The Tower Q [The Tower!4132], 2025-03-05 The HOP Q [The HOP!5646], 2025-03-19 The HOP Q [The HOP!5703], 2025-03-20 The Point Q [The Point!7498], 2025-03-26 The Branch Q [The Branch!3202], 2025-03-27 The Tower Q [The Tower!4362], 2025-04-01 The Valley Q [The Valley!413], 2025-04-24 The Corridor Q [The Corridor!2516], 2025-05-06 The Corridor Q [The Corridor!2561], 2025-06-04 The HOP Q [The HOP!6129], 2025-06-10 The Point Q [The Point!7944], 2025-06-19 The Oasis Q [The Oasis!311], 2025-06-27 The HOP Q [The HOP!6279], 2025-07-01 The Tower Q [The Tower!4838], 2025-07-02 The HOP Q [The HOP!6306], 2025-07-22 The Corridor Q [The Corridor!2845], 2025-08-19 The Corridor Q [The Corridor!2971], 2025-08-20 The HOP Q [The HOP!6590], 2025-09-16 The Corridor Q [The Corridor!3081], 2025-10-21 The Corridor Q [The Corridor!3212], 2025-11-26 The HOP Q [The HOP!7245], 2025-12-09 The Corridor Q [The Corridor!3443], 2025-12-17 The HOP Q [The HOP!7352], 2026-01-08 The Iron Gate Q [The Iron Gate!14], 2026-01-17 The Iron Gate Q [The Iron Gate!45], 2026-01-24 The Iron Gate Q [The Iron Gate!65], 2026-02-02 The HOP Q [The HOP!7572], 2026-03-24 The Iron Gate Q [The Iron Gate!268], 2026-04-03 The HOP Q [The HOP!7864], 2026-04-14 The Iron Gate Q [The Iron Gate!339], 2026-05-04 The HOP Q [The HOP!8100], 2026-05-05 The Point Q [The Point!9924], 2026-05-08 The Branch Q [The Branch!4875], 2026-05-11 The Branch Q [The Branch!4889], 2026-05-21 The Valley Q [The Valley!1638], 2026-05-27 Valhalla Q [Valhalla!761], 2026-06-12 The HOP Q [The HOP!8301], 2026-06-23 The Corridor Q [The Corridor!4258], 2026-08-04 The Iron Gate Q [The Iron Gate!762], 2026-08-22 The Oasis Q [The Oasis!2510], 2026-08-25 The Corridor Q [The Corridor!4513], 2026-09-03 The Iron Gate Q [The Iron Gate!934]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Iron Gate, The Knot, The Oasis, The Point, The Tower, The Valley, Valhalla

#### BabyShark

- Identity key: `wh-member-4f7bc87f5ad864d355d6`
- Raw variants: `BabyShark` (1), `babyshark` (1)
- Active dates: 2025-06-12 through 2025-08-21
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The Oasis 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Oasis

#### Comparative evidence

**Baby Shark vs. BabyShark**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor, The Oasis
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-003: Bill Dance / Billdance

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `billdance`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Bill Dance

- Identity key: `wh-member-61272a351ac48016d4e1`
- Raw variants: `Bill Dance` (9)
- Active dates: 2025-03-18 through 2026-07-30
- Attendance: primary BD **9**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The Valley 8 (BD 8, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch, The Valley

#### Billdance

- Identity key: `wh-member-8d14adf36691dbf12b6b`
- Raw variants: `Billdance` (1)
- Active dates: 2024-01-09 through 2024-01-09
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Comparative evidence

**Bill Dance vs. Billdance**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-8d14adf36691dbf12b6b` last appears 2024-01-09; `wh-member-61272a351ac48016d4e1` first appears 2025-03-18 (434 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-004: Bird Shot / Birdshot

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `birdshot`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Bird Shot

- Identity key: `wh-member-73984bf163fe2eb7d4e5`
- Raw variants: `Bird Shot` (1)
- Active dates: 2026-08-18 through 2026-08-18
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Iron Gate 1 (BD 1, DD 0)
- Q/VQ: **1**; 2026-08-18 The Iron Gate Q [The Iron Gate!891]
- Explicit FNG evidence: none
- Source sheets: The Iron Gate

#### Birdshot

- Identity key: `wh-member-b24df247bbf28243d25b`
- Raw variants: `Birdshot` (299)
- Active dates: 2024-07-19 through 2026-09-22
- Attendance: primary BD **196**; DD **102**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 7 (BD 5, DD 2), The Corridor 130 (BD 70, DD 60), The HOP 98 (BD 69, DD 29), The Iron Gate 5 (BD 2, DD 3), The Oasis 1 (BD 1, DD 0), The Point 1 (BD 1, DD 0), The Tower 31 (BD 25, DD 6), The Valley 2 (BD 1, DD 1), Valhalla 23 (BD 22, DD 1)
- Q/VQ: **14**; 2024-09-06 The HOP VQ [The HOP!4734], 2024-11-04 The HOP Q [The HOP!5031], 2025-01-15 Valhalla Q [Valhalla!15], 2025-03-04 The Tower Q [The Tower!4261], 2025-04-23 Valhalla Q [Valhalla!100], 2025-06-04 Valhalla Q [Valhalla!157], 2025-06-09 The HOP Q [The HOP!6161], 2025-06-12 The Tower Q [The Tower!4745], 2025-08-07 The Corridor Q [The Corridor!2910], 2025-09-11 The Corridor Q [The Corridor!3072], 2025-10-23 The Corridor Q [The Corridor!3226], 2025-11-13 The Tower Q [The Tower!5666], 2026-01-13 The Iron Gate Q [The Iron Gate!30], 2026-04-13 The HOP Q [The HOP!7982]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Iron Gate, The Oasis, The Point, The Tower, The Valley, Valhalla

#### Comparative evidence

**Bird Shot vs. Birdshot**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Iron Gate
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-005: Blue Screen / BlueScreen

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `bluescreen`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Blue Screen

- Identity key: `wh-member-9bcdc4e4687089b138e5`
- Raw variants: `Blue Screen` (636), `Blue screen` (2)
- Active dates: 2021-09-07 through 2026-09-19
- Attendance: primary BD **637**; DD **0**; DR **1** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 1 (BD 1, DD 0), The Branch 33 (BD 33, DD 0), The Corridor 2 (BD 2, DD 0), The HOP 18 (BD 18, DD 0), The Iron Gate 2 (BD 2, DD 0), The Knot 2 (BD 2, DD 0), The Oasis 2 (BD 2, DD 0), The Point 563 (BD 563, DD 0), The Tower 6 (BD 6, DD 0), The Valley 5 (BD 5, DD 0), Valhalla 3 (BD 3, DD 0)
- Q/VQ: **30**; 2021-09-21 The Point Q [The Point!74], 2021-10-21 The Point Q [The Point!224], 2022-01-20 The Point Q [The Point!737], 2022-02-22 The Point Q [The Point!977], 2022-04-07 The Point Q [The Point!1210], 2022-09-15 The Point Q [The Point!2186], 2022-10-25 The Point Q [The Point!2406], 2022-10-31 The Branch Q [The Branch!80], 2022-12-29 The Point Q [The Point!2727], 2023-03-25 The Point Q [The Point!3194], 2023-06-13 The Point Q [The Point!3581], 2023-09-02 The Point Q [The Point!4070], 2023-12-23 The Point Q [The Point!4804], 2024-02-17 The Point Q [The Point!5143], 2024-05-07 The Point Q [The Point!5687], 2024-11-09 The Point Q [The Point!6805], 2024-12-17 The Point Q [The Point!6967], 2025-01-25 The Point Q [The Point!7161], 2025-04-12 The Point Q [The Point!7635], 2025-05-10 The Point Q [The Point!7793], 2025-08-19 The Point Q [The Point!8336], 2025-09-30 The Valley Q [The Valley!980], 2025-10-30 The Point Q [The Point!8828], 2025-11-20 The Point Q [The Point!8950], 2026-01-15 The Point Q [The Point!9250], 2026-05-23 The Point Q [The Point!10014], 2026-06-18 The Knot Q [The Knot!167], 2026-06-23 The Point Q [The Point!10118], 2026-07-23 The Point Q [The Point!10238], 2026-08-15 The Point Q [The Point!10337]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Iron Gate, The Knot, The Oasis, The Point, The Tower, The Valley, Valhalla

#### BlueScreen

- Identity key: `wh-member-68b39c281635e3302e24`
- Raw variants: `BlueScreen` (1), `Bluescreen` (1)
- Active dates: 2025-08-14 through 2025-08-16
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The Oasis 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Oasis

#### Comparative evidence

**Blue Screen vs. BlueScreen**

- Name similarity: sequence ratio 0.9524; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor, The Oasis
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-006: Bob Ross / BobRoss

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `bobross`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Bob Ross

- Identity key: `wh-member-950642bd3a11fd875d50`
- Raw variants: `Bob Ross` (8)
- Active dates: 2024-05-30 through 2026-07-18
- Attendance: primary BD **8**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 8 (BD 8, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### BobRoss

- Identity key: `wh-member-c3ba424666c9d3b072a0`
- Raw variants: `BobRoss` (1)
- Active dates: 2026-07-16 through 2026-07-16
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Comparative evidence

**Bob Ross vs. BobRoss**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Point
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-007: Cap It / Capit

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `capit`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Cap It

- Identity key: `wh-member-52bf1a2bef93197aa4f3`
- Raw variants: `Cap It` (2)
- Active dates: 2023-02-25 through 2025-07-15
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Tower 1 (BD 1, DD 0), The Valley 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Tower, The Valley

#### Capit

- Identity key: `wh-member-e52368538296d22e27be`
- Raw variants: `Capit` (2)
- Active dates: 2022-01-12 through 2023-09-16
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The HOP 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP

#### Comparative evidence

**Cap It vs. Capit**

- Name similarity: sequence ratio 0.9091; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-008: Cat 5 / Cat5

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `cat5`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Cat 5

- Identity key: `wh-member-03ceb7954a6050a5c455`
- Raw variants: `Cat 5` (2)
- Active dates: 2022-08-25 through 2022-08-30
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Cat5

- Identity key: `wh-member-4509b1ab6283e3c651cc`
- Raw variants: `Cat5` (1)
- Active dates: 2025-04-23 through 2025-04-23
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch

#### Comparative evidence

**Cat 5 vs. Cat5**

- Name similarity: sequence ratio 0.8889; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-03ceb7954a6050a5c455` last appears 2022-08-30; `wh-member-4509b1ab6283e3c651cc` first appears 2025-04-23 (967 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-009: Cheese Sticks / Cheesesticks

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `cheesesticks`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Cheese Sticks

- Identity key: `wh-member-30fe4aff70503a26e0b6`
- Raw variants: `Cheese Sticks` (1)
- Active dates: 2026-03-04 through 2026-03-04
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: Valhalla 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: Valhalla

#### Cheesesticks

- Identity key: `wh-member-c665fd21ebeb83c77f47`
- Raw variants: `Cheesesticks` (1)
- Active dates: 2026-03-05 through 2026-03-05
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Comparative evidence

**Cheese Sticks vs. Cheesesticks**

- Name similarity: sequence ratio 0.9600; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-30fe4aff70503a26e0b6` last appears 2026-03-04; `wh-member-c665fd21ebeb83c77f47` first appears 2026-03-05 (1 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-010: Cracker Jack / Crackerjack

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `crackerjack`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Cracker Jack

- Identity key: `wh-member-7303f84a872003d374d2`
- Raw variants: `Cracker Jack` (1)
- Active dates: 2025-12-23 through 2025-12-23
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Crackerjack

- Identity key: `wh-member-2f558c84d8136143034b`
- Raw variants: `Crackerjack` (87)
- Active dates: 2025-07-08 through 2026-09-19
- Attendance: primary BD **87**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 4 (BD 4, DD 0), The HOP 1 (BD 1, DD 0), The Iron Gate 40 (BD 40, DD 0), The Tower 42 (BD 42, DD 0)
- Q/VQ: **4**; 2025-10-30 The Tower VQ [The Tower!5582], 2026-04-23 The Iron Gate Q [The Iron Gate!370], 2026-05-30 The Iron Gate Q [The Iron Gate!510], 2026-08-06 The Iron Gate Q [The Iron Gate!770]
- Explicit FNG evidence: 2025-07-08 The Tower [The Tower!4903]
- Source sheets: The Corridor, The HOP, The Iron Gate, The Tower

#### Comparative evidence

**Cracker Jack vs. Crackerjack**

- Name similarity: sequence ratio 0.9565; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-011: Cross Check / Crosscheck

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `crosscheck`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Cross Check

- Identity key: `wh-member-d47722178f8b4bcd814b`
- Raw variants: `Cross Check` (10), `Cross check` (4)
- Active dates: 2025-08-26 through 2026-04-28
- Attendance: primary BD **14**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 14 (BD 14, DD 0)
- Q/VQ: **1**; 2025-11-04 The Corridor Q [The Corridor!3272]
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Crosscheck

- Identity key: `wh-member-a388c23379edeb5eda81`
- Raw variants: `Crosscheck` (18)
- Active dates: 2023-09-12 through 2024-09-12
- Attendance: primary BD **18**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 18 (BD 18, DD 0)
- Q/VQ: **2**; 2023-10-12 The Corridor Q [The Corridor!223], 2024-09-10 The Corridor Q [The Corridor!1675]
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Comparative evidence

**Cross Check vs. Crosscheck**

- Name similarity: sequence ratio 0.9524; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Corridor
- Transition: `wh-member-a388c23379edeb5eda81` last appears 2024-09-12; `wh-member-d47722178f8b4bcd814b` first appears 2025-08-26 (348 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-012: Daniel San / Daniel-San / Danielsan

Assessment: `strong_separate_evidence`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `danielsan`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- More than one candidate has explicit FNG evidence on different dates, which supports separate identities unless an FNG marker is erroneous.

#### Daniel San

- Identity key: `wh-member-547ef7bac21276177f49`
- Raw variants: `Daniel San` (1)
- Active dates: 2024-07-06 through 2024-07-06
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Tower 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Tower

#### Daniel-San

- Identity key: `wh-member-5e812c5891c1d8baed6a`
- Raw variants: `Daniel-San` (2)
- Active dates: 2024-07-04 through 2024-08-08
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2024-07-04 The Corridor [The Corridor!1462]
- Source sheets: The Corridor

#### Danielsan

- Identity key: `wh-member-6bc8374c3c42edf30797`
- Raw variants: `Danielsan` (1)
- Active dates: 2025-05-15 through 2025-05-15
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2025-05-15 The Corridor [The Corridor!2619]
- Source sheets: The Corridor

#### Comparative evidence

**Daniel San vs. Daniel-San**

- Name similarity: sequence ratio 0.9000; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).
**Daniel San vs. Danielsan**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-547ef7bac21276177f49` last appears 2024-07-06; `wh-member-6bc8374c3c42edf30797` first appears 2025-05-15 (313 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).
**Daniel-San vs. Danielsan**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Corridor
- Transition: `wh-member-5e812c5891c1d8baed6a` last appears 2024-08-08; `wh-member-6bc8374c3c42edf30797` first appears 2025-05-15 (280 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: yes.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-013: Deep Dish / Deepdish

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `deepdish`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Deep Dish

- Identity key: `wh-member-95a9414dcdc03eb6f737`
- Raw variants: `Deep Dish` (191), `Deep dish` (11), `deep dish` (3)
- Active dates: 2025-02-05 through 2026-09-19
- Attendance: primary BD **204**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The HOP 183 (BD 183, DD 0), The Iron Gate 10 (BD 9, DD 1), The Knot 6 (BD 6, DD 0), The Tower 5 (BD 5, DD 0)
- Q/VQ: **2**; 2026-01-14 The HOP Q [The HOP!7464], 2026-04-22 The HOP Q [The HOP!8027]
- Explicit FNG evidence: 2025-02-05 The HOP [The HOP!5516]
- Source sheets: The Corridor, The HOP, The Iron Gate, The Knot, The Tower

#### Deepdish

- Identity key: `wh-member-6f322616326a0169411a`
- Raw variants: `Deepdish` (6), `deepdish` (5)
- Active dates: 2025-07-04 through 2026-08-08
- Attendance: primary BD **11**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 2 (BD 2, DD 0), The Corridor 1 (BD 1, DD 0), The Knot 7 (BD 7, DD 0), The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The Knot, The Point

#### Comparative evidence

**Deep Dish vs. Deepdish**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor, The Knot
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-014: @Desperado / Desperado

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `desperado`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### @Desperado

- Identity key: `wh-member-ec21039f6d80a543acd9`
- Raw variants: `@Desperado` (1)
- Active dates: 2025-09-09 through 2025-09-09
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Desperado

- Identity key: `wh-member-40b4a760ce27161cd700`
- Raw variants: `Desperado` (130)
- Active dates: 2023-02-25 through 2026-09-22
- Attendance: primary BD **130**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 123 (BD 123, DD 0), The Point 1 (BD 1, DD 0), The Tower 5 (BD 5, DD 0), The Valley 1 (BD 1, DD 0)
- Q/VQ: **10**; 2023-11-14 The Corridor Q [The Corridor!383], 2024-01-23 The Corridor Q [The Corridor!733], 2024-09-05 The Corridor Q [The Corridor!1655], 2024-11-21 The Corridor Q [The Corridor!1984], 2025-02-13 The Corridor Q [The Corridor!2238], 2025-04-17 The Corridor Q [The Corridor!2494], 2025-08-05 The Corridor Q [The Corridor!2891], 2025-09-23 The Corridor Q [The Corridor!3124], 2026-01-22 The Corridor Q [The Corridor!3617], 2026-03-26 The Corridor Q [The Corridor!3891]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Point, The Tower, The Valley

#### Comparative evidence

**@Desperado vs. Desperado**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-015: Double Double / DoubleDouble

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `doubledouble`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Candidates occur on the same date at different primary workouts 1 time(s), supporting separate identities but not ruling out duplicate logging across workouts.

#### Double Double

- Identity key: `wh-member-263c1101b9d1f01e2c3c`
- Raw variants: `Double Double` (18)
- Active dates: 2026-02-20 through 2026-09-19
- Attendance: primary BD **18**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The HOP 9 (BD 9, DD 0), The Iron Gate 2 (BD 2, DD 0), The Knot 1 (BD 1, DD 0), The Oasis 2 (BD 2, DD 0), The Tower 2 (BD 2, DD 0), The Valley 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch, The HOP, The Iron Gate, The Knot, The Oasis, The Tower, The Valley

#### DoubleDouble

- Identity key: `wh-member-0d324476f202556ff001`
- Raw variants: `DoubleDouble` (45)
- Active dates: 2026-01-31 through 2026-09-17
- Attendance: primary BD **44**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 45 (BD 44, DD 1)
- Q/VQ: **4**; 2026-04-23 The Corridor VQ [The Corridor!4006], 2026-06-18 The Corridor Q [The Corridor!4250], 2026-07-16 The Corridor Q [The Corridor!4387], 2026-08-27 The Corridor Q [The Corridor!4526]
- Explicit FNG evidence: 2026-01-31 The Corridor [The Corridor!3662]
- Source sheets: The Corridor

#### Comparative evidence

**Double Double vs. DoubleDouble**

- Name similarity: sequence ratio 0.9600; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences:
  - 2026-07-09: Double Double at The Oasis / Bootcamp [The Oasis!2273], session `wh-session-76a6a8a84dd9a5925881`; DoubleDouble at The Corridor / Bootcamp [The Corridor!4311], session `wh-session-a3b9ad79a83d7013a076`.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-016: Down hole / Downhole

Assessment: `strong_merge_evidence`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `downhole`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and one spelling stops within 120 days of the other starting, with no same-session or same-date conflict.

#### Down hole

- Identity key: `wh-member-1875d3f37419b5f81fe8`
- Raw variants: `Down hole` (1)
- Active dates: 2025-06-03 through 2025-06-03
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Downhole

- Identity key: `wh-member-94a1b94f08e593ca762f`
- Raw variants: `Downhole` (3)
- Active dates: 2025-06-05 through 2025-08-14
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 3 (BD 3, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Comparative evidence

**Down hole vs. Downhole**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Corridor
- Transition: `wh-member-1875d3f37419b5f81fe8` last appears 2025-06-03; `wh-member-94a1b94f08e593ca762f` first appears 2025-06-05 (2 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-017: Drill Bit / Drillbit

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `drillbit`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Drill Bit

- Identity key: `wh-member-0bdc2f2981570bfa3e34`
- Raw variants: `Drill Bit` (54)
- Active dates: 2026-05-02 through 2026-09-19
- Attendance: primary BD **51**; DD **3**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 2 (BD 2, DD 0), The Corridor 3 (BD 3, DD 0), The HOP 2 (BD 2, DD 0), The Iron Gate 46 (BD 43, DD 3), Valhalla 1 (BD 1, DD 0)
- Q/VQ: **6**; 2026-06-30 The Iron Gate VQ [The Iron Gate!630], 2026-07-21 The Iron Gate Q [The Iron Gate!702], 2026-08-29 The Iron Gate Q [The Iron Gate!913], 2026-09-12 The Iron Gate Q [The Iron Gate!981], 2026-09-15 The Iron Gate Q [The Iron Gate!997], 2026-09-19 The Iron Gate Q [The Iron Gate!1020]
- Explicit FNG evidence: 2026-05-02 The Iron Gate [The Iron Gate!406]
- Source sheets: The Branch, The Corridor, The HOP, The Iron Gate, Valhalla

#### Drillbit

- Identity key: `wh-member-31554efd2e238bc24e66`
- Raw variants: `Drillbit` (1)
- Active dates: 2026-05-28 through 2026-05-28
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Tower 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Tower

#### Comparative evidence

**Drill Bit vs. Drillbit**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-018: Farm Boy / Farmboy

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `farmboy`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Farm Boy

- Identity key: `wh-member-93742f7c4ce409ee9e0e`
- Raw variants: `Farm Boy` (135)
- Active dates: 2025-04-08 through 2026-08-22
- Attendance: primary BD **133**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 133 (BD 133, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2025-04-08 The Oasis [The Oasis!41]
- Source sheets: The Oasis

#### Farmboy

- Identity key: `wh-member-cfec556556bed47c6dae`
- Raw variants: `Farmboy` (1)
- Active dates: 2026-07-30 through 2026-07-30
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### Comparative evidence

**Farm Boy vs. Farmboy**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Oasis
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-019: Fix It / FixIt

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `fixit`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Fix It

- Identity key: `wh-member-b1ebcb1ada2f8c752e7e`
- Raw variants: `Fix It` (161)
- Active dates: 2023-02-25 through 2026-05-28
- Attendance: primary BD **148**; DD **13**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 157 (BD 144, DD 13), The HOP 1 (BD 1, DD 0), The Tower 2 (BD 2, DD 0), The Valley 1 (BD 1, DD 0)
- Q/VQ: **8**; 2023-09-09 The Corridor Q [The Corridor!9], 2023-11-09 The Corridor Q [The Corridor!365], 2024-01-20 The Corridor Q [The Corridor!713], 2024-10-12 The Corridor Q [The Corridor!1821], 2025-01-30 The Corridor Q [The Corridor!2182], 2025-03-22 The Corridor Q [The Corridor!2379], 2025-05-03 The Corridor Q [The Corridor!2551], 2025-06-26 The Corridor Q [The Corridor!2761]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Tower, The Valley

#### FixIt

- Identity key: `wh-member-1c913a058fa3653d77f7`
- Raw variants: `FixIt` (2), `fixit` (1)
- Active dates: 2022-01-01 through 2025-06-12
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The Point 2 (BD 2, DD 0)
- Q/VQ: **1**; 2023-12-05 The Point Q [The Point!4685]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Point

#### Comparative evidence

**Fix It vs. FixIt**

- Name similarity: sequence ratio 0.9091; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-020: Free Fall / Freefall

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `freefall`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Free Fall

- Identity key: `wh-member-5ca9ac60e39b44e70f7d`
- Raw variants: `Free Fall` (58)
- Active dates: 2023-09-09 through 2024-11-26
- Attendance: primary BD **58**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 58 (BD 58, DD 0)
- Q/VQ: **6**; 2024-02-13 The Corridor VQ [The Corridor!812], 2024-02-29 The Corridor Q [The Corridor!901], 2024-04-06 The Corridor Q [The Corridor!1057], 2024-05-25 The Corridor Q [The Corridor!1259], 2024-07-20 The Corridor Q [The Corridor!1497], 2024-09-28 The Corridor Q [The Corridor!1754]
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Freefall

- Identity key: `wh-member-83bfbfba41e6bca3eb6b`
- Raw variants: `Freefall` (10)
- Active dates: 2023-10-16 through 2024-08-09
- Attendance: primary BD **10**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 10 (BD 10, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The HOP

#### Comparative evidence

**Free Fall vs. Freefall**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-021: Game Boy / Gameboy

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `gameboy`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Game Boy

- Identity key: `wh-member-3bfe2fadc87e932dc103`
- Raw variants: `Game Boy` (8), `Game boy` (1)
- Active dates: 2023-06-27 through 2026-09-19
- Attendance: primary BD **9**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 2 (BD 2, DD 0), The Iron Gate 1 (BD 1, DD 0), The Tower 6 (BD 6, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2023-06-27 The Tower [The Tower!1381]
- Source sheets: The HOP, The Iron Gate, The Tower

#### Gameboy

- Identity key: `wh-member-98d9de0737e489b5e6f7`
- Raw variants: `Gameboy` (3)
- Active dates: 2024-01-06 through 2026-02-11
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The HOP 1 (BD 1, DD 0), The Tower 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Tower

#### Comparative evidence

**Game Boy vs. Gameboy**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The HOP, The Tower
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-022: Gator Light / GatorLight

Assessment: `strong_merge_evidence`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `gatorlight`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and one spelling stops within 120 days of the other starting, with no same-session or same-date conflict.

#### Gator Light

- Identity key: `wh-member-478a62bd1eb304336018`
- Raw variants: `Gator Light` (2)
- Active dates: 2025-10-14 through 2025-12-13
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### GatorLight

- Identity key: `wh-member-9d4b9de30075b1737b11`
- Raw variants: `GatorLight` (1)
- Active dates: 2025-08-14 through 2025-08-14
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### Comparative evidence

**Gator Light vs. GatorLight**

- Name similarity: sequence ratio 0.9524; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Oasis
- Transition: `wh-member-9d4b9de30075b1737b11` last appears 2025-08-14; `wh-member-478a62bd1eb304336018` first appears 2025-10-14 (61 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-023: Go Kart / Gokart

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `gokart`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Go Kart

- Identity key: `wh-member-1bf1645929058f571f4e`
- Raw variants: `Go Kart` (105)
- Active dates: 2023-10-03 through 2026-09-22
- Attendance: primary BD **105**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 76 (BD 76, DD 0), The HOP 7 (BD 7, DD 0), The Point 9 (BD 9, DD 0), The Tower 2 (BD 2, DD 0), The Valley 4 (BD 4, DD 0), Valhalla 7 (BD 7, DD 0)
- Q/VQ: **12**; 2024-03-07 The Corridor Q [The Corridor!933], 2024-05-16 The Corridor Q [The Corridor!1226], 2024-09-03 The Corridor Q [The Corridor!1644], 2024-10-22 The Corridor Q [The Corridor!1856], 2025-02-06 The Corridor Q [The Corridor!2217], 2025-03-27 The Corridor Q [The Corridor!2384], 2025-10-18 The Corridor Q [The Corridor!3203], 2025-12-04 The Corridor Q [The Corridor!3427], 2026-02-26 The Corridor Q [The Corridor!3767], 2026-04-21 The Corridor Q [The Corridor!3995], 2026-08-04 The Corridor Q [The Corridor!4442], 2026-09-22 The Corridor Q [The Corridor!4605]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Point, The Tower, The Valley, Valhalla

#### Gokart

- Identity key: `wh-member-3a2aa35ea48067cac6c0`
- Raw variants: `Gokart` (2)
- Active dates: 2023-02-23 through 2025-07-10
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Comparative evidence

**Go Kart vs. Gokart**

- Name similarity: sequence ratio 0.9231; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Point
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-024: Good Life / GoodLife

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `goodlife`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Good Life

- Identity key: `wh-member-e444548ad31752048fb8`
- Raw variants: `Good Life` (705)
- Active dates: 2022-06-09 through 2026-09-19
- Attendance: primary BD **683**; DD **21**; DR **1** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 1 (BD 1, DD 0), The Branch 262 (BD 243, DD 19), The Corridor 20 (BD 20, DD 0), The HOP 24 (BD 24, DD 0), The Iron Gate 5 (BD 5, DD 0), The Knot 1 (BD 1, DD 0), The Oasis 2 (BD 2, DD 0), The Point 197 (BD 197, DD 0), The Tower 15 (BD 15, DD 0), The Valley 151 (BD 150, DD 1), Valhalla 26 (BD 25, DD 1)
- Q/VQ: **91**; 2022-11-12 The Point Q [The Point!2505], 2022-12-02 The HOP VQ [The HOP!1789], 2022-12-12 The Branch Q [The Branch!177], 2023-01-02 The Branch Q [The Branch!219], 2023-02-18 The Point Q [The Point!3001], 2023-02-20 The Branch Q [The Branch!353], 2023-03-06 The Branch Q [The Branch!394], 2023-04-10 The Branch Q [The Branch!481], 2023-04-15 The Point Q [The Point!3305], 2023-05-05 The Branch Q [The Branch!560], 2023-06-06 The Tower Q [The Tower!1262], 2023-06-09 The Branch Q [The Branch!643], 2023-06-10 The Point Q [The Point!3569], 2023-07-10 The Branch Q [The Branch!708], 2023-08-12 The Point Q [The Point!3930], 2023-08-18 The Branch Q [The Branch!813], 2023-09-18 The Branch Q [The Branch!908], 2023-10-06 The Branch Q [The Branch!972], 2023-10-12 The Point Q [The Point!4354], 2023-11-17 The Branch Q [The Branch!1135], 2023-11-21 The Point Q [The Point!4589], 2023-12-14 The Corridor Q [The Corridor!552], 2023-12-18 The Branch Q [The Branch!1245], 2024-01-13 The Point Q [The Point!4919], 2024-01-29 The Branch Q [The Branch!1416], 2024-02-26 The Branch Q [The Branch!1572], 2024-02-29 The Point Q [The Point!5224], 2024-04-19 The Branch Q [The Branch!1863], 2024-04-25 The Point Q [The Point!5600], 2024-05-13 The Branch Q [The Branch!1988], 2024-05-28 The Point Q [The Point!5855], 2024-06-10 The HOP Q [The HOP!4293], 2024-06-11 The Corridor Q [The Corridor!1342], 2024-06-14 The Branch Q [The Branch!2130], 2024-06-15 The Point Q [The Point!5981], 2024-08-10 The Point Q [The Point!6293], 2024-08-26 The Branch Q [The Branch!2446], 2024-09-12 The Valley Q [The Valley!22], 2024-09-27 The Branch Q [The Branch!2608], 2024-09-28 The Point Q [The Point!6569], 2024-10-08 The Valley Q [The Valley!67], 2024-10-17 The Valley Q [The Valley!87], 2024-10-21 The Branch Q [The Branch!2697], 2024-10-22 The Point Q [The Point!6703], 2024-11-21 The Valley Q [The Valley!159], 2024-11-22 The Branch Q [The Branch!2831], 2024-11-23 The Point Q [The Point!6858], 2024-12-03 The Valley Q [The Valley!172], 2024-12-16 The Branch Q [The Branch!2907], 2024-12-28 The Point Q [The Point!7032], 2024-12-31 The Valley Q [The Valley!267], 2025-01-17 The Branch Q [The Branch!2989], 2025-01-23 The Valley Q [The Valley!301], 2025-02-15 The Point Q [The Point!7343], 2025-02-17 The Branch Q [The Branch!3089], 2025-02-18 The Valley Q [The Valley!348], 2025-03-08 The Point Q [The Point!7450], 2025-03-20 The Valley Q [The Valley!390], 2025-04-14 The Branch Q [The Branch!3296], 2025-05-08 The Valley Q [The Valley!519], 2025-05-16 The Branch Q [The Branch!3412], 2025-06-07 The Tower Q [The Tower!4715], 2025-06-10 The Valley Q [The Valley!597], 2025-06-14 The Point Q [The Point!7968], 2025-06-20 The Branch Q [The Branch!3517], 2025-06-28 The Corridor Q [The Corridor!2763], 2025-07-11 The Branch Q [The Branch!3605], 2025-08-11 The Branch Q [The Branch!3772], 2025-08-19 The Valley Q [The Valley!847], 2025-08-23 The Corridor Q [The Corridor!2983], 2025-09-02 The Valley Q [The Valley!883], 2025-09-13 The Point Q [The Point!8526], 2025-10-16 The Valley Q [The Valley!1009], 2025-11-19 Valhalla Q [Valhalla!498], 2025-11-20 The Tower Q [The Tower!5720], 2025-11-22 The Corridor Q [The Corridor!3378], 2025-12-11 The Valley Q [The Valley!1196], 2025-12-30 The Valley Q [The Valley!1245], 2026-02-03 The Valley Q [The Valley!1366], 2026-04-07 The Valley Q [The Valley!1525], 2026-04-11 The Corridor Q [The Corridor!3959], 2026-05-05 The Tower Q [The Tower!6522], 2026-05-19 The Oasis Q [The Oasis!2064], 2026-05-28 The Corridor Q [The Corridor!4180], 2026-05-30 The Point Q [The Point!10033], 2026-06-09 The Valley Q [The Valley!1697], 2026-06-20 The Tower Q [The Tower!6724], 2026-07-14 The Valley Q [The Valley!1803], 2026-07-28 The Valley Q [The Valley!1837], 2026-08-01 The Point Q [The Point!10285], 2026-08-29 The Knot Q [The Knot!440]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Iron Gate, The Knot, The Oasis, The Point, The Tower, The Valley, Valhalla

#### GoodLife

- Identity key: `wh-member-3f5d470084e08ec93e8b`
- Raw variants: `GoodLife` (1)
- Active dates: 2025-08-26 through 2025-08-26
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### Comparative evidence

**Good Life vs. GoodLife**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Oasis
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-025: Goose Hunter / Goosehunter

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `goosehunter`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Goose Hunter

- Identity key: `wh-member-66b13cd3990dcd304bd3`
- Raw variants: `Goose Hunter` (100)
- Active dates: 2025-05-24 through 2026-08-20
- Attendance: primary BD **99**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 99 (BD 99, DD 0)
- Q/VQ: **5**; 2025-08-28 The Oasis VQ [The Oasis!687], 2026-02-05 The Oasis VQ [The Oasis!1497], 2026-03-12 The Oasis Q [The Oasis!1681], 2026-04-16 The Oasis Q [The Oasis!1917], 2026-06-25 The Oasis Q [The Oasis!2210]
- Explicit FNG evidence: 2025-05-24 The Oasis [The Oasis!218]
- Source sheets: The Oasis

#### Goosehunter

- Identity key: `wh-member-e24592658065a3efa4bc`
- Raw variants: `Goosehunter` (1)
- Active dates: 2026-09-19 through 2026-09-19
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Iron Gate 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Iron Gate

#### Comparative evidence

**Goose Hunter vs. Goosehunter**

- Name similarity: sequence ratio 0.9565; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-66b13cd3990dcd304bd3` last appears 2026-08-20; `wh-member-e24592658065a3efa4bc` first appears 2026-09-19 (30 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-026: Hall Pass / Hallpass

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `hallpass`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Hall Pass

- Identity key: `wh-member-c3dea0ebe25e6c8a5dab`
- Raw variants: `Hall Pass` (626)
- Active dates: 2023-01-23 through 2025-11-01
- Attendance: primary BD **625**; DD **1**; DR **4** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 4 (BD 4, DD 0), The Branch 3 (BD 3, DD 0), The Corridor 12 (BD 12, DD 0), The HOP 296 (BD 295, DD 1), The Oasis 1 (BD 1, DD 0), The Point 4 (BD 4, DD 0), The Tower 305 (BD 305, DD 0), Valhalla 1 (BD 1, DD 0)
- Q/VQ: **60**; 2023-03-03 The HOP VQ [The HOP!2142], 2023-03-11 The Tower VQ [The Tower!801], 2023-04-03 The HOP Q [The HOP!2246], 2023-05-01 The HOP Q [The HOP!2385], 2023-05-16 The Tower Q [The Tower!1177], 2023-05-27 The Tower Q [The Tower!1237], 2023-05-31 The HOP Q [The HOP!2510], 2023-06-19 The HOP Q [The HOP!2595], 2023-06-29 The Tower Q [The Tower!1382], 2023-06-30 The HOP Q [The HOP!2643], 2023-08-01 The Tower Q [The Tower!1498], 2023-08-02 The HOP Q [The HOP!2773], 2023-09-04 The HOP Q [The HOP!2916], 2023-09-05 The Tower Q [The Tower!1704], 2023-09-21 The Tower Q [The Tower!1784], 2023-09-25 The HOP Q [The HOP!3003], 2023-10-09 The HOP Q [The HOP!3068], 2023-11-08 The HOP Q [The HOP!3196], 2023-11-09 The Tower Q [The Tower!2030], 2023-11-13 The HOP Q [The HOP!3210], 2023-12-09 The Tower Q [The Tower!2143], 2023-12-11 The HOP Q [The HOP!3378], 2024-01-04 The Tower Q [The Tower!2258], 2024-01-19 The HOP Q [The HOP!3571], 2024-02-06 The Tower Q [The Tower!2412], 2024-02-17 The Corridor Q [The Corridor!837], 2024-03-11 The HOP Q [The HOP!3845], 2024-04-01 The HOP Q [The HOP!3941], 2024-04-06 The Tower Q [The Tower!2683], 2024-04-26 The Branch Q [The Branch!1902], 2024-05-07 The Tower Q [The Tower!2816], 2024-05-20 The HOP Q [The HOP!4195], 2024-05-23 The Tower Q [The Tower!2894], 2024-06-01 The Corridor Q [The Corridor!1290], 2024-06-08 The Tower Q [The Tower!2969], 2024-07-18 The Tower Q [The Tower!3153], 2024-07-25 The Tower Q [The Tower!3186], 2024-08-05 The HOP Q [The HOP!4545], 2024-08-17 The Tower Q [The Tower!3310], 2024-09-19 The Tower Q [The Tower!3496], 2024-10-01 The Point Q [The Point!6588], 2024-11-07 The Tower Q [The Tower!3711], 2024-11-25 The HOP Q [The HOP!5136], 2024-12-26 The Tower Q [The Tower!3910], 2024-12-27 The HOP Q [The HOP!5303], 2025-01-11 The Tower Q [The Tower!3970], 2025-01-20 The HOP Q [The HOP!5413], 2025-03-08 The Tower Q [The Tower!4286], 2025-03-31 The HOP Q [The HOP!5752], 2025-04-18 The HOP Q [The HOP!5861], 2025-05-01 The Tower Q [The Tower!4521], 2025-05-03 The Oasis Q [The Oasis!125], 2025-05-05 The HOP Q [The HOP!5950], 2025-05-27 The Tower Q [The Tower!4663], 2025-06-06 The HOP Q [The HOP!6146], 2025-06-19 The Tower Q [The Tower!4771], 2025-08-18 The HOP Q [The HOP!6575], 2025-08-21 The Tower Q [The Tower!5172], 2025-09-09 The Tower Q [The Tower!5277], 2025-10-24 The HOP Q [The HOP!7017]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Oasis, The Point, The Tower, Valhalla

#### Hallpass

- Identity key: `wh-member-33b1a335c48266266a61`
- Raw variants: `Hallpass` (7)
- Active dates: 2024-06-27 through 2025-10-30
- Attendance: primary BD **7**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 7 (BD 7, DD 0)
- Q/VQ: **2**; 2024-11-30 The Corridor Q [The Corridor!2010], 2025-04-08 The Corridor Q [The Corridor!2466]
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Comparative evidence

**Hall Pass vs. Hallpass**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-027: hammer time / Hammertime

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `hammertime`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### hammer time

- Identity key: `wh-member-76abbc924580c2018873`
- Raw variants: `hammer time` (3)
- Active dates: 2026-06-13 through 2026-06-30
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Knot 3 (BD 3, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Knot

#### Hammertime

- Identity key: `wh-member-a33714af9f75711c3797`
- Raw variants: `Hammertime` (35), `hammertime` (7)
- Active dates: 2026-05-30 through 2026-09-22
- Attendance: primary BD **42**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Iron Gate 1 (BD 1, DD 0), The Knot 41 (BD 41, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2026-05-30 The Knot [The Knot!65]
- Source sheets: The Iron Gate, The Knot

#### Comparative evidence

**hammer time vs. Hammertime**

- Name similarity: sequence ratio 0.9524; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Knot
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-028: High Rise / High-Rise

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `highrise`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### High Rise

- Identity key: `wh-member-f838f4ea9147bb2a71b2`
- Raw variants: `High Rise` (1)
- Active dates: 2022-02-25 through 2022-02-25
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The HOP

#### High-Rise

- Identity key: `wh-member-f6e2ef86dd8db98264de`
- Raw variants: `High-Rise` (1)
- Active dates: 2022-02-17 through 2022-02-17
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Comparative evidence

**High Rise vs. High-Rise**

- Name similarity: sequence ratio 0.8889; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-f6e2ef86dd8db98264de` last appears 2022-02-17; `wh-member-f838f4ea9147bb2a71b2` first appears 2022-02-25 (8 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-029: Home slice / Homeslice

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `homeslice`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Home slice

- Identity key: `wh-member-18fcb8936b7a5a424ec0`
- Raw variants: `Home Slice` (14), `Home slice` (99)
- Active dates: 2025-07-22 through 2026-09-11
- Attendance: primary BD **113**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 14 (BD 14, DD 0), The Valley 99 (BD 99, DD 0)
- Q/VQ: **9**; 2025-11-11 The Valley VQ [The Valley!1078], 2025-12-11 The Valley Q [The Valley!1193], 2026-01-15 The Valley Q [The Valley!1298], 2026-02-12 The Valley Q [The Valley!1387], 2026-02-17 The Valley Q [The Valley!1396], 2026-05-12 The Valley Q [The Valley!1615], 2026-06-02 The Valley Q [The Valley!1659], 2026-07-16 The Valley Q [The Valley!1813], 2026-08-25 The Valley Q [The Valley!1924]
- Explicit FNG evidence: 2025-07-22 The Valley [The Valley!742]
- Source sheets: The Branch, The Valley

#### Homeslice

- Identity key: `wh-member-47a6308dcca0efb84981`
- Raw variants: `Homeslice` (1)
- Active dates: 2026-09-19 through 2026-09-19
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Iron Gate 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Iron Gate

#### Comparative evidence

**Home slice vs. Homeslice**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-18fcb8936b7a5a424ec0` last appears 2026-09-11; `wh-member-47a6308dcca0efb84981` first appears 2026-09-19 (8 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-030: Honey Do / HoneyDo

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `honeydo`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Honey Do

- Identity key: `wh-member-ac8f5441695b7e77ed98`
- Raw variants: `Honey Do` (3)
- Active dates: 2024-01-01 through 2025-01-04
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The HOP 2 (BD 2, DD 0)
- Q/VQ: **1**; 2025-01-04 The Corridor Q [The Corridor!2091]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP

#### HoneyDo

- Identity key: `wh-member-eb5b1b949b585751920f`
- Raw variants: `HoneyDo` (1)
- Active dates: 2024-11-30 through 2024-11-30
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Comparative evidence

**Honey Do vs. HoneyDo**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-031: Lay Up / LayUp

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `layup`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Lay Up

- Identity key: `wh-member-4faf7a199ce9ee27e6cd`
- Raw variants: `Lay Up` (342), `Lay up` (2)
- Active dates: 2022-09-08 through 2026-09-15
- Attendance: primary BD **342**; DD **2**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 6 (BD 6, DD 0), The Corridor 1 (BD 1, DD 0), The Knot 1 (BD 1, DD 0), The Tower 336 (BD 334, DD 2)
- Q/VQ: **30**; 2022-09-15 The Tower Q [The Tower!27], 2022-10-25 The Tower Q [The Tower!146], 2022-12-20 The Tower Q [The Tower!329], 2023-02-14 The Tower Q [The Tower!545], 2023-03-28 The Tower Q [The Tower!890], 2023-05-30 The Tower Q [The Tower!1239], 2023-08-15 The Tower Q [The Tower!1571], 2023-09-26 The Tower Q [The Tower!1810], 2023-10-17 The Tower Q [The Tower!1898], 2024-01-11 The Tower Q [The Tower!2289], 2024-02-22 The Tower Q [The Tower!2493], 2024-04-27 The Tower Q [The Tower!2774], 2024-08-08 The Tower Q [The Tower!3250], 2024-09-12 The Tower Q [The Tower!3465], 2024-10-03 The Tower Q [The Tower!3546], 2024-10-26 The Tower Q [The Tower!3643], 2024-11-19 The Tower Q [The Tower!3764], 2025-01-18 The Tower Q [The Tower!4002], 2025-02-27 The Tower Q [The Tower!4190], 2025-04-08 The Tower Q [The Tower!4414], 2025-05-10 The Tower Q [The Tower!4569], 2025-05-29 The Tower Q [The Tower!4670], 2025-07-22 The Tower Q [The Tower!4971], 2025-08-16 The Tower Q [The Tower!5125], 2025-10-04 The Tower Q [The Tower!5429], 2026-01-06 The Tower Q [The Tower!5951], 2026-02-21 The Tower Q [The Tower!6170], 2026-06-11 The Tower Q [The Tower!6693], 2026-08-06 The Knot Q [The Knot!350], 2026-08-13 The Tower Q [The Tower!6932]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The Knot, The Tower

#### LayUp

- Identity key: `wh-member-67ad354380480c78dbce`
- Raw variants: `LayUp` (229), `Layup` (22)
- Active dates: 2022-04-13 through 2026-09-09
- Attendance: primary BD **249**; DD **2**; DR **1** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 1 (BD 1, DD 0), The Branch 12 (BD 10, DD 2), The Corridor 10 (BD 10, DD 0), The HOP 181 (BD 181, DD 0), The Iron Gate 3 (BD 3, DD 0), The Oasis 4 (BD 4, DD 0), The Point 6 (BD 6, DD 0), The Tower 1 (BD 1, DD 0), The Valley 6 (BD 6, DD 0), Valhalla 27 (BD 27, DD 0)
- Q/VQ: **29**; 2022-08-15 The HOP VQ [The HOP!1092], 2022-11-02 The HOP Q [The HOP!1638], 2022-11-28 The HOP Q [The HOP!1766], 2022-12-28 The HOP Q [The HOP!1889], 2023-01-23 The HOP Q [The HOP!1996], 2023-03-27 The HOP Q [The HOP!2232], 2023-04-26 The HOP Q [The HOP!2366], 2023-05-24 The HOP Q [The HOP!2487], 2023-07-07 The HOP Q [The HOP!2662], 2023-09-18 The HOP Q [The HOP!2976], 2023-11-29 The HOP Q [The HOP!3289], 2024-03-06 The HOP Q [The HOP!3824], 2024-07-02 The Corridor Q [The Corridor!1456], 2024-08-07 The HOP Q [The HOP!4557], 2024-10-30 The HOP Q [The HOP!5015], 2024-12-09 The HOP Q [The HOP!5214], 2025-02-05 The HOP Q [The HOP!5506], 2025-04-30 The HOP Q [The HOP!5918], 2025-05-22 The Oasis Q [The Oasis!200], 2025-07-30 The HOP Q [The HOP!6464], 2025-10-22 Valhalla Q [Valhalla!453], 2026-01-14 The Branch Q [The Branch!4431], 2026-02-03 The Iron Gate Q [The Iron Gate!91], 2026-04-02 The Iron Gate Q [The Iron Gate!296], 2026-05-20 The HOP Q [The HOP!8181], 2026-05-27 The Branch Q [The Branch!4942], 2026-06-04 The Point Q [The Point!10052], 2026-07-11 The Corridor Q [The Corridor!4372], 2026-09-09 Valhalla Q [Valhalla!919]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Iron Gate, The Oasis, The Point, The Tower, The Valley, Valhalla

#### Comparative evidence

**Lay Up vs. LayUp**

- Name similarity: sequence ratio 0.9091; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Branch, The Corridor, The Tower
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-032: Leather Man / Leatherman

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `leatherman`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Leather Man

- Identity key: `wh-member-b93e5e5015d15b508d29`
- Raw variants: `Leather Man` (1)
- Active dates: 2024-07-30 through 2024-07-30
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Leatherman

- Identity key: `wh-member-1e288cd8ca4633395fe9`
- Raw variants: `Leatherman` (3)
- Active dates: 2024-08-08 through 2024-08-26
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The HOP 1 (BD 1, DD 0), The Tower 1 (BD 1, DD 0)
- Q/VQ: **1**; 2024-08-26 The HOP VQ [The HOP!4681]
- Explicit FNG evidence: none
- Source sheets: The Branch, The HOP, The Tower

#### Comparative evidence

**Leather Man vs. Leatherman**

- Name similarity: sequence ratio 0.9524; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-b93e5e5015d15b508d29` last appears 2024-07-30; `wh-member-1e288cd8ca4633395fe9` first appears 2024-08-08 (9 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-033: Levi's / Levis

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `levis`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Levi's

- Identity key: `wh-member-306997bccb1822f88b3e`
- Raw variants: `Levi's` (151)
- Active dates: 2022-01-01 through 2025-02-08
- Attendance: primary BD **151**; DD **0**; DR **20** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 20 (BD 20, DD 0), The HOP 129 (BD 129, DD 0), The Point 2 (BD 2, DD 0)
- Q/VQ: **16**; 2022-01-10 The HOP Q [The HOP!38], 2022-01-17 The HOP Q [The HOP!75], 2022-02-02 The HOP Q [The HOP!164], 2022-02-21 The HOP Q [The HOP!237], 2022-03-07 The HOP Q [The HOP!299], 2022-03-16 The HOP Q [The HOP!348], 2022-03-18 The HOP Q [The HOP!359], 2022-04-11 The HOP Q [The HOP!460], 2022-04-27 The HOP Q [The HOP!554], 2022-05-25 The HOP Q [The HOP!687], 2022-06-01 The HOP Q [The HOP!710], 2022-07-01 The HOP Q [The HOP!855], 2022-08-10 The HOP Q [The HOP!1068], 2022-09-28 The HOP Q [The HOP!1444], 2022-11-30 The HOP Q [The HOP!1779], 2022-12-23 The HOP Q [The HOP!1873]
- Explicit FNG evidence: none
- Source sheets: The HOP, The Point

#### Levis

- Identity key: `wh-member-a3c1f46227066ca11869`
- Raw variants: `Levis` (9)
- Active dates: 2022-11-08 through 2026-07-11
- Attendance: primary BD **9**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The Corridor 4 (BD 4, DD 0), The Tower 4 (BD 4, DD 0)
- Q/VQ: **1**; 2023-07-14 The Branch Q [The Branch!720]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The Tower

#### Comparative evidence

**Levi's vs. Levis**

- Name similarity: sequence ratio 0.9091; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-034: lighting rod / Lightingrod

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `lightingrod`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### lighting rod

- Identity key: `wh-member-e645a5547a1c126130cf`
- Raw variants: `lighting rod` (2)
- Active dates: 2025-07-22 through 2025-08-07
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Lightingrod

- Identity key: `wh-member-b1cac893fa5bab5e0f25`
- Raw variants: `Lightingrod` (1)
- Active dates: 2026-01-02 through 2026-01-02
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch

#### Comparative evidence

**lighting rod vs. Lightingrod**

- Name similarity: sequence ratio 0.9565; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-e645a5547a1c126130cf` last appears 2025-08-07; `wh-member-b1cac893fa5bab5e0f25` first appears 2026-01-02 (148 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-035: Lightning Rod / Lightningrod

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `lightningrod`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Lightning Rod

- Identity key: `wh-member-b30b33a980735b4ed091`
- Raw variants: `Lightning Rod` (69), `Lightning rod` (1), `lightning rod` (2)
- Active dates: 2025-07-08 through 2026-09-22
- Attendance: primary BD **70**; DD **2**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 32 (BD 30, DD 2), The HOP 2 (BD 2, DD 0), The Iron Gate 2 (BD 2, DD 0), The Knot 27 (BD 27, DD 0), The Point 1 (BD 1, DD 0), The Tower 4 (BD 4, DD 0), Valhalla 4 (BD 4, DD 0)
- Q/VQ: **6**; 2025-11-15 The Corridor Q [The Corridor!3336], 2026-03-10 The Corridor Q [The Corridor!3828], 2026-07-02 The Corridor Q [The Corridor!4291], 2026-07-07 The Knot Q [The Knot!233], 2026-07-23 The Corridor Q [The Corridor!4406], 2026-09-15 The Knot Q [The Knot!504]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Iron Gate, The Knot, The Point, The Tower, Valhalla

#### Lightningrod

- Identity key: `wh-member-3e49686b36a6a3c67be6`
- Raw variants: `Lightningrod` (10), `lightningrod` (7)
- Active dates: 2025-06-12 through 2026-08-31
- Attendance: primary BD **17**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The Corridor 6 (BD 6, DD 0), The HOP 8 (BD 8, DD 0), The Oasis 1 (BD 1, DD 0), The Valley 1 (BD 1, DD 0)
- Q/VQ: **1**; 2025-09-20 The Corridor Q [The Corridor!3104]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Oasis, The Valley

#### Comparative evidence

**Lightning Rod vs. Lightningrod**

- Name similarity: sequence ratio 0.9600; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor, The HOP
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-036: Lion Heart / Lionheart

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `lionheart`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Lion Heart

- Identity key: `wh-member-d365d87912a9c91c9997`
- Raw variants: `Lion Heart` (4)
- Active dates: 2025-08-14 through 2026-06-30
- Attendance: primary BD **4**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The Knot 2 (BD 2, DD 0), The Oasis 1 (BD 1, DD 0)
- Q/VQ: **1**; 2026-06-30 The Knot Q [The Knot!218]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Knot, The Oasis

#### Lionheart

- Identity key: `wh-member-0dacdb7d858e1dcf0fa3`
- Raw variants: `Lionheart` (167), `lionheart` (1)
- Active dates: 2025-07-03 through 2026-09-19
- Attendance: primary BD **168**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 55 (BD 55, DD 0), The Corridor 2 (BD 2, DD 0), The HOP 6 (BD 6, DD 0), The Iron Gate 2 (BD 2, DD 0), The Knot 1 (BD 1, DD 0), The Oasis 1 (BD 1, DD 0), The Point 71 (BD 71, DD 0), The Tower 4 (BD 4, DD 0), The Valley 2 (BD 2, DD 0), Valhalla 24 (BD 24, DD 0)
- Q/VQ: **8**; 2025-12-23 The Point VQ [The Point!9091], 2025-12-30 The Point Q [The Point!9122], 2026-02-06 The Branch Q [The Branch!4531], 2026-04-11 The Point Q [The Point!9793], 2026-05-09 The Tower Q [The Tower!6553], 2026-05-22 The HOP Q [The HOP!8202], 2026-05-26 The Iron Gate Q [The Iron Gate!492], 2026-06-18 The Point Q [The Point!10101]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Iron Gate, The Knot, The Oasis, The Point, The Tower, The Valley, Valhalla

#### Comparative evidence

**Lion Heart vs. Lionheart**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor, The Knot, The Oasis
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-037: Lost and Find / LOSTandFIND

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `lostandfind`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Lost and Find

- Identity key: `wh-member-f330e3281d2c2650da3f`
- Raw variants: `Lost and Find` (1)
- Active dates: 2026-09-01 through 2026-09-01
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Knot 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Knot

#### LOSTandFIND

- Identity key: `wh-member-52ee7eb3152c5df400cf`
- Raw variants: `LOSTandFIND` (15)
- Active dates: 2026-01-13 through 2026-06-25
- Attendance: primary BD **15**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 15 (BD 15, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2026-01-13 The Point [The Point!9241]
- Source sheets: The Point

#### Comparative evidence

**Lost and Find vs. LOSTandFIND**

- Name similarity: sequence ratio 0.9167; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-52ee7eb3152c5df400cf` last appears 2026-06-25; `wh-member-f330e3281d2c2650da3f` first appears 2026-09-01 (68 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-038: Mall Cop / Mallcop

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `mallcop`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Mall Cop

- Identity key: `wh-member-66d935aa9289cb190fbf`
- Raw variants: `Mall Cop` (650)
- Active dates: 2021-09-07 through 2026-09-16
- Attendance: primary BD **648**; DD **2**; DR **7** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 7 (BD 7, DD 0), The Branch 226 (BD 224, DD 2), The Corridor 2 (BD 2, DD 0), The HOP 28 (BD 28, DD 0), The Oasis 1 (BD 1, DD 0), The Point 375 (BD 375, DD 0), The Tower 3 (BD 3, DD 0), The Valley 8 (BD 8, DD 0)
- Q/VQ: **102**; 2021-09-14 The Point Q [The Point!45], 2021-11-06 The Point Q [The Point!310], 2021-12-11 The Point Q [The Point!528], 2022-01-01 The Point Q [The Point!619], 2022-01-15 The Point Q [The Point!712], 2022-01-22 The Point Q [The Point!757], 2022-01-29 The Point Q [The Point!802], 2022-02-10 The Point Q [The Point!904], 2022-03-03 The Point Q [The Point!1036], 2022-04-14 The Point Q [The Point!1264], 2022-05-28 The Point Q [The Point!1543], 2022-07-02 The Point Q [The Point!1744], 2022-09-24 The Point Q [The Point!2242], 2022-10-20 The Point Q [The Point!2380], 2022-10-24 The Branch Q [The Branch!62], 2022-11-05 The Point Q [The Point!2468], 2022-11-19 The Point Q [The Point!2552], 2022-12-08 The Point Q [The Point!2646], 2023-01-06 The Branch Q [The Branch!225], 2023-01-25 The Branch Q [The Branch!260], 2023-03-03 The Branch Q [The Branch!386], 2023-03-04 The Point Q [The Point!3084], 2023-04-07 The Branch Q [The Branch!473], 2023-04-18 The Point Q [The Point!3319], 2023-05-09 The Point Q [The Point!3422], 2023-06-07 The Branch Q [The Branch!638], 2023-06-22 The Point Q [The Point!3629], 2023-07-21 The Branch Q [The Branch!739], 2023-07-29 The Point Q [The Point!3831], 2023-08-22 The Point Q [The Point!3996], 2023-08-23 The Branch Q [The Branch!829], 2023-08-30 The Branch Q [The Branch!844], 2023-09-07 The Point Q [The Point!4113], 2023-09-27 The Branch Q [The Branch!940], 2023-09-28 The Point Q [The Point!4263], 2023-10-14 The Point Q [The Point!4375], 2023-10-30 The Branch Q [The Branch!1067], 2023-11-23 The Point Q [The Point!4606], 2023-12-06 The Branch Q [The Branch!1189], 2024-01-10 The Branch Q [The Branch!1323], 2024-01-16 The Point Q [The Point!4937], 2024-01-17 The Branch Q [The Branch!1361], 2024-02-03 The Point Q [The Point!5066], 2024-02-05 The Branch Q [The Branch!1456], 2024-02-15 The Point Q [The Point!5131], 2024-03-09 The Point Q [The Point!5275], 2024-04-03 The Branch Q [The Branch!1784], 2024-04-13 The Point Q [The Point!5504], 2024-05-03 The Branch Q [The Branch!1943], 2024-05-11 The Point Q [The Point!5726], 2024-06-08 The Point Q [The Point!5934], 2024-06-19 The Branch Q [The Branch!2149], 2024-06-22 The Point Q [The Point!6015], 2024-07-22 The Branch Q [The Branch!2270], 2024-07-27 The Point Q [The Point!6206], 2024-08-06 The Point Q [The Point!6267], 2024-08-15 The Tower Q [The Tower!3287], 2024-08-23 The Branch Q [The Branch!2436], 2024-09-03 The Point Q [The Point!6418], 2024-09-19 The Valley Q [The Valley!34], 2024-09-20 The Branch Q [The Branch!2575], 2024-10-12 The Point Q [The Point!6654], 2024-10-14 The Branch Q [The Branch!2675], 2024-10-18 The Branch Q [The Branch!2689], 2024-10-24 The Point Q [The Point!6718], 2024-10-29 The Valley Q [The Valley!116], 2024-11-02 The Point Q [The Point!6771], 2024-11-06 The Branch Q [The Branch!2766], 2024-11-15 The Branch Q [The Branch!2809], 2024-12-10 The Point Q [The Point!6930], 2024-12-13 The Branch Q [The Branch!2899], 2024-12-23 The Branch Q [The Branch!2930], 2024-12-24 The Point Q [The Point!7012], 2025-01-16 The Point Q [The Point!7123], 2025-01-18 The Point Q [The Point!7137], 2025-01-22 The Branch Q [The Branch!2994], 2025-01-28 The Point Q [The Point!7174], 2025-02-03 The Branch Q [The Branch!3040], 2025-02-07 The Branch Q [The Branch!3057], 2025-02-08 The Point Q [The Point!7278], 2025-02-12 The Branch Q [The Branch!3071], 2025-02-18 The Point Q [The Point!7359], 2025-03-04 The Point Q [The Point!7432], 2025-03-05 The Branch Q [The Branch!3138], 2025-03-06 The Corridor Q [The Corridor!2321], 2025-03-25 The Valley Q [The Valley!396], 2025-04-10 The Point Q [The Point!7623], 2025-04-15 The Corridor Q [The Corridor!2481], 2025-04-18 The Branch Q [The Branch!3316], 2025-04-26 The Point Q [The Point!7715], 2025-04-30 The Branch Q [The Branch!3351], 2025-05-12 The Branch Q [The Branch!3397], 2025-05-23 The Branch Q [The Branch!3434], 2025-07-22 The Point Q [The Point!8172], 2025-08-05 The Valley Q [The Valley!772], 2025-09-11 The Point Q [The Point!8511], 2025-09-18 The Point Q [The Point!8567], 2025-09-23 The Point Q [The Point!8596], 2025-10-07 The Valley Q [The Valley!991], 2026-06-24 The Branch Q [The Branch!5066], 2026-07-08 The Branch Q [The Branch!5131], 2026-09-16 The Branch Q [The Branch!5368]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Oasis, The Point, The Tower, The Valley

#### Mallcop

- Identity key: `wh-member-8d9625e1af10b09b81e2`
- Raw variants: `Mallcop` (1)
- Active dates: 2025-09-17 through 2025-09-17
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch

#### Comparative evidence

**Mall Cop vs. Mallcop**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Branch
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-039: Man Maker / Manmaker

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `manmaker`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Candidates occur on the same date at different primary workouts 1 time(s), supporting separate identities but not ruling out duplicate logging across workouts.

#### Man Maker

- Identity key: `wh-member-676db2a898cb8454acce`
- Raw variants: `Man Maker` (3)
- Active dates: 2022-10-07 through 2024-08-30
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 3 (BD 3, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch

#### Manmaker

- Identity key: `wh-member-4ce66401e366a289e49f`
- Raw variants: `ManMaker` (9), `Manmaker` (141)
- Active dates: 2022-01-07 through 2025-04-25
- Attendance: primary BD **150**; DD **0**; DR **9** (DR is reported separately and may include BD and/or DD records)
- AOs: DR 9 (BD 9, DD 0), The Corridor 14 (BD 14, DD 0), The HOP 125 (BD 125, DD 0), The Tower 2 (BD 2, DD 0)
- Q/VQ: **1**; 2023-09-14 The Corridor Q [The Corridor!45]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Tower

#### Comparative evidence

**Man Maker vs. Manmaker**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences:
  - 2022-10-07: Man Maker at The Branch / SB [The Branch!22], session `wh-session-1e2144383b6782b61dab`; Manmaker at DR / 30/30 [The HOP!1504], session `wh-session-510093993c4a630d3426`.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-040: Meal Prep / MealPrep

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `mealprep`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Meal Prep

- Identity key: `wh-member-f6e168a83929c94bf73f`
- Raw variants: `Meal Prep` (6), `Meal prep` (6)
- Active dates: 2025-05-01 through 2025-08-12
- Attendance: primary BD **12**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 10 (BD 10, DD 0), The Tower 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2025-05-01 The Tower [The Tower!4529]
- Source sheets: The Corridor, The Tower

#### MealPrep

- Identity key: `wh-member-733d6d3ce9129a74eab6`
- Raw variants: `MealPrep` (19), `mealprep` (1)
- Active dates: 2025-05-08 through 2025-09-11
- Attendance: primary BD **20**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 20 (BD 20, DD 0)
- Q/VQ: **1**; 2025-07-24 The Corridor VQ [The Corridor!2848]
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Comparative evidence

**Meal Prep vs. MealPrep**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-041: Mini-Van / Minivan

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `minivan`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Mini-Van

- Identity key: `wh-member-8ffa36b161d9e468957a`
- Raw variants: `Mini-Van` (201), `Mini-van` (3)
- Active dates: 2021-09-07 through 2026-07-09
- Attendance: primary BD **204**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The Corridor 1 (BD 1, DD 0), The Point 202 (BD 202, DD 0)
- Q/VQ: **10**; 2021-10-14 The Point Q [The Point!184], 2022-01-18 The Point Q [The Point!727], 2022-04-02 The Point Q [The Point!1193], 2022-07-26 The Point Q [The Point!1874], 2022-08-23 The Point Q [The Point!2033], 2022-10-29 The Point Q [The Point!2435], 2023-02-14 The Point Q [The Point!2976], 2023-12-26 The Point Q [The Point!4815], 2024-05-21 The Point Q [The Point!5801], 2026-03-03 The Point Q [The Point!9563]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The Point

#### Minivan

- Identity key: `wh-member-95b356828ec3784a8299`
- Raw variants: `Minivan` (4)
- Active dates: 2023-02-25 through 2026-07-11
- Attendance: primary BD **4**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 2 (BD 2, DD 0), The Tower 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Tower

#### Comparative evidence

**Mini-Van vs. Minivan**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-042: Motor City / MotorCity

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `motorcity`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Motor City

- Identity key: `wh-member-684d3afa643a36c9b448`
- Raw variants: `Motor City` (29)
- Active dates: 2025-12-23 through 2026-08-20
- Attendance: primary BD **29**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 29 (BD 29, DD 0)
- Q/VQ: **2**; 2026-02-19 The Oasis VQ [The Oasis!1579], 2026-07-25 The Oasis Q [The Oasis!2341]
- Explicit FNG evidence: 2025-12-23 The Oasis [The Oasis!1309]
- Source sheets: The Oasis

#### MotorCity

- Identity key: `wh-member-217acd159c29a469065f`
- Raw variants: `MotorCity` (1)
- Active dates: 2026-03-31 through 2026-03-31
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### Comparative evidence

**Motor City vs. MotorCity**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Oasis
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-043: Mr Clean / Mr. Clean

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `mrclean`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Mr Clean

- Identity key: `wh-member-35835a281a9e5231bc23`
- Raw variants: `Mr Clean` (1)
- Active dates: 2023-08-26 through 2023-08-26
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Tower 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Tower

#### Mr. Clean

- Identity key: `wh-member-d63eb2d9f480f4c5cefc`
- Raw variants: `Mr. Clean` (1)
- Active dates: 2022-08-17 through 2022-08-17
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The HOP

#### Comparative evidence

**Mr Clean vs. Mr. Clean**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-d63eb2d9f480f4c5cefc` last appears 2022-08-17; `wh-member-35835a281a9e5231bc23` first appears 2023-08-26 (374 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-044: My Space / MySpace

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `myspace`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### My Space

- Identity key: `wh-member-bf08b7e8a652c1a9a8b9`
- Raw variants: `My Space` (2)
- Active dates: 2026-02-28 through 2026-03-05
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 2 (BD 2, DD 0)
- Q/VQ: **1**; 2026-03-05 The Oasis Q [The Oasis!1639]
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### MySpace

- Identity key: `wh-member-67a5eaa40c22453d9b22`
- Raw variants: `MySpace` (57)
- Active dates: 2025-07-17 through 2026-08-22
- Attendance: primary BD **57**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 57 (BD 57, DD 0)
- Q/VQ: **1**; 2025-09-13 The Oasis VQ [The Oasis!779]
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### Comparative evidence

**My Space vs. MySpace**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Oasis
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-045: Nacho Libre / NachoLibre

Assessment: `strong_merge_evidence`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `nacholibre`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and one spelling stops within 120 days of the other starting, with no same-session or same-date conflict.

#### Nacho Libre

- Identity key: `wh-member-ce8d68cde3e77a773f40`
- Raw variants: `Nacho Libre` (5)
- Active dates: 2025-09-06 through 2026-03-28
- Attendance: primary BD **5**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 5 (BD 5, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### NachoLibre

- Identity key: `wh-member-71f42c57be7ebb57909d`
- Raw variants: `NachoLibre` (1)
- Active dates: 2025-07-01 through 2025-07-01
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Oasis 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Oasis

#### Comparative evidence

**Nacho Libre vs. NachoLibre**

- Name similarity: sequence ratio 0.9524; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Oasis
- Transition: `wh-member-71f42c57be7ebb57909d` last appears 2025-07-01; `wh-member-ce8d68cde3e77a773f40` first appears 2025-09-06 (67 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-046: Night Life / Nightlife

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `nightlife`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Night Life

- Identity key: `wh-member-8ed3403221b38f0e1768`
- Raw variants: `Night Life` (57)
- Active dates: 2022-09-29 through 2026-04-14
- Attendance: primary BD **57**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 44 (BD 44, DD 0), The Iron Gate 10 (BD 10, DD 0), The Tower 2 (BD 2, DD 0), The Valley 1 (BD 1, DD 0)
- Q/VQ: **4**; 2023-09-26 The Corridor Q [The Corridor!114], 2024-01-04 The Corridor Q [The Corridor!627], 2024-02-20 The Corridor Q [The Corridor!852], 2026-03-10 The Iron Gate Q [The Iron Gate!219]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Iron Gate, The Tower, The Valley

#### Nightlife

- Identity key: `wh-member-cf1a47107b2e9b54e380`
- Raw variants: `Nightlife` (1)
- Active dates: 2025-08-14 through 2025-08-14
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Comparative evidence

**Night Life vs. Nightlife**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-047: Nose Plug / NosePlug

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `noseplug`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Nose Plug

- Identity key: `wh-member-9bcdbde7f805762ddf66`
- Raw variants: `Nose Plug` (1)
- Active dates: 2026-03-24 through 2026-03-24
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### NosePlug

- Identity key: `wh-member-252937d415de046405d4`
- Raw variants: `NosePlug` (70), `Noseplug` (12)
- Active dates: 2025-06-21 through 2026-08-01
- Attendance: primary BD **82**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: Convergence 1 (BD 1, DD 0), The Oasis 81 (BD 81, DD 0)
- Q/VQ: **6**; 2025-07-24 The Oasis VQ [The Oasis!479], 2025-08-30 The Oasis Q [The Oasis!700], 2025-10-25 The Oasis Q [The Oasis!1017], 2026-01-10 The Oasis Q [The Oasis!1362], 2026-04-02 The Oasis Q [The Oasis!1843], 2026-04-11 The Oasis Q [The Oasis!1896]
- Explicit FNG evidence: 2025-06-21 The Oasis [The Oasis!325]
- Source sheets: The Oasis

#### Comparative evidence

**Nose Plug vs. NosePlug**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-048: Pac Man / Pac-Man / Pacman

Assessment: `strong_merge_evidence`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `pacman`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and one spelling stops within 120 days of the other starting, with no same-session or same-date conflict.

#### Pac Man

- Identity key: `wh-member-482fed8ddfc5ec377c6d`
- Raw variants: `Pac Man` (1)
- Active dates: 2026-01-15 through 2026-01-15
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **1**; 2026-01-15 The Corridor Q [The Corridor!3592]
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Pac-Man

- Identity key: `wh-member-1810d9000f8b0caa01e6`
- Raw variants: `Pac-Man` (6)
- Active dates: 2025-05-13 through 2025-09-25
- Attendance: primary BD **5**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 6 (BD 5, DD 1)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Pacman

- Identity key: `wh-member-cb16729cd059be83eaed`
- Raw variants: `Pacman` (144), `pacman` (2)
- Active dates: 2023-04-05 through 2026-09-03
- Attendance: primary BD **143**; DD **3**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 45 (BD 42, DD 3), The HOP 94 (BD 94, DD 0), The Point 1 (BD 1, DD 0), The Tower 5 (BD 5, DD 0), The Valley 1 (BD 1, DD 0)
- Q/VQ: **14**; 2023-08-07 The HOP VQ [The HOP!2794], 2023-09-11 The HOP Q [The HOP!2949], 2024-02-08 The Corridor Q [The Corridor!805], 2024-07-16 The Corridor Q [The Corridor!1486], 2024-09-16 The HOP Q [The HOP!4795], 2024-09-19 The Corridor Q [The Corridor!1719], 2024-10-18 The HOP Q [The HOP!4971], 2024-11-15 The HOP Q [The HOP!5094], 2024-12-12 The Corridor Q [The Corridor!2050], 2025-02-04 The Corridor Q [The Corridor!2206], 2025-03-17 The HOP Q [The HOP!5694], 2025-04-10 The Corridor Q [The Corridor!2468], 2025-10-04 The Corridor Q [The Corridor!3168], 2026-09-03 The Corridor Q [The Corridor!4543]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Point, The Tower, The Valley

#### Comparative evidence

**Pac Man vs. Pac-Man**

- Name similarity: sequence ratio 0.8571; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Corridor
- Transition: `wh-member-1810d9000f8b0caa01e6` last appears 2025-09-25; `wh-member-482fed8ddfc5ec377c6d` first appears 2026-01-15 (112 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).
**Pac Man vs. Pacman**

- Name similarity: sequence ratio 0.9231; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).
**Pac-Man vs. Pacman**

- Name similarity: sequence ratio 0.9231; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-049: Paper Boy / Paperboy

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `paperboy`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Paper Boy

- Identity key: `wh-member-2c985b0a60c657d1c10e`
- Raw variants: `Paper Boy` (4)
- Active dates: 2022-10-07 through 2024-09-27
- Attendance: primary BD **4**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 3 (BD 3, DD 0), The Tower 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch, The Tower

#### Paperboy

- Identity key: `wh-member-991a66f1d630ee98f288`
- Raw variants: `PaperBoy` (74), `Paperboy` (151)
- Active dates: 2021-09-07 through 2026-06-04
- Attendance: primary BD **225**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The HOP 2 (BD 2, DD 0), The Point 155 (BD 155, DD 0), The Valley 67 (BD 67, DD 0)
- Q/VQ: **35**; 2021-09-18 The Point Q [The Point!70], 2021-09-25 The Point Q [The Point!101], 2021-11-02 The Point Q [The Point!288], 2021-12-14 The Point Q [The Point!542], 2022-01-04 The Point Q [The Point!634], 2022-02-03 The Point Q [The Point!836], 2022-03-24 The Point Q [The Point!1132], 2022-05-07 The Point Q [The Point!1427], 2022-06-18 The Point Q [The Point!1668], 2022-07-30 The Point Q [The Point!1885], 2022-09-22 The Point Q [The Point!2234], 2022-11-01 The Point Q [The Point!2446], 2023-01-07 The Point Q [The Point!2770], 2023-08-26 The Point Q [The Point!4027], 2023-10-19 The Point Q [The Point!4394], 2023-11-11 The Point Q [The Point!4542], 2024-01-23 The Point Q [The Point!4988], 2024-02-22 The Point Q [The Point!5173], 2024-03-07 The Point Q [The Point!5266], 2024-06-29 The Point Q [The Point!6077], 2024-10-03 The Valley Q [The Valley!62], 2024-10-05 The Point Q [The Point!6614], 2024-10-31 The Valley Q [The Valley!120], 2024-12-26 The Point Q [The Point!7025], 2025-01-02 The Valley Q [The Valley!272], 2025-02-20 The Valley Q [The Valley!351], 2025-03-27 The Valley Q [The Valley!412], 2025-04-24 The Valley Q [The Valley!480], 2025-05-29 The Valley Q [The Valley!573], 2025-07-08 The Valley Q [The Valley!697], 2025-07-31 The Valley Q [The Valley!771], 2025-08-26 The Valley Q [The Valley!869], 2026-01-29 The Valley Q [The Valley!1353], 2026-03-31 The Valley Q [The Valley!1504], 2026-06-04 The Valley Q [The Valley!1671]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Point, The Valley

#### Comparative evidence

**Paper Boy vs. Paperboy**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-050: Piano Man / Pianoman

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `pianoman`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Piano Man

- Identity key: `wh-member-fc071117ee4b96274e53`
- Raw variants: `Piano Man` (2)
- Active dates: 2024-10-18 through 2024-10-25
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2024-10-18 The HOP [The HOP!4972]
- Source sheets: The HOP

#### Pianoman

- Identity key: `wh-member-7288d2fd159f513470f2`
- Raw variants: `Pianoman` (2)
- Active dates: 2025-04-03 through 2025-05-17
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Tower 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Tower

#### Comparative evidence

**Piano Man vs. Pianoman**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-fc071117ee4b96274e53` last appears 2024-10-25; `wh-member-7288d2fd159f513470f2` first appears 2025-04-03 (160 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-051: Pit Bull / Pitbull

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `pitbull`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Pit Bull

- Identity key: `wh-member-9548c4314619fb15000d`
- Raw variants: `Pit Bull` (206)
- Active dates: 2022-08-16 through 2026-09-09
- Attendance: primary BD **206**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 203 (BD 203, DD 0), Valhalla 3 (BD 3, DD 0)
- Q/VQ: **19**; 2023-01-12 The Point Q [The Point!2802], 2023-03-28 The Point Q [The Point!3205], 2023-04-27 The Point Q [The Point!3367], 2023-06-01 The Point Q [The Point!3531], 2024-03-14 The Point Q [The Point!5304], 2024-09-17 The Point Q [The Point!6502], 2025-01-07 The Point Q [The Point!7076], 2025-02-08 The Point Q [The Point!7285], 2025-05-08 The Point Q [The Point!7783], 2025-06-12 The Point Q [The Point!7958], 2025-07-15 The Point Q [The Point!8133], 2025-10-09 The Point Q [The Point!8720], 2025-10-23 The Point Q [The Point!8803], 2026-01-06 The Point Q [The Point!9188], 2026-03-05 The Point Q [The Point!9583], 2026-04-02 The Point Q [The Point!9726], 2026-05-26 The Point Q [The Point!10020], 2026-06-13 The Point Q [The Point!10084], 2026-08-04 The Point Q [The Point!10293]
- Explicit FNG evidence: 2022-08-16 The Point [The Point!1982]
- Source sheets: The Point, Valhalla

#### Pitbull

- Identity key: `wh-member-e752f42f6708b4c7440f`
- Raw variants: `Pitbull` (1)
- Active dates: 2026-08-11 through 2026-08-11
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Knot 1 (BD 1, DD 0)
- Q/VQ: **1**; 2026-08-11 The Knot Q [The Knot!372]
- Explicit FNG evidence: none
- Source sheets: The Knot

#### Comparative evidence

**Pit Bull vs. Pitbull**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-052: Pop Up / Pop-up

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `popup`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Pop Up

- Identity key: `wh-member-8bf363035864e10f7b61`
- Raw variants: `Pop Up` (2)
- Active dates: 2026-02-24 through 2026-02-24
- Attendance: primary BD **1**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 2 (BD 1, DD 1)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Pop-up

- Identity key: `wh-member-ee4cb1add9a6b5554f08`
- Raw variants: `Pop-up` (7)
- Active dates: 2026-03-03 through 2026-08-15
- Attendance: primary BD **4**; DD **3**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Iron Gate 7 (BD 4, DD 3)
- Q/VQ: **1**; 2026-06-09 The Iron Gate Q [The Iron Gate!547]
- Explicit FNG evidence: none
- Source sheets: The Iron Gate

#### Comparative evidence

**Pop Up vs. Pop-up**

- Name similarity: sequence ratio 0.8333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-8bf363035864e10f7b61` last appears 2026-02-24; `wh-member-ee4cb1add9a6b5554f08` first appears 2026-03-03 (7 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-053: Pre-check / Precheck

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `precheck`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Pre-check

- Identity key: `wh-member-fb4d0af955399080b170`
- Raw variants: `Pre-check` (6)
- Active dates: 2022-10-13 through 2023-11-14
- Attendance: primary BD **5**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Tower 6 (BD 5, DD 1)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Tower

#### Precheck

- Identity key: `wh-member-12fbc15c2f4097bf4125`
- Raw variants: `Precheck` (1)
- Active dates: 2023-04-10 through 2023-04-10
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The HOP

#### Comparative evidence

**Pre-check vs. Precheck**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-054: putt Putt / Putt-Putt / PuttPutt

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `puttputt`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### putt Putt

- Identity key: `wh-member-78befe3a0a03f980e612`
- Raw variants: `putt Putt` (1)
- Active dates: 2025-08-19 through 2025-08-19
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Putt-Putt

- Identity key: `wh-member-711bf62eeda3d67b9a49`
- Raw variants: `Putt-Putt` (3)
- Active dates: 2021-11-23 through 2023-01-17
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 2 (BD 2, DD 0), The Tower 1 (BD 1, DD 0)
- Q/VQ: **2**; 2023-01-12 The Tower Q [The Tower!410], 2023-01-17 The Point Q [The Point!2826]
- Explicit FNG evidence: none
- Source sheets: The Point, The Tower

#### PuttPutt

- Identity key: `wh-member-e7c370f67eb67a3e2787`
- Raw variants: `PuttPutt` (3)
- Active dates: 2026-04-23 through 2026-04-30
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Valley 3 (BD 3, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2026-04-23 The Valley [The Valley!1566]
- Source sheets: The Valley

#### Comparative evidence

**putt Putt vs. Putt-Putt**

- Name similarity: sequence ratio 0.8889; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-711bf62eeda3d67b9a49` last appears 2023-01-17; `wh-member-78befe3a0a03f980e612` first appears 2025-08-19 (945 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).
**putt Putt vs. PuttPutt**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-78befe3a0a03f980e612` last appears 2025-08-19; `wh-member-e7c370f67eb67a3e2787` first appears 2026-04-23 (247 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).
**Putt-Putt vs. PuttPutt**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-711bf62eeda3d67b9a49` last appears 2023-01-17; `wh-member-e7c370f67eb67a3e2787` first appears 2026-04-23 (1192 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-055: Rat Rod / Ratrod

Assessment: `strong_merge_evidence`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `ratrod`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and one spelling stops within 120 days of the other starting, with no same-session or same-date conflict.

#### Rat Rod

- Identity key: `wh-member-a5e6d5730d97d1b53073`
- Raw variants: `Rat Rod` (91)
- Active dates: 2023-02-07 through 2025-04-22
- Attendance: primary BD **90**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 2 (BD 2, DD 0), The Corridor 2 (BD 2, DD 0), The HOP 12 (BD 12, DD 0), The Point 1 (BD 1, DD 0), The Tower 74 (BD 73, DD 1)
- Q/VQ: **4**; 2023-11-11 The Tower VQ [The Tower!2031], 2024-04-11 The Tower Q [The Tower!2702], 2024-06-06 The Tower Q [The Tower!2960], 2024-09-03 The Tower Q [The Tower!3417]
- Explicit FNG evidence: 2023-02-07 The Tower [The Tower!507]
- Source sheets: The Branch, The Corridor, The HOP, The Point, The Tower

#### Ratrod

- Identity key: `wh-member-6d432fc384f16a211c9f`
- Raw variants: `Ratrod` (2)
- Active dates: 2022-11-08 through 2022-11-10
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Comparative evidence

**Rat Rod vs. Ratrod**

- Name similarity: sequence ratio 0.9231; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Point
- Transition: `wh-member-6d432fc384f16a211c9f` last appears 2022-11-10; `wh-member-a5e6d5730d97d1b53073` first appears 2023-02-07 (89 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-056: Red Eye / Redeye

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `redeye`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Red Eye

- Identity key: `wh-member-be9f969c7105fb2683f2`
- Raw variants: `Red Eye` (1)
- Active dates: 2025-09-08 through 2025-09-08
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch

#### Redeye

- Identity key: `wh-member-5b826120490927b27d72`
- Raw variants: `Redeye` (1)
- Active dates: 2025-09-09 through 2025-09-09
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Valley 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Valley

#### Comparative evidence

**Red Eye vs. Redeye**

- Name similarity: sequence ratio 0.9231; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-be9f969c7105fb2683f2` last appears 2025-09-08; `wh-member-5b826120490927b27d72` first appears 2025-09-09 (1 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-057: Shark Bait / Sharkbait

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `sharkbait`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Shark Bait

- Identity key: `wh-member-f50a27d98d33f88fd9fe`
- Raw variants: `Shark Bait` (1)
- Active dates: 2026-09-19 through 2026-09-19
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Iron Gate 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Iron Gate

#### Sharkbait

- Identity key: `wh-member-8d2e5ef9ed9d21d34d97`
- Raw variants: `Sharkbait` (10)
- Active dates: 2022-02-05 through 2022-05-26
- Attendance: primary BD **10**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 1 (BD 1, DD 0), The Point 9 (BD 9, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The HOP, The Point

#### Comparative evidence

**Shark Bait vs. Sharkbait**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-8d2e5ef9ed9d21d34d97` last appears 2022-05-26; `wh-member-f50a27d98d33f88fd9fe` first appears 2026-09-19 (1577 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-058: Show Boy / Showboy

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `showboy`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Show Boy

- Identity key: `wh-member-8f19d0082fb2ccef48ad`
- Raw variants: `Show Boy` (1)
- Active dates: 2026-09-19 through 2026-09-19
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Iron Gate 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Iron Gate

#### Showboy

- Identity key: `wh-member-fab729fffa4a8ff1e9ce`
- Raw variants: `Showboy` (4)
- Active dates: 2025-12-06 through 2026-09-22
- Attendance: primary BD **3**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 4 (BD 3, DD 1)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2025-12-06 The Corridor [The Corridor!3437]
- Source sheets: The Corridor

#### Comparative evidence

**Show Boy vs. Showboy**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-059: Sight Line / Sightline

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `sightline`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Sight Line

- Identity key: `wh-member-dfc34d7a2db012b42808`
- Raw variants: `Sight Line` (1)
- Active dates: 2022-03-31 through 2022-03-31
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Point 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Point

#### Sightline

- Identity key: `wh-member-1672b786f69bb366e6c8`
- Raw variants: `Sightline` (1)
- Active dates: 2022-03-25 through 2022-03-25
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2022-03-25 The HOP [The HOP!392]
- Source sheets: The HOP

#### Comparative evidence

**Sight Line vs. Sightline**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-1672b786f69bb366e6c8` last appears 2022-03-25; `wh-member-dfc34d7a2db012b42808` first appears 2022-03-31 (6 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-060: Slap shot / Slapshot

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `slapshot`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Slap shot

- Identity key: `wh-member-ac77daec7b98caf64395`
- Raw variants: `Slap Shot` (111), `Slap shot` (127)
- Active dates: 2023-09-09 through 2026-09-17
- Attendance: primary BD **197**; DD **41**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 144 (BD 114, DD 30), The HOP 62 (BD 51, DD 11), The Iron Gate 2 (BD 2, DD 0), The Knot 1 (BD 1, DD 0), The Oasis 2 (BD 2, DD 0), The Point 4 (BD 4, DD 0), The Tower 3 (BD 3, DD 0), Valhalla 20 (BD 20, DD 0)
- Q/VQ: **17**; 2023-11-18 The Corridor Q [The Corridor!417], 2025-12-06 The Corridor Q [The Corridor!3434], 2026-02-03 The Corridor Q [The Corridor!3665], 2026-03-10 The Corridor Q [The Corridor!3833], 2026-03-13 The HOP Q [The HOP!7785], 2026-03-18 Valhalla Q [Valhalla!668], 2026-03-23 The HOP Q [The HOP!7849], 2026-04-11 The Iron Gate Q [The Iron Gate!334], 2026-04-30 The Corridor Q [The Corridor!4033], 2026-05-09 The Iron Gate Q [The Iron Gate!424], 2026-06-02 The Corridor Q [The Corridor!4198], 2026-07-08 Valhalla Q [Valhalla!810], 2026-07-18 The Knot Q [The Knot!276], 2026-07-21 The Corridor Q [The Corridor!4399], 2026-08-15 The Corridor Q [The Corridor!4481], 2026-08-21 The HOP Q [The HOP!8673], 2026-09-17 The Corridor Q [The Corridor!4599]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The HOP, The Iron Gate, The Knot, The Oasis, The Point, The Tower, Valhalla

#### Slapshot

- Identity key: `wh-member-8ecdbf6b6b167c860395`
- Raw variants: `Slapshot` (6)
- Active dates: 2023-11-04 through 2026-01-05
- Attendance: primary BD **6**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The Corridor 4 (BD 4, DD 0), The Tower 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The Tower

#### Comparative evidence

**Slap shot vs. Slapshot**

- Name similarity: sequence ratio 0.9412; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor, The Tower
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-061: Snow Cap / Snowcap

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `snowcap`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Snow Cap

- Identity key: `wh-member-d57b737f265356848422`
- Raw variants: `Snow Cap` (2)
- Active dates: 2022-08-16 through 2026-06-20
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Knot 1 (BD 1, DD 0), The Point 1 (BD 1, DD 0)
- Q/VQ: **1**; 2022-08-16 The Point Q [The Point!1986]
- Explicit FNG evidence: none
- Source sheets: The Knot, The Point

#### Snowcap

- Identity key: `wh-member-0ebfa4dd79e58054f247`
- Raw variants: `Snowcap` (1)
- Active dates: 2023-01-20 through 2023-01-20
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The HOP 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The HOP

#### Comparative evidence

**Snow Cap vs. Snowcap**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-062: Spark Plug / Sparkplug

Assessment: `possible_merge`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `sparkplug`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and have no session-level conflict; a sparse or non-overlapping spelling history is consistent with a spelling change.

#### Spark Plug

- Identity key: `wh-member-9eaa8c6964d0dd4662ac`
- Raw variants: `Spark Plug` (201)
- Active dates: 2025-02-17 through 2026-04-06
- Attendance: primary BD **158**; DD **43**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 1 (BD 1, DD 0), The Corridor 3 (BD 3, DD 0), The HOP 147 (BD 113, DD 34), The Tower 49 (BD 40, DD 9), Valhalla 1 (BD 1, DD 0)
- Q/VQ: **11**; 2025-05-16 The HOP VQ [The HOP!6026], 2025-06-30 The HOP Q [The HOP!6292], 2025-07-08 The Tower VQ [The Tower!4887], 2025-09-05 The HOP Q [The HOP!6704], 2025-11-07 The HOP Q [The HOP!7126], 2025-11-19 The HOP Q [The HOP!7199], 2025-12-09 The Tower Q [The Tower!5808], 2025-12-19 The HOP Q [The HOP!7358], 2026-01-19 The HOP Q [The HOP!7504], 2026-02-20 The HOP Q [The HOP!7674], 2026-04-06 The HOP Q [The HOP!7905]
- Explicit FNG evidence: 2025-02-17 The HOP [The HOP!5579]
- Source sheets: The Branch, The Corridor, The HOP, The Tower, Valhalla

#### Sparkplug

- Identity key: `wh-member-94e05d60aa238b7092ec`
- Raw variants: `Sparkplug` (2)
- Active dates: 2025-12-23 through 2025-12-23
- Attendance: primary BD **1**; DD **1**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 2 (BD 1, DD 1)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Comparative evidence

**Spark Plug vs. Sparkplug**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-063: Spinal Tap / Spinaltap

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `spinaltap`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Active ranges overlap and the candidates have no AO in common, which weakly supports separate identities.

#### Spinal Tap

- Identity key: `wh-member-810f782c2b87e30d3686`
- Raw variants: `Spinal Tap` (2)
- Active dates: 2025-03-11 through 2025-11-29
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Tower 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Tower

#### Spinaltap

- Identity key: `wh-member-c60a50f030235fc97f5b`
- Raw variants: `Spinaltap` (1)
- Active dates: 2025-11-27 through 2025-11-27
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Comparative evidence

**Spinal Tap vs. Spinaltap**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: none
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-064: Stir Fry / Stirfry

Assessment: `strong_merge_evidence`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `stirfry`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share an AO and one spelling stops within 120 days of the other starting, with no same-session or same-date conflict.

#### Stir Fry

- Identity key: `wh-member-9af96746ee0a61ee3b50`
- Raw variants: `Stir Fry` (3)
- Active dates: 2025-08-14 through 2025-09-18
- Attendance: primary BD **3**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 3 (BD 3, DD 0)
- Q/VQ: **1**; 2025-08-21 The Corridor VQ [The Corridor!2973]
- Explicit FNG evidence: none
- Source sheets: The Corridor

#### Stirfry

- Identity key: `wh-member-7d94a78eaeb2a1120fa5`
- Raw variants: `Stirfry` (2)
- Active dates: 2025-07-24 through 2025-07-31
- Attendance: primary BD **2**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 2 (BD 2, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2025-07-24 The Corridor [The Corridor!2854]
- Source sheets: The Corridor

#### Comparative evidence

**Stir Fry vs. Stirfry**

- Name similarity: sequence ratio 0.9333; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: The Corridor
- Transition: `wh-member-7d94a78eaeb2a1120fa5` last appears 2025-07-31; `wh-member-9af96746ee0a61ee3b50` first appears 2025-08-14 (14 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-065: Super Trooper / SuperTrooper

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `supertrooper`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The workbook provides name similarity but no shared AO, same-session conflict, or clear transition evidence.

#### Super Trooper

- Identity key: `wh-member-434119af786de34b2e11`
- Raw variants: `Super Trooper` (8)
- Active dates: 2025-03-20 through 2026-04-16
- Attendance: primary BD **8**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 1 (BD 1, DD 0), The Point 7 (BD 7, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2025-03-20 The Point [The Point!7510]
- Source sheets: The Corridor, The Point

#### SuperTrooper

- Identity key: `wh-member-4b64ba2ba68c72bc5789`
- Raw variants: `SuperTrooper` (1)
- Active dates: 2026-08-20 through 2026-08-20
- Attendance: primary BD **1**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Valley 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Valley

#### Comparative evidence

**Super Trooper vs. SuperTrooper**

- Name similarity: sequence ratio 0.9600; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: no
- Shared AOs: none
- Transition: `wh-member-434119af786de34b2e11` last appears 2026-04-16; `wh-member-4b64ba2ba68c72bc5789` first appears 2026-08-20 (126 days later).
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-066: Tummy Ache / TummyAche

Assessment: `ambiguous`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `tummyache`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- The candidates share at least one AO and have no same-session conflict, but the workbook does not provide a decisive transition pattern.

#### Tummy Ache

- Identity key: `wh-member-0d31a59fe323298cc0c0`
- Raw variants: `Tummy Ache` (42)
- Active dates: 2025-08-02 through 2026-09-12
- Attendance: primary BD **42**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 3 (BD 3, DD 0), The Iron Gate 28 (BD 28, DD 0), The Point 1 (BD 1, DD 0), The Tower 10 (BD 10, DD 0)
- Q/VQ: **4**; 2026-03-07 The Iron Gate VQ [The Iron Gate!208], 2026-05-02 The Iron Gate Q [The Iron Gate!405], 2026-06-13 The Iron Gate Q [The Iron Gate!565], 2026-08-01 The Iron Gate Q [The Iron Gate!754]
- Explicit FNG evidence: none
- Source sheets: The Corridor, The Iron Gate, The Point, The Tower

#### TummyAche

- Identity key: `wh-member-e12c0ec32f4800aa908f`
- Raw variants: `TummyAche` (3), `Tummyache` (1)
- Active dates: 2025-07-05 through 2025-09-06
- Attendance: primary BD **4**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Corridor 3 (BD 3, DD 0), The Tower 1 (BD 1, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: 2025-07-05 The Tower [The Tower!4880]
- Source sheets: The Corridor, The Tower

#### Comparative evidence

**Tummy Ache vs. TummyAche**

- Name similarity: sequence ratio 0.9474; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Corridor, The Tower
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences: none found.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

### WH-ID-067: White Water / Whitewater

Assessment: `possible_separate`. Analyzer flag: `punctuation_or_spacing_insensitive_names_collide` using loose key `whitewater`.

Evidence basis:
- Every candidate name collapses to the same punctuation/spacing-insensitive key.
- Candidates occur on the same date at different primary workouts 1 time(s), supporting separate identities but not ruling out duplicate logging across workouts.

#### White Water

- Identity key: `wh-member-2254a1951a9ea4a37e34`
- Raw variants: `White Water` (27)
- Active dates: 2023-07-19 through 2025-07-25
- Attendance: primary BD **27**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 27 (BD 27, DD 0)
- Q/VQ: **0**; none
- Explicit FNG evidence: none
- Source sheets: The Branch

#### Whitewater

- Identity key: `wh-member-746284c64fb2e5e6883d`
- Raw variants: `Whitewater` (455)
- Active dates: 2021-09-07 through 2026-09-16
- Attendance: primary BD **455**; DD **0**; DR **0** (DR is reported separately and may include BD and/or DD records)
- AOs: The Branch 18 (BD 18, DD 0), The Corridor 2 (BD 2, DD 0), The HOP 3 (BD 3, DD 0), The Knot 1 (BD 1, DD 0), The Oasis 1 (BD 1, DD 0), The Point 420 (BD 420, DD 0), The Tower 7 (BD 7, DD 0), The Valley 2 (BD 2, DD 0), Valhalla 1 (BD 1, DD 0)
- Q/VQ: **37**; 2021-10-07 The Point Q [The Point!159], 2022-01-25 The Point Q [The Point!780], 2022-04-05 The Point Q [The Point!1208], 2022-07-14 The Point Q [The Point!1816], 2022-09-10 The Point Q [The Point!2168], 2022-10-15 The Point Q [The Point!2359], 2022-12-17 The Point Q [The Point!2691], 2023-02-28 The Point Q [The Point!3059], 2023-05-06 The Point Q [The Point!3414], 2023-07-22 The Point Q [The Point!3785], 2023-09-26 The Point Q [The Point!4255], 2023-10-21 The Point Q [The Point!4407], 2023-12-30 The Point Q [The Point!4838], 2024-01-20 The Point Q [The Point!4975], 2024-02-24 The Point Q [The Point!5190], 2024-04-06 The Point Q [The Point!5462], 2024-08-31 The Point Q [The Point!6408], 2024-11-14 The Point Q [The Point!6841], 2024-12-12 The Point Q [The Point!6950], 2025-01-11 The Point Q [The Point!7090], 2025-02-13 The Point Q [The Point!7340], 2025-03-13 The Point Q [The Point!7475], 2025-04-08 The Point Q [The Point!7618], 2025-05-01 The Point Q [The Point!7743], 2025-06-03 The Point Q [The Point!7917], 2025-10-07 The Point Q [The Point!8704], 2025-11-04 The Point Q [The Point!8858], 2025-12-04 The Point Q [The Point!9006], 2026-01-13 The Point Q [The Point!9235], 2026-03-17 The Point Q [The Point!9646], 2026-04-16 The Point Q [The Point!9818], 2026-05-26 The Tower Q [The Tower!6620], 2026-06-09 The Point Q [The Point!10070], 2026-07-16 The Point Q [The Point!10208], 2026-07-25 The Point Q [The Point!10248], 2026-08-13 The Point Q [The Point!10333], 2026-08-25 The Knot Q [The Knot!421]
- Explicit FNG evidence: none
- Source sheets: The Branch, The Corridor, The HOP, The Knot, The Oasis, The Point, The Tower, The Valley, Valhalla

#### Comparative evidence

**White Water vs. Whitewater**

- Name similarity: sequence ratio 0.9524; Names become identical after removing punctuation and spacing.
- Active date ranges overlap: yes
- Shared AOs: The Branch
- Transition: no disappearance/start handoff because active ranges overlap.
- Same primary BD conflicts: none found.
- Other same-session occurrences: none found.
- Same-date, different-primary-workout occurrences:
  - 2023-09-04: White Water at The Branch / SB [The Branch!863], session `wh-session-3d5d8f69a8bbc93906cb`; Whitewater at The HOP / SB [The HOP!2928], session `wh-session-063969c4673eafe5be16`.
- Conflicting FNG evidence: no.
- Q-history conflict: not both identities have Q/VQ history; both marked Q/VQ in the same session 0 time(s).

Human-resolution fields: `resolution: null`; `canonical_identity_key: null`; `review_notes: null`.

## Cases likely requiring institutional knowledge

The following **60** groups do not have the strongest workbook-only transition or co-attendance evidence and likely require West Houston/DOGE/Excel input. `UNRESOLVED` is preferable to a speculative merge:

`WH-ID-001`, `WH-ID-002`, `WH-ID-003`, `WH-ID-004`, `WH-ID-005`, `WH-ID-006`, `WH-ID-007`, `WH-ID-008`, `WH-ID-009`, `WH-ID-010`, `WH-ID-011`, `WH-ID-013`, `WH-ID-014`, `WH-ID-015`, `WH-ID-017`, `WH-ID-018`, `WH-ID-019`, `WH-ID-020`, `WH-ID-021`, `WH-ID-023`, `WH-ID-024`, `WH-ID-025`, `WH-ID-026`, `WH-ID-027`, `WH-ID-028`, `WH-ID-029`, `WH-ID-030`, `WH-ID-031`, `WH-ID-032`, `WH-ID-033`, `WH-ID-034`, `WH-ID-035`, `WH-ID-036`, `WH-ID-037`, `WH-ID-038`, `WH-ID-039`, `WH-ID-040`, `WH-ID-041`, `WH-ID-042`, `WH-ID-043`, `WH-ID-044`, `WH-ID-046`, `WH-ID-047`, `WH-ID-049`, `WH-ID-050`, `WH-ID-051`, `WH-ID-052`, `WH-ID-053`, `WH-ID-054`, `WH-ID-056`, `WH-ID-057`, `WH-ID-058`, `WH-ID-059`, `WH-ID-060`, `WH-ID-061`, `WH-ID-062`, `WH-ID-063`, `WH-ID-065`, `WH-ID-066`, `WH-ID-067`
