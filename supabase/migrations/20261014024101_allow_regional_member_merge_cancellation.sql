create or replace function public.cancel_member_merge(
    p_merge_id uuid,
    p_reason text default null
)
returns public.member_merges
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_actor_user_id uuid := auth.uid();
    v_merge public.member_merges%rowtype;
    v_is_superadmin boolean;
begin
    if v_actor_user_id is null then
        raise exception 'Authentication is required to cancel a member merge.'
            using errcode = '42501';
    end if;

    if p_merge_id is null then
        raise exception 'Member merge ID is required.'
            using errcode = '22004';
    end if;

    select exists (
        select 1
        from public.profiles p
        where p.id = v_actor_user_id
          and p.role = 'superadmin'
    )
    into v_is_superadmin;

    select mm.*
    into v_merge
    from public.member_merges mm
    where mm.id = p_merge_id
    for update;

    if not found then
        raise exception 'Member merge % does not exist.', p_merge_id
            using errcode = 'P0002';
    end if;

    if not v_is_superadmin then
        perform m.id
        from public.members m
        where m.id in (v_merge.canonical_member_id, v_merge.duplicate_member_id)
        order by m.id
        for update;

        if not public.can_manage_regional_member_merge(
            v_merge.canonical_member_id,
            v_merge.duplicate_member_id
        ) then
            raise exception 'Member merge is outside your authorized region.'
                using errcode = '42501';
        end if;
    end if;

    if v_merge.status = 'cancelled' then
        return v_merge;
    end if;

    if v_merge.status not in ('draft', 'validated', 'ready', 'failed') then
        raise exception 'Member merge % cannot be cancelled while its status is %.',
            p_merge_id,
            v_merge.status
            using errcode = '23514';
    end if;

    update public.member_merges
    set
        status = 'cancelled',
        cancelled_at = now(),
        notes = case
            when nullif(btrim(p_reason), '') is null then notes
            when nullif(btrim(notes), '') is null then btrim(p_reason)
            else notes || E'\n\nCancellation: ' || btrim(p_reason)
        end,
        updated_at = now()
    where id = p_merge_id
    returning *
    into v_merge;

    return v_merge;
end;
$function$;