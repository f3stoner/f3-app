begin;

-- =========================================================
-- REGION PARTICIPANTS
--
-- One row means:
-- "This canonical member is relevant to this region."
--
-- This is distinct from:
--   members.region_id  = organizational home region
--   region_access      = workspace permission
--   member_stats       = derived activity totals
-- =========================================================

create table public.region_participants (
    id uuid primary key
        default gen_random_uuid(),

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    status text not null
        default 'active'
        check (
            status in (
                'active',
                'inactive',
                'hidden'
            )
        ),

    sources text[] not null
        default '{}'::text[],

    first_participated_on date,
    last_participated_on date,

    created_by_user_id uuid
        references public.profiles(id)
        on delete set null,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),

    constraint region_participants_region_member_unique
        unique (
            region_id,
            member_id
        ),

    constraint region_participants_date_order
        check (
            first_participated_on is null
            or last_participated_on is null
            or first_participated_on <=
                last_participated_on
        )
);


comment on table public.region_participants is
    'Canonical member relationships with regions. A participant may be a home-region member or a non-home member with regional activity.';

comment on column public.region_participants.sources is
    'Reasons the member is known to the region, such as home_region, regional_activity, session_attendance, q_history, historic_import, manual_add, member_merge, or region_transfer.';


-- =========================================================
-- INDEXES
-- =========================================================

create index
    region_participants_region_status_idx
on public.region_participants (
    region_id,
    status
);

create index
    region_participants_member_idx
on public.region_participants (
    member_id
);

create index
    region_participants_region_last_activity_idx
on public.region_participants (
    region_id,
    last_participated_on desc
);


-- =========================================================
-- UPDATED_AT
-- =========================================================

create or replace function public.set_region_participant_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
    new.updated_at := now();
    return new;
end;
$function$;

create trigger
    set_region_participant_updated_at
before update
on public.region_participants
for each row
execute function
    public.set_region_participant_updated_at();


-- =========================================================
-- HOME-REGION SYNCHRONIZATION
--
-- Every member becomes a participant of his home region.
--
-- Changing home region adds the new relationship but does
-- not delete prior participation from the former region.
-- =========================================================

create or replace function public.ensure_home_region_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if new.region_id is null then
        return new;
    end if;

    insert into public.region_participants (
        region_id,
        member_id,
        status,
        sources
    )
    values (
        new.region_id,
        new.id,
        'active',
        array['home_region']::text[]
    )
    on conflict (
        region_id,
        member_id
    )
    do update
    set
        status = 'active',

        sources =
            case
                when 'home_region' = any(
                    public.region_participants.sources
                )
                    then public.region_participants.sources

                else array_append(
                    public.region_participants.sources,
                    'home_region'
                )
            end,

        updated_at = now();

    return new;
end;
$function$;

create trigger
    ensure_home_region_participant
after insert or update of region_id
on public.members
for each row
execute function
    public.ensure_home_region_participant();


-- =========================================================
-- BACKFILL HOME-REGION MEMBERS
-- =========================================================

insert into public.region_participants (
    region_id,
    member_id,
    status,
    sources
)
select
    m.region_id,
    m.id,

    case
        when m.status = 'active'
            then 'active'
        else 'inactive'
    end,

    array['home_region']::text[]

from public.members m

where m.region_id is not null

on conflict (
    region_id,
    member_id
)
do update
set
    sources =
        case
            when 'home_region' = any(
                public.region_participants.sources
            )
                then public.region_participants.sources

            else array_append(
                public.region_participants.sources,
                'home_region'
            )
        end,

    updated_at = now();


-- =========================================================
-- BACKFILL REGIONAL ACTIVITY
--
-- member_stats supplies the established member/region
-- relationship and regional first/last activity dates.
-- Stats remain the source of truth for totals.
-- =========================================================

insert into public.region_participants (
    region_id,
    member_id,
    status,
    sources,
    first_participated_on,
    last_participated_on
)
select
    ms.region_id,
    ms.member_id,
    'active',
    array['regional_activity']::text[],
    case
        when ms.first_post_date is null
            then ms.last_post_date
        when ms.last_post_date is null
            then ms.first_post_date
        else least(
            ms.first_post_date,
            ms.last_post_date
        )
    end,

    case
        when ms.first_post_date is null
            then ms.last_post_date
        when ms.last_post_date is null
            then ms.first_post_date
        else greatest(
            ms.first_post_date,
            ms.last_post_date
        )
    end

from public.member_stats ms

join public.members m
    on m.id = ms.member_id

where ms.region_id is not null
  and ms.member_id is not null
  and m.status = 'active'

on conflict (
    region_id,
    member_id
)
do update
set
    status = 'active',

    sources =
        case
            when 'regional_activity' = any(
                public.region_participants.sources
            )
                then public.region_participants.sources

            else array_append(
                public.region_participants.sources,
                'regional_activity'
            )
        end,

    first_participated_on =
        case
            when public.region_participants
                    .first_participated_on is null
                then excluded.first_participated_on

            when excluded.first_participated_on is null
                then public.region_participants
                    .first_participated_on

            else least(
                public.region_participants
                    .first_participated_on,
                excluded.first_participated_on
            )
        end,

    last_participated_on =
        case
            when public.region_participants
                    .last_participated_on is null
                then excluded.last_participated_on

            when excluded.last_participated_on is null
                then public.region_participants
                    .last_participated_on

            else greatest(
                public.region_participants
                    .last_participated_on,
                excluded.last_participated_on
            )
        end,

    updated_at = now();


-- =========================================================
-- ROW LEVEL SECURITY
--
-- Users may read participants for regions they can access.
-- Client writes are intentionally not permitted yet.
-- =========================================================

alter table public.region_participants
enable row level security;

create policy
    "Users may read participants in accessible regions"
on public.region_participants
for select
to authenticated
using (
    exists (
        select 1
        from public.region_access ra
        where ra.user_id = auth.uid()
          and ra.region_id =
                region_participants.region_id
    )
    or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'superadmin'
    )
);


-- =========================================================
-- GRANTS
-- =========================================================

revoke all
on table public.region_participants
from public, anon;

grant select
on table public.region_participants
to authenticated;

grant all
on table public.region_participants
to service_role;


comment on function public.ensure_home_region_participant() is
    'Ensures every member has an active participant relationship with his current home region.';

notify pgrst, 'reload schema';

commit;