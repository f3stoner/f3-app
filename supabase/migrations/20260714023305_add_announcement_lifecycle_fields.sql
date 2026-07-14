alter table public.planned_workouts
add column if not exists announcement_mode text;

alter table public.planned_workouts
add column if not exists announcement_legacy_text text;

update public.planned_workouts
set announcement_legacy_text = announcement_text
where announcement_legacy_text is null
  and nullif(trim(announcement_text), '') is not null;

update public.planned_workouts
set announcement_mode = 'auto'
where announcement_mode is null;

alter table public.planned_workouts
alter column announcement_mode set default 'auto';

alter table public.planned_workouts
alter column announcement_mode set not null;

alter table public.planned_workouts
drop constraint if exists planned_workouts_announcement_mode_check;

alter table public.planned_workouts
add constraint planned_workouts_announcement_mode_check
check (announcement_mode in ('auto', 'custom'));

alter table public.sessions
add column if not exists announcement_text text;

alter table public.sessions
add column if not exists announcement_snapshot jsonb;