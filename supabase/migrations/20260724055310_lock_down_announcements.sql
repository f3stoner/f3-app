begin;

-- Browser roles may read announcements through RLS,
-- but may not mutate the table directly.
revoke insert, update, delete, truncate, references, trigger
on table public.announcements
from anon, authenticated;

-- Remove every direct mutation policy.
drop policy if exists
    "Admins can delete announcements"
on public.announcements;

drop policy if exists
    "announcements_delete_region_access"
on public.announcements;

drop policy if exists
    "Privileged users can create announcements"
on public.announcements;

drop policy if exists
    "Admins can update announcements"
on public.announcements;

drop policy if exists
    "announcements_update_region_access"
on public.announcements;

-- The browser now reorders through save_announcement_command.
drop function if exists
    public.reorder_announcement(uuid, uuid, integer);

commit;


-- ============================================================
-- Verification
-- ============================================================

-- Only the authenticated SELECT policy should remain.
select
    policyname,
    cmd,
    roles,
    qual,
    with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'announcements'
order by cmd, policyname;


-- anon/authenticated should retain SELECT only.
-- postgres and service_role remain unchanged.
select
    grantee,
    privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'announcements'
order by grantee, privilege_type;


-- The old reorder RPC should be gone.
-- save_announcement_command should remain SECURITY DEFINER,
-- owned by postgres.
select
    p.oid::regprocedure as function_signature,
    p.prosecdef as security_definer,
    pg_get_userbyid(p.proowner) as owner,
    p.proconfig as configuration
from pg_proc p
join pg_namespace n
    on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
      'save_announcement_command',
      'reorder_announcement'
  )
order by p.proname;


-- Confirm browser execution rights on the surviving RPC.
select
    has_function_privilege(
        'anon',
        'public.save_announcement_command(text,uuid,uuid,text,text,text,uuid,date,date,boolean,boolean,text,text,jsonb,text[])',
        'execute'
    ) as anon_can_execute,
    has_function_privilege(
        'authenticated',
        'public.save_announcement_command(text,uuid,uuid,text,text,text,uuid,date,date,boolean,boolean,text,text,jsonb,text[])',
        'execute'
    ) as authenticated_can_execute,
    has_function_privilege(
        'service_role',
        'public.save_announcement_command(text,uuid,uuid,text,text,text,uuid,date,date,boolean,boolean,text,text,jsonb,text[])',
        'execute'
    ) as service_role_can_execute;