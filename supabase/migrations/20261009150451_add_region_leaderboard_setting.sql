
-- Region-specific leaderboard visibility. Disabled by default.
alter table public.regions
add column leaderboards_enabled boolean not null default false;

-- Only authorized regional leadership can change this setting.
create function public.set_region_leaderboards_enabled(
    p_region_id uuid,
    p_enabled boolean
)
returns table (region_id uuid, leaderboards_enabled boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    if auth.uid() is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication required';
    end if;

    if p_region_id is null or p_enabled is null then
        raise exception using
            errcode = '22004',
            message = 'Region and setting are required';
    end if;

    if not public.is_region_leader(p_region_id) then
        raise exception using
            errcode = '42501',
            message = 'Not authorized to manage this region';
    end if;

    return query
    update public.regions r
    set leaderboards_enabled = p_enabled
    where r.id = p_region_id
    returning r.id, r.leaderboards_enabled;

    if not found then
        raise exception using
            errcode = 'P0002',
            message = 'Region not found';
    end if;
end;
$$;

revoke all on function public.set_region_leaderboards_enabled(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.set_region_leaderboards_enabled(uuid, boolean)
to authenticated;
