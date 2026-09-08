begin;

-- =========================================================
-- REGION ENVIRONMENT
--
-- Canonical boundary between real production regions and
-- test-only workspaces such as Sandbox.
-- =========================================================

alter table public.regions
add column if not exists environment text;

update public.regions
set environment = 'production'
where environment is null;

update public.regions
set environment = 'test'
where id = '8872e939-5691-450f-ba32-293a8b77d029'::uuid;

alter table public.regions
alter column environment set default 'production';

alter table public.regions
alter column environment set not null;

alter table public.regions
drop constraint if exists regions_environment_check;

alter table public.regions
add constraint regions_environment_check
check (
    environment in (
        'production',
        'test'
    )
);

comment on column public.regions.environment is
    'Runtime environment boundary for region data. Production-facing workflows must exclude test-only identities and activity unless explicitly operating inside authorized test tooling.';


-- =========================================================
-- PRODUCTION MEMBER ELIGIBILITY
--
-- A production member is a canonical member whose HOME
-- region is production.
--
-- Important:
-- region_participants intentionally does NOT grant production
-- eligibility. This prevents an accidental cross-region
-- participant row from laundering a test-only identity into
-- production visibility.
-- =========================================================

create or replace function public.member_is_production_eligible(
    p_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select exists (
        select 1
        from public.members m
        join public.regions r
            on r.id = m.region_id
        where m.id = p_member_id
          and r.environment = 'production'
    );
$function$;

revoke all
on function public.member_is_production_eligible(uuid)
from public, anon, authenticated;

alter function public.member_is_production_eligible(uuid)
owner to postgres;


-- =========================================================
-- GLOBAL MEMBER SEARCH
--
-- Global search is a production identity-discovery surface.
-- Test-home members must never appear here.
--
-- Sandbox-local members remain available through normal
-- region-scoped member loading while inside Sandbox.
-- =========================================================

create or replace function public.search_global_members(
    p_search_term text,
    p_limit integer default 20
)
returns table (
    member_id uuid,
    pax_name text,
    real_name text,
    home_ao text,
    status text,
    home_region_id uuid,
    home_region_name text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_search_term text;
    v_limit integer;
begin
    if auth.uid() is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    v_search_term :=
        nullif(
            btrim(p_search_term),
            ''
        );

    if v_search_term is null
       or length(v_search_term) < 2
    then
        return;
    end if;

    v_limit :=
        least(
            greatest(
                coalesce(p_limit, 20),
                1
            ),
            50
        );

    return query
    select
        m.id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        m.status,
        m.region_id,
        r.name
    from public.members m
    join public.regions r
        on r.id = m.region_id
    where m.status = 'active'
      and r.environment = 'production'
      and (
            m.pax_name ilike
                '%' || v_search_term || '%'

            or m.real_name ilike
                '%' || v_search_term || '%'

            or regexp_replace(
                lower(
                    coalesce(
                        m.pax_name,
                        ''
                    )
                ),
                '[^a-z0-9]',
                '',
                'g'
            ) like
                '%' ||
                regexp_replace(
                    lower(v_search_term),
                    '[^a-z0-9]',
                    '',
                    'g'
                ) ||
                '%'
      )
    order by
        case
            when lower(m.pax_name) =
                lower(v_search_term)
                then 0

            when lower(m.pax_name) like
                lower(v_search_term) || '%'
                then 1

            else 2
        end,

        m.pax_name,
        r.name

    limit v_limit;
end;
$function$;

revoke all
on function public.search_global_members(
    text,
    integer
)
from public, anon, authenticated;

grant execute
on function public.search_global_members(
    text,
    integer
)
to authenticated;

alter function public.search_global_members(
    text,
    integer
)
owner to postgres;


-- =========================================================
-- SESSION ENVIRONMENT GUARD
--
-- Production sessions may reference only production-home
-- canonical members.
--
-- Test-region sessions remain unrestricted so production
-- PAX can participate in Sandbox and Sandbox fake members
-- can operate normally inside Sandbox.
-- =========================================================

create or replace function public.enforce_session_member_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    target_environment text;
begin
    select r.environment
    into target_environment
    from public.regions r
    where r.id = new.region_id;

    if target_environment is null then
        raise exception
            'Session region does not exist';
    end if;

    if target_environment <> 'production' then
        return new;
    end if;

    if exists (
        select 1
        from jsonb_array_elements_text(
            coalesce(
                new.attendee_ids,
                '[]'::jsonb
            )
        ) submitted(member_id)
        where not public.member_is_production_eligible(
            submitted.member_id::uuid
        )
    )
    then
        raise exception
            'Production sessions cannot include test-only attendees';
    end if;

    if exists (
        select 1
        from unnest(
            coalesce(
                new.q_ids,
                '{}'::uuid[]
            )
        ) submitted(member_id)
        where not public.member_is_production_eligible(
            submitted.member_id
        )
    )
    then
        raise exception
            'Production sessions cannot include test-only Qs';
    end if;

    if new.q_id is not null
       and not public.member_is_production_eligible(
            new.q_id
       )
    then
        raise exception
            'Production sessions cannot include a test-only Q';
    end if;

    return new;
end;
$function$;

revoke all
on function public.enforce_session_member_environment()
from public, anon, authenticated;

alter function public.enforce_session_member_environment()
owner to postgres;

drop trigger if exists
    sessions_member_environment_guard
on public.sessions;

create trigger sessions_member_environment_guard
before insert or update of
    region_id,
    attendee_ids,
    q_ids,
    q_id
on public.sessions
for each row
execute function public.enforce_session_member_environment();


commit;