create or replace function public.load_member_merge(
    p_merge_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
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
from member_merges mm

join members canonical
    on canonical.id = mm.canonical_member_id

join members duplicate
    on duplicate.id = mm.duplicate_member_id

join regions canonical_region
    on canonical_region.id = canonical.region_id

join regions duplicate_region
    on duplicate_region.id = duplicate.region_id

where mm.id = p_merge_id;
$$;

grant execute on function public.load_member_merge(uuid)
to authenticated;