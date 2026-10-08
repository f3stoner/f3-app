# DOGE West Houston roster reconciliation

## Executive summary

This package is a read-only audit. It does not apply or recommend automatic identity merges or production updates.

- Workbook roster rows: 1,191
- Normalized unique identities: 937
- HIGH_CONFIDENCE_EXISTING: 385
- NEEDS_HUMAN_REVIEW: 403
- ROSTER_ONLY: 106
- NO_ACTION: 43
- Suspected duplicate/collision groups: 130

## Potential enrichments

- home_ao: 431
- hospital_name: 407
- inviter_member_id: 334

## Existing-data conflicts

- first_post_date: 152
- hospital_name: 9
- identity: 4
- inviter: 81

## Schema observations

- `members` is the canonical human identity table. It stores F3 name (`pax_name`), hospital name (`real_name`), text home AO (`home_ao`), canonical first-post date (`first_post_date`), status, and a legacy scalar inviter reference (`invited_by_id`).
- `member_inviters` is the authoritative multi-inviter/Proud Papa relationship. Both sides are foreign keys to canonical `members` rows. `invited_by_id` remains a transitional scalar mirror.
- Region membership/activity is modeled with `region_participants`; authenticated access is separate in `region_access` through user profiles.
- FNG details also appear in session `fngs` JSON, and attendance history supplies corroborating first-post evidence.
- Q/VQ history is represented by session Q assignments (`q_ids`/`q_id`); there is no separate member VQ-date field.
- Member email and phone are not modeled on the canonical `members` row. The workbook's email/phone values are retained as audit evidence only.
- Home AO is currently text, not an immutable AO foreign key.
- Durable duplicate resolution exists through `member_merges`. Import staging also supports explicit reviewed identity resolutions; no general member-alias table was found.
- Emergency contacts, addresses, blood type, birthdays, and similar sensitive fields were intentionally excluded from reconciliation output.

## First-workout interpretation

- Tower: original_first_post_or_origin_mixed (63 records)
- The Iron Gate: original_first_post_or_origin_mixed (47 records)
- Valhalla: ao_specific_first_workout (37 records)
- The Branch: ao_specific_or_ambiguous_first_workout (67 records)
- The Oasis: no_first_post_field (51 records)
- The Point: original_date_and_ao_mixed (452 records)
- The Valley: explicit_original_first_post (31 records)
- The Knot: ao_specific_or_ambiguous_first_workout (32 records)
- The Corridor: original_date_or_ao_mixed (307 records)
- The HOP: ao_specific_or_ambiguous_first_workout (104 records)

## Future Admin/Data Review dashboard

Useful review data would include side-by-side source and canonical values, source-sheet citations, identity candidates and evidence, attendance corroboration, field-level conflicts, inviter resolution, collision groups, reviewer decision and notes, and a clear stale-snapshot indicator. Any future apply action should remain separate from review and require explicit confirmation.
