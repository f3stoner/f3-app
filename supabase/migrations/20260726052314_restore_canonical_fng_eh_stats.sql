begin;

-- ============================================================================
-- Restore canonical FNG EH statistics
--
-- Problem:
-- rebuild_member_stats_for_member currently calculates fngs_eh from the legacy
-- sessions.fngs[].invitedById snapshot.
--
-- Canonical definition:
-- One EH credit equals one distinct member_inviters relationship:
--
--     invited member -> inviter member
--
-- A multi-inviter FNG gives one credit to each inviter.
-- The same FNG appearing in multiple sessions still counts only once.
-- ============================================================================


-- ============================================================================
-- 1. Preserve the current region-aware stats implementation as an internal
--    base function.
--
-- The new public function created below will call this function and then
-- replace only fngs_eh with the canonical member_inviters total.
-- ============================================================================

alter function public.rebuild_member_stats_for_member(uuid, uuid)
rename to rebuild_member_stats_for_member_region_activity_base;


-- ============================================================================
-- 2. Recreate the public function as a wrapper around the existing regional
--    implementation.
-- ============================================================================

create or replace function public.rebuild_member_stats_for_member(
    target_region_id uuid,
    target_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
    -- Preserve all existing region-scoped posts, Qs, AO, date, and baseline
    -- behavior.
    perform public.rebuild_member_stats_for_member_region_activity_base(
        target_region_id,
        target_member_id
    );

    -- Restore member_inviters as the canonical source for EH totals.
    --
    -- This is intentionally a lifetime relationship total. Because
    -- member_inviters is not region-scoped, every regional stats row for the
    -- member displays the same canonical EH count.
    update public.member_stats ms
    set
        fngs_eh = (
            select count(distinct mi.member_id)::integer
            from public.member_inviters mi
            where mi.inviter_member_id = target_member_id
        ),
        updated_at = now()
    where ms.region_id = target_region_id
      and ms.member_id = target_member_id;
end;
$function$;


-- ============================================================================
-- 3. Rebuild an inviter's stats in every region where that member currently
--    has a stats row, plus the member's home region.
--
-- This allows member_inviters changes to correct both old and new inviters.
-- ============================================================================

create or replace function public.rebuild_stats_for_inviter(
    target_inviter_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    affected_region_id uuid;
begin
    if target_inviter_member_id is null then
        return;
    end if;

    for affected_region_id in
        select distinct regions_to_rebuild.region_id
        from (
            select ms.region_id
            from public.member_stats ms
            where ms.member_id = target_inviter_member_id

            union

            select m.region_id
            from public.members m
            where m.id = target_inviter_member_id
              and m.region_id is not null
        ) as regions_to_rebuild
        where regions_to_rebuild.region_id is not null
    loop
        perform public.rebuild_member_stats_for_member(
            affected_region_id,
            target_inviter_member_id
        );
    end loop;
end;
$function$;


-- ============================================================================
-- 4. Automatically rebuild affected inviters whenever canonical relationships
--    are inserted, deleted, or changed.
--
-- This covers:
-- - set_member_inviters
-- - member-profile Proud Papa edits
-- - session save relationship writes
-- - admin corrections
-- - canonical import/reconciliation writes
--
-- Row-level execution may rebuild a retained inviter during both the delete
-- and insert portions of a replacement operation. That is acceptable because
-- the final insert rebuild leaves the deterministic final value.
-- ============================================================================

create or replace function public.handle_member_inviter_stats_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
    if tg_op = 'INSERT' then
        perform public.rebuild_stats_for_inviter(
            new.inviter_member_id
        );

        return new;
    end if;

    if tg_op = 'DELETE' then
        perform public.rebuild_stats_for_inviter(
            old.inviter_member_id
        );

        return old;
    end if;

    if tg_op = 'UPDATE' then
        if old.inviter_member_id is distinct from new.inviter_member_id then
            perform public.rebuild_stats_for_inviter(
                old.inviter_member_id
            );

            perform public.rebuild_stats_for_inviter(
                new.inviter_member_id
            );
        else
            perform public.rebuild_stats_for_inviter(
                new.inviter_member_id
            );
        end if;

        return new;
    end if;

    return null;
end;
$function$;


drop trigger if exists member_inviters_rebuild_stats
on public.member_inviters;

create trigger member_inviters_rebuild_stats
after insert or update or delete
on public.member_inviters
for each row
execute function public.handle_member_inviter_stats_change();


-- ============================================================================
-- 5. Correct all currently stored profile EH values immediately.
--
-- This updates only fngs_eh. It does not recalculate or disturb posts, Qs,
-- baselines, favorite AO, or first/last post dates.
-- ============================================================================

update public.member_stats ms
set
    fngs_eh = (
        select count(distinct mi.member_id)::integer
        from public.member_inviters mi
        where mi.inviter_member_id = ms.member_id
    ),
    updated_at = now();


-- ============================================================================
-- 6. Permissions
-- ============================================================================

revoke all
on function public.rebuild_member_stats_for_member(uuid, uuid)
from public;

revoke all
on function public.rebuild_stats_for_inviter(uuid)
from public;

revoke all
on function public.handle_member_inviter_stats_change()
from public;

grant execute
on function public.rebuild_member_stats_for_member(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.rebuild_stats_for_inviter(uuid)
to service_role;

-- Trigger functions do not need to be directly executable by client roles.

commit;