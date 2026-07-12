# Official Aggieland Baseline Match Audit

Generated: 2026-07-12T19:26:12.406Z

## Inputs

- Supabase members export: `audit/attendance/members_rows.csv`
- Official totals export: `audit/attendance/Simple Overall Totals v1 - Overall Totals.csv`
- Raw Pax Master export: `audit/attendance/Simple Overall Totals v1 - Raw_Pax_Master.csv`

## Summary

- Region ID: 96c9eef9-3b6e-4365-86cd-51dbeccf231a
- Source: aggieland_official
- Baseline cutover date: 2026-07-11
- Total official rows: 1241
- Total official PAX rows: 1241
- Matched existing members: 1225
- Unmatched official PAX: 0
- Ambiguous matches: 16
- Proposed members to create: 0
- Proposed baseline stat imports: 1225
- Existing-member import-ready rows: 1225
- Matched: 444
- Unmatched: 0
- Ambiguous Supabase duplicate: 6
- Metadata conflicts: 10
- Inactive matches: 781
- Import-ready rows: 1225
- Import-ready active: 326
- Import-ready inactive: 570
- Import-ready qualified identity: 329
- Previous review required: 113
- Review required: 16
- Review required delta: -97

## Classification Counts

| Classification | Count |
|---|---:|
| inactive_match | 781 |
| matched | 444 |
| metadata_conflict | 10 |
| ambiguous_supabase_duplicate | 6 |

## Dry-Run Proposed Creates

- None

## Top Unmatched Names

- None

## Review Required

| Classification | Official Pax | Hospital Name | First AO | FNG Date | Posts | Qs | Supabase Candidates | Candidate Hospital Names | Recommended Decision | Notes | Reason |
|---|---|---|---|---|---:|---:|---|---|---|---|---|
| metadata_conflict | Shaggy | Joshua Samuelson | Cave | 2024-11-23 | 331 | 91 | Shaggy | Justin Samuelson | accept_metadata_conflict | - | Raw Pax Master hospital name (Joshua Samuelson) does not match Supabase real_name (Justin Samuelson). |
| metadata_conflict | Sinko | Josh | Iron | 2025-05-28 | 135 | 15 | Sinko | Josh Ravichandran | accept_metadata_conflict | - | Raw Pax Master hospital name (Josh) does not match Supabase real_name (Josh Ravichandran). |
| metadata_conflict | Circuit | Juan Acuna | Watch | 2025-09-20 | 84 | 1 | Circuit | Juan Acuña | accept_metadata_conflict | - | Raw Pax Master hospital name (Juan Acuna) does not match Supabase real_name (Juan Acuña). |
| metadata_conflict | Hot Wheels | Issac Starnes | Keep | 2025-04-03 | 41 | 1 | Hot Wheels | Issac Starns | accept_metadata_conflict | - | Raw Pax Master hospital name (Issac Starnes) does not match Supabase real_name (Issac Starns). |
| metadata_conflict | Buttercream | Jared Steffen | Rock | 2026-04-15 | 34 | 0 | Buttercream | Jered Stefflen | accept_metadata_conflict | - | Raw Pax Master hospital name (Jared Steffen) does not match Supabase real_name (Jered Stefflen). |
| metadata_conflict | Abacus | Barclay Stewart | Iron | 2026-05-04 | 29 | 0 | Abacus | Mark | accept_metadata_conflict | Same PAX; imported metadata conflict accepted. | Raw Pax Master hospital name (Barclay Stewart) does not match Supabase real_name (Mark). |
| metadata_conflict | Seabiscuit | Jimmy Tillman | Iron | 2026-05-18 | 27 | 0 | Seabiscuit | Jarret Baker-Wilkinson | accept_match_after_create | Official Seabiscuit is Jimmy Tillman. Jarret Baker-Wilkinson belongs to Seabiscuit (Inactive). | Raw Pax Master hospital name (Jimmy Tillman) does not match Supabase real_name (Jarret Baker-Wilkinson). |
| ambiguous_supabase_duplicate | Trex (2.0) | Kevin (Narc 2.0) | F3Dads | 2025-06-21 | 12 | 0 | T-Rex (2.0); Trex (2.0) | Kevin (Narc 2.0) | map_to_existing_member | Distinct 2.0 PAX. | Multiple Supabase members share the same normalized pax_name. |
| ambiguous_supabase_duplicate | Top Hat | Doug Pittman | Iron | 2026-06-17 | 8 | 0 | Top Hat | Doug Pittman; Matthew Murphy | map_to_existing_member | Official Top Hat is Doug Pittman; map to active Iron member. | Multiple Supabase members share the same normalized pax_name. |
| ambiguous_supabase_duplicate | T-Rex (2.0) | Kevin (Narc 2.0) | F3Dads | 2025-06-21 | 5 | 0 | T-Rex (2.0); Trex (2.0) | Kevin (Narc 2.0) | map_to_existing_member | Distinct 2.0 PAX. | Multiple Supabase members share the same normalized pax_name. |
| metadata_conflict | Bus Stop | David Berry | Iron | 2026-05-11 | 4 | 1 | Bus Stop | David Barry | accept_metadata_conflict | - | Raw Pax Master hospital name (David Berry) does not match Supabase real_name (David Barry). |
| metadata_conflict | Liver King | Jason Rinaldi | Cave | 2026-04-25 | 4 | 0 | Liver King | Jason | accept_metadata_conflict | - | Raw Pax Master hospital name (Jason Rinaldi) does not match Supabase real_name (Jason). |
| metadata_conflict | Tubbs | Zack Vise | Mine | 2026-06-30 | 4 | 0 | Tubbs | Zack Vice | verify_metadata_then_import | New FNG member manually verified. | Raw Pax Master hospital name (Zack Vise) does not match Supabase real_name (Zack Vice). |
| ambiguous_supabase_duplicate | B-I-N-G-O (2.0) | Maui 2.0 | F3Dads | 2024-07-27 | 3 | 0 | Bingo (2.0); B-I-N-G-O (2.0) | Meadow (Sinko 2.0); Maui 2.0 | map_to_existing_member | Distinct 2.0 PAX from Bingo (2.0); choose candidate with hospital name Maui 2.0. | Multiple Supabase members share the same normalized pax_name. |
| ambiguous_supabase_duplicate | Bingo (2.0) | Maui 2.0 | F3Dads | 2024-07-27 | 2 | 0 | Bingo (2.0); B-I-N-G-O (2.0) | Meadow (Sinko 2.0); Maui 2.0 | map_to_existing_member | Distinct 2.0 PAX. | Multiple Supabase members share the same normalized pax_name. |
| ambiguous_supabase_duplicate | Jingling Johnny (DR) | - | Iron | - | 2 | 0 | Jingling Johnny (DR) | - | resolve_duplicate_member | All Supabase duplicates require manual resolution. | Multiple Supabase members share the same normalized pax_name. |

## Generated Files

- `audit/attendance/official-baseline-matches.csv`
- `audit/attendance/official-baseline-import-ready.csv`
- `audit/attendance/official-proposed-member-creates.csv`
- `audit/attendance/official-baseline-review-required.csv`
- `audit/attendance/official-baseline-manual-decisions-template.csv`
- `audit/attendance/official-baseline-final-dry-run.md`
