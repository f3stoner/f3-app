begin;

alter table public.regions
add column if not exists timezone text;

update public.regions
set timezone = 'America/Chicago'
where timezone is null;

alter table public.regions
alter column timezone set default 'America/Chicago';

alter table public.regions
alter column timezone set not null;

comment on column public.regions.timezone is
'IANA timezone used for region-local calendar dates and time-sensitive regional behavior.';

create or replace function public.region_local_date(
    p_region_id uuid
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
    region_timezone text;
begin
    select r.timezone
    into region_timezone
    from public.regions r
    where r.id = p_region_id;

    if region_timezone is null then
        raise exception 'Region timezone not found';
    end if;

    return (now() at time zone region_timezone)::date;
end;
$function$;

commit;