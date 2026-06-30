# Official Aggieland Baseline Match Audit

Generated: 2026-06-29T16:40:48.939Z

## Inputs

- Supabase members export: `audit/attendance/members_rows.csv`
- Official totals export: `audit/attendance/Simple Overall Totals v1 - Overall Totals.csv`
- Raw Pax Master export: `audit/attendance/Simple Overall Totals v1 - Raw_Pax_Master.csv`

## Summary

- Region ID: 96c9eef9-3b6e-4365-86cd-51dbeccf231a
- Source: aggieland_official
- Baseline cutover date: 2026-06-29
- Total official rows: 1229
- Matched: 375
- Unmatched: 0
- Ambiguous Supabase duplicate: 6
- Inactive matches: 741
- Possible 2.0/DR identity split: 107
- Import-ready rows: 1116
- Import-ready active: 262
- Import-ready inactive: 530
- Import-ready qualified identity: 324
- Previous review required: 187
- Review required: 113
- Review required delta: -74

## Classification Counts

| Classification | Count |
|---|---:|
| inactive_match | 741 |
| matched | 375 |
| possible_2_0_or_dr_identity_split | 107 |
| ambiguous_supabase_duplicate | 6 |

## Top Unmatched Names

- None

## Top Suspicious 2.0/DR Split Pairs

| Pax | Posts | Qs | Supabase Candidates | Raw Pax Master Base Names | Official Base Names |
|---|---:|---:|---|---|---|
| Rosetta | 444 | 107 | Rosetta | Rosetta; Rosetta (DR) | Rosetta; Rosetta (DR) |
| Cowbell | 272 | 24 | Cowbell | Cowbell; Cowbell (Inactive) | Cowbell; Cowbell (Inactive) |
| Magellan | 126 | 1 | Magellan | Magellan; Magellan (inactive) | Magellan; Magellan (inactive) |
| Dial-Up | 115 | 3 | Dial-Up | Dial-Up; Dial-Up (Inactive) | Dial-Up; Dial-Up (Inactive) |
| Victory Lap | 111 | 9 | Victory Lap | Victory Lap; Victory Lap (Devin) | Victory Lap; Victory Lap (Devin) |
| Grizzly | 75 | 3 | Grizzly | Grizzly; Grizzly (2.0) | Grizzly; Grizzly (2.0) |
| Rio | 64 | 2 | Rio | Rio; Rio (DR) | Rio; Rio (DR) |
| Igloo | 44 | 0 | Igloo | Igloo; Igloo (inactive) | Igloo; Igloo (inactive) |
| Pellet | 41 | 3 | Pellet | Pellet; Pellet (inactive) | Pellet; Pellet (inactive) |
| Chip | 37 | 6 | Chip | Chip; Chip (inactive) | Chip; Chip (inactive) |
| Goose | 33 | 1 | Goose | Goose; Goose (inactive) | Goose; Goose (inactive) |
| Piccolo | 30 | 0 | Piccolo | Piccolo; Piccolo (inactive) | Piccolo; Piccolo (inactive) |
| Griswold | 29 | 0 | Griswold | Griswold; Griswold (inactive) | Griswold; Griswold (inactive) |
| Abacus | 27 | 0 | Abacus | Abacus (Inactive); Abacus | Abacus; Abacus (Inactive) |
| Wrangler | 26 | 0 | Wrangler | Wrangler; Wrangler (2.0) | Wrangler; Wrangler (2.0) |
| Butterfly | 25 | 0 | Butterfly | Butterfly; Butterfly (inactive) | Butterfly; Butterfly (inactive) |
| Rebar | 21 | 0 | Rebar | Rebar; Rebar (inactive) | Rebar; Rebar (inactive) |
| Seabiscuit | 21 | 0 | Seabiscuit | Seabiscuit (Inactive); Seabiscuit | Seabiscuit; Seabiscuit (Inactive) |
| Pellet (inactive) | 18 | 0 | Pellet (inactive) | Pellet; Pellet (inactive) | Pellet; Pellet (inactive) |
| Beast | 16 | 2 | Beast | Beast (2.0); Beast | Beast; Beast (2.0) |
| Shocker | 12 | 0 | Shocker | Shocker; Shocker (inactive); Shocker (inactive 2) | Shocker; Shocker (inactive 2); Shocker (inactive) |
| Bandit | 11 | 0 | Bandit | Bandit; BANDIT (DJ) | Bandit; BANDIT (DJ) |
| Water boy | 8 | 0 | Water boy | Water boy; Water Boy (DR) | Water boy; Water Boy (DR) |
| Roadkill | 7 | 0 | Roadkill | Roadkill (DR); Roadkill | Roadkill; Roadkill (DR) |
| Big Papi | 6 | 0 | Big Papi | Big Papi; Big Papi (Inactive) | Big Papi; Big Papi (Inactive) |
| Slow Pitch | 6 | 0 | Slow Pitch | Slow Pitch; Slow Pitch (inactive) | Slow Pitch; Slow Pitch (inactive) |
| Socrates | 6 | 0 | Socrates | Socrates; Socrates (2.0) | Socrates; Socrates (2.0) |
| Sunshine | 6 | 0 | Sunshine | Sunshine (2.0); Sunshine | Sunshine; Sunshine (2.0) |
| Tapout | 6 | 0 | Tapout | Tap Out (Inactive); Tapout | Tap Out (Inactive); Tapout |
| Dial-Up (Inactive) | 5 | 0 | Dial-Up (Inactive) | Dial-Up; Dial-Up (Inactive) | Dial-Up; Dial-Up (Inactive) |
| Goose (inactive) | 5 | 0 | Goose (inactive) | Goose; Goose (inactive) | Goose; Goose (inactive) |
| Homeboy | 5 | 0 | Homeboy | Homeboy; Homeboy (inactive) | Homeboy; Homeboy (inactive) |
| Sawdust | 5 | 0 | Sawdust | Sawdust; Sawdust (Kotter); Sawdust (Inactive) | Sawdust; Sawdust (Inactive); Sawdust (Kotter) |
| Slide Rule (inactive) | 5 | 0 | Slide Rule (inactive) | Slide Rule; Slide Rule (inactive) | Slide Rule; Slide Rule (inactive) |
| Spud (inactive) | 5 | 0 | Spud (inactive) | Spud; Spud (inactive) | Spud; Spud (inactive) |
| Dr. Seuss | 4 | 0 | Dr. Seuss | Dr. Seuss (2.0); Dr. Seuss (DR); Dr. Seuss | Dr. Seuss; Dr. Seuss (2.0); Dr. Seuss (DR) |
| Fall Guy | 4 | 0 | Fall Guy | Fall Guy (9/11); Fall Guy | Fall Guy; Fall Guy (9/11) |
| Prime | 4 | 0 | Prime | Prime (2.0); Prime | Prime; Prime (2.0) |
| Tap Out (Inactive) | 4 | 0 | Tap Out (Inactive) | Tap Out (Inactive); Tapout | Tap Out (Inactive); Tapout |
| Tarzan (Inactive) | 4 | 0 | Tarzan (Inactive) | Tarzan; Tarzan (Inactive) | Tarzan; Tarzan (Inactive) |
| Baywatch | 3 | 0 | Baywatch | Baywatch (DR); Baywatch | Baywatch; Baywatch (DR) |
| Hancock | 3 | 0 | Hancock | Hancock; Hancock (DR) | Hancock; Hancock (DR) |
| Magellan (inactive) | 3 | 0 | Magellan (inactive) | Magellan; Magellan (inactive) | Magellan; Magellan (inactive) |
| Ronaldo | 3 | 0 | Ronaldo | Ronaldo; Ronaldo (2.0); Ronaldo (Liver King 2.0) | Ronaldo; Ronaldo (2.0); Ronaldo (Liver King 2.0) |
| Yoshi | 3 | 0 | Yoshi | Yoshi (2.0); Yoshi | Yoshi; Yoshi (2.0) |
| Big Papi (Inactive) | 2 | 0 | Big Papi (Inactive) | Big Papi; Big Papi (Inactive) | Big Papi; Big Papi (Inactive) |
| Blue Bell | 2 | 0 | Blue Bell | Blue Bell (inactive); Blue Bell | Blue Bell; Blue Bell (inactive) |
| ButterCup | 2 | 0 | ButterCup | Buttercup (2.0); ButterCup | ButterCup; Buttercup (2.0) |
| Chip (inactive) | 2 | 0 | Chip (inactive) | Chip; Chip (inactive) | Chip; Chip (inactive) |
| Cliffhanger -2nd (inactive) | 2 | 0 | Cliffhanger -2nd (inactive) | Cliffhanger -2nd (inactive) | Cliffhanger -2nd (inactive) |

## Remaining Review-Required Examples

| Classification | Pax | Posts | Qs | Supabase Candidates | Raw Pax Master Base Names | Official Base Names | Reason |
|---|---|---:|---:|---|---|---|---|
| possible_2_0_or_dr_identity_split | Rosetta | 444 | 107 | Rosetta | Rosetta; Rosetta (DR) | Rosetta; Rosetta (DR) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Cowbell | 272 | 24 | Cowbell | Cowbell; Cowbell (Inactive) | Cowbell; Cowbell (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Magellan | 126 | 1 | Magellan | Magellan; Magellan (inactive) | Magellan; Magellan (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Dial-Up | 115 | 3 | Dial-Up | Dial-Up; Dial-Up (Inactive) | Dial-Up; Dial-Up (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Victory Lap | 111 | 9 | Victory Lap | Victory Lap; Victory Lap (Devin) | Victory Lap; Victory Lap (Devin) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Grizzly | 75 | 3 | Grizzly | Grizzly; Grizzly (2.0) | Grizzly; Grizzly (2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Rio | 64 | 2 | Rio | Rio; Rio (DR) | Rio; Rio (DR) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Igloo | 44 | 0 | Igloo | Igloo; Igloo (inactive) | Igloo; Igloo (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Pellet | 41 | 3 | Pellet | Pellet; Pellet (inactive) | Pellet; Pellet (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Chip | 37 | 6 | Chip | Chip; Chip (inactive) | Chip; Chip (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Goose | 33 | 1 | Goose | Goose; Goose (inactive) | Goose; Goose (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Piccolo | 30 | 0 | Piccolo | Piccolo; Piccolo (inactive) | Piccolo; Piccolo (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Griswold | 29 | 0 | Griswold | Griswold; Griswold (inactive) | Griswold; Griswold (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Abacus | 27 | 0 | Abacus | Abacus (Inactive); Abacus | Abacus; Abacus (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Wrangler | 26 | 0 | Wrangler | Wrangler; Wrangler (2.0) | Wrangler; Wrangler (2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Butterfly | 25 | 0 | Butterfly | Butterfly; Butterfly (inactive) | Butterfly; Butterfly (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Rebar | 21 | 0 | Rebar | Rebar; Rebar (inactive) | Rebar; Rebar (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Seabiscuit | 21 | 0 | Seabiscuit | Seabiscuit (Inactive); Seabiscuit | Seabiscuit; Seabiscuit (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Pellet (inactive) | 18 | 0 | Pellet (inactive) | Pellet; Pellet (inactive) | Pellet; Pellet (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Beast | 16 | 2 | Beast | Beast (2.0); Beast | Beast; Beast (2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Shocker | 12 | 0 | Shocker | Shocker; Shocker (inactive); Shocker (inactive 2) | Shocker; Shocker (inactive 2); Shocker (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| ambiguous_supabase_duplicate | Trex (2.0) | 12 | 0 | T-Rex (2.0); Trex (2.0) | Trex (2.0); T-Rex (2.0) | T-Rex (2.0); Trex (2.0) | Multiple Supabase members share the same normalized pax_name. |
| possible_2_0_or_dr_identity_split | Bandit | 11 | 0 | Bandit | Bandit; BANDIT (DJ) | Bandit; BANDIT (DJ) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Water boy | 8 | 0 | Water boy | Water boy; Water Boy (DR) | Water boy; Water Boy (DR) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Roadkill | 7 | 0 | Roadkill | Roadkill (DR); Roadkill | Roadkill; Roadkill (DR) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Big Papi | 6 | 0 | Big Papi | Big Papi; Big Papi (Inactive) | Big Papi; Big Papi (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Slow Pitch | 6 | 0 | Slow Pitch | Slow Pitch; Slow Pitch (inactive) | Slow Pitch; Slow Pitch (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Socrates | 6 | 0 | Socrates | Socrates; Socrates (2.0) | Socrates; Socrates (2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Sunshine | 6 | 0 | Sunshine | Sunshine (2.0); Sunshine | Sunshine; Sunshine (2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Tapout | 6 | 0 | Tapout | Tap Out (Inactive); Tapout | Tap Out (Inactive); Tapout | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Dial-Up (Inactive) | 5 | 0 | Dial-Up (Inactive) | Dial-Up; Dial-Up (Inactive) | Dial-Up; Dial-Up (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Goose (inactive) | 5 | 0 | Goose (inactive) | Goose; Goose (inactive) | Goose; Goose (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Homeboy | 5 | 0 | Homeboy | Homeboy; Homeboy (inactive) | Homeboy; Homeboy (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Sawdust | 5 | 0 | Sawdust | Sawdust; Sawdust (Kotter); Sawdust (Inactive) | Sawdust; Sawdust (Inactive); Sawdust (Kotter) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Slide Rule (inactive) | 5 | 0 | Slide Rule (inactive) | Slide Rule; Slide Rule (inactive) | Slide Rule; Slide Rule (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Spud (inactive) | 5 | 0 | Spud (inactive) | Spud; Spud (inactive) | Spud; Spud (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| ambiguous_supabase_duplicate | T-Rex (2.0) | 5 | 0 | T-Rex (2.0); Trex (2.0) | Trex (2.0); T-Rex (2.0) | T-Rex (2.0); Trex (2.0) | Multiple Supabase members share the same normalized pax_name. |
| ambiguous_supabase_duplicate | Top Hat | 5 | 0 | Top Hat | Top Hat (inactive); Top Hat | Top Hat; Top Hat (inactive) | Multiple Supabase members share the same normalized pax_name. |
| possible_2_0_or_dr_identity_split | Dr. Seuss | 4 | 0 | Dr. Seuss | Dr. Seuss (2.0); Dr. Seuss (DR); Dr. Seuss | Dr. Seuss; Dr. Seuss (2.0); Dr. Seuss (DR) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Fall Guy | 4 | 0 | Fall Guy | Fall Guy (9/11); Fall Guy | Fall Guy; Fall Guy (9/11) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Prime | 4 | 0 | Prime | Prime (2.0); Prime | Prime; Prime (2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Tap Out (Inactive) | 4 | 0 | Tap Out (Inactive) | Tap Out (Inactive); Tapout | Tap Out (Inactive); Tapout | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Tarzan (Inactive) | 4 | 0 | Tarzan (Inactive) | Tarzan; Tarzan (Inactive) | Tarzan; Tarzan (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| ambiguous_supabase_duplicate | B-I-N-G-O (2.0) | 3 | 0 | Bingo (2.0); B-I-N-G-O (2.0) | B-I-N-G-O (2.0); Bingo (2.0) | B-I-N-G-O (2.0); Bingo (2.0) | Multiple Supabase members share the same normalized pax_name. |
| possible_2_0_or_dr_identity_split | Baywatch | 3 | 0 | Baywatch | Baywatch (DR); Baywatch | Baywatch; Baywatch (DR) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Hancock | 3 | 0 | Hancock | Hancock; Hancock (DR) | Hancock; Hancock (DR) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Magellan (inactive) | 3 | 0 | Magellan (inactive) | Magellan; Magellan (inactive) | Magellan; Magellan (inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Ronaldo | 3 | 0 | Ronaldo | Ronaldo; Ronaldo (2.0); Ronaldo (Liver King 2.0) | Ronaldo; Ronaldo (2.0); Ronaldo (Liver King 2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Yoshi | 3 | 0 | Yoshi | Yoshi (2.0); Yoshi | Yoshi; Yoshi (2.0) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |
| possible_2_0_or_dr_identity_split | Big Papi (Inactive) | 2 | 0 | Big Papi (Inactive) | Big Papi; Big Papi (Inactive) | Big Papi; Big Papi (Inactive) | Official Pax matched exactly, but related qualified, inactive, or same-base variants require review. |

## Generated Files

- `audit/attendance/official-baseline-matches.csv`
- `audit/attendance/official-baseline-import-ready.csv`
