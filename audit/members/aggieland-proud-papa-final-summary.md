# Aggieland Proud Papa Final Decisions

This is an audit-only correction package. It does not modify runtime code, migrations, schemas, policies, tests, or database data.

## Final relationship plan

- Total approved unique member-to-member relationships: 841
- Relationships already represented by current scalar invited_by_id: 801
- Additional relationships ready for future relationship-table insert: 40
- Excluded acquisition/non-member review rows: 61
- Ignored external DR/outside-region references without member records: 7
- Remaining unresolved review rows: 0

The final plan is safe to use as a future migration input after identity cleanup noted below. Apply only rows where `future_insert_required=true` if the future migration is additive.

## Duplicate Bingo result

Current Aggieland Bingo/equivalent records found: 2

- facfa382-2eda-4904-91ea-4fd8741f8849 | B-I-N-G-O (2.0) | real=Maui 2.0 | home=F3Dads | first_post_date=2024-07-27 | status=active | invited_by_id=0880fb6e-6047-490d-9246-6ef395827cd4
- 871402d0-39d3-4c95-9a46-83989338a5cd | Bingo (2.0) | real=Meadow (Sinko 2.0) | home=F3Dads | first_post_date=2025-08-09 | status=inactive | invited_by_id=888b44db-8ba8-4288-b9b4-fff5ed7d1fc6

- Source row 14, B-I-N-G-O (2.0), Hospital Name Maui 2.0, First AO F3Dads, FNG Date 7/27/24, Proud Papa Maui -> facfa382-2eda-4904-91ea-4fd8741f8849 (B-I-N-G-O (2.0)) -> Maui.
- Source row 29, Bingo (2.0), Hospital Name Meadow (Sinko 2.0), First AO F3Dads, FNG Date 8/9/25, Proud Papa Sinko -> 871402d0-39d3-4c95-9a46-83989338a5cd (Bingo (2.0)) -> Sinko.
- The earlier Proud Papa audit collapsed row 14 onto the Sinko-linked Bingo record. The baseline manual selections contain the separate B-I-N-G-O/Bingo IDs, so the correction affects Proud Papa reconstruction rather than attendance totals.

## Duplicate Top Hat result

Current exact `Top Hat` records found: 2. Current Top Hat-family records including `Top Hat (inactive)`: 3.

- 55ff451c-62dc-4875-805d-88218c5a708a | Top Hat | real=Doug Pittman | home=The Iron | first_post_date=2026-06-17 | status=active | invited_by_id=fc9b0708-761a-4c9c-9341-26bbc797216e
- ce70e528-8546-4178-b435-f11121399fbc | Top Hat | real=Matthew Murphy | home=Watch | first_post_date=2025-09-11 | status=inactive | invited_by_id=5fa6e2ce-c9fe-4fad-8aad-e08442ae820e
- b3d5c189-6fca-40e5-9d7f-760e03ae540e | Top Hat (inactive) | real=Matthew Murphy | home=Watch | first_post_date=2025-09-11 | status=inactive | invited_by_id=5fa6e2ce-c9fe-4fad-8aad-e08442ae820e

- Official Doug Pittman Top Hat, The Iron, 2026-06-17, Proud Papa Mash -> 55ff451c-62dc-4875-805d-88218c5a708a (Top Hat) -> Mash.
- Source row 227, Top Hat, Matthew Murphy, Watch, 9/11/25, Proud Papa Mudder -> ce70e528-8546-4178-b435-f11121399fbc (Top Hat) -> Mudder.
- b3d5c189-6fca-40e5-9d7f-760e03ae540e (Top Hat (inactive)) appears to duplicate Matthew Murphy / Watch / 2025-09-11 / Mudder and should be repaired or merged before applying relationship migrations that depend on canonical member identity.
- The Proud Papa audit had mapped row 227 to Doug Pittman's Mash-linked Top Hat. Attendance baseline data is not modified here, but the duplicate Top Hat (inactive) current record is an identity cleanup issue for a separate repair pass.

## Messi result

- be846ab0-8224-4e38-b02a-1e036e7c4723 | Messi (2.0) | real=Zion Flippen | home=Keep | first_post_date=2023-11-02 | status=inactive | invited_by_id=fe998114-b65c-4a7a-a1e1-eed026fd8f9d
- dc346afb-2f85-4912-9d10-cb19e2349967 | Messi (DR) | real= | home=ZSugarland | first_post_date= | status=inactive | invited_by_id=

- Rows 795 (Betty) and 936 (Spellchek) use raw token Messi and are resolved to be846ab0-8224-4e38-b02a-1e036e7c4723 (Messi (2.0)).
- Rows whose raw token is explicitly `Messi (DR)` remain matched to Messi (DR); this finalizer only changes unresolved raw token `Messi`.

## Exclusions

- Acquisition/non-member tokens excluded: First Friday; Online; Other; Self; Signs; SocialMedia; Texags; TexAgs; Walk-Up; website; Website; Wife
- Ignored external references: Dean Davis; Deliverance; Dilly Dilly; ILT; Rocky Top; Underoos (F3 Marshall)
- Self-reference excluded: Mufasa -> Mufasa.

## Baseline and duplicate-name observations

- Manual duplicate-name selections found: Top Hat -> selected_member_id=55ff451c-62dc-4875-805d-88218c5a708a (Official Top Hat is Doug Pittman; map to active Iron member.); B-I-N-G-O (2.0) -> selected_member_id=facfa382-2eda-4904-91ea-4fd8741f8849 (Distinct 2.0 PAX from Bingo (2.0); choose candidate with hospital name Maui 2.0.); Bingo (2.0) -> selected_member_id=871402d0-39d3-4c95-9a46-83989338a5cd (Distinct 2.0 PAX.)
- Top Hat baseline match rows inspected: Top Hat | member_id= | candidates=55ff451c-62dc-4875-805d-88218c5a708a; ce70e528-8546-4178-b435-f11121399fbc | raw_real_name=Doug Pittman | raw_first_ao=Iron | raw_fng_date=2026-06-17 | raw_proud_papa=Mash
- No additional duplicate display-name collapses were accepted by the final Proud Papa audit beyond the explicitly corrected Bingo and Top Hat cases. Parenthetical DR matches were accepted only as inviter matches, not as duplicate invited-member collapses.
- Correcting these mappings changes the Proud Papa reconstruction artifacts only. It does not change attendance baseline data or production member rows.

## Output files

- audit/members/aggieland-proud-papa-final-decisions.csv
- audit/members/aggieland-proud-papa-final-relationship-plan.csv
- audit/members/aggieland-proud-papa-final-summary.md

