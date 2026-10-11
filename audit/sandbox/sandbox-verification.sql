-- Read-only checks for the simplified Sandbox cleanup/reseed.

select r.id, r.slug, r.environment,
 (select count(*) from public.aos where region_id=r.id) aos,
 (select count(*) from public.sites where region_id=r.id) sites,
 (select count(*) from public.ao_recurring_schedules where region_id=r.id) schedules,
 (select count(*) from public.region_access where region_id=r.id) access_grants,
 (select count(*) from public.members where region_id=r.id) members,
 (select count(*) from public.sessions where region_id=r.id) sessions,
 (select count(*) from public.q_slots where region_id=r.id) q_slots,
 (select count(*) from public.planned_workouts where region_id=r.id) planned_workouts,
 (select count(*) from public.campaigns where region_id=r.id) campaigns,
 (select count(*) from public.region_feed_events where region_id=r.id) feed_events
from public.regions r
where r.id='8872e939-5691-450f-ba32-293a8b77d029';

-- Expected fictional roster: 27 active, three inactive, across seven AOs.
select status, count(*) from public.members
where region_id='8872e939-5691-450f-ba32-293a8b77d029'
and real_name like 'SANDBOX FICTIONAL %'
group by status order by status;

select home_ao, count(*) fictional_members from public.members
where region_id='8872e939-5691-450f-ba32-293a8b77d029'
and real_name like 'SANDBOX FICTIONAL %'
group by home_ao order by home_ao;

-- Expected empty: duplicate fictional PAX names.
select lower(pax_name), count(*) from public.members
where region_id='8872e939-5691-450f-ba32-293a8b77d029'
and real_name like 'SANDBOX FICTIONAL %'
group by lower(pax_name) having count(*) > 1;

-- Expected empty: fictional members linked to authentication profiles.
select p.id profile_id, p.email, m.id member_id, m.pax_name
from public.profiles p join public.members m on m.id=p.member_id
where m.region_id='8872e939-5691-450f-ba32-293a8b77d029'
and m.real_name like 'SANDBOX FICTIONAL %';

-- Preserved merge/audit identities should be inactive and hidden.
select m.id, m.pax_name, m.real_name, m.status,
       rp.status participant_status, rp.sources
from public.members m left join public.region_participants rp
on rp.region_id=m.region_id and rp.member_id=m.id
where m.region_id='8872e939-5691-450f-ba32-293a8b77d029'
and m.real_name like 'SANDBOX PRESERVED IDENTITY %'
order by m.id;

-- Expected unchanged access identities: Rawhide, Mario, and Stoner.
select p.id, p.email, r.slug
from public.region_access access
join public.profiles p on p.id=access.user_id
join public.regions r on r.id=access.region_id
where access.region_id='8872e939-5691-450f-ba32-293a8b77d029'
order by p.email;
