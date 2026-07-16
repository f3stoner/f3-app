alter table public.planned_workouts
add column if not exists third_f_mode text not null default 'auto',
add column if not exists third_f_legacy_text text;

alter table public.planned_workouts
add constraint planned_workouts_third_f_mode_check
check (third_f_mode in ('auto', 'custom'));