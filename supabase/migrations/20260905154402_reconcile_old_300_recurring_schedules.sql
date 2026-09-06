/*
 * Reconcile Old 300 recurring schedules with the schedule currently
 * configured and used by The Q.
 *
 * The Hub is already synchronized.
 *
 * The Melt Shop is running an additional Thursday 8:00 PM workout
 * during September 2026. The legacy AO schedule and generated q_slots
 * already reflect this, but ao_recurring_schedules does not.
 */

insert into public.ao_recurring_schedules (
    region_id,
    ao_id,
    site_id,
    weekday,
    start_time,
    duration_minutes,
    schedule_label,
    emphasis_rule,
    effective_start_date,
    effective_end_date,
    is_active
)
select
    r.id,
    ao.id,
    ao.default_site_id,
    4,
    '20:00:00'::time,
    null,
    null,
    '{}'::jsonb,
    '2026-09-01'::date,
    '2026-09-30'::date,
    true
from public.regions r
join public.aos ao
    on ao.region_id = r.id
where r.slug = 'old-300'
  and ao.slug = 'the-melt-shop'
  and not exists (
      select 1
      from public.ao_recurring_schedules ars
      where ars.region_id = r.id
        and ars.ao_id = ao.id
        and ars.weekday = 4
        and ars.start_time = '20:00:00'::time
        and ars.site_id = ao.default_site_id
        and ars.effective_start_date = '2026-09-01'::date
        and ars.effective_end_date = '2026-09-30'::date
  );