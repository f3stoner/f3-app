alter table public.planned_workouts
add column if not exists source_q_slot_id uuid references public.q_slots(id) on delete set null;

alter table public.sessions
add column if not exists source_q_slot_id uuid references public.q_slots(id) on delete set null;

create index if not exists idx_planned_workouts_source_q_slot_id
on public.planned_workouts(source_q_slot_id);

create index if not exists idx_sessions_source_q_slot_id
on public.sessions(source_q_slot_id);