-- =========================================================
-- ROSTER MANAGEMENT COMMANDS
-- =========================================================

begin;


-- ---------------------------------------------------------
-- 1. Audit trail for canonical member changes
-- ---------------------------------------------------------

create table if not exists public.member_change_audit (
    id uuid primary key default gen_random_uuid(),

    member_id uuid not null
        references public.members(id)
        on delete restrict,

    region_id uuid not null,

    changed_by_user_id uuid not null
        references auth.users(id)
        on delete restrict,

    change_type text not null
        check (change_type in ('roster_status', 'pax_name')),

    old_value text,
    new_value text,

    created_at timestamptz not null default now()
);

create index if not exists member_change_audit_member_id_idx
    on public.member_change_audit(member_id);

create index if not exists member_change_audit_region_id_idx
    on public.member_change_audit(region_id);

create index if not exists member_change_audit_created_at_idx
    on public.member_change_audit(created_at desc);


alter table public.member_change_audit enable row level security;


-- Superadmins may inspect the complete identity-change audit.
drop policy if exists member_change_audit_select_superadmin
    on public.member_change_audit;

create policy member_change_audit_select_superadmin
on public.member_change_audit
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'superadmin'
    )
);


-- Regional roster managers may inspect status changes for their own region.
drop policy if exists member_change_audit_select_region_managers
    on public.member_change_audit;

create policy member_change_audit_select_region_managers
on public.member_change_audit
for select
to authenticated
using (
    change_type = 'roster_status'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.region_id = member_change_audit.region_id
          and p.role in ('slt', 'dataq')
    )
);


revoke all on table public.member_change_audit from public;
revoke all on table public.member_change_audit from anon;
revoke all on table public.member_change_audit from authenticated;

grant select on table public.member_change_audit to authenticated;


-- ---------------------------------------------------------
-- 2. Regional roster-status command
-- ---------------------------------------------------------

create or replace function public.set_member_roster_status(
    p_member_id uuid,
    p_is_active boolean
)
returns table (
    id uuid,
    region_id uuid,
    pax_name text,
    real_name text,
    home_ao text,
    invited_by_id uuid,
    first_post_date text,
    status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
    target_member public.members%rowtype;
    caller_profile public.profiles%rowtype;
    next_status text;
begin
    if auth.uid() is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication required';
    end if;

    if p_member_id is null then
        raise exception using
            errcode = '22004',
            message = 'Member id is required';
    end if;

    if p_is_active is null then
        raise exception using
            errcode = '22004',
            message = 'Roster status is required';
    end if;

    select *
    into caller_profile
    from public.profiles
    where profiles.id = auth.uid();

    if caller_profile.id is null then
        raise exception using
            errcode = '42501',
            message = 'Authenticated profile not found';
    end if;

    select *
    into target_member
    from public.members
    where members.id = p_member_id
    for update;

    if target_member.id is null then
        raise exception using
            errcode = 'P0002',
            message = 'Member not found';
    end if;

    /*
     * Regional roster authority:
     *
     * - Superadmin may manage any home roster.
     * - SLT and Data Q may manage only their own home region.
     *
     * Mere region_access is intentionally insufficient.
     */
    if not (
        caller_profile.role = 'superadmin'
        or (
            caller_profile.role in ('slt', 'dataq')
            and caller_profile.region_id = target_member.region_id
        )
    ) then
        raise exception using
            errcode = '42501',
            message = 'Not authorized to manage this regional roster';
    end if;

    next_status :=
        case
            when p_is_active then 'active'
            else 'inactive'
        end;

    if target_member.status is distinct from next_status then
        update public.members
        set status = next_status
        where members.id = p_member_id;

        insert into public.member_change_audit (
            member_id,
            region_id,
            changed_by_user_id,
            change_type,
            old_value,
            new_value
        )
        values (
            target_member.id,
            target_member.region_id,
            auth.uid(),
            'roster_status',
            target_member.status,
            next_status
        );
    end if;

    return query
    select
        m.id,
        m.region_id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        m.invited_by_id,
        m.first_post_date,
        m.status,
        m.created_at
    from public.members m
    where m.id = p_member_id;
end;
$function$;


revoke all on function public.set_member_roster_status(uuid, boolean)
    from public;

revoke all on function public.set_member_roster_status(uuid, boolean)
    from anon;

grant execute
on function public.set_member_roster_status(uuid, boolean)
to authenticated;


-- ---------------------------------------------------------
-- 3. Superadmin-only canonical PAX-name command
-- ---------------------------------------------------------

create or replace function public.rename_member(
    p_member_id uuid,
    p_pax_name text
)
returns table (
    id uuid,
    region_id uuid,
    pax_name text,
    real_name text,
    home_ao text,
    invited_by_id uuid,
    first_post_date text,
    status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
    target_member public.members%rowtype;
    caller_profile public.profiles%rowtype;
    normalized_name text;
begin
    if auth.uid() is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication required';
    end if;

    if p_member_id is null then
        raise exception using
            errcode = '22004',
            message = 'Member id is required';
    end if;

    /*
     * Trim outside whitespace and collapse repeated internal whitespace.
     * Parenthetical qualifiers and punctuation remain significant.
     */
    normalized_name :=
        nullif(
            regexp_replace(
                btrim(coalesce(p_pax_name, '')),
                '[[:space:]]+',
                ' ',
                'g'
            ),
            ''
        );

    if normalized_name is null then
        raise exception using
            errcode = '22023',
            message = 'PAX name cannot be empty';
    end if;

    select *
    into caller_profile
    from public.profiles
    where profiles.id = auth.uid();

    if caller_profile.id is null
       or caller_profile.role <> 'superadmin'
    then
        raise exception using
            errcode = '42501',
            message = 'Only a superadmin may rename a canonical member';
    end if;

    select *
    into target_member
    from public.members
    where members.id = p_member_id
    for update;

    if target_member.id is null then
        raise exception using
            errcode = 'P0002',
            message = 'Member not found';
    end if;

    /*
     * Reject a trimmed, whitespace-normalized, case-insensitive collision.
     *
     * Existing duplicates are not modified by this migration. This only
     * prevents this command from creating a new collision.
     */
    if exists (
        select 1
        from public.members other_member
        where other_member.id <> p_member_id
          and other_member.pax_name is not null
          and lower(
                regexp_replace(
                    btrim(other_member.pax_name),
                    '[[:space:]]+',
                    ' ',
                    'g'
                )
              ) = lower(normalized_name)
    ) then
        raise exception using
            errcode = '23505',
            message = 'Another member already uses that PAX name';
    end if;

    if target_member.pax_name is distinct from normalized_name then
        update public.members
        set pax_name = normalized_name
        where members.id = p_member_id;

        insert into public.member_change_audit (
            member_id,
            region_id,
            changed_by_user_id,
            change_type,
            old_value,
            new_value
        )
        values (
            target_member.id,
            target_member.region_id,
            auth.uid(),
            'pax_name',
            target_member.pax_name,
            normalized_name
        );
    end if;

    return query
    select
        m.id,
        m.region_id,
        m.pax_name,
        m.real_name,
        m.home_ao,
        m.invited_by_id,
        m.first_post_date,
        m.status,
        m.created_at
    from public.members m
    where m.id = p_member_id;
end;
$function$;


revoke all on function public.rename_member(uuid, text)
    from public;

revoke all on function public.rename_member(uuid, text)
    from anon;

grant execute
on function public.rename_member(uuid, text)
to authenticated;


commit;