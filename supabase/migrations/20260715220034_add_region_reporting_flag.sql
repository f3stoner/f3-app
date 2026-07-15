begin;

alter table public.regions
add column if not exists include_in_reporting boolean
not null
default true;

update public.regions
set include_in_reporting = false
where lower(trim(name)) = 'sandbox';

commit;