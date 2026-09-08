begin;

create or replace function public.enforce_q_slot_member_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if new.q_user_id is not null
       and not public.member_is_eligible_for_region(
           new.q_user_id,
           new.region_id
       )
    then
        raise exception
            'Member % is not eligible to Q in region %',
            new.q_user_id,
            new.region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    q_slots_member_environment_guard
on public.q_slots;

create trigger q_slots_member_environment_guard
before insert or update
on public.q_slots
for each row
execute function public.enforce_q_slot_member_environment();

commit;