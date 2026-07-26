create or replace function public.rebuild_member_stats_for_region(
    target_region_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    member_rec record;
begin
    if target_region_id is null then
        raise exception 'target_region_id is required';
    end if;

    /*
     * Regional member statistics are activity-scoped, not roster-scoped.
     *
     * A canonical member should have a member_stats row for this region
     * when either:
     *
     *   1. The member participated in at least one session in the region; or
     *   2. The member has an imported statistics baseline for the region.
     *
     * members.region_id remains the member's canonical home region.
     * member_stats.region_id identifies the region being measured.
     *
     * All calculations are delegated to
     * rebuild_member_stats_for_member(region_id, member_id) so that the
     * regional and single-member rebuild paths cannot drift apart.
     */

    delete from public.member_stats
    where region_id = target_region_id;

    for member_rec in
        select distinct qualifying_members.member_id
        from (
            /*
             * Members referenced by a session in the target region.
             *
             * Using the canonical members table here prevents malformed or
             * deleted member IDs in session JSON from being sent into the
             * per-member rebuild.
             */
            select m.id as member_id
            from public.members m
            where exists (
                select 1
                from public.sessions s
                where s.region_id = target_region_id
                  and (
                        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text

                        or s.q_id = m.id

                        or m.id = any(
                            coalesce(s.q_ids, '{}'::uuid[])
                        )

                        or exists (
                            select 1
                            from jsonb_array_elements(
                                coalesce(s.fngs, '[]'::jsonb)
                            ) as fng(fng_obj)
                            where fng.fng_obj->>'memberId' = m.id::text
                               or fng.fng_obj->>'member_id' = m.id::text
                        )
                  )
            )

            union

            /*
             * Members with imported historical baselines in the region,
             * even when matching raw sessions do not exist.
             */
            select msb.member_id
            from public.member_stats_baselines msb
            join public.members m
                on m.id = msb.member_id
            where msb.region_id = target_region_id
        ) as qualifying_members
    loop
        perform public.rebuild_member_stats_for_member(
            target_region_id,
            member_rec.member_id
        );
    end loop;
end;
$function$;