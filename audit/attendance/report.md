# Attendance Comparison Audit

Generated: 2026-06-28T13:45:19.470Z

## Inputs

- Supabase sessions export: `audit/sessions_rows.csv`
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
- Session rows compared: 3964
- Session mismatches: 211
- Aggieland unmatched names vs Pax_Master: 1
- Supabase unresolved_pax entries: 248
- Pax_Master duplicate normalized names: 0
- Source duplicate attendance rows: 18
- Member rows not resolvable from sessions export alone: 167

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

## Top 25 Session Mismatches

| Date | AO | Aggieland | Supabase | Delta | FNG Delta | Q Delta | Status |
|---|---|---:|---:|---:|---:|---:|---|
| 2026-05-25 | The Keep | 0 | 22 | 22 | 1 | 1 | extra_in_supabase |
| 2026-06-13 | Dads (The Mine) | 0 | 21 | 21 | 1 | 1 | extra_in_supabase |
| 2026-05-20 | Southie | 0 | 19 | 19 | 0 | 1 | extra_in_supabase |
| 2026-05-30 | Dads (The Mine) | 0 | 19 | 19 | 2 | 1 | extra_in_supabase |
| 2026-05-23 | Dads (The Mine) | 0 | 18 | 18 | 2 | 1 | extra_in_supabase |
| 2026-06-02 | The Keep | 0 | 18 | 18 | 0 | 1 | extra_in_supabase |
| 2026-06-09 | The Keep | 0 | 18 | 18 | 0 | 1 | extra_in_supabase |
| 2026-06-23 | The Rock | 0 | 18 | 18 | 0 | 1 | extra_in_supabase |
| 2026-06-24 | The Keep | 0 | 18 | 18 | 0 | 1 | extra_in_supabase |
| 2026-05-18 | The Iron | 0 | 17 | 17 | 2 | 1 | extra_in_supabase |
| 2026-05-19 | The Forest | 0 | 17 | 17 | 0 | 1 | extra_in_supabase |
| 2026-05-28 | The Mine | 0 | 17 | 17 | 1 | 1 | extra_in_supabase |
| 2026-05-29 | The Rock | 0 | 17 | 17 | 0 | 1 | extra_in_supabase |
| 2026-05-04 | BlackOps | 16 | 0 | -16 | 0 | -3 | missing_in_supabase |
| 2026-05-04 | The Moat PM | 0 | 16 | 16 | 0 | 3 | extra_in_supabase |
| 2026-05-18 | The Cave | 0 | 16 | 16 | 0 | 1 | extra_in_supabase |
| 2026-05-21 | The Mine | 0 | 16 | 16 | 0 | 1 | extra_in_supabase |
| 2026-05-22 | The Cave | 0 | 16 | 16 | 1 | 1 | extra_in_supabase |
| 2026-06-06 | Convergence (Cave) | 0 | 16 | 16 | 0 | 1 | extra_in_supabase |
| 2026-06-11 | The Keep | 0 | 16 | 16 | 0 | 1 | extra_in_supabase |
| 2026-05-22 | The Iron | 0 | 15 | 15 | 0 | 1 | extra_in_supabase |
| 2026-05-27 | The Forest | 0 | 15 | 15 | 0 | 1 | extra_in_supabase |
| 2026-06-12 | The Iron | 0 | 15 | 15 | 1 | 1 | extra_in_supabase |
| 2026-06-12 | The Keep | 0 | 15 | 15 | 0 | 1 | extra_in_supabase |
| 2026-06-13 | The Keep | 0 | 15 | 15 | 0 | 1 | extra_in_supabase |

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

## Duplicate Name Risks

### Pax_Master duplicate normalized names

- None

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

## Member Comparison Limitation

The Supabase sessions export contains attendee UUIDs but does not include the full members table. This script resolves Supabase member names only when a session FNG row embeds `paxName` for a `memberId`. For full member-level name comparison, add a members export with member IDs and PAX names.

## Generated Files

- `audit/attendance/session-mismatches.csv`
- `audit/attendance/member-mismatches.csv`
