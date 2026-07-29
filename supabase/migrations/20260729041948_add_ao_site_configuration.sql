alter table public.aos
    add column if not exists default_site_id uuid
    references public.sites(id);

create index if not exists idx_aos_default_site_id
    on public.aos(default_site_id);


create or replace function public.validate_ao_default_site_region()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_site_region_id uuid;
begin
    if new.default_site_id is null then
        return new;
    end if;

    select s.region_id
      into v_site_region_id
      from public.sites s
     where s.id = new.default_site_id;

    if v_site_region_id is null then
        raise exception 'Default Site does not exist.';
    end if;

    if v_site_region_id <> new.region_id then
        raise exception 'AO default Site must belong to the AO region.';
    end if;

    return new;
end;
$$;

drop trigger if exists validate_ao_default_site_region
    on public.aos;

create trigger validate_ao_default_site_region
before insert or update of default_site_id, region_id
on public.aos
for each row
execute function public.validate_ao_default_site_region();


create or replace function public.validate_ao_recurring_schedule_region()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_ao_region_id uuid;
    v_site_region_id uuid;
begin
    select a.region_id
      into v_ao_region_id
      from public.aos a
     where a.id = new.ao_id;

    if v_ao_region_id is null then
        raise exception 'AO does not exist.';
    end if;

    select s.region_id
      into v_site_region_id
      from public.sites s
     where s.id = new.site_id;

    if v_site_region_id is null then
        raise exception 'Site does not exist.';
    end if;

    if new.region_id <> v_ao_region_id then
        raise exception 'Recurring schedule region must match the AO region.';
    end if;

    if new.region_id <> v_site_region_id then
        raise exception 'Recurring schedule Site must belong to the AO region.';
    end if;

    return new;
end;
$$;

drop trigger if exists validate_ao_recurring_schedule_region
    on public.ao_recurring_schedules;

create trigger validate_ao_recurring_schedule_region
before insert or update of region_id, ao_id, site_id
on public.ao_recurring_schedules
for each row
execute function public.validate_ao_recurring_schedule_region();