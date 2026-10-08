# F3 SacTown 2026 YTD historical extension — read-only dry run

Source window: 2026-01-01 through 2026-08-30. Existing Aug. 31–Sep. 12 data is outside the candidate set and remains untouched.

## Control totals

- Source session groups: 542
- Excluded special-event sessions: 2
- Final importable sessions: 540
- Attendance relationships: 4436
- Q relationships: 564
- FNG records: 134
- Unique source names: 252
- Normalized identities: 251
- Existing SacTown matches: 64
- Proposed new identities: 158
- Manual-review identities: 29
- Sessions blocked by unresolved manual identities: 125

## Live target preflight

- Region state: `production/onboarding`; reporting=false.
- Current counts: 71 members, 40 sessions, 286 attendance relationships, 40 Q relationships, 7 FNG records, 18 AOs, 12 sites, 18 schedules.
- Protected Aug. 31–Sep. 12 baseline: 36 sessions, 265 attendance, 36 Qs, 4 FNGs; hash `94ad388764830c1612cc764b85b7fdeb2d392796e5bcdb4bd0a4fa2acfcd91ec`.
- Duplicate candidate sessions: 0.
- Commit blocker: the live region classification differs from the original test/active seed report.

## Expected database counts

- Minimum while preserving every source relationship: 233 members, 580 sessions, 4722 attendance relationships, 604 Q relationships, 141 FNG records, 19 AOs, 12 sites, 19 schedules.
- Maximum if every manual identity becomes new: 258 members; all other counts unchanged.
- A lower bound of 229 members is possible only if one or more manual identities are deferred/ignored, which would block or reduce source relationships.
- Relationship totals assume every manual identity is resolved rather than ignored.

## Deterministic IDs and source keys

- Import project ID: `6a9fade6-aeda-5fcf-a383-30278385f3b6`
- Batch ID: `76ba6b0d-b12a-5de4-b1f4-716e4a828b44`
- Session key: `2026-ytd:session:{YYYY-MM-DD}:{normalized_ao}`.
- Session UUID seed: `sactown-demo:extension:{session_key}:v1`.
- Proposed member UUID seed: `sactown-demo:extension:2026-ytd:member:{normalized_name}:v1`.
- Existing SacTown members, AOs and sites retain their current IDs. Manual-review identities receive no proposed canonical ID until resolved.

## AO/site coverage

| AO | Sessions | Coverage | Status | Site | Existing AO |
|---|---:|---|---|---|---|
| Chain Breakers | 13 | 2026-06-01–2026-08-24 | active | Southport Levee Trailhead | yes |
| Ironstride | 35 | 2026-01-02–2026-08-28 | active | McKinley Park | yes |
| McKinley | 35 | 2026-01-02–2026-08-28 | active | McKinley Park | yes |
| Q-Source | 13 | 2026-06-01–2026-08-24 | active | Nugget Market Cafe | yes |
| Rumble | 27 | 2026-01-03–2026-07-04 | retired | McKinley Park | no |
| SafariLand | 15 | 2026-05-19–2026-08-25 | active | William Land Park | yes |
| Statehouse | 34 | 2026-01-05–2026-08-24 | active | Franklin D. Roosevelt Park | yes |
| Talko Tuesday | 34 | 2026-01-06–2026-08-25 | active | Oki Park | yes |
| Terminus | 35 | 2026-01-01–2026-08-27 | active | Railroad Museum | yes |
| The American | 34 | 2026-01-07–2026-08-26 | active | Oak Meadow Park | yes |
| The Beacon | 27 | 2026-02-25–2026-08-26 | active | Southport Levee Trailhead | yes |
| The Burbs | 35 | 2026-01-01–2026-08-27 | active | Arden Park | yes |
| The Gate | 34 | 2026-01-10–2026-08-29 | active | Southport Gateway Park | yes |
| The Oak | 34 | 2026-01-07–2026-08-26 | active | Oak Meadow Park | yes |
| The Refinery | 36 | 2026-01-03–2026-08-29 | active | McKinley Park | yes |
| The River | 35 | 2026-01-01–2026-08-27 | active | Glenbrook Park | yes |
| The Rock | 34 | 2026-01-06–2026-08-25 | active | Granite Regional Park | yes |
| The Ruff | 13 | 2026-06-01–2026-08-24 | active | Southport Levee Trailhead | yes |
| Winds of Change | 17 | 2026-05-09–2026-08-29 | active | Southport Gateway Park | yes |

## Excluded special events

- 2026-05-02 — 2026 CSAUP - Gloom Beach Classic: 14 attendees, 4 Qs; excluded because Sites has no AO/site/time metadata.
- 2026-07-11 — 2026 CSAUP - Tahoe Triple Crown: 23 attendees, 2 Qs; excluded because Sites has no AO/site/time metadata.

## Manual identity review

- **Aggie** — duplicate_roster_rows; external exact-name candidates: none.
- **Bam Bam** — external_exact_name_candidate; external exact-name candidates: Bam Bam @ F3 West Houston.
- **Blue** — external_exact_name_candidate; external exact-name candidates: Blue @ F3 Aggieland.
- **Boyardee** — external_exact_name_candidate; external exact-name candidates: Boyardee @ F3 West Houston.
- **Cheese Steak** — external_exact_name_candidate; external exact-name candidates: Cheesesteak @ F3 West Houston.
- **Duck Hunt** — external_exact_name_candidate; external exact-name candidates: Duck Hunt @ F3 Aggieland.
- **Flo** — external_exact_name_candidate; external exact-name candidates: Flo @ F3 Aggieland.
- **Flounder** — external_exact_name_candidate; external exact-name candidates: Flounder @ F3 West Houston.
- **FNG-Jack** — fng_or_placeholder_style_name; external exact-name candidates: none.
- **Frodo** — multiple_external_exact_name_candidates; external exact-name candidates: Frodo @ F3 Aggieland, Frodo @ F3 West Houston.
- **Hotpants** — external_exact_name_candidate; external exact-name candidates: Hot Pants @ F3 Aggieland.
- **Lasso** — external_exact_name_candidate; external exact-name candidates: Lasso @ F3 West Houston.
- **Mike (FNG)** — fng_or_placeholder_style_name; external exact-name candidates: none.
- **Miyagi** — external_exact_name_candidate; external exact-name candidates: Miyagi @ F3 West Houston.
- **Mule** — external_exact_name_candidate; external exact-name candidates: Mule @ F3 West Houston.
- **Nathan (FNG)** — fng_or_placeholder_style_name; external exact-name candidates: none.
- **Paperboy** — external_exact_name_candidate; external exact-name candidates: PaperBoy @ F3 West Houston.
- **Pinky** — external_exact_name_candidate; external exact-name candidates: Pinky @ F3 West Houston.
- **Postal** — external_exact_name_candidate; external exact-name candidates: Postal @ F3 North Katy.
- **Prius** — external_exact_name_candidate; external exact-name candidates: Prius @ F3 West Houston.
- **Red Ryder** — external_exact_name_candidate; external exact-name candidates: Red Ryder @ F3 West Houston.
- **Road Rash** — external_exact_name_candidate; external exact-name candidates: Road Rash @ F3 West Houston.
- **Rx** — external_exact_name_candidate; external exact-name candidates: Rx @ F3 West Houston.
- **Sea Biscuit / Seabiscuit** — external_exact_name_candidate, normalized_spelling_collision; external exact-name candidates: Seabiscuit @ F3 Aggieland.
- **Splinter** — external_exact_name_candidate; external exact-name candidates: Splinter @ F3 Aggieland.
- **Sub Prime** — external_exact_name_candidate; external exact-name candidates: Subprime @ F3 West Houston.
- **Sunshine** — multiple_external_exact_name_candidates; external exact-name candidates: Sunshine @ F3 Aggieland, sunshine @ F3 West Houston.
- **TeaTime** — external_exact_name_candidate; external exact-name candidates: TeaTime @ F3 Aggieland.
- **Tonka** — external_exact_name_candidate; external exact-name candidates: Tonka @ F3 Aggieland.

## Rollback ledger

- Import project: `6a9fade6-aeda-5fcf-a383-30278385f3b6`
- Batch: `76ba6b0d-b12a-5de4-b1f4-716e4a828b44`
- Ledger every inserted table/id/source-key/row-hash; never ledger pre-existing rows.
- Delete derived rows first, then sessions, unreferenced new members, new inactive schedule/AO/site records, and finally staging/project rows. Rebuild SacTown stats afterward.

## Required post-import validations

```sql
-- Window and duplicate controls
select count(*) from sessions where region_id = '45a32e90-3f95-5261-bb49-5719f6f77cca' and date between '2026-01-01' and '2026-08-30';
select date, ao_id, start_time, count(*) from sessions where region_id = '45a32e90-3f95-5261-bb49-5719f6f77cca' group by date, ao_id, start_time having count(*) > 1;

-- Existing seed preservation
select count(*) as sessions, sum(jsonb_array_length(attendee_ids)) as attendance, sum(cardinality(coalesce(q_ids, '{}'::uuid[]))) as qs from sessions where region_id = '45a32e90-3f95-5261-bb49-5719f6f77cca' and date between '2026-08-31' and '2026-09-12';

-- Relationship integrity
select s.id from sessions s cross join lateral jsonb_array_elements_text(s.attendee_ids) a(member_id) left join members m on m.id = a.member_id::uuid where s.region_id = '45a32e90-3f95-5261-bb49-5719f6f77cca' and s.date between '2026-01-01' and '2026-08-30' and m.id is null;
select s.id, q.member_id from sessions s cross join lateral unnest(coalesce(s.q_ids, '{}'::uuid[])) q(member_id) where s.region_id = '45a32e90-3f95-5261-bb49-5719f6f77cca' and s.date between '2026-01-01' and '2026-08-30' and not (s.attendee_ids ? q.member_id::text);

-- Region safety
select id, environment, lifecycle_status, include_in_reporting, timezone from regions where id = '45a32e90-3f95-5261-bb49-5719f6f77cca';
```

The JSON manifest contains every source row reference, deterministic ID, staged status, AO mapping, exclusion, identity candidate and proposed ledger ID.
