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
language sql
security definer
set search_path = public
as $$
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
from member_merges mm

join members canonical
    on canonical.id = mm.canonical_member_id

join members duplicate
    on duplicate.id = mm.duplicate_member_id

join regions canonical_region
    on canonical_region.id = canonical.region_id

join regions duplicate_region
    on duplicate_region.id = duplicate.region_id

where mm.status <> 'completed'

order by
    mm.created_at desc;
$$;

grant execute on function public.load_member_merges()
to authenticated;