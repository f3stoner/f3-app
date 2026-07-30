-- Serialize rebuilds for one logical member_stats key.
--
-- rebuild_member_stats_for_member_region_activity_base() uses DELETE followed
-- by INSERT. Without a transaction-scoped lock, concurrent rebuilds for the
-- same (region_id, member_id) can race and violate member_stats_pkey.

create or replace function public.rebuild_member_stats_for_member(
    target_region_id uuid,
    target_member_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    if target_region_id is null then
        raise exception 'target_region_id is required';
    end if;

    if target_member_id is null then
        raise exception 'target_member_id is required';
    end if;

    -- Lock the logical member_stats key for the remainder of this transaction.
    -- Every public rebuild path reaches this wrapper, so a competing rebuild
    -- for the same region/member waits instead of racing the DELETE/INSERT.
    -- Hash collisions only cause harmless extra serialization.
    perform pg_advisory_xact_lock(
        hashtextextended(
            'member_stats:' || target_region_id::text || ':' || target_member_id::text,
            0
        )
    );

    -- Preserve all existing region-scoped posts, Qs, AO, date, and baseline
    -- behavior, including deletion with no replacement row when the member has
    -- no qualifying regional activity or baseline.
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

comment on function public.rebuild_member_stats_for_member(uuid, uuid) is
'Serializes rebuilds per region/member, rebuilds region-activity stats, and restores canonical EH totals.';