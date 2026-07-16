create or replace function public.load_region_member_inviters(
    p_region_id uuid
)
returns table (
    member_id uuid,
    inviter_member_id uuid,
    source text,
    source_metadata jsonb,
    created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    select
        mi.member_id,
        mi.inviter_member_id,
        mi.source,
        mi.source_metadata,
        mi.created_at
    from public.member_inviters mi
    join public.members m
      on m.id = mi.member_id
    where m.region_id = p_region_id
      and (
        exists (
            select 1
            from public.region_access ra
            where ra.region_id = p_region_id
              and ra.user_id = auth.uid()
        )
        or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role = 'superadmin'
        )
      )
    order by
        mi.created_at,
        mi.inviter_member_id;
$$;

revoke all
on function public.load_region_member_inviters(uuid)
from public;

grant execute
on function public.load_region_member_inviters(uuid)
to authenticated;