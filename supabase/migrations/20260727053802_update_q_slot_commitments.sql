begin;

create or replace function public.set_q_slot_commitment(
    target_q_slot_id uuid,
    target_member_id uuid,
    target_commitment_type text
)
returns table (
    commitment_id uuid,
    q_slot_id uuid,
    member_id uuid,
    commitment_type text,
    source text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz,
    updated_at timestamptz,
    cleared boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_slot public.q_slots%rowtype;
    v_my_member_id uuid;
    v_is_self boolean;
    v_can_manage boolean;
    v_row public.q_slot_commitments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if target_q_slot_id is null then
        raise exception 'Q slot ID is required'
            using errcode = '22004';
    end if;

    if target_member_id is null then
        raise exception 'Member ID is required'
            using errcode = '22004';
    end if;

    if target_commitment_type is not null
       and target_commitment_type not in ('hc', 'sc') then
        raise exception
            'Commitment type must be hc, sc, or null'
            using errcode = '22023';
    end if;

    select qs.*
    into v_slot
    from public.q_slots qs
    where qs.id = target_q_slot_id;

    if not found then
        raise exception 'Q slot not found'
            using errcode = 'P0002';
    end if;

    if not public.has_region_access(v_slot.region_id) then
        raise exception 'Region access required'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.members m
        where m.id = target_member_id
    ) then
        raise exception 'Member not found'
            using errcode = 'P0002';
    end if;

    v_my_member_id := public.my_member_id();

    v_is_self :=
        v_my_member_id is not null
        and v_my_member_id = target_member_id;

    v_can_manage :=
        public.can_manage_q_slot_commitments(
            target_q_slot_id
        );

    if not v_is_self and not v_can_manage then
        raise exception
            'You may only manage your own commitment for this Q slot'
            using errcode = '42501';
    end if;

    if not v_is_self
       and not public.is_member_known_in_region(
           v_slot.region_id,
           target_member_id
       ) then
        raise exception
            'Member is not known in this regional workspace'
            using errcode = '42501';
    end if;

    if target_commitment_type is null then
        delete from public.q_slot_commitments qsc
        where qsc.q_slot_id = target_q_slot_id
          and qsc.member_id = target_member_id
        returning qsc.*
        into v_row;

        return query
        select
            v_row.id,
            target_q_slot_id,
            target_member_id,
            null::text,
            v_row.source,
            v_row.created_by,
            auth.uid(),
            v_row.created_at,
            now(),
            true;

        return;
    end if;

    insert into public.q_slot_commitments (
        q_slot_id,
        member_id,
        commitment_type,
        source,
        created_by,
        updated_by
    )
    values (
        target_q_slot_id,
        target_member_id,
        target_commitment_type,
        case
            when v_is_self then 'self'
            else 'leader'
        end,
        auth.uid(),
        auth.uid()
    )
    on conflict on constraint
        q_slot_commitments_slot_member_key
    do update set
        commitment_type = excluded.commitment_type,
        source = excluded.source,
        updated_by = excluded.updated_by,
        updated_at = now()
    returning *
    into v_row;

    return query
    select
        v_row.id,
        v_row.q_slot_id,
        v_row.member_id,
        v_row.commitment_type,
        v_row.source,
        v_row.created_by,
        v_row.updated_by,
        v_row.created_at,
        v_row.updated_at,
        false;
end;
$$;

revoke all
on function public.set_q_slot_commitment(uuid, uuid, text)
from public, anon, authenticated;

grant execute
on function public.set_q_slot_commitment(uuid, uuid, text)
to authenticated, service_role;

alter function public.set_q_slot_commitment(uuid, uuid, text)
owner to postgres;

notify pgrst, 'reload schema';

commit;