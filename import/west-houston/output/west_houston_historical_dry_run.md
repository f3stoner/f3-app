# West Houston historical workbook dry run

## Source selection

- Workbook: `2024 West Houston Consolidated (1).xlsx`
- SHA-256: `2e8c68bcd96c84dccdadabb761e778d60de092fd7a374719d5768372e23ee533`
- Parser version: `west-houston-workbook-v1`
- Canonical source sheets: The Branch, The Point, The HOP, The Corridor, The Valley, The Tower, Valhalla, The Oasis, The Iron Gate, The Knot
- Excluded derived sheets: Combined, FNG, Posting Table
- Reason: the AO sheets hold the imported row-level records. `Combined` unions those sheets, while `Posting Table` and `FNG` are calculated summaries.
- Session identity: date + proposed AO + BD/DD stream + normalized workout type.

## Reconciliation totals

| Metric | Value |
| --- | --- |
| physicalRowsExamined | 56359 |
| nonemptyRowsExamined | 48598 |
| legitimateSourceAttendanceRows | 43554 |
| normalizedAttendanceRecords | 45324 |
| proposedMembers | 1261 |
| mechanicalVariantGroups | 107 |
| possibleIdentityCollisions | 66 |
| proposedSessions | 4734 |
| explicitQAssignments | 3637 |
| sessionsWithZeroQs | 1154 |
| sessionsWithOneQ | 3554 |
| sessionsWithMultipleQs | 26 |
| explicitFngEvents | 494 |
| membersWithExplicitFirstPost | 475 |
| fngEarliestAttendanceDiscrepancies | 19 |
| duplicateAttendanceRemoved | 74 |
| ambiguousSessionGroupings | 698 |
| rejectedRows | 5044 |
| sourceContradictions | 0 |

## Source sheets

| Sheet | Physical rows | Nonempty rows | Accepted source rows | Date column | Name column |
| --- | --- | --- | --- | --- | --- |
| The Branch | 5605 | 5509 | 5249 | 7 | 8 |
| The Point | 11160 | 10551 | 10551 | 7 | 8 |
| The HOP | 9088 | 8761 | 8713 | 7 | 8 |
| The Corridor | 7782 | 4655 | 4652 | 7 | 8 |
| The Valley | 2989 | 1975 | 1975 | 7 | 8 |
| The Tower | 7728 | 7199 | 7111 | 7 | 8 |
| Valhalla | 3004 | 945 | 934 | 8 | 7 |
| The Oasis | 4010 | 4010 | 2683 | 7 | 8 |
| The Iron Gate | 1999 | 1999 | 1137 | 7 | 8 |
| The Knot | 2994 | 2994 | 549 | 7 | 8 |

Valhalla is the column-order exception: its header and cached rows place Name in G and Date in H; the other AO sheets place Date in G and Name in H.

## AO/location inventory

| Raw location | Proposed AO | Accepted records |
| --- | --- | --- |
| Convergence | Convergence | 7 |
| Corridor | The Corridor | 4642 |
| DR | DR | 241 |
| Iron Gate | Iron Gate | 9 |
| The Branch | The Branch | 5249 |
| The Corridor | The Corridor | 1 |
| The HOP | The HOP | 8472 |
| The Iron Gate | The Iron Gate | 1137 |
| The Knot | The Knot | 549 |
| The Oasis | The Oasis | 2676 |
| The Point | The Point | 10551 |
| The Tower | The Tower | 7111 |
| The Valley | The Valley | 1975 |
| Valhalla | Valhalla | 934 |

## Sessions by year and AO

| Year | AO | Stream | Sessions |
| --- | --- | --- | --- |
| 2021 | The Point | bd | 47 |
| 2022 | DR | bd | 95 |
| 2022 | The Branch | bd | 25 |
| 2022 | The HOP | bd | 153 |
| 2022 | The Point | bd | 151 |
| 2022 | The Tower | bd | 36 |
| 2022 | The Tower | dd | 5 |
| 2023 | DR | bd | 21 |
| 2023 | The Branch | bd | 144 |
| 2023 | The Corridor | bd | 47 |
| 2023 | The HOP | bd | 153 |
| 2023 | The HOP | dd | 1 |
| 2023 | The Point | bd | 152 |
| 2023 | The Tower | bd | 148 |
| 2023 | The Tower | dd | 22 |
| 2024 | The Branch | bd | 150 |
| 2024 | The Branch | dd | 11 |
| 2024 | The Corridor | bd | 137 |
| 2024 | The HOP | bd | 153 |
| 2024 | The HOP | dd | 5 |
| 2024 | The Point | bd | 152 |
| 2024 | The Tower | bd | 146 |
| 2024 | The Tower | dd | 18 |
| 2024 | The Valley | bd | 32 |
| 2024 | The Valley | dd | 3 |
| 2024 | Valhalla | bd | 1 |
| 2025 | Convergence | bd | 1 |
| 2025 | The Branch | bd | 148 |
| 2025 | The Branch | dd | 29 |
| 2025 | The Corridor | bd | 135 |
| 2025 | The Corridor | dd | 120 |
| 2025 | The HOP | bd | 150 |
| 2025 | The HOP | dd | 189 |
| 2025 | The Oasis | bd | 117 |
| 2025 | The Point | bd | 151 |
| 2025 | The Tower | bd | 137 |
| 2025 | The Tower | dd | 99 |
| 2025 | The Valley | bd | 101 |
| 2025 | The Valley | dd | 3 |
| 2025 | Valhalla | bd | 51 |
| 2025 | Valhalla | dd | 13 |
| 2026 | Iron Gate | bd | 1 |
| 2026 | The Branch | bd | 114 |
| 2026 | The Branch | dd | 13 |
| 2026 | The Corridor | bd | 105 |
| 2026 | The Corridor | dd | 121 |
| 2026 | The HOP | bd | 103 |
| 2026 | The HOP | dd | 101 |
| 2026 | The Iron Gate | bd | 111 |
| 2026 | The Iron Gate | dd | 65 |
| 2026 | The Knot | bd | 60 |
| 2026 | The Oasis | bd | 111 |
| 2026 | The Point | bd | 111 |
| 2026 | The Tower | bd | 102 |
| 2026 | The Tower | dd | 46 |
| 2026 | The Valley | bd | 71 |
| 2026 | The Valley | dd | 3 |
| 2026 | Valhalla | bd | 37 |
| 2026 | Valhalla | dd | 7 |

## Attendance by year and AO

| Year | AO | Stream | Attendance |
| --- | --- | --- | --- |
| 2021 | The Point | bd | 608 |
| 2022 | DR | bd | 209 |
| 2022 | The Branch | bd | 215 |
| 2022 | The HOP | bd | 1688 |
| 2022 | The Point | bd | 2121 |
| 2022 | The Tower | bd | 346 |
| 2022 | The Tower | dd | 7 |
| 2023 | DR | bd | 32 |
| 2023 | The Branch | bd | 1067 |
| 2023 | The Corridor | bd | 607 |
| 2023 | The HOP | bd | 1540 |
| 2023 | The HOP | dd | 1 |
| 2023 | The Point | bd | 2103 |
| 2023 | The Tower | bd | 1906 |
| 2023 | The Tower | dd | 37 |
| 2024 | The Branch | bd | 1556 |
| 2024 | The Branch | dd | 18 |
| 2024 | The Corridor | bd | 1478 |
| 2024 | The HOP | bd | 1841 |
| 2024 | The HOP | dd | 5 |
| 2024 | The Point | bd | 2205 |
| 2024 | The Tower | bd | 1673 |
| 2024 | The Tower | dd | 31 |
| 2024 | The Valley | bd | 266 |
| 2024 | The Valley | dd | 8 |
| 2024 | Valhalla | bd | 7 |
| 2025 | Convergence | bd | 7 |
| 2025 | The Branch | bd | 1385 |
| 2025 | The Branch | dd | 74 |
| 2025 | The Corridor | bd | 1442 |
| 2025 | The Corridor | dd | 274 |
| 2025 | The HOP | bd | 2013 |
| 2025 | The HOP | dd | 428 |
| 2025 | The Oasis | bd | 1314 |
| 2025 | The Point | bd | 2086 |
| 2025 | The Tower | bd | 1945 |
| 2025 | The Tower | dd | 166 |
| 2025 | The Valley | bd | 988 |
| 2025 | The Valley | dd | 7 |
| 2025 | Valhalla | bd | 540 |
| 2025 | Valhalla | dd | 18 |
| 2026 | Iron Gate | bd | 9 |
| 2026 | The Branch | bd | 991 |
| 2026 | The Branch | dd | 32 |
| 2026 | The Corridor | bd | 1081 |
| 2026 | The Corridor | dd | 322 |
| 2026 | The HOP | bd | 1336 |
| 2026 | The HOP | dd | 288 |
| 2026 | The Iron Gate | bd | 1132 |
| 2026 | The Iron Gate | dd | 134 |
| 2026 | The Knot | bd | 548 |
| 2026 | The Oasis | bd | 1338 |
| 2026 | The Point | bd | 1417 |
| 2026 | The Tower | bd | 1227 |
| 2026 | The Tower | dd | 82 |
| 2026 | The Valley | bd | 721 |
| 2026 | The Valley | dd | 7 |
| 2026 | Valhalla | bd | 385 |
| 2026 | Valhalla | dd | 12 |

## Review findings

### Possible identity collisions

| Loose key | Proposed members | Reason |
| --- | --- | --- |
| a1 | [{"memberKey": "wh-member-7fbd38753220ff224c89", "proposedF3Name": "A.1."}, {"memberKey": "wh-member-dd91fcc8adf5dee35fef", "proposedF3Name": "A1"}] | punctuation_or_spacing_insensitive_names_collide |
| babyshark | [{"memberKey": "wh-member-d264714542d37bbd6837", "proposedF3Name": "Baby Shark"}, {"memberKey": "wh-member-4f7bc87f5ad864d355d6", "proposedF3Name": "BabyShark"}] | punctuation_or_spacing_insensitive_names_collide |
| billdance | [{"memberKey": "wh-member-61272a351ac48016d4e1", "proposedF3Name": "Bill Dance"}, {"memberKey": "wh-member-8d14adf36691dbf12b6b", "proposedF3Name": "Billdance"}] | punctuation_or_spacing_insensitive_names_collide |
| bluescreen | [{"memberKey": "wh-member-9bcdc4e4687089b138e5", "proposedF3Name": "Blue Screen"}, {"memberKey": "wh-member-68b39c281635e3302e24", "proposedF3Name": "BlueScreen"}] | punctuation_or_spacing_insensitive_names_collide |
| bobross | [{"memberKey": "wh-member-950642bd3a11fd875d50", "proposedF3Name": "Bob Ross"}, {"memberKey": "wh-member-c3ba424666c9d3b072a0", "proposedF3Name": "BobRoss"}] | punctuation_or_spacing_insensitive_names_collide |
| capit | [{"memberKey": "wh-member-52bf1a2bef93197aa4f3", "proposedF3Name": "Cap It"}, {"memberKey": "wh-member-e52368538296d22e27be", "proposedF3Name": "Capit"}] | punctuation_or_spacing_insensitive_names_collide |
| cat5 | [{"memberKey": "wh-member-03ceb7954a6050a5c455", "proposedF3Name": "Cat 5"}, {"memberKey": "wh-member-4509b1ab6283e3c651cc", "proposedF3Name": "Cat5"}] | punctuation_or_spacing_insensitive_names_collide |
| cheesesticks | [{"memberKey": "wh-member-30fe4aff70503a26e0b6", "proposedF3Name": "Cheese Sticks"}, {"memberKey": "wh-member-c665fd21ebeb83c77f47", "proposedF3Name": "Cheesesticks"}] | punctuation_or_spacing_insensitive_names_collide |

### Mechanical name-variant collapses

| Proposed name | Variants |
| --- | --- |
| 3K | [{"occurrences": 17, "value": "3K"}, {"occurrences": 1, "value": "3k"}] |
| Aardappel | [{"occurrences": 4, "value": "AArdappel"}, {"occurrences": 203, "value": "Aardappel"}] |
| Animal | [{"occurrences": 6, "value": "Animal"}, {"occurrences": 1, "value": "animal"}] |
| Atlas | [{"occurrences": 6, "value": "ATLAS"}, {"occurrences": 51, "value": "Atlas"}] |
| Baby Shark | [{"occurrences": 657, "value": "Baby Shark"}, {"occurrences": 4, "value": "Baby shark"}, {"occurrences": 2, "value": "baby Shark"}] |
| BabyShark | [{"occurrences": 1, "value": "BabyShark"}, {"occurrences": 1, "value": "babyshark"}] |
| Bandsaw | [{"occurrences": 34, "value": "BandSaw"}, {"occurrences": 284, "value": "Bandsaw"}, {"occurrences": 1, "value": "bandsaw"}] |
| Beto | [{"occurrences": 239, "value": "Beto"}, {"occurrences": 3, "value": "bEtO"}] |

### FNG date discrepancies

| Member | Earliest attendance | Earliest explicit FNG |
| --- | --- | --- |
| Anime | 2022-07-23 | 2026-04-18 |
| Bob the Builder | 2025-11-10 | 2025-12-18 |
| Cappuccino | 2024-10-01 | 2024-12-03 |
| Chum | 2024-09-07 | 2026-08-14 |
| Fireball | 2024-10-05 | 2026-01-20 |
| Fosters | 2024-05-08 | 2024-08-19 |
| Haggis | 2021-11-20 | 2026-07-21 |
| Jasmine | 2022-08-31 | 2025-02-04 |

### Duplicate attendance removed

| Session | Member | Kept | Removed |
| --- | --- | --- | --- |
| wh-session-1487aa2198b6b6d4a19a | wh-member-0dfc18393fff8411a959 | {"row": 286, "sheet": "The Point"} | {"row": 287, "sheet": "The Point"} |
| wh-session-b59863622d151101fe5a | wh-member-a3d0f60cc627056013fa | {"row": 337, "sheet": "The Point"} | {"row": 338, "sheet": "The Point"} |
| wh-session-1991529c213f33df7399 | wh-member-1e42c0c066dbfafcc41e | {"row": 138, "sheet": "The HOP"} | {"row": 139, "sheet": "The HOP"} |
| wh-session-5752715c503d7ae00453 | wh-member-0dfc18393fff8411a959 | {"row": 1323, "sheet": "The Point"} | {"row": 1324, "sheet": "The Point"} |
| wh-session-ec0ea967851e33b5f015 | wh-member-60b5f759c11390c9cc78 | {"row": 1640, "sheet": "The Point"} | {"row": 1641, "sheet": "The Point"} |
| wh-session-0e02a0001053ed3d04d6 | wh-member-7a9971e42a81d18ca880 | {"row": 2953, "sheet": "The Point"} | {"row": 2954, "sheet": "The Point"} |
| wh-session-098f6b42ea4834cba306 | wh-member-2e358f360aadabf49cf5 | {"row": 484, "sheet": "The Branch"} | {"row": 485, "sheet": "The Branch"} |
| wh-session-4ab8ae47c6c27e6b2a93 | wh-member-8726c102daaae8fdb88d | {"row": 406, "sheet": "The Corridor"} | {"row": 407, "sheet": "The Corridor"} |

### Unusual AO values

| Raw location | Proposed AO | Records |
| --- | --- | --- |
| Convergence | Convergence | 7 |
| DR | DR | 241 |
| Iron Gate | Iron Gate | 9 |

### Special-event comments

| Date | AO | Comments |
| --- | --- | --- |
| 2022-01-21 | The HOP | ["LAUNCH!!"] |
| 2022-02-05 | The Point | ["LAUNCH"] |
| 2022-02-14 | DR | ["GOP LAUNCH TODAY"] |
| 2022-02-14 | The HOP | ["GOP LAUNCH TODAY"] |
| 2022-05-20 | DR | ["Power of the APEX Launch"] |
| 2022-07-30 | The Point | ["a few PAX at Mill Launch"] |
| 2022-08-13 | The Point | ["Some PAX to Aggieland launch, theCorridor visitors (Cardinal, Cantilever, Chinos)"] |
| 2022-10-10 | DR | ["CLOSED KTX Express Launch"] |

### Ambiguous session groupings

| Date | AO | Candidate sessions |
| --- | --- | --- |
| 2022-09-20 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-c83c7ed88230d7bed759", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-6c0755876dd9eeba134a", "stream": "dd"}] |
| 2022-10-11 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-e818e57ac58486a118ab", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-4e2c8dfbda8c3112068e", "stream": "dd"}] |
| 2022-10-18 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-078822d9e55f4dee8d7d", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-b7df1e81d7247322950e", "stream": "dd"}] |
| 2022-11-29 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-89492119adc99bda6a78", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-e9939c197d4ea19d117c", "stream": "dd"}] |
| 2022-12-27 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-54ddc31c88d1e77aa8ca", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-1b050a0f5dc5e0a3bd02", "stream": "dd"}] |
| 2023-01-03 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-ead6a38895afba345e4a", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-154b864e8f0f1710ffa5", "stream": "dd"}] |
| 2023-01-12 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-905ad62c036c4b5c8335", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-dc2beea4b3ca61cea223", "stream": "dd"}] |
| 2023-01-14 | The Tower | [{"bdType": "Bootcamp", "sessionKey": "wh-session-f33d2c95ccea46ae51ff", "stream": "bd"}, {"bdType": "Run", "sessionKey": "wh-session-c17555d7953fddd9bfc1", "stream": "dd"}] |

### Rejected rows

| Sheet | Row | Reason | Name | Date |
| --- | --- | --- | --- | --- |
| The Branch | 1333 | summary_or_header_row | DD Count |  |
| The Branch | 1346 | summary_or_header_row | DD Count |  |
| The Branch | 1369 | summary_or_header_row | DD Count |  |
| The Branch | 1399 | summary_or_header_row | DD Count |  |
| The Branch | 1427 | summary_or_header_row | DD Count |  |
| The Branch | 1438 | summary_or_header_row | DD Count |  |
| The Branch | 1452 | summary_or_header_row | DD Count |  |
| The Branch | 1478 | summary_or_header_row | DD Count |  |

### Source contradictions

None.

### Q-assignment examples

| Session | Member | Evidence | Source |
| --- | --- | --- | --- |
| wh-session-a82e18de2b6750eea2a3 | wh-member-41285490d9b76b825b2e | Q | {"row": 5, "sheet": "The Point"} |
| wh-session-72b97342bf3f85100444 | wh-member-1584f22dcdb50ae6d7ea | Q | {"row": 16, "sheet": "The Point"} |
| wh-session-5d2d97673b17851897a0 | wh-member-3fe6abdf46f977ef77e9 | Q | {"row": 37, "sheet": "The Point"} |
| wh-session-e4c71b25835bd158bad6 | wh-member-66d935aa9289cb190fbf | Q | {"row": 45, "sheet": "The Point"} |
| wh-session-32b4eb49ceb81f9b1169 | wh-member-7a76937b0c95d0f03c4b | Q | {"row": 55, "sheet": "The Point"} |
| wh-session-0a94efb409bcc43ac0b8 | wh-member-991a66f1d630ee98f288 | Q | {"row": 70, "sheet": "The Point"} |
| wh-session-eecd821a3da3de2ae7b7 | wh-member-9bcdc4e4687089b138e5 | Q | {"row": 74, "sheet": "The Point"} |
| wh-session-33b69d9f06b71d3d617c | wh-member-e16e2586eb8e4bc3fa8c | Q | {"row": 90, "sheet": "The Point"} |

### Multiple-Q session examples

| Date | AO | Stream | Type | Q count |
| --- | --- | --- | --- | --- |
| 2023-09-01 | The Branch | bd | SB | 2 |
| 2023-11-02 | The Tower | bd | Bootcamp | 2 |
| 2025-02-08 | The Point | bd | Bootcamp | 9 |
| 2025-02-13 | The Point | bd | Bootcamp | 2 |
| 2025-03-28 | The Branch | bd | SB | 3 |
| 2025-05-01 | The Point | bd | Bootcamp | 2 |
| 2025-09-16 | The Point | bd | Bootcamp | 2 |
| 2025-09-20 | The Point | bd | Bootcamp | 2 |

### Explicit FNG examples

| Session | Member | Source |
| --- | --- | --- |
| wh-session-e588381d5e56855ff11c | wh-member-71f044d4fc32beb44191 | {"row": 148, "sheet": "The Point"} |
| wh-session-76b038e0d512a620f009 | wh-member-7e011ddf451cbf05ce7c | {"row": 584, "sheet": "The Point"} |
| wh-session-76b038e0d512a620f009 | wh-member-9c3e4f04464c4f9f424c | {"row": 589, "sheet": "The Point"} |
| wh-session-cb28e1b1bea3ecd53c8c | wh-member-1e8493f95a231baa1292 | {"row": 1094, "sheet": "The Point"} |
| wh-session-24dcbc723e8817050b00 | wh-member-1672b786f69bb366e6c8 | {"row": 392, "sheet": "The HOP"} |
| wh-session-9c4f8842446c799d8a48 | wh-member-0c2f0e94c1e4cdf54752 | {"row": 500, "sheet": "The HOP"} |
| wh-session-266152781519eb4b4e5c | wh-member-1a4b89e41c1de239a975 | {"row": 1688, "sheet": "The Point"} |
| wh-session-edd4e94c1e791c386d8d | wh-member-bf1c9a70f09ffb78cdcb | {"row": 1922, "sheet": "The Point"} |

### Inviter/Proud Papa

No explicit inviter target field exists. PP/BB tags do not identify the inviter and were not converted into relationships.

| Sheet | Row | Date | Name | PAX comment | BD comment | Finding |
| --- | --- | --- | --- | --- | --- | --- |
| The Branch | 1296 | 2023-12-29 | Prince | BB | None | inviter-like notation without a reliable invited-member-to-inviter mapping |
| The Point | 1522 | 2022-05-24 | Vector | Q | No BB from Vector | inviter-like notation without a reliable invited-member-to-inviter mapping |
| The Point | 7223 | 2025-02-04 | Jasmine | FNG | Proud Papa - Pumba | inviter-like notation without a reliable invited-member-to-inviter mapping |
| The HOP | 5412 | 2025-01-20 | Strawberry | PP | AO 2-Year Anniversary Convergence | inviter-like notation without a reliable invited-member-to-inviter mapping |
| The HOP | 5784 | 2025-04-04 | Baby Shark | BB | None | inviter-like notation without a reliable invited-member-to-inviter mapping |
| The HOP | 5905 | 2025-04-28 | Karbach | PP | DD pull-ups | inviter-like notation without a reliable invited-member-to-inviter mapping |
| The HOP | 5907 | 2025-04-28 | Birdshot | BB | DD pull-ups | inviter-like notation without a reliable invited-member-to-inviter mapping |
| The HOP | 5923 | 2025-05-02 | Birdshot | PP | None | inviter-like notation without a reliable invited-member-to-inviter mapping |

## Decisions requiring review

- Confirm that DD markers represent separate historical workout sessions rather than metadata on the primary BD. They are kept as separate `dd` sessions so same-date activity is not lost.
- Review every punctuation-insensitive identity collision before merging people.
- Review FNG records whose explicit FNG date is later than earliest attendance. The output retains the explicit FNG date and does not rewrite earlier attendance.
- Confirm whether `DR` and `Convergence` should remain distinct AOs, map to event locations, or carry a separate event classification.
- Review launch, anniversary, closure, OTB, Black Ops, and convergence comments before normalizing special events.
- Decide whether `VQ` should remain Q evidence. This parser treats it as explicit Q evidence.
- No inviter relationships are proposed because PP/BB markers do not identify a target inviter.

## Current region-import framework differences

- Staged session participants currently support only attendee, Q, and co-Q roles. This output stores FNG evidence separately while also keeping the member in attendance.
- The current session commit RPC writes `sessions.fngs` as an empty array, so it cannot preserve this output's explicit FNG events.
- The framework has no first-class fields for BD/DD stream, workout type, BD comment, raw location variants, or row-level provenance on committed sessions.
- The framework can stage notes, but flattening structured comments and provenance into notes would lose semantics.
- The current identity normalizer does not directly accept this output's complete name-variant and collision-review structure.
- No write mapping has been implemented in this phase.
