# Region Onboarding and Canonical Identity Resolution

## Status

**Proposed architecture**

This document defines the target architecture and phased roadmap for onboarding new F3 regions into The Q.

It is intended to guide product design, database design, implementation sequencing, testing, and future operational procedures.

---

## Context

The Q is a vanilla JavaScript PWA backed by Supabase.

The known-user multi-region lifecycle is now operational in production.

The current multi-region model includes:

### Canonical Member

One canonical member record represents one human across all F3 regions.

Member merges are operational and have been successfully used in production.

### Home Region

The canonical home region is stored on:

```text
members.region_id
```

The home region is the permanent identity anchor for the member unless it is explicitly changed through a separate correction or transfer workflow.

### Region Participants

Regional participation is represented through:

```text
region_participants
```

This is the operational directory of canonical members known through activity in a region.

It includes:

* Home-region members
* Cross-region visitors
* Historical attendees
* Historical Qs and co-Qs
* Imported roster-only participants
* Other canonical members with region-specific participation evidence

Participation alone does not grant workspace access.

### Region Access

Authenticated workspace access is represented through:

```text
region_access
```

This determines which regional workspaces a user can open or manage.

Region access is separate from:

* Canonical identity
* Home-region membership
* Historical attendance
* Regional participation

### Workspace Model

The application distinguishes between:

* Home Region
* Active Region
* Accessible Regions

### Existing Known-User Lifecycle

The following lifecycle is now operational:

1. A canonical member participates in another region.
2. The member becomes a region participant.
3. The system may present a region invitation.
4. The authenticated user may accept the invitation.
5. A `region_access` record is created.
6. The new region becomes available in the workspace switcher.

This lifecycle should remain responsible for authenticated access after a region is onboarded.

---

# Problem

The existing region import process predates canonical members.

It assumes that every imported person becomes a new row in `members`.

That behavior is no longer acceptable.

A direct import would create duplicate canonical identities when an imported region contains people who already exist elsewhere in The Q.

This is especially likely when:

* A PAX has posted in multiple regions
* A PAX has relocated
* A PAX appears in destination-region history before onboarding
* Multiple regions contain overlapping historical attendance
* A person appears under different F3-name spellings
* A person has changed F3 names
* Legacy source files contain inconsistent names
* A source roster contains visitors or former members
* The canonical member already has a claimed user account

Before importing a new region into production, The Q needs a staged identity-resolution pipeline.

---

# Strategic Design Decision

New-region onboarding must be designed as an **import project and identity-resolution workflow**, not as a direct roster import.

The imported region’s data is treated as source evidence.

Imported people are not canonical members.

They are project-scoped source identities that must resolve to canonical members before historical data is committed.

The core rule is:

> Imported identities are staged source identities, not canonical members waiting to be created.

The permanent provenance chain should be:

```text
Raw source row
    ↓
Normalized source record
    ↓
Source identity
    ↓
Canonical match candidates
    ↓
Reviewed identity resolution
    ↓
Canonical member
    ↓
Region participant
    ↓
Imported production records
```

This distinction is required to maintain a clean canonical directory while scaling onboarding to dozens or hundreds of regions.

---

# Core Invariants

The onboarding system must preserve the following invariants.

## Identity

* One canonical member should represent one human.
* An imported source identity is not a canonical member.
* Candidate generation must not alter production identity records.
* A canonical member is reused only after an explicit resolution.
* A new canonical member is created only after an explicit resolution.
* New canonical members should be created during controlled commit, not during review.
* Existing canonical home regions must not be silently overwritten by onboarding.

## Participation

* Historical attendance and Q records attach to canonical member IDs.
* Region participants are created from canonical participation evidence.
* Imported roster-only people may become region participants even if they have no historical sessions.
* Participation does not grant region access.

## Access

* `region_access` remains separate from identity resolution and participation.
* Importing a person does not automatically grant workspace access.
* Existing invitation and join-region flows handle authenticated access after onboarding.
* Initial regional leadership access may be assigned explicitly during activation.

## Import Safety

* Raw source data must be retained.
* Production records must retain import provenance.
* Import operations must be idempotent.
* Validation must occur before commit.
* Pre-activation rollback must be possible.
* Post-activation corrections must be traceable and surgical.
* Unresolved source identities must not force creation of placeholder canonical members.

---

# Domain Model

## Import Project

An import project represents one region onboarding effort.

Examples:

```text
Aggieland Historical Import
Old 300 Migration
Region X Initial Onboarding
```

An import project is the durable container for:

* Source uploads
* Parsing and normalization
* Source identities
* Match candidates
* Reviewer decisions
* Staged regional data
* Validation issues
* Commit runs
* Audit history
* Activation state

A single file upload is not the onboarding unit.

The import project is the onboarding unit.

---

## Import Batch

An import batch represents one ingestion event within an import project.

Examples:

* Current roster CSV
* 2022 attendance export
* 2023 attendance export
* AO directory
* Leadership roster
* Corrected replacement file

Each batch should retain:

* Source type
* Original filename
* File hash
* Source format
* Upload timestamp
* Uploaded-by user
* Parser version
* Row count
* Status
* Superseded batch relationship

A file hash should be used to detect duplicate uploads.

---

## Raw Source Row

A raw source row stores the original imported representation.

It should be immutable after ingestion.

The raw payload should be preserved even after parsing succeeds.

This allows:

* Reprocessing with a newer parser
* Debugging normalization behavior
* Tracing production records to exact source rows
* Recovering from parser mistakes
* Auditing imported evidence

---

## Normalized Source Record

A normalized source record contains standardized values derived from raw data.

Normalization may include:

* Trimming whitespace
* Standardizing case for comparison
* Lowercasing email addresses
* Normalizing phone numbers
* Normalizing punctuation
* Converting source dates to region-local dates
* Separating display values from comparison values
* Identifying placeholder or invalid values
* Mapping source AO names
* Preserving the original source representation

Normalization must not decide canonical identity.

Example:

```text
Original value: "  RAW-HIDE "
Comparison value: "rawhide"
Display value: "Raw-Hide"
```

---

## Source Identity

A source identity represents a possible human as described by the imported data.

Examples:

```text
Rawhide
Raw Hide
John Kazmierski
John K.
Rawhide - Old 300
```

A source identity may aggregate evidence from:

* Roster rows
* Attendance rows
* Q history
* Co-Q history
* Email directories
* Phone directories
* Legacy system IDs
* AO affiliations
* Source-specific identifiers
* First-seen and last-seen dates
* Alternate spellings
* Claimed home region

A source identity is scoped to an import project.

It is not a production member record.

---

## Source Identity Evidence

Source identity evidence links a source identity back to the records that support it.

Evidence types may include:

* F3 name
* Real name
* Email
* Phone
* Legacy member ID
* Source row
* AO affiliation
* Attendance event
* Q event
* Home-region claim
* Alias
* Date range
* Existing source-system identifier

Evidence should retain:

* Original value
* Normalized value
* Confidence
* Source row
* Batch
* Evidence type

---

## Match Candidate

A match candidate represents a possible relationship between a source identity and an existing canonical member.

A source identity may have:

* No candidates
* One candidate
* Several candidates

Each candidate should retain:

* Source identity ID
* Canonical member ID
* Candidate rank
* Overall score
* Score breakdown
* Positive evidence
* Conflicting evidence
* Matching algorithm version
* Candidate-generation timestamp
* Generation source
* Reviewer disposition

The system should not retain only the winning candidate.

The entire candidate set should remain auditable.

---

## Identity Resolution

An identity resolution is the durable reviewer decision that determines what happens to a source identity.

Supported resolution types should include:

```text
match_existing
create_new
deferred
ignored
needs_superadmin
```

A resolution should retain:

* Source identity ID
* Resolution type
* Existing canonical member ID, when applicable
* Created canonical member ID, after commit
* Reviewer user ID
* Resolution timestamp
* Notes
* Superseded resolution ID, when corrected

The resolution is authoritative.

Candidate scores are advisory.

---

## Staged Session

A staged session represents a historical workout before production commit.

It should retain:

* Import project
* Import batch
* Source session key
* Region
* Date
* Start time
* Source AO reference
* Resolved AO reference, when available
* Source Q identity
* Source co-Q identities
* Raw source payload
* Validation status
* Duplicate-detection status

---

## Staged Session Participant

A staged session participant links a staged session to a source identity.

It should retain:

* Staged session ID
* Source identity ID
* Participant role
* Resolution status
* Canonical member ID after identity resolution

The original source identity relationship must remain even after a canonical member ID is attached.

---

## Validation Issue

A validation issue represents a problem discovered before or during commit.

Severity levels:

```text
info
warning
blocking
```

Validation issues should retain:

* Project
* Entity type
* Entity ID
* Issue code
* Human-readable message
* Severity
* Status
* Resolved-by user
* Resolution timestamp

---

## Commit Run

A commit run represents one attempt to move staged data into production.

It should retain:

* Project
* Status
* Started timestamp
* Completed timestamp
* Started-by user
* New members created
* Existing members reused
* Sessions created
* Participants created
* Records skipped
* Validation failures
* Error payload
* Rollback metadata

A project may have multiple commit attempts.

---

# Recommended Project Lifecycle

The import project should move through explicit states.

```text
DRAFT
SOURCE_UPLOAD
PARSING
NORMALIZATION
IDENTITY_CLUSTERING
MATCH_GENERATION
IDENTITY_REVIEW
DATA_VALIDATION
READY_TO_COMMIT
COMMITTING
COMPLETED
COMPLETED_WITH_EXCEPTIONS
FAILED
ROLLED_BACK
```

These states should represent real gates, not only display labels.

---

# Complete Onboarding Workflow

## Stage 1: Create Region and Import Project

The onboarding process begins by creating a region in a non-live state.

Suggested region state:

```text
regions.onboarding_status = staging
```

The region should not be visible to normal users until activation.

The project setup should collect:

* Region name
* Region slug
* Region timezone
* Historical start date
* Planned cutover date
* Source system
* Primary Data Q
* Expected roster size
* Expected historical session count
* Whether partial data already exists
* Whether the region is entirely new or is migrating an existing workspace

This allows staged records to reference a real `region_id` without exposing an incomplete region.

---

## Stage 2: Upload Complete Source Dataset

The onboarding process should ingest all available source data before identity review begins.

Possible source inputs include:

* Current roster
* Historical attendance
* Historical Q records
* Historical co-Q records
* AO directory
* Site data
* Recurring schedules
* Leadership directory
* Email directory
* Legacy member IDs
* Existing system exports
* Manual correction files

The current roster alone is insufficient.

Historical activity may contain:

* Former members
* Visitors
* Renamed PAX
* People missing from the current roster
* Duplicate spellings
* Existing canonical members from other regions

The system should preserve:

```text
Import Project
    Import Batch
        Raw Rows
        Parsed Rows
        Normalized Records
```

---

## Stage 3: Map Source Columns

Source formats will vary between regions.

The onboarding UI should map source columns to known concepts.

Possible target fields include:

```text
F3 Name
Real First Name
Real Last Name
Email
Phone
Legacy Member ID
Home Region
AO Name
Workout Date
Start Time
Q Name
Co-Q Name
Attendee Name
Inviter
Notes
```

The reviewer should confirm mappings before processing.

Reusable templates may later be stored for common formats, such as:

```text
F3 Nation Standard Spreadsheet
Aggieland Legacy Format
Old 300 Export
Manual CSV
```

---

## Stage 4: Normalize Source Data

Normalization should standardize comparison values without changing original source evidence.

Normalization should handle:

* Whitespace
* Capitalization
* Punctuation
* Email formatting
* Phone formatting
* Dates
* Timezones
* AO naming
* Placeholder names
* Empty values
* Duplicate separators
* Known source-specific quirks

Original source values must remain recoverable.

---

## Stage 5: Build and Cluster Source Identities

Before comparing imported people against canonical members, the system must first deduplicate representations within the source dataset.

Example:

```text
Roster: Rawhide
Attendance: Raw Hide
Q History: RAW HIDE
Email Directory: rawhide@example.com
```

These may represent one source identity.

Clustering may use:

* Exact legacy ID
* Exact email
* Exact phone
* Normalized F3 name
* Real name
* AO context
* Temporal context
* Source-specific identifiers
* Known aliases

Ambiguous clusters should be reviewable.

The reviewer must be able to:

* Merge source identities
* Split a source identity
* Inspect source evidence
* View all supporting rows

F3 names must not be assumed globally unique.

Two records sharing an F3 name may still represent different people.

---

## Stage 6: Generate Canonical Match Candidates

Each source identity should be compared with the existing canonical member directory.

Candidate classification should include:

```text
Recommended Match
Possible Match
No Match
Conflict
Already Resolved
Deferred
Ignored
```

### Recommended Match

The system has strong evidence and no meaningful contradiction.

### Possible Match

There is credible evidence, but ambiguity remains.

### No Match

No existing canonical member appears sufficiently likely.

### Conflict

The evidence points in incompatible directions.

Examples:

* Email matches one canonical member while phone matches another.
* F3 name matches but real names conflict.
* Two strong candidates have nearly equal scores.
* Two source identities strongly match one canonical member but appear to be different humans.
* An existing claimed account conflicts with imported identity evidence.

### Already Resolved

A durable resolution already exists.

### Deferred

The reviewer intentionally postponed the identity.

### Ignored

The source record does not represent a canonical human that should be imported.

---

## Stage 7: Review Identities

The reviewer experience should use queue-based case review rather than a giant spreadsheet.

Recommended queues:

* Recommended
* Possible
* No Match
* Conflict
* Deferred
* Resolved
* Ignored

### Reviewer Actions

The reviewer may:

* Accept recommended match
* Match another candidate
* Search the canonical directory
* Mark for new canonical member creation
* Defer
* Ignore
* Escalate to Superadmin
* Merge source identities
* Split a source identity
* Add notes
* Review source evidence
* Review historical impact

### Bulk Review

Bulk acceptance may be allowed for high-confidence recommendations.

Bulk actions should not be allowed for conflict cases.

---

## Stage 8: Validate Identity Resolution Graph

Before production commit, the system should validate all resolved relationships.

Required checks should include:

* Every historical attendee has a resolved source identity or approved unresolved handling.
* Every historical Q and co-Q has a resolved source identity or approved unresolved handling.
* No matched canonical member has been deleted or superseded.
* No source identity points to an invalid canonical member.
* No historical session contains duplicate canonical attendees after resolution.
* No two source identities map to one canonical member without an explicit acknowledgment when both occur in the same context.
* No canonical member receives an implicit home-region reassignment.
* AO references are valid.
* Dates and times are parseable.
* Session duplicates are classified.
* Expected roster and session counts are within reasonable bounds.
* New-member creation counts are visible.
* Cross-region matches are visible.
* Blocking contradictions are resolved.

The system should generate a pre-commit impact report.

---

## Stage 9: Commit Canonical Identity Decisions

Canonical identity decisions should be applied only during controlled commit.

### Match Existing

When the resolution is:

```text
match_existing
```

The importer should:

* Reuse the existing canonical `members.id`
* Preserve the existing canonical home region
* Ensure regional participation exists
* Attach imported historical activity to the canonical member
* Preserve source identity provenance

### Create New

When the resolution is:

```text
create_new
```

The importer should:

1. Revalidate that no stronger canonical match has appeared.
2. Recheck duplicate-name and identifier warnings.
3. Create one canonical member.
4. Assign the onboarding region as the home region.
5. Record the created member ID on the resolution.
6. Create regional participation.
7. Attach historical activity.
8. Record import provenance.

The canonical member should not be created when the reviewer initially selects “Create New.”

The reviewer action should record an intended resolution.

Actual production creation should happen during commit.

### Deferred

When the resolution is:

```text
deferred
```

The importer should not create a canonical member.

The source identity and related historical evidence should remain structured and recoverable.

### Ignored

When the resolution is:

```text
ignored
```

No canonical member should be created.

Examples may include:

* Unknown
* Guest
* Generic FNG
* Test User
* Aggregate rows
* Spreadsheet headers
* Non-person placeholders
* Corrupt source records

### Needs Superadmin

When the resolution is:

```text
needs_superadmin
```

The source identity remains blocked until privileged review occurs.

---

## Stage 10: Commit Region Data

After identity decisions are validated and applied, the system may commit regional production data.

Recommended order:

1. Create or update AOs.
2. Create or update sites.
3. Create schedules when available.
4. Commit historical sessions.
5. Attach Q and co-Q canonical IDs.
6. Attach attendee canonical IDs.
7. Record import provenance.
8. Run existing participant synchronization.
9. Add roster-only region participants.
10. Rebuild member-region statistics.
11. Run duplicate and consistency checks.
12. Generate a final commit report.

The importer should not implement a competing region-participant system.

The existing participation synchronization from session attendance and Q history should remain authoritative.

Direct participant creation should primarily cover roster-only people with no historical activity.

---

## Stage 11: Activate Region

A region should become operational only after successful validation and commit.

Activation may include:

* Marking the region active
* Assigning initial leadership access
* Enabling normal workspace access
* Enabling invitation flows
* Publishing the region participant directory
* Setting the cutover date
* Locking the initial historical import
* Recording unresolved exceptions
* Creating follow-up tasks for deferred identities

After activation, the existing invitation and `region_access` lifecycle should handle authenticated users.

---

# Reviewer Experience

## Project Overview

The project landing page should summarize:

```text
Source identities
Recommended matches
Possible matches
No matches
Conflicts
Resolved identities
Deferred identities
Ignored identities
Blocking issues
Warnings
```

It should also show:

* Expected roster count
* Actual source identity count
* Expected historical session count
* Actual staged session count
* Existing canonical matches
* New canonical members to be created
* Cross-region participant relationships
* Duplicate sessions detected
* Unresolved historical references
* Overall completion percentage

---

## Identity Comparison View

The comparison view should show the source identity and candidate canonical member side by side.

### Imported Source Identity

Possible fields:

```text
F3 name
Real name
Email
Phone
Claimed region
First seen
Last seen
Imported posts
Imported Q count
AO affiliations
Source files
Aliases
```

### Canonical Candidate

Possible fields:

```text
F3 name
Real name
Home region
Known participant regions
Existing post count
Existing Q count
Account claimed status
Known aliases
Existing identifiers
```

### Match Explanation

The reviewer should see why the candidate was generated.

Example:

```text
Exact F3 name
Exact real name
Exact email
Existing participation in onboarding region
No conflicting identifiers
```

The reviewer should not have to infer the matcher’s reasoning.

---

## Historical Impact Warning

Before confirming a resolution, the UI should show the production impact.

Example:

```text
This match will attach:

143 historical attendance records
18 Q records
4 co-Q records
3 AO affiliations

to the existing canonical member Rawhide.
```

For new-member creation:

```text
This will create a new canonical member named Rawhide.

Another canonical member with this F3 name already exists in Old 300.
```

---

## Manual Canonical Search

The reviewer should be able to search the global member directory by:

* F3 name
* Real name
* Email
* Phone
* Home region
* Participant region
* Alias
* Legacy identifier

Search results should indicate whether the member was already generated as a candidate.

---

# Matching Strategy

The matching system should use explicit weighted evidence and contradiction rules.

It should not rely on one opaque similarity score.

## Deterministic Evidence

Strongest evidence may include:

* Exact verified email
* Exact normalized phone
* Exact legacy member ID
* Existing persisted alias mapping
* Existing reviewed import mapping
* Source-system canonical member identifier

A unique deterministic match may qualify as recommended when no contradictions exist.

---

## Strong Identity Evidence

Examples:

* Exact F3 name plus exact real name
* Exact real name plus compatible home-region history
* Exact F3 name plus existing activity in the onboarding region
* Known prior alias
* Matching email username plus supporting name evidence
* Unique F3 name plus compatible cross-region activity
* Same canonical user account identifier

---

## Contextual Evidence

Examples:

* Similar F3-name spelling
* Similar real name
* Nearby region
* Shared AO history
* Overlapping participation dates
* Existing destination-region activity
* Same inviter
* Same historical associates
* Similar start date

Contextual evidence should not independently trigger automatic matching.

---

## Contradictory Evidence

Contradictions should subtract heavily or force conflict status.

Examples:

* Different verified emails
* Different phone numbers
* Incompatible real names
* Two claimed accounts
* Simultaneous attendance as separate people
* Distinct home-region histories
* Clearly incompatible location history
* Both source identities appear in the same session
* Both identities Q the same event as separate people

A strong contradiction may outweigh several weak similarities.

---

## Candidate Separation

Recommendation confidence should consider both:

* Absolute match strength
* Difference from the next-best candidate

Example:

```text
Candidate A: 88
Candidate B: 86
```

This should remain a possible match or conflict.

Example:

```text
Candidate A: 88
Candidate B: 31
```

This may qualify as a recommended match.

---

## Example Score Breakdown

```json
{
  "exact_f3_name": 35,
  "exact_real_name": 30,
  "exact_email": 60,
  "same_claimed_home_region": 10,
  "existing_region_activity": 15,
  "conflicting_phone": -100,
  "total": 50
}
```

The classification should not be based on total score alone.

---

## Classification Rules

### Recommended Match

* At least one deterministic identifier, or multiple strong identity signals
* No strong contradiction
* Clear separation from the second-best candidate

### Possible Match

* Meaningful positive evidence
* No deterministic proof
* Remaining ambiguity

### No Match

* No credible candidate exceeds the minimum threshold

### Conflict

* Strong positive and contradictory evidence
* Multiple similarly strong candidates
* Evidence that source identities or canonical candidates represent distinct people

---

## Algorithm Versioning

Every generated candidate should retain the matcher version.

Example:

```text
identity_matcher_v1
```

Candidate sets may be regenerated when the algorithm improves.

Existing reviewer resolutions should not be overwritten by matcher updates.

---

## Automatic Resolution

The first version should require human review.

Future versions may allow project-level opt-in for deterministic auto-resolution.

Example policy:

```text
Automatically accept unique deterministic matches with no contradictions.
```

Automatic resolutions should still be recorded in the audit log as durable decisions.

---

# Home Region Rules

The imported roster represents what the source system considered part of the region.

It does not automatically redefine canonical home region.

## New Canonical Member

For a truly new member:

```text
members.region_id = onboarding_region_id
```

## Existing Canonical Member

For an existing canonical member:

```text
members.region_id remains unchanged
```

The importer should surface discrepancies.

Example:

```text
Imported source considers Rawhide local to Aggieland.

Canonical home region is Old 300.
```

A separate explicit home-region correction or transfer workflow should handle legitimate changes.

The onboarding importer must not silently rewrite the identity anchor.

---

# Historical Session Attachment

Every staged historical participant reference should resolve through a source identity.

Example:

```text
Historical source:
2024-03-12, The Mine, Attendee: Raw Hide

Staged participant:
source_identity_id = 842

Identity resolution:
source_identity_id 842
→ canonical_member_id 71

Committed session:
attendee_ids includes canonical_member_id 71
```

This ensures all imported history attaches consistently.

---

## Duplicate Participant Collapse

If two source identities resolve to the same canonical member and both appear in one session, the importer should not create duplicate attendance.

It should create a validation issue.

Example:

```text
Two source identities resolve to Rawhide in the same session:

Rawhide
Raw Hide
```

The reviewer may need to merge the source identities or explicitly confirm an alias relationship.

---

# Existing Session Deduplication

The onboarding pipeline must detect partial historical overlap.

A session fingerprint may include:

```text
region_id
date
AO or site
start_time
source legacy ID
Q identity
```

Date and AO alone may be insufficient because an AO may host more than one workout per day.

Each staged session should be classified as:

```text
new
exact_existing_match
probable_duplicate
conflicting_existing_session
```

Possible reviewer actions:

* Skip existing
* Merge missing participants
* Replace import-owned session
* Keep both
* Defer
* Escalate

---

# Unresolved Historical Identities

The onboarding process should not require fake canonical members for unknown historical names.

Unresolved identities should remain structured.

A project may complete as:

```text
COMPLETED_WITH_EXCEPTIONS
```

A production session may retain structured unresolved import references when needed.

Example:

```json
{
  "source_identity_id": "uuid",
  "display_name": "Unknown Rawhide",
  "import_project_id": "uuid",
  "reason": "identity_deferred"
}
```

A later resolution process should be able to:

1. Resolve the source identity.
2. Add the canonical member to affected sessions.
3. Remove the unresolved reference.
4. Rebuild affected statistics.
5. Synchronize region participation.
6. Record the correction.

The importer must not create placeholder canonical members merely to complete the project.

---

# Participant Synchronization

The existing `region_participants` synchronization should remain authoritative for participation created from:

* Session attendance
* Q history
* Co-Q history
* Imported completed sessions

Recommended order:

1. Commit historical sessions with canonical IDs.
2. Run participant synchronization.
3. Confirm expected participants.
4. Add roster-only participants.
5. Record participation provenance.

Possible participation evidence types:

```text
home_roster
historical_attendance
historical_q
historical_co_q
manual_admin
import_roster
```

---

# Access and Invitations

Importing a roster or historical participation must not create `region_access`.

After activation:

* Claimed users may receive region invitations.
* Accepted invitations create region access.
* Unclaimed members remain canonical members and region participants without access.
* Initial leaders may receive explicit access assignments.
* Participation alone remains insufficient to open a workspace.

This preserves the separation:

```text
Canonical identity
≠
Regional participation
≠
Authenticated workspace access
```

---

# Proposed Staging Tables

Centralized staging tables should be keyed by `import_project_id` and `import_batch_id`.

Do not create temporary tables per region.

Do not add staging fields to production tables.

Recommended initial tables:

```text
region_import_projects
region_import_batches
region_import_raw_rows
region_import_source_identities
region_import_source_identity_evidence
region_import_identity_candidates
region_import_identity_resolutions
region_import_staged_aos
region_import_staged_sessions
region_import_staged_session_participants
region_import_validation_issues
region_import_commit_runs
region_import_audit_log
```

---

## `region_import_projects`

Suggested fields:

```text
id
region_id
name
status
source_system
created_by_user_id
created_at
updated_at
parser_version
matching_version
expected_member_count
expected_session_count
activated_at
completed_at
```

---

## `region_import_batches`

Suggested fields:

```text
id
project_id
batch_type
filename
file_hash
source_format
status
uploaded_by_user_id
uploaded_at
row_count
supersedes_batch_id
```

---

## `region_import_raw_rows`

Suggested fields:

```text
id
batch_id
row_number
raw_payload jsonb
parse_status
parse_error
```

---

## `region_import_source_identities`

Suggested fields:

```text
id
project_id
display_name
normalized_f3_name
normalized_real_name
normalized_email
normalized_phone
claimed_home_region
first_seen_date
last_seen_date
source_identity_status
```

---

## `region_import_source_identity_evidence`

Suggested fields:

```text
id
source_identity_id
raw_row_id
evidence_type
evidence_value
normalized_value
confidence
```

---

## `region_import_identity_candidates`

Suggested fields:

```text
id
source_identity_id
canonical_member_id
candidate_rank
overall_score
score_breakdown jsonb
positive_evidence jsonb
negative_evidence jsonb
matching_version
created_at
```

---

## `region_import_identity_resolutions`

Suggested fields:

```text
id
source_identity_id
resolution_type
canonical_member_id
created_member_id
resolved_by_user_id
resolved_at
notes
supersedes_resolution_id
```

---

## `region_import_staged_sessions`

Suggested fields:

```text
id
project_id
batch_id
source_session_key
date
start_time
ao_source_key
normalized_ao_id
source_q_identity_id
source_co_q_identity_ids
raw_payload
validation_status
duplicate_status
```

---

## `region_import_staged_session_participants`

Suggested fields:

```text
id
staged_session_id
source_identity_id
participant_role
resolution_status
canonical_member_id
```

---

## `region_import_validation_issues`

Suggested fields:

```text
id
project_id
entity_type
entity_id
severity
issue_code
message
status
resolved_by_user_id
resolved_at
```

---

## `region_import_commit_runs`

Suggested fields:

```text
id
project_id
status
started_at
completed_at
started_by_user_id
created_member_count
matched_member_count
created_session_count
created_participant_count
skipped_record_count
error_payload
rollback_metadata
```

---

# Provenance

Committed production records should retain import provenance.

Possible fields:

```text
import_project_id
import_batch_id
source_record_id
source_system
imported_at
imported_by
```

The system should be able to answer:

* Which import created this member?
* Which source identity produced this relationship?
* Which source row created this session?
* Which reviewer approved this identity resolution?
* Which commit run wrote this record?
* Which source file contained the original evidence?

Provenance is required for safe correction and rollback.

---

# Idempotency

Re-running the same project or commit should not create duplicate:

* Canonical members
* Region participants
* Sessions
* Attendance
* Q relationships
* Statistics
* Import records

Stable source keys, file hashes, resolution IDs, and commit-run tracking should be used to prevent duplicate writes.

---

# Rollback and Corrections

## Pre-Activation Rollback

Before activation, rollback may remove or deactivate records created exclusively by the import.

Rollback should:

* Remove import-owned sessions
* Remove import-owned participant evidence
* Remove unreferenced canonical members created only by the import
* Rebuild affected statistics
* Preserve audit history
* Preserve raw source data and reviewer decisions

## Post-Activation Correction

After activation, corrections must be surgical.

A full destructive rollback may no longer be safe because users may have:

* Edited imported sessions
* Added attendance
* Claimed accounts
* Accepted invitations
* Added new workouts
* Created downstream statistics
* Used imported members in new records

Post-activation changes should be implemented as corrective migrations.

---

## Identity Resolution Correction

If a source identity was attached to the wrong canonical member:

1. Supersede the original resolution.
2. Record the corrected canonical member.
3. Find all imported records attached through the source identity.
4. Remove the incorrect canonical references.
5. Add the correct canonical references.
6. Rebuild statistics for both members.
7. Re-run participant synchronization.
8. Preserve the full audit trail.

This requires production relationships to retain source identity provenance.

---

# Permissions

## Data Q

May be allowed to:

* Create import projects
* Upload files
* Map fields
* Review source identities
* Resolve ordinary matches
* Propose new canonical members
* Fix staging data
* Run validation
* Review import reports

## Regional SLT

May be allowed to:

* View onboarding status
* Review region-specific data
* Confirm roster structure
* Confirm AO structure
* Review unresolved cases
* Approve readiness for activation

## Superadmin

Should be required for:

* Overriding identity conflicts
* Approving member merges
* Changing canonical home regions
* Committing imports
* Rolling back imports
* Correcting committed identity resolutions
* Resolving cross-project conflicts
* Activating regions

A source identity match is not the same operation as a member merge.

Matching attaches imported evidence to an existing canonical member.

Merging combines two existing canonical member records.

---

# Metrics

At scale, onboarding quality should be measured.

Recommended metrics:

```text
Average source identities per region
Recommended-match rate
Possible-match rate
No-match rate
Conflict rate
Accepted recommendation rate
New canonical member creation rate
Deferred identity rate
Ignored identity rate
Average review time per identity
Average onboarding duration
Historical sessions imported
Duplicate sessions prevented
Unresolved historical references
Post-import correction count
Resolution correction rate
```

The most important quality metric may be:

> How often was an approved identity resolution later corrected?

This measures both matcher quality and reviewer reliability.

---

# Phased Implementation Roadmap

## Phase 0: Architecture Contract

Finalize the architectural invariants before implementation.

Deliverables:

* Domain definitions
* Project lifecycle
* Resolution types
* Canonical member creation rules
* Home-region rules
* Unresolved identity policy
* Session deduplication policy
* Commit guarantees
* Rollback guarantees
* Permission matrix
* Architecture decision record

Success condition:

> The team can clearly explain the complete lifecycle without relying on implementation details.

---

## Phase 1: Import Foundation

Build the durable ingestion framework.

Scope:

* Import projects
* Import batches
* Raw row storage
* CSV upload
* File hashes
* Duplicate upload detection
* Column mapping
* Parsing
* Normalization
* Project status UI
* Audit log
* Parser versioning

No canonical matching is required in this phase.

Success condition:

> A region’s source files can be ingested, preserved, normalized, and safely reprocessed without affecting production data.

---

## Phase 2: Source Identity Construction

Build project-scoped source identities.

Scope:

* Extract person references
* Aggregate source evidence
* Build source identities
* Propose duplicate clusters
* Merge source identities
* Split source identities
* Show source identity inventory
* Trace identities back to raw rows

Success condition:

> Every person reference in the imported dataset maps to one reviewable staged source identity.

---

## Phase 3: Canonical Candidate Matching

Generate canonical member candidates.

Scope:

* Candidate generation
* Weighted evidence model
* Contradiction rules
* Candidate ranking
* Score breakdown
* Candidate separation logic
* Conflict classification
* Matcher versioning
* Manual canonical search

All decisions should remain manual in the first version.

Success condition:

> The system reliably surfaces likely existing members without changing production records.

---

## Phase 4: Identity Review UI

Build the reviewer workflow.

Scope:

* Recommended queue
* Possible queue
* No Match queue
* Conflict queue
* Deferred queue
* Resolved queue
* Side-by-side comparison
* Accept recommended match
* Choose another canonical member
* Propose new canonical member
* Defer
* Ignore
* Escalate
* Bulk accept recommended matches
* Reviewer notes
* Progress tracking
* Audit history

Success condition:

> A Data Q can resolve a realistic region without direct SQL or external tracking spreadsheets.

---

## Phase 5: Historical Data Staging and Validation

Stage regional history after identity resolution is available.

Scope:

* Stage AOs
* Stage sites
* Stage sessions
* Stage Q relationships
* Stage co-Q relationships
* Stage attendance
* Attach source identity references
* Detect duplicate sessions
* Validate AO references
* Validate dates and times
* Validate duplicate canonical attendees
* Generate pre-commit impact report
* Reconcile expected counts
* Track blocking and warning issues

Success condition:

> The system can explain exactly what it would create, reuse, skip, merge, or flag before writing production data.

---

## Phase 6: Controlled Commit

Build production commit orchestration.

Scope:

* Revalidate identity decisions
* Create approved new canonical members
* Reuse matched canonical members
* Preserve canonical home regions
* Commit sessions
* Attach canonical participants
* Run participant synchronization
* Add roster-only participants
* Rebuild statistics
* Record provenance
* Prevent duplicate writes
* Generate commit report
* Support pre-activation rollback

Success condition:

> A complete region can be imported repeatably without duplicate canonical members and with traceable historical records.

---

## Phase 7: Region Activation

Move the staged region into normal operation.

Scope:

* Readiness checklist
* Initial leadership access
* Activate region workspace
* Enable invitation lifecycle
* Set cutover date
* Publish participant directory
* Lock historical import
* Record deferred exceptions
* Create follow-up queue

Success condition:

> The region transitions cleanly from staged migration to live operation.

---

## Phase 8: Scale and Automation

Build only after several real region imports have been observed.

Possible scope:

* Saved source templates
* Deterministic auto-resolution
* Cross-project identity memory
* Improved alias detection
* Bulk correction tools
* Portfolio onboarding dashboard
* Import API
* Background validation jobs
* Matching analytics
* Region self-service onboarding
* Superadmin approval workflow
* More advanced spreadsheet parsers

Do not build this phase before learning from several substantially different real-world datasets.

---

# First-Version Boundary

The first production version should support:

* One onboarding project per region
* CSV input
* Roster input
* Historical session input
* Manual column mapping
* Raw source preservation
* Normalization
* Source identity construction
* Source-level deduplication
* Canonical candidate recommendations
* Human review
* Controlled commit
* Import provenance
* Pre-activation rollback
* Completed-with-exceptions handling

The first version should not attempt:

* Fully automatic identity resolution
* Arbitrary spreadsheet structures
* AI-only matching
* Automatic home-region transfers
* Self-service region activation
* Automatic workspace access
* Placeholder canonical members
* Complex post-activation rollback
* Simultaneous multi-admin resolution editing
* Fully generalized enterprise ETL behavior

---

# Final Architecture Summary

The complete target lifecycle is:

```text
REGION ONBOARDING PROJECT
        ↓
RAW SOURCE FILES
        ↓
NORMALIZED SOURCE RECORDS
        ↓
SOURCE IDENTITIES
        ↓
SOURCE-LEVEL DEDUPLICATION
        ↓
CANONICAL MATCH CANDIDATES
        ↓
HUMAN IDENTITY RESOLUTIONS
        ↓
VALIDATED COMMIT PLAN
        ↓
CANONICAL MEMBERS CREATED OR REUSED
        ↓
HISTORICAL SESSIONS ATTACHED
        ↓
REGION PARTICIPANTS SYNCHRONIZED
        ↓
REGION ACTIVATED
        ↓
NORMAL INVITATION AND ACCESS LIFECYCLE
```

The most important permanent design requirement is preserving the bridge:

```text
source record
→ source identity
→ identity resolution
→ canonical member
→ imported production record
```

That provenance chain is what allows The Q to onboard many regions over time without corrupting the canonical member directory or losing the ability to explain and correct historical imports.
