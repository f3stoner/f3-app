-- Add canonical AO references.
alter table public.sessions
add column if not exists ao_id uuid references public.aos(id) on delete set null;

alter table public.planned_workouts
add column if not exists ao_id uuid references public.aos(id) on delete set null;

-- Add lookup indexes.
create index if not exists sessions_ao_id_idx
on public.sessions(ao_id);

create index if not exists planned_workouts_ao_id_idx
on public.planned_workouts(ao_id);

create index if not exists sessions_region_ao_date_idx
on public.sessions(region_id, ao_id, date);

create index if not exists planned_workouts_region_ao_date_idx
on public.planned_workouts(region_id, ao_id, date);

-- Backfill existing rows by matching region + AO name.
update public.sessions s
set ao_id = a.id
from public.aos a
where s.ao_id is null
  and s.region_id = a.region_id
  and lower(trim(s.ao_name)) = lower(trim(a.name));

update public.planned_workouts pw
set ao_id = a.id
from public.aos a
where pw.ao_id is null
  and pw.region_id = a.region_id
  and lower(trim(pw.ao_name)) = lower(trim(a.name));