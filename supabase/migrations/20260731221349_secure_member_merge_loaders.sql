begin;

-- =========================================================
-- SECURE MEMBER MERGE LIST LOADER
-- =========================================================

create or replace function public.load_member_merges()
returns table (
    merge_id uuid,
    status text,
    canonical_member_id uuid,
    canonical_pax_name text,
    canonical_region_name text,
    duplicate_member_id uuid,
    duplicate_pax_name text,
    duplicate_region_name text,
    plan_hash text,
    created_at timestamptz,
    validated_at timestamptz,
    ready_at timestamptz,
    completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_actor_user_id uuid;
begin
    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to access member merges.'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_user_id
          and p.role = 'superadmin'
    ) then
        raise exception
            'Only a superadmin may access member merges.'
            using errcode = '42501';
    end if;

    return query
    select
        mm.id,
        mm.status,

        canonical.id,
        canonical.pax_name,
        canonical_region.name,

        duplicate.id,
        duplicate.pax_name,
        duplicate_region.name,

        mm.plan_hash,

        mm.created_at,
        mm.validated_at,
        mm.ready_at,
        mm.completed_at

    from public.member_merges mm

    join public.members canonical
        on canonical.id =
            mm.canonical_member_id

    join public.members duplicate
        on duplicate.id =
            mm.duplicate_member_id

    join public.regions canonical_region
        on canonical_region.id =
            canonical.region_id

    join public.regions duplicate_region
        on duplicate_region.id =
            duplicate.region_id

    where mm.status <> 'completed'

    order by
        mm.created_at desc;
end;
$function$;


-- =========================================================
-- SECURE MEMBER MERGE DETAIL LOADER
-- =========================================================

create or replace function public.load_member_merge(
    p_merge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_actor_user_id uuid;
    v_result jsonb;
begin
    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to access a member merge.'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_user_id
          and p.role = 'superadmin'
    ) then
        raise exception
            'Only a superadmin may access member merges.'
            using errcode = '42501';
    end if;

    if p_merge_id is null then
        raise exception
            'Member merge ID is required.'
            using errcode = '22004';
    end if;

    select jsonb_build_object(
        'merge',
            to_jsonb(mm),

        'canonicalMember',
            to_jsonb(canonical),

        'duplicateMember',
            to_jsonb(duplicate),

        'canonicalRegion',
            canonical_region.name,

        'duplicateRegion',
            duplicate_region.name
    )
    into v_result

    from public.member_merges mm

    join public.members canonical
        on canonical.id =
            mm.canonical_member_id

    join public.members duplicate
        on duplicate.id =
            mm.duplicate_member_id

    join public.regions canonical_region
        on canonical_region.id =
            canonical.region_id

    join public.regions duplicate_region
        on duplicate_region.id =
            duplicate.region_id

    where mm.id = p_merge_id;

    return v_result;
end;
$function$;


-- =========================================================
-- OWNERSHIP, COMMENTS, AND GRANTS
-- =========================================================

alter function public.load_member_merges()
owner to postgres;

alter function public.load_member_merge(uuid)
owner to postgres;


comment on function public.load_member_merges()
is
    'Returns incomplete member merges to authenticated superadmins.';


comment on function public.load_member_merge(uuid)
is
    'Returns one member merge and its member snapshots to authenticated superadmins.';


revoke all
on function public.load_member_merges()
from public, anon, authenticated;

revoke all
on function public.load_member_merge(uuid)
from public, anon, authenticated;


grant execute
on function public.load_member_merges()
to authenticated;

grant execute
on function public.load_member_merge(uuid)
to authenticated;


grant execute
on function public.load_member_merges()
to service_role;

grant execute
on function public.load_member_merge(uuid)
to service_role;


notify pgrst, 'reload schema';

commit;