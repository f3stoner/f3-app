# Admin/Data Review requirements

The triage demonstrates these required review states and actions.

## Review states

- Internally corroborated: evidence supports a proposed resolution, but nothing is applied automatically.
- Internal approval required: an admin must accept, reject, or defer a proposed resolution.
- Region input required: the evidence cannot establish historical identity, FNG date, or Proud Papa.
- Identity collision: potentially different humans or an existing canonical split/merge problem; highest priority and no bulk action.
- Roster-only: historical/inactive, recent missing PAX, possible alternate identity, or insufficient evidence.

## Evidence the reviewer needs

- Canonical and source values side by side, with source sheet and row.
- Exact and normalized F3/hospital names, phone/email agreement indicators, and missing-value indicators.
- Earliest attendance, first-post date, Q history, AO history, and source-date semantics.
- Existing and proposed Proud Papa relationships, including unresolved external-region names.
- Other records in the same collision group and any canonical duplicate candidates.

## Reviewer actions

- Confirm same human, confirm different humans, accept spelling variation, or mark alias.
- Keep canonical value, accept source candidate, request region input, or defer.
- Resolve an inviter to a canonical member or retain it as unresolved historical evidence.
- Mark an AO-specific workout date so it cannot overwrite a true FNG date.
- Record reviewer, decision time, evidence, notes, and source-snapshot version.
- Generate a concise external question set without database IDs or implementation details.

Any future apply workflow should be separate from review, require explicit authorization, show the exact field-level effect, and block bulk merges for identity-collision cases.
