# West Houston workbook refresh delta

> Status: candidate canonical refresh only. The approved migration and approved human-resolution manifest were not modified. One new FNG/first-post discrepancy requires human review before the final migration is regenerated.

## Executive result

The fresh workbook advances the cutoff from **2026-09-22** to **2026-09-29**. Existing DOGE identity and workout decisions reapply deterministically. There are **no new analyzer collision groups**. WH-ID-004 changed shape because the old one-row `Bird Shot` identity was corrected in place to `BirdShot`; the same workbook row now belongs to the surviving approved `Birdshot` identity, so the approved merge outcome remains intact without a new identity decision.

The refresh adds **9 canonical members**, **47 primary sessions**, **511 attendance relationships**, **48 Q/VQ assignments**, and **2 explicit FNG evidence records**. DD and DR remain excluded from all canonical session, attendance, Q, and FNG totals.

## Source workbook delta

| Measure | Approved source | Fresh source | Delta |
| --- | ---: | ---: | ---: |
| Physical rows examined | 56,359 | 56,359 | +0 |
| Non-empty rows examined | 48,337 | 48,598 | +261 |
| Legitimate source attendance rows | 43,042 | 43,554 | +512 |
| Normalized attendance records | 44,804 | 45,324 | +520 |
| Proposed source identities | 1,253 | 1,261 | +8 |
| Proposed source sessions | 4,684 | 4,734 | +50 |
| Explicit Q/VQ assignments | 3,589 | 3,637 | +48 |
| Explicit FNG evidence | 492 | 494 | +2 |
| Possible identity collisions | 67 | 66 | -1 |
| Attendance-before-FNG discrepancies | 18 | 19 | +1 |

## Post-human canonical delta

| Measure | Approved canonical | Refresh candidate | Delta |
| --- | ---: | ---: | ---: |
| Canonical members | 1,185 | 1,194 | +9 |
| Canonical primary sessions | 3,695 | 3,742 | +47 |
| Canonical attendance relationships | 42,621 | 43,132 | +511 |
| Canonical Q/VQ assignments | 3,588 | 3,636 | +48 |
| Canonical FNG evidence | 492 | 494 | +2 |
| Excluded DD sessions | 871 | 874 | +3 |
| Excluded DD attendance | 1,942 | 1,951 | +9 |
| Excluded DD Q/VQ | 0 | 0 | +0 |
| Excluded DD FNG evidence | 0 | 0 | +0 |
| Excluded DR sessions | 116 | 116 | +0 |
| Excluded DR attendance | 241 | 241 | +0 |
| Excluded DR Q/VQ | 1 | 1 | +0 |
| Excluded DR FNG evidence | 0 | 0 | +0 |

The 50 new normalized source sessions comprise 47 BD, 3 DD. Only eligible primary BD sessions flow into the candidate canonical totals.

## Newly encountered PAX names

The exact raw-name additions are: `BirdShot`, `Conspiracy`, `Dr. Phil`, `Drifter`, `Fn D Paddle`, `Forcefield`, `Gas Leak`, `Grey's Anatomy`, `Podcast`, `Yellow Card`.

`BirdShot` is the corrected spelling at the old Bird Shot provenance row, not a new source identity. The nine genuinely new source identities are:

| Proposed F3 name | Raw variants | Active range |
| --- | --- | --- |
| Podcast | Podcast (2) | 2026-09-12 to 2026-09-26 |
| Fn D Paddle | Fn D Paddle (44) | 2025-09-27 to 2026-09-26 |
| Conspiracy | Conspiracy (2) | 2026-09-24 to 2026-09-24 |
| Drifter | Drifter (1) | 2026-09-26 to 2026-09-26 |
| Yellow Card | Yellow Card (1) | 2026-09-05 to 2026-09-05 |
| Gas Leak | Gas Leak (1) | 2026-09-15 to 2026-09-15 |
| Forcefield | Forcefield (1) | 2026-09-16 to 2026-09-16 |
| Grey's Anatomy | Grey's Anatomy (1) | 2026-09-29 to 2026-09-29 |
| Dr. Phil | Dr. Phil (1) | 2026-09-26 to 2026-09-26 |

The only raw name removed is `Bird Shot`; its exact source row is retained under `BirdShot`.

## Identity and collision review

- New analyzer collision groups requiring review: **0**.
- Previously approved identity groups that fail to map: **0**.
- Approved group requiring a deterministic source-shape adjustment: **WH-ID-004** only. Its old `Bird Shot` source key disappeared, but its sole provenance (`The Iron Gate`, row 891) is present under the existing `Birdshot` source key in the fresh parse. The approved canonical name remains `Birdshot`.
- The old Bird Shot/Birdshot analyzer collision is therefore absent from the fresh analyzer's 66 collision groups.

## FNG and first-post review

All 18 existing `Unsure` decisions still map to the same source identities and retain the approved representation: earlier verified attendance is canonical first-post history, while later explicit FNG evidence remains preserved. No existing decision was reinterpreted.

One new discrepancy requires review as **WH-FNG-019**:

- **Lightningrod** has verified attendance on **2025-06-12** at **The Corridor** (The Corridor row 2723) and later explicit FNG evidence on **2026-08-25** at **The Oasis** (The Oasis row 2539).
- This source identity is already part of the approved Lightningrod cross-group merge **WH-ID-034, WH-ID-035, WH-XID-001**. The existing identity decision remains valid; only the newly surfaced FNG-date discrepancy lacks a human response.
- The candidate canonical output safely uses the earliest verified attendance for first-post and preserves the later explicit FNG metadata. This is a provisional safe representation, not a new human decision.

## The Knot and Convergence decisions

| Review ID | Fresh representation | Status |
| --- | --- | --- |
| WH-WO-001 | 2026-06-13, The Knot, Bootcamp, 12 attendees | Still valid |
| WH-WO-002 | 2026-06-25, The Knot, Bootcamp, 8 attendees | Still valid |
| WH-WO-003 | 2025-07-12, The Corridor, Bootcamp, 7 attendees, The Corridor 4-year anniversary | Still valid |

The Convergence source location remains preserved in provenance while the canonical record remains The Corridor anniversary event; no permanent Convergence AO is created.

## Preserved domain rules and checks

- DD and DR are excluded from canonical sessions, attendance, statistics, Q assignments, and FNG evidence.
- VQ remains represented as Q evidence.
- Every canonical FNG is also a canonical attendee; FNG remains additive metadata.
- No inviter relationship is inferred.
- DOGE remains the single `match_existing` candidate.
- Canonical Q/FNG contradictions: **0**.
- Existing approved canonical artifact, manifest, and SQL migration were not modified.

## New human decisions needed before migration regeneration

1. **WH-FNG-019 — Lightningrod FNG/first-post discrepancy.** Confirm whether the earlier attendance and later explicit FNG evidence refer to the same person, whether the FNG tag/date is wrong, whether the earlier attendance is wrong, or whether the case remains unsure.

No new identity-collision or workout-grouping decision is required by this refresh.
