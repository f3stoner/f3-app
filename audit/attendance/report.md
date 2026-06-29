# Attendance Comparison Audit

Generated: 2026-06-29T01:25:45.383Z

## Inputs

- Supabase sessions export: `audit/sessions_rows.csv`
- Supabase members export: `audit/attendance/members_rows.csv`
- Roster lookup: `public/Pax_Master.csv`
- Current AO logs:
  - `public/Forest_Log.csv`
  - `public/Cave_Log.csv`
  - `public/Iron_Log.csv`
  - `public/Keep_Log.csv`
  - `public/Rock_Log.csv`
  - `public/Mine_Log.csv`
  - `public/Southie_Log.csv`
  - `public/Watch_Log.csv`
  - `public/Dads_Log.csv`
  - `public/BlackOps_Log.csv`
  - `public/CSAUP_Log.csv`
  - `public/Other_Log.csv`
- Historical log: `public/Historic_Log.csv`

## Summary

- Supabase region filter: 96c9eef9-3b6e-4365-86cd-51dbeccf231a
- Aggieland sessions: 3780
- Supabase sessions: 3957
- Supabase members: 1237
- Session rows compared: 3964
- Session mismatches: 211
- True session mismatches: 64
- Sessions outside bundled CSV coverage: 145
- Sessions before bundled CSV coverage: 2
- Aggieland unmatched names vs Pax_Master: 1
- Supabase unresolved_pax entries: 248
- Supabase unrostered FNG rows: 5
- Supabase unresolved UUIDs: 1
- Pax_Master duplicate normalized names: 0
- Supabase duplicate normalized pax_name risks: 2
- Source duplicate attendance rows: 18
- Member rows not found in members export: 39

## Member Name Resolution Rate

- UUID references resolved: 44292 / 44294 (100.0%)
- Attendee UUID references: 39225
- Q UUID references: 4042
- FNG member UUID references: 1027
- Unresolved UUID references: 2
- Distinct unresolved UUIDs: 1

## AO Totals

| AO | Aggieland | Supabase | Delta |
|---|---:|---:|---:|
| Austin's Colony | 0 | 19 | 19 |
| BlackOps | 243 | 182 | -61 |
| CSAUP | 216 | 263 | 47 |
| Convergence (Cave) | 3289 | 3340 | 51 |
| Dads (The Mine) | 1614 | 1712 | 98 |
| F3 Franklin | 0 | 24 | 24 |
| LBJ | 0 | 2 | 2 |
| Other | 261 | 270 | 9 |
| Run Club | 0 | 15 | 15 |
| Southie | 1226 | 1279 | 53 |
| The Cave | 5970 | 6122 | 152 |
| The Forest | 5956 | 6119 | 163 |
| The Iron | 2942 | 3126 | 184 |
| The Keep | 7441 | 7748 | 307 |
| The Mine | 2265 | 2365 | 100 |
| The Moat AM | 0 | 39 | 39 |
| The Moat PM | 0 | 23 | 23 |
| The Rock | 5322 | 5486 | 164 |
| The Watch | 162 | 162 | 0 |
| Watch (D) | 376 | 392 | 16 |
| Watch (W) | 525 | 548 | 23 |

## Sessions Outside Bundled CSV Coverage

### After source max date

| AO | Count | Min Date | Max Date | Supabase Attendance |
|---|---:|---|---|---:|
| The Keep | 27 | 2026-05-17 | 2026-06-26 | 296 |
| The Forest | 22 | 2026-05-18 | 2026-06-25 | 172 |
| The Rock | 19 | 2026-05-18 | 2026-06-26 | 170 |
| The Cave | 17 | 2026-05-18 | 2026-06-26 | 152 |
| The Iron | 14 | 2026-05-15 | 2026-06-19 | 180 |
| The Mine | 11 | 2026-05-19 | 2026-06-25 | 101 |
| Dads (The Mine) | 7 | 2026-05-16 | 2026-06-27 | 94 |
| Southie | 7 | 2026-05-14 | 2026-06-24 | 53 |
| Watch (W) | 6 | 2026-05-22 | 2026-06-26 | 23 |
| Convergence (Cave) | 5 | 2026-05-16 | 2026-06-20 | 52 |
| Watch (D) | 5 | 2026-05-19 | 2026-06-16 | 16 |
| CSAUP | 2 | 2026-05-30 | 2026-06-13 | 11 |
| Other | 2 | 2026-05-25 | 2026-06-01 | 9 |
| BlackOps | 1 | 2026-05-18 | 2026-05-18 | 5 |

### Before source min date

| AO | Count | Min Date | Max Date | Supabase Attendance |
|---|---:|---|---|---:|
| The Keep | 1 | 2022-08-11 | 2022-08-11 | 12 |
| The Rock | 1 | 2022-04-23 | 2022-04-23 | 1 |

## Top 25 Session Mismatches

| Date | AO | Aggieland | Supabase | Delta | FNG Delta | Q Delta | Status |
|---|---|---:|---:|---:|---:|---:|---|
| 2026-05-04 | BlackOps | 16 | 0 | -16 | 0 | -3 | missing_in_supabase |
| 2026-05-04 | The Moat PM | 0 | 16 | 16 | 0 | 3 | extra_in_supabase |
| 2026-01-12 | BlackOps | 12 | 0 | -12 | 0 | -2 | missing_in_supabase |
| 2026-02-02 | BlackOps | 11 | 0 | -11 | 0 | -2 | missing_in_supabase |
| 2026-01-19 | BlackOps | 10 | 0 | -10 | 0 | -2 | missing_in_supabase |
| 2023-11-11 | CSAUP | 0 | 9 | 9 | 0 | 1 | extra_in_supabase |
| 2023-08-12 | CSAUP | 0 | 8 | 8 | 0 | 1 | extra_in_supabase |
| 2023-08-20 | CSAUP | 0 | 8 | 8 | 0 | 1 | extra_in_supabase |
| 2026-01-12 | The Moat AM | 0 | 8 | 8 | 0 | 1 | extra_in_supabase |
| 2026-02-02 | The Moat AM | 0 | 7 | 7 | 0 | 1 | extra_in_supabase |
| 2026-05-11 | BlackOps | 7 | 0 | -7 | 0 | -2 | missing_in_supabase |
| 2026-01-19 | The Moat AM | 0 | 6 | 6 | 0 | 1 | extra_in_supabase |
| 2026-02-16 | BlackOps | 6 | 0 | -6 | 0 | -1 | missing_in_supabase |
| 2026-02-16 | Run Club | 0 | 6 | 6 | 0 | 1 | extra_in_supabase |
| 2026-01-25 | Dads (The Mine) | 0 | 5 | 5 | 0 | 1 | extra_in_supabase |
| 2026-02-16 | The Moat AM | 0 | 5 | 5 | 0 | 1 | extra_in_supabase |
| 2026-05-04 | The Moat AM | 0 | 5 | 5 | 0 | 1 | extra_in_supabase |
| 2026-05-11 | The Moat AM | 0 | 5 | 5 | 0 | 1 | extra_in_supabase |
| 2026-01-10 | F3 Franklin | 0 | 4 | 4 | 0 | 1 | extra_in_supabase |
| 2026-01-19 | Austin's Colony | 0 | 4 | 4 | 0 | 1 | extra_in_supabase |
| 2026-05-25 | The Moat PM | 0 | 4 | 4 | 0 | 1 | extra_in_supabase |
| 2023-07-16 | CSAUP | 0 | 3 | 3 | 0 | 1 | extra_in_supabase |
| 2023-09-23 | CSAUP | 0 | 3 | 3 | 0 | 1 | extra_in_supabase |
| 2025-11-01 | CSAUP | 0 | 3 | 3 | 0 | 1 | extra_in_supabase |
| 2026-01-26 | Austin's Colony | 0 | 3 | 3 | 0 | 1 | extra_in_supabase |

## Unmatched Names / Unresolved PAX

### Aggieland names not found in Pax_Master

- Fukushima: 1 row(s), files: public/Historic_Log.csv

### Supabase unresolved_pax

- 2026-02-03 The Cave: Cowbell (ambiguous_member_reference, code Q)
- 2026-02-03 The Cave: Rosetta (ambiguous_member_reference, code -)
- 2026-02-27 The Keep: Dial-Up (ambiguous_member_reference, code -)
- 2026-04-27 The Iron: Jingling Johnny (DR) (ambiguous_member_reference, code FNG)
- 2025-12-27 Convergence (Cave): Rosetta (ambiguous_member_reference, code -)
- 2026-01-20 The Keep: Shooter (2.0) (ambiguous_member_reference, code -)
- 2025-12-05 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2025-12-05 The Cave: Rosetta (ambiguous_member_reference, code -)
- 2025-12-08 The Iron: Tapout (ambiguous_member_reference, code FNG)
- 2025-11-25 The Keep: Victory Lap (ambiguous_member_reference, code -)
- 2025-12-19 The Cave: Bandit (ambiguous_member_reference, code -)
- 2025-12-19 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2025-12-19 The Cave: Rosetta (ambiguous_member_reference, code Q)
- 2026-01-21 The Iron: Tapout (ambiguous_member_reference, code -)
- 2026-02-21 Convergence (Cave): Cowbell (ambiguous_member_reference, code DD)
- 2026-02-21 Convergence (Cave): Rosetta (ambiguous_member_reference, code DD)
- 2026-04-08 The Iron: Wrangler (2.0) (ambiguous_member_reference, code -)
- 2026-04-13 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2026-04-13 The Cave: Rosetta (ambiguous_member_reference, code -)
- 2026-01-09 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2026-01-09 The Cave: Rosetta (ambiguous_member_reference, code Q)
- 2026-04-14 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2026-04-14 The Cave: Rosetta (ambiguous_member_reference, code Q)
- 2025-11-18 The Cave: Bandit (ambiguous_member_reference, code -)
- 2025-11-18 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2025-11-18 The Cave: Rosetta (ambiguous_member_reference, code -)
- 2025-12-12 The Keep: Victory Lap (ambiguous_member_reference, code -)
- 2026-04-03 The Iron: Magellan (ambiguous_member_reference, code -)
- 2025-12-06 Convergence (Cave): Rosetta (ambiguous_member_reference, code -)
- 2026-01-23 The Iron: Magellan (ambiguous_member_reference, code -)
- 2026-03-06 The Iron: Magellan (ambiguous_member_reference, code -)
- 2026-03-13 The Iron: Walker (2.0) (ambiguous_member_reference, code -)
- 2026-04-23 The Keep: Victory Lap (ambiguous_member_reference, code -)
- 2026-01-19 The Cave: Cowbell (ambiguous_member_reference, code Q)
- 2026-01-19 The Cave: Rosetta (ambiguous_member_reference, code Q)
- 2025-11-21 The Iron: Magellan (ambiguous_member_reference, code -)
- 2026-01-29 The Forest: Cowbell (ambiguous_member_reference, code -)
- 2026-01-29 The Forest: Rosetta (ambiguous_member_reference, code -)
- 2026-04-27 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2026-04-27 The Cave: Rosetta (ambiguous_member_reference, code Q)
- 2026-03-25 The Iron: Cowbell (ambiguous_member_reference, code -)
- 2026-03-25 The Iron: Rosetta (ambiguous_member_reference, code -)
- 2025-11-21 The Cave: Rosetta (ambiguous_member_reference, code Q)
- 2025-11-22 Convergence (Cave): Rosetta (ambiguous_member_reference, code -)
- 2026-01-31 Convergence (Cave): Rosetta (ambiguous_member_reference, code DD)
- 2025-12-09 The Keep: Dial-Up (ambiguous_member_reference, code -)
- 2026-04-14 The Keep: Victory Lap (ambiguous_member_reference, code -)
- 2026-03-20 The Iron: Magellan (ambiguous_member_reference, code -)
- 2025-11-17 The Cave: Cowbell (ambiguous_member_reference, code -)
- 2025-11-17 The Cave: Rosetta (ambiguous_member_reference, code Q)

### Supabase unrostered FNGs

- 2026-05-25 The Keep: Altoid
- 2026-05-08 The Cave: Saul
- 2026-05-14 The Keep: Wire Fraud
- 2026-05-28 The Mine: Longboard
- 2026-04-03 The Keep: Wallaby

## Unresolved UUIDs

- 01a752bc-82e6-4ed6-8a2f-ab8f4ac8c7e7: 2 reference(s), types attendee/q, example 2026-05-14 Southie

## Duplicate Name Risks

### Pax_Master duplicate normalized names

- None

### Supabase members duplicate normalized pax_name risks

- jingling johnny (dr): 6 members (6 active), ids 6d5c2670-637b-442b-baa8-b3da17438914, 6d76b5a7-6e7e-47b1-9446-0383afc48075, 6e7551df-50c3-4971-90e9-12d1158522df, 770d851f-3fa9-4d3a-9820-6a1885547084, 93335a72-07c2-491a-9171-f313683ad332, df25ecd0-87d3-4d85-9ed5-e4f73783a35b
- top hat: 2 members (1 active), ids 55ff451c-62dc-4875-805d-88218c5a708a, ce70e528-8546-4178-b435-f11121399fbc

### Duplicate source attendance rows

- 2026-04-28 The Forest: 8 Mile (Q, public/Forest_Log.csv)
- 2025-11-18 The Forest: 8 Mile (blank, public/Forest_Log.csv)
- 2025-11-18 The Forest: Frodo (blank, public/Forest_Log.csv)
- 2025-11-18 The Forest: Nickels (blank, public/Forest_Log.csv)
- 2025-11-18 The Forest: Scooter (blank, public/Forest_Log.csv)
- 2025-11-18 The Forest: Skin Graft (blank, public/Forest_Log.csv)
- 2025-11-18 The Forest: Whistleblower (Q, public/Forest_Log.csv)
- 2026-01-14 The Keep: Bareback (blank, public/Keep_Log.csv)
- 2026-05-12 The Rock: Lazarus (VQ, public/Rock_Log.csv)
- 2026-05-12 The Rock: O-Ring (DD, public/Rock_Log.csv)
- 2026-05-12 The Rock: Elmer (DD, public/Rock_Log.csv)
- 2026-05-12 The Rock: Narc (blank, public/Rock_Log.csv)
- 2026-05-12 The Rock: Squatter (DD, public/Rock_Log.csv)
- 2026-05-07 The Rock: Cobbler (blank, public/Rock_Log.csv)
- 2026-01-27 The Mine: Rio (QVQ, public/Mine_Log.csv)
- 2026-04-04 Dads (The Mine): Thumper (2.0) (VQ, public/Dads_Log.csv)
- 2026-05-11 BlackOps: Mario (blank, public/BlackOps_Log.csv)
- 2026-05-04 BlackOps: Mario (Q, public/BlackOps_Log.csv)

### Supabase duplicate risks

- None

## Top 25 Member Mismatches After UUID Resolution

| PAX | Aggieland Posts | Supabase Posts | Delta | Status |
|---|---:|---:|---:|---|
| Jumper | 1 | 178 | 177 | resolved_by_members_export |
| Jumper (2.0) | 177 | 1 | -176 | resolved_by_members_export |
| Dial-Up (Inactive) | 5 | 66 | 61 | resolved_by_members_export |
| Prime | 4 | 55 | 51 | resolved_by_members_export |
| Prime (2.0) | 72 | 27 | -45 | resolved_by_members_export |
| Yoshi | 3 | 44 | 41 | resolved_by_members_export |
| Yoshi (2.0) | 49 | 8 | -41 | resolved_by_members_export |
| Dial-Up | 92 | 54 | -38 | resolved_by_members_export |
| Rosetta | 408 | 444 | 36 | resolved_by_members_export |
| Johnny 5 | 567 | 599 | 32 | resolved_by_members_export |
| Boomer | 715 | 744 | 29 | resolved_by_members_export |
| Anakin | 536 | 564 | 28 | resolved_by_members_export |
| Babel | 698 | 723 | 25 | resolved_by_members_export |
| Mario | 587 | 612 | 25 | resolved_by_members_export |
| Walker  (DR) | 0 | 25 | 25 | resolved_by_members_export |
| Acme | 444 | 468 | 24 | resolved_by_members_export |
| Frodo | 740 | 764 | 24 | resolved_by_members_export |
| Walker (2.0) | 31 | 7 | -24 | resolved_by_members_export |
| Cobbler | 574 | 597 | 23 | resolved_by_members_export |
| Jake | 506 | 529 | 23 | resolved_by_members_export |
| Thermostat | 242 | 264 | 22 | resolved_by_members_export |
| Cowbell | 251 | 271 | 20 | resolved_by_members_export |
| Narc | 201 | 221 | 20 | resolved_by_members_export |
| Skipper | 62 | 82 | 20 | resolved_by_members_export |
| Werner | 242 | 262 | 20 | resolved_by_members_export |

## Generated Files

- `audit/attendance/session-mismatches.csv`
- `audit/attendance/member-mismatches.csv`
