# Simplified Sandbox cleanup and roster reseed

Review artifacts only. Nothing has been executed or deployed.

## What the script deletes

- Sandbox sessions and attendance-bearing session records
- Q-slot commitments tied to disposable members; Q slots themselves are preserved
- Planned workouts and commitments
- Campaigns, enrollments, and contributions
- Feed events, comments, and reactions
- Announcements and Third-F discussions
- Region import staging data, member activity, and derived member statistics
- Generic Sandbox media metadata and attachments
- Disposable Sandbox members and their participant/inviter relationships

Storage objects referenced by deleted generic media metadata are not deleted by
this SQL. Export their exact paths first if those objects also need cleanup.

## What it preserves

- The Sandbox region and all region/public-site configuration
- All seven existing AOs, sites, and recurring schedules
- All existing Q slots, with assignments to deleted members cleared
- Existing Rawhide, Mario, and Stoner access
- Authentication users and profiles
- Global reference data and all production-region records
- `member_merges` and `member_change_audit`
- Member identities required by immutable merges or audit history; these are
  renamed to neutral archive labels, made inactive, and hidden from the roster

## What it creates

- Thirty deterministic fictional members
- Twenty-seven active and three inactive members
- Distribution across the seven existing AOs
- Five recent fictional FNGs and several fictional Proud Papa relationships
- No sessions, attendance, Q slots, plans, campaigns, or generated activity

Run [sandbox-verification.sql](./sandbox-verification.sql) after the transaction.
Any guard or verification failure inside the reset transaction rolls it back.

The proposed DOGE migration and grant SQL remain separate and unapplied. They
are not part of this cleanup.
