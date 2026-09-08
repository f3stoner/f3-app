begin;

create or replace function public.enforce_q_slot_commitment_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_region_id uuid;
begin
    select qs.region_id
    into v_region_id
    from public.q_slots qs
    where qs.id = new.q_slot_id;

    if v_region_id is null then
        raise exception
            'Q slot % does not exist',
            new.q_slot_id
            using errcode = '23503';
    end if;

    if not public.member_is_eligible_for_region(
        new.member_id,
        v_region_id
    ) then
        raise exception
            'Member % is not eligible for Q slot region %',
            new.member_id,
            v_region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    q_slot_commitments_environment_guard
on public.q_slot_commitments;

create trigger q_slot_commitments_environment_guard
before insert or update
on public.q_slot_commitments
for each row
execute function public.enforce_q_slot_commitment_environment();

commit;