-- Publish the normal recurring Aggieland workout AOs for Q Sites.
-- Special-purpose AOs such as Convergence, CSAUP, F3 Dads, and Run Club
-- remain private until we intentionally decide how they should appear
-- on the public site.

update public.aos
set
    is_public = false,
    public_display_order = null
where region_id = '96c9eef9-3b6e-4365-86cd-51dbeccf231a';

update public.aos
set
    is_public = true,
    public_display_order = case name
        when 'F3 Franklin' then 1
        when 'F3 Retirees' then 2
        when 'Southie' then 3
        when 'The Cave' then 4
        when 'The Forest' then 5
        when 'The Iron' then 6
        when 'The Keep' then 7
        when 'The Mine' then 8
        when 'The Rock' then 9
        when 'The Watch' then 10
    end
where region_id = '96c9eef9-3b6e-4365-86cd-51dbeccf231a'
  and name in (
      'F3 Franklin',
      'F3 Retirees',
      'Southie',
      'The Cave',
      'The Forest',
      'The Iron',
      'The Keep',
      'The Mine',
      'The Rock',
      'The Watch'
  );

-- F3 Retirees is configured in the operational AO model as:
-- Tuesday + Thursday, 7:30 AM, Central Park.
-- Backfill the missing descriptive recurring schedule rows so the
-- public AO directory has the same weekly schedule.

insert into public.ao_recurring_schedules (
    region_id,
    ao_id,
    site_id,
    weekday,
    start_time,
    is_active
)
select
    ao.region_id,
    ao.id,
    ao.default_site_id,
    schedule.weekday,
    '07:30'::time,
    true
from public.aos ao
cross join (
    values
        (2),
        (4)
) as schedule(weekday)
where ao.id = '554e206e-7205-4e9f-b5c8-f864d0698c69'
  and ao.region_id = '96c9eef9-3b6e-4365-86cd-51dbeccf231a'
  and not exists (
      select 1
      from public.ao_recurring_schedules ars
      where ars.region_id = ao.region_id
        and ars.ao_id = ao.id
        and ars.weekday = schedule.weekday
        and ars.is_active = true
  );