# Effective Member Stats

# Status

Status: Draft
Owner: JK
Last Updated: 2026-07-12

## Purpose

Provide one stats source for every region.

Regions may have:
- no historical baseline
- an imported historical baseline
- all future activity recorded in The Q

The app should not care which case applies.

## Assumptions

- Sessions are the authoritative record of attendance.
- Baseline data is immutable after verification.
- Only one active baseline snapshot exists per region.
- Every effective row represents exactly one region/member pair.

## Core Formulas

effective_posts =
baseline_posts
+
post_cutover_posts

effective_qs =
baseline_qs
+
post_cutover_qs

## Region Behavior

For regions without a baseline:
- baseline contribution is 0
- count all sessions

For regions with a baseline:
- use the active baseline snapshot
- count only sessions after baseline_through_date

## Aggieland

- baseline source: official Aggieland totals
- baseline frozen: 2026-07-12
- The Q owns future sessions after the chosen cutover boundary
- old Aggieland importer is retired after final import

## Old 300

- no baseline
- count all sessions

## Canonical Read Source

All runtime stats reads should eventually use:
effective_member_stats

Views should not contain region-specific logic.

Application code should not read member_stats directly once migration is complete.

## Rebuild Behavior

Do not increment counters directly.

Rebuild from:

- immutable baseline data (if present)
- authoritative session history

The rebuild derives every cumulative value from source data.

No cumulative counters are incremented directly.

This allows session edits, deletes, attendance changes, and Q changes to correct stats automatically.

## Fields

At minimum:
- region_id
- member_id
- total_posts
- total_qs
- first_post_date
- last_post_date
- last_q_date
- posts_30_days
- posts_90_days
- qs_30_days
- qs_90_days
- favorite_ao
- updated_at

## Cumulative Fields

- total_posts
- total_qs
- first_post_date
- last_post_date
- last_q_date

## Derived Rolling Fields

- posts_30_days
- posts_90_days
- qs_30_days
- qs_90_days
- favorite_ao

## Counting Rules

- one post per member per session
- Qs counted from q_ids, with legacy q_id fallback
- Q should not receive two posts if also present in attendee_ids
- unresolved names do not count until linked to a member
- visitors without member records do not count toward member stats

A session contributes at most one post per member.

A member may receive:
- one post
- one Q

from the same session.

Attendance edits are reflected on rebuild.

Deleted sessions remove their contribution.

Session ownership is determined solely by the current session record.

## Cutover Rules

A baseline must define:
- region_id
- source
- version
- baseline_through_date
- active status

Sessions on or before baseline_through_date are excluded from the additive session count for that region.

Regions without an active baseline have no date exclusion.

## Rebuild Functions

Need:
- rebuild_effective_member_stats_for_member(member_id)
- rebuild_effective_member_stats_for_region(region_id)

Member rebuild runs after normal session changes.
Region rebuild is for imports, repairs, and validation.

## Migration PLan

1. Build effective stats calculation.
2. Populate effective_member_stats for Aggieland and Old 300.
3. Compare against expected totals.
4. Switch service-layer reads.
5. Keep member_stats temporarily for rollback.
6. Remove or deprecate direct member_stats reads later.

## Invariants

- one effective row per region/member
- baseline rows are immutable except explicit repair
- no region-name special cases
- no double-counting across baseline and sessions
- repeated rebuilds produce the same result

## Non-Goals

This system is NOT responsible for:

- Importing historical sessions.
- Importing historical baseline statistics.
- Creating members from external systems.
- Reconciling duplicate identities.
- Maintaining official import pipelines.

Those are separate onboarding processes.

Effective Member Stats assumes historical data has already been reconciled.