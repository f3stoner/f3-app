# DOGE roster reconciliation triage

This is a read-only second-stage review. No production records, identities, schema, or UI were changed.

## Original review cases by primary reason

- AO-specific first-workout date vs likely true FNG date: 67
- Conflicting FNG dates: 59
- Conflicting inviter/Proud Papa: 1
- Conflicting phone/email: 0
- F3-name collision with different hospital names: 58
- Inviter/Proud Papa cannot be resolved to canonical member: 45
- Likely hospital-name spelling variation: 18
- Missing identifying information: 147
- Multiple canonical member candidates: 4
- Other: 4
- Suspected duplicate canonical members: 0

## Review tiers

- DOGE_INPUT_REQUIRED: 70
- INTERNAL_HIGH_CONFIDENCE: 265
- INTERNAL_REVIEW: 6
- TRUE_IDENTITY_COLLISION: 62

## Collision groups

- insufficient evidence: 0
- likely different humans sharing F3 name: 21
- likely same human / duplicate record: 98
- likely same human / spelling or alias variation: 6
- possible existing canonical-data problem: 5

## Roster-only identities

- active/recent PAX unexpectedly missing from The Q: 0
- historical/inactive West Houston PAX: 91
- insufficient evidence: 15
- potentially represented under another canonical identity: 0

Questions remaining for DOGE: 98

## Five highest-risk findings

1. Possible duplicate/conflicting canonical F3 identities (5)
2. Same F3 name associated with different hospital names (21)
3. First-post dates conflict with workbook history (59)
4. Proud Papa references cannot be resolved canonically (45)
5. Roster-only identities lack enough activity evidence (15)

## Model and tooling implications

- The canonical member model supports the core audit fields, but `home_ao` remains free text and cannot reliably distinguish current home AO from original AO.
- Proud Papa is correctly modeled as canonical member relationships, but external-region or historical inviters need an explicit unresolved-reference state instead of being forced into a member match.
- Q/VQ history is session-derived; spreadsheet VQ dates need provenance-aware comparison rather than a new member field.
- Reconciliation tooling should preserve field semantics by source sheet, distinguish AO-first-workout from original FNG date, and group evidence before creating questions.
- Collision review needs explicit split/same-human/alias decisions and must never default to merging on F3 name alone.
