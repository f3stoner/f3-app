create table public.region_import_staged_sessions (
    id uuid primary key default gen_random_uuid(),

    project_id uuid not null
        references public.region_import_projects(id)
        on delete cascade,

    batch_id uuid
        references public.region_import_batches(id)
        on delete set null,

    source_session_key text not null,

    session_date date not null,
    start_time time without time zone,

    ao_source_key text not null,
    site_source_key text,

    resolved_ao_id uuid
        references public.aos(id)
        on delete restrict,

    resolved_site_id uuid
        references public.sites(id)
        on delete restrict,

    notes text,

    raw_payload jsonb not null default '{}'::jsonb,

    validation_status text not null default 'staged',
    duplicate_status text not null default 'unchecked',

    created_session_id uuid
        references public.sessions(id)
        on delete restrict,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint region_import_staged_sessions_validation_status_check
        check (
            validation_status in (
                'staged',
                'reviewed',
                'committed',
                'ignored',
                'error'
            )
        ),

    constraint region_import_staged_sessions_duplicate_status_check
        check (
            duplicate_status in (
                'unchecked',
                'new',
                'exact_existing_match',
                'probable_duplicate',
                'conflicting_existing_session'
            )
        ),

    constraint region_import_staged_sessions_project_source_unique
        unique (
            project_id,
            source_session_key
        )
);


create table public.region_import_staged_session_participants (
    id uuid primary key default gen_random_uuid(),

    staged_session_id uuid not null
        references public.region_import_staged_sessions(id)
        on delete cascade,

    source_identity_id uuid not null
        references public.region_import_source_identities(id)
        on delete restrict,

    participant_role text not null,

    resolution_status text not null default 'pending',

    canonical_member_id uuid
        references public.members(id)
        on delete restrict,

    source_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint region_import_staged_session_participants_role_check
        check (
            participant_role in (
                'attendee',
                'q',
                'coq'
            )
        ),

    constraint region_import_staged_session_participants_resolution_check
        check (
            resolution_status in (
                'pending',
                'resolved',
                'ignored',
                'deferred',
                'error'
            )
        ),

    constraint region_import_staged_session_participant_unique
        unique (
            staged_session_id,
            source_identity_id,
            participant_role
        )
);


create index region_import_staged_sessions_project_idx
    on public.region_import_staged_sessions(project_id);

create index region_import_staged_sessions_project_date_idx
    on public.region_import_staged_sessions(
        project_id,
        session_date
    );

create index region_import_staged_sessions_resolved_ao_idx
    on public.region_import_staged_sessions(resolved_ao_id)
    where resolved_ao_id is not null;

create index region_import_staged_session_participants_session_idx
    on public.region_import_staged_session_participants(
        staged_session_id
    );

create index region_import_staged_session_participants_identity_idx
    on public.region_import_staged_session_participants(
        source_identity_id
    );

create index region_import_staged_session_participants_member_idx
    on public.region_import_staged_session_participants(
        canonical_member_id
    )
    where canonical_member_id is not null;


alter table public.region_import_staged_sessions
    enable row level security;

alter table public.region_import_staged_session_participants
    enable row level security;


create policy region_import_staged_sessions_superadmin_all
on public.region_import_staged_sessions
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());


create policy region_import_staged_session_participants_superadmin_all
on public.region_import_staged_session_participants
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());