begin;

create or replace function public.enforce_member_merge_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_canonical_environment text;
    v_duplicate_environment text;
begin
    select r.environment
    into v_canonical_environment
    from public.members m
    join public.regions r
      on r.id = m.region_id
    where m.id = new.canonical_member_id;

    if v_canonical_environment is null then
        raise exception
            'Canonical member % does not exist or has no home environment',
            new.canonical_member_id
            using errcode = '23503';
    end if;

    select r.environment
    into v_duplicate_environment
    from public.members m
    join public.regions r
      on r.id = m.region_id
    where m.id = new.duplicate_member_id;

    if v_duplicate_environment is null then
        raise exception
            'Duplicate member % does not exist or has no home environment',
            new.duplicate_member_id
            using errcode = '23503';
    end if;

    if v_canonical_environment is distinct from v_duplicate_environment then
        raise exception
            'Cannot merge members across environments: canonical %, duplicate %',
            v_canonical_environment,
            v_duplicate_environment
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    member_merges_environment_guard
on public.member_merges;

create trigger member_merges_environment_guard
before insert or update
on public.member_merges
for each row
execute function public.enforce_member_merge_environment();

commit;