-- Region import identity staging foundation
--
-- This migration intentionally creates staging infrastructure only.
-- It does not create or modify canonical members, sessions, region participants,
-- region access, AOs, sites, schedules, or Q slots.

create table public.region_import_projects (
    id uuid primary key default gen_random_uuid(),
    region_id uuid not null references public.regions(id) on delete restrict,

    name text not null,
    source_system text,

    status text not null default 'draft',

    parser_version text,
    matching_version text,

    expected_member_count integer,
    expected_session_count integer,

    created_by_user_id uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    completed_at timestamptz,
    activated_at timestamptz,

    constraint region_import_projects_status_check
        check (
            status in (
                'draft',
                'source_upload',
                'parsing',
                'normalization',
                'identity_clustering',
                'match_generation',
                'identity_review',
                'data_validation',
                'ready_to_commit',
                'committing',
                'completed',
                'completed_with_exceptions',
                'failed',
                'rolled_back'
            )
        ),

    constraint region_import_projects_expected_member_count_check
        check (
            expected_member_count is null
            or expected_member_count >= 0
        ),

    constraint region_import_projects_expected_session_count_check
        check (
            expected_session_count is null
            or expected_session_count >= 0
        )
);


create table public.region_import_batches (
    id uuid primary key default gen_random_uuid(),

    project_id uuid not null
        references public.region_import_projects(id)
        on delete cascade,

    batch_type text not null,

    filename text,
    file_hash text,
    source_format text,

    status text not null default 'uploaded',

    parser_version text,

    uploaded_by_user_id uuid not null references auth.users(id),
    uploaded_at timestamptz not null default now(),

    row_count integer,

    supersedes_batch_id uuid
        references public.region_import_batches(id)
        on delete set null,

    constraint region_import_batches_status_check
        check (
            status in (
                'uploaded',
                'parsing',
                'parsed',
                'normalized',
                'failed',
                'superseded'
            )
        ),

    constraint region_import_batches_row_count_check
        check (
            row_count is null
            or row_count >= 0
        )
);


create table public.region_import_raw_rows (
    id uuid primary key default gen_random_uuid(),

    batch_id uuid not null
        references public.region_import_batches(id)
        on delete cascade,

    row_number integer not null,

    source_key text,

    raw_payload jsonb not null,

    parse_status text not null default 'pending',
    parse_error text,

    created_at timestamptz not null default now(),

    constraint region_import_raw_rows_row_number_check
        check (row_number > 0),

    constraint region_import_raw_rows_parse_status_check
        check (
            parse_status in (
                'pending',
                'parsed',
                'ignored',
                'error'
            )
        ),

    constraint region_import_raw_rows_batch_row_unique
        unique (batch_id, row_number)
);


create table public.region_import_source_identities (
    id uuid primary key default gen_random_uuid(),

    project_id uuid not null
        references public.region_import_projects(id)
        on delete cascade,

    source_identity_key text not null,

    display_name text,

    source_f3_name text,
    source_real_name text,
    source_email text,
    source_phone text,
    source_home_region text,

    normalized_f3_name text,
    normalized_real_name text,
    normalized_email text,
    normalized_phone text,

    first_seen_date date,
    last_seen_date date,

    source_identity_status text not null default 'pending',

    source_summary jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint region_import_source_identities_status_check
        check (
            source_identity_status in (
                'pending',
                'ready_for_matching',
                'matched',
                'needs_review',
                'resolved',
                'deferred',
                'ignored'
            )
        ),

    constraint region_import_source_identities_seen_dates_check
        check (
            first_seen_date is null
            or last_seen_date is null
            or first_seen_date <= last_seen_date
        ),

    constraint region_import_source_identities_project_key_unique
        unique (project_id, source_identity_key)
);


create table public.region_import_identity_candidates (
    id uuid primary key default gen_random_uuid(),

    source_identity_id uuid not null
        references public.region_import_source_identities(id)
        on delete cascade,

    canonical_member_id uuid not null
        references public.members(id)
        on delete restrict,

    candidate_rank integer,

    classification text not null,

    overall_score numeric,

    score_breakdown jsonb not null default '{}'::jsonb,
    positive_evidence jsonb not null default '[]'::jsonb,
    negative_evidence jsonb not null default '[]'::jsonb,

    matching_version text not null,
    generation_source text,

    created_at timestamptz not null default now(),

    constraint region_import_identity_candidates_rank_check
        check (
            candidate_rank is null
            or candidate_rank > 0
        ),

    constraint region_import_identity_candidates_classification_check
        check (
            classification in (
                'recommended',
                'possible',
                'conflict'
            )
        ),

    constraint region_import_identity_candidates_source_member_unique
        unique (
            source_identity_id,
            canonical_member_id
        )
);


create table public.region_import_identity_resolutions (
    id uuid primary key default gen_random_uuid(),

    source_identity_id uuid not null
        references public.region_import_source_identities(id)
        on delete cascade,

    resolution_type text not null,

    canonical_member_id uuid
        references public.members(id)
        on delete restrict,

    created_member_id uuid
        references public.members(id)
        on delete restrict,

    resolved_by_user_id uuid not null references auth.users(id),
    resolved_at timestamptz not null default now(),

    notes text,

    supersedes_resolution_id uuid
        references public.region_import_identity_resolutions(id)
        on delete set null,

    constraint region_import_identity_resolutions_type_check
        check (
            resolution_type in (
                'match_existing',
                'create_new',
                'deferred',
                'ignored',
                'needs_superadmin'
            )
        ),

    constraint region_import_identity_resolutions_existing_member_check
        check (
            (
                resolution_type = 'match_existing'
                and canonical_member_id is not null
                and created_member_id is null
            )
            or
            (
                resolution_type <> 'match_existing'
                and canonical_member_id is null
            )
        ),

    constraint region_import_identity_resolutions_created_member_check
        check (
            created_member_id is null
            or resolution_type = 'create_new'
        ),

    constraint region_import_identity_resolutions_not_self_superseding
        check (
            supersedes_resolution_id is null
            or supersedes_resolution_id <> id
        )
);


create index region_import_projects_region_id_idx
    on public.region_import_projects(region_id);

create index region_import_projects_status_idx
    on public.region_import_projects(status);


create index region_import_batches_project_id_idx
    on public.region_import_batches(project_id);

create index region_import_batches_file_hash_idx
    on public.region_import_batches(file_hash)
    where file_hash is not null;


create index region_import_raw_rows_batch_id_idx
    on public.region_import_raw_rows(batch_id);

create index region_import_raw_rows_source_key_idx
    on public.region_import_raw_rows(source_key)
    where source_key is not null;


create index region_import_source_identities_project_id_idx
    on public.region_import_source_identities(project_id);

create index region_import_source_identities_normalized_f3_name_idx
    on public.region_import_source_identities(normalized_f3_name)
    where normalized_f3_name is not null;

create index region_import_source_identities_normalized_email_idx
    on public.region_import_source_identities(normalized_email)
    where normalized_email is not null;

create index region_import_source_identities_status_idx
    on public.region_import_source_identities(
        project_id,
        source_identity_status
    );


create index region_import_identity_candidates_source_identity_id_idx
    on public.region_import_identity_candidates(source_identity_id);

create index region_import_identity_candidates_member_id_idx
    on public.region_import_identity_candidates(canonical_member_id);


create index region_import_identity_resolutions_source_identity_id_idx
    on public.region_import_identity_resolutions(source_identity_id);

create index region_import_identity_resolutions_member_id_idx
    on public.region_import_identity_resolutions(canonical_member_id)
    where canonical_member_id is not null;


alter table public.region_import_projects enable row level security;
alter table public.region_import_batches enable row level security;
alter table public.region_import_raw_rows enable row level security;
alter table public.region_import_source_identities enable row level security;
alter table public.region_import_identity_candidates enable row level security;
alter table public.region_import_identity_resolutions enable row level security;

-- Region import staging is intentionally superadmin-only.
-- Broader onboarding roles can be introduced later without
-- weakening the initial identity/commit safety boundary.

create policy region_import_projects_superadmin_all
on public.region_import_projects
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_batches_superadmin_all
on public.region_import_batches
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_raw_rows_superadmin_all
on public.region_import_raw_rows
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_source_identities_superadmin_all
on public.region_import_source_identities
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_identity_candidates_superadmin_all
on public.region_import_identity_candidates
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_identity_resolutions_superadmin_all
on public.region_import_identity_resolutions
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());