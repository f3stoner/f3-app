-- REVIEW ONLY. Do not execute without an approved backup and change window.
\set ON_ERROR_STOP on

begin;
set local lock_timeout = '10s';
set local statement_timeout = '5min';

do $guard$
declare v_region public.regions%rowtype;
begin
  select * into v_region from public.regions
  where id = '8872e939-5691-450f-ba32-293a8b77d029'::uuid for update;

  if not found or v_region.slug is distinct from 'sandbox'
     or v_region.environment is distinct from 'test' then
    raise exception 'Sandbox region guard failed';
  end if;
  if (select count(*) from public.aos where region_id = v_region.id) <> 7 then
    raise exception 'Expected seven existing Sandbox AOs';
  end if;
  if (select count(*) from public.region_access where region_id = v_region.id) <> 3 then
    raise exception 'Expected Rawhide, Mario, and Stoner Sandbox access';
  end if;
  if exists (select 1 from public.profiles p join public.members m on m.id = p.member_id
             where m.region_id = v_region.id)
     or exists (select 1 from public.profiles where region_id = v_region.id) then
    raise exception 'Unexpected Sandbox-linked authentication profile';
  end if;
  if exists (
    select 1 from public.region_participants rp join public.members m on m.id = rp.member_id
    where m.region_id = v_region.id and rp.region_id <> v_region.id
  ) or exists (
    select 1 from public.q_slots qs join public.members m on m.id = qs.q_user_id
    where m.region_id = v_region.id and qs.region_id <> v_region.id
  ) or exists (
    select 1 from public.member_activity_entries a join public.members m on m.id = a.member_id
    where m.region_id = v_region.id and a.region_id <> v_region.id
  ) or exists (
    select 1 from public.q_slot_commitments c
    join public.q_slots q on q.id = c.q_slot_id
    join public.members m on m.id = c.member_id
    where m.region_id = v_region.id and q.region_id <> v_region.id
  ) or exists (
    select 1 from public.planned_workout_commitments c
    join public.planned_workouts w on w.id = c.planned_workout_id
    join public.members m on m.id = c.member_id
    where m.region_id = v_region.id and w.region_id <> v_region.id
  ) or exists (
    select 1 from public.region_feed_comments c
    join public.region_feed_events e on e.id = c.feed_event_id
    join public.members m on m.id = c.member_id
    where m.region_id = v_region.id and e.region_id <> v_region.id
  ) or exists (
    select 1 from public.region_feed_reactions reaction
    join public.region_feed_events e on e.id = reaction.feed_event_id
    join public.members m on m.id = reaction.member_id
    where m.region_id = v_region.id and e.region_id <> v_region.id
  ) or exists (
    select 1 from public.member_inviters i
    join public.members member on member.id = i.member_id
    join public.members inviter on inviter.id = i.inviter_member_id
    where (member.region_id = v_region.id) <> (inviter.region_id = v_region.id)
  ) then
    raise exception 'A Sandbox-home member has an unreviewed cross-region reference';
  end if;
  if exists (
    select 1 from public.sessions s join public.regions r on r.id = s.region_id
    where r.environment = 'production' and (
      exists (select 1 from jsonb_array_elements_text(
                case when jsonb_typeof(s.attendee_ids) = 'array' then s.attendee_ids else '[]'::jsonb end
              ) x(member_id) join public.members m on m.id = x.member_id::uuid
              where m.region_id = v_region.id)
      or exists (select 1 from unnest(coalesce(s.q_ids, '{}'::uuid[])) x(member_id)
                 join public.members m on m.id = x.member_id where m.region_id = v_region.id)
      or exists (select 1 from public.members m where m.id = s.q_id and m.region_id = v_region.id)
    )
  ) then
    raise exception 'A production session references a Sandbox-home member';
  end if;
  if exists (
    select 1 from public.members external_member
    join public.members sandbox_inviter on sandbox_inviter.id = external_member.invited_by_id
    where sandbox_inviter.region_id = v_region.id and external_member.region_id <> v_region.id
  ) then
    raise exception 'A non-Sandbox member references a Sandbox inviter';
  end if;
end;
$guard$;

-- Exact before-images for infrastructure that this cleanup must not alter.
create temp table sandbox_q_slots_before on commit drop as
select id from public.q_slots
where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

create temp table sandbox_aos_before on commit drop as
select * from public.aos
where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

create temp table sandbox_schedules_before on commit drop as
select * from public.ao_recurring_schedules
where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

-- Preserve immutable merge endpoints, audited identities, and profile-linked identities.
create temp table protected_sandbox_members (member_id uuid primary key) on commit drop;
insert into protected_sandbox_members
select distinct protected.member_id
from (
  select canonical_member_id member_id from public.member_merges
  union all select duplicate_member_id from public.member_merges
  union all select member_id from public.member_change_audit
  union all select member_id from public.profiles where member_id is not null
) protected
join public.members m on m.id = protected.member_id
where m.region_id = '8872e939-5691-450f-ba32-293a8b77d029';

create temp table disposable_sandbox_members (member_id uuid primary key) on commit drop;
insert into disposable_sandbox_members
select m.id from public.members m
where m.region_id = '8872e939-5691-450f-ba32-293a8b77d029'
and not exists (select 1 from protected_sandbox_members p where p.member_id = m.id);

-- Delete only disposable Sandbox activity/content. Infrastructure, access,
-- public-site configuration, profiles, and global reference data remain.
delete from public.region_import_staged_session_participants x
using public.region_import_staged_sessions s, public.region_import_projects p
where x.staged_session_id = s.id and s.project_id = p.id
and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_staged_sessions x using public.region_import_projects p
where x.project_id = p.id and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_staged_schedules x using public.region_import_projects p
where x.project_id = p.id and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_staged_aos x using public.region_import_projects p
where x.project_id = p.id and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_staged_sites x using public.region_import_projects p
where x.project_id = p.id and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_identity_resolutions x
using public.region_import_source_identities i, public.region_import_projects p
where x.source_identity_id = i.id and i.project_id = p.id
and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_identity_candidates x
using public.region_import_source_identities i, public.region_import_projects p
where x.source_identity_id = i.id and i.project_id = p.id
and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_source_identities x using public.region_import_projects p
where x.project_id = p.id and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_raw_rows x
using public.region_import_batches b, public.region_import_projects p
where x.batch_id = b.id and b.project_id = p.id
and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_batches x using public.region_import_projects p
where x.project_id = p.id and p.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_import_projects
where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

delete from public.campaign_contributions x using public.campaigns c
where x.campaign_id = c.id and c.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.campaign_enrollments x using public.campaigns c
where x.campaign_id = c.id and c.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.campaigns where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

delete from public.media_attachments x using public.media_assets a
where x.media_asset_id = a.id and a.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.media_assets where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

delete from public.region_feed_comments x using public.region_feed_events e
where x.feed_event_id = e.id and e.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_feed_reactions x using public.region_feed_events e
where x.feed_event_id = e.id and e.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.region_feed_events where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

delete from public.session_visitors x using public.sessions s
where x.session_id = s.id and s.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.session_backblast_links x using public.sessions s
where x.session_id = s.id and s.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.planned_workout_commitments x using public.planned_workouts w
where x.planned_workout_id = w.id and w.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.planned_workouts where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.sessions where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.q_slot_commitments commitment
using public.q_slots slot
where commitment.q_slot_id = slot.id
and slot.region_id = '8872e939-5691-450f-ba32-293a8b77d029';
update public.q_slots
set q_user_id = null
where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
and q_user_id is not null;

delete from public.announcements where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.third_f_discussions where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.backblast_review_decisions where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.participant_region_invitation_dismissals where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.member_activity_entries where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.member_stats where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.effective_member_stats where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
delete from public.member_stats_baselines where region_id = '8872e939-5691-450f-ba32-293a8b77d029';

delete from public.member_inviters i
where i.member_id in (select member_id from disposable_sandbox_members)
or i.inviter_member_id in (select member_id from disposable_sandbox_members);
delete from public.region_participants where region_id = '8872e939-5691-450f-ba32-293a8b77d029';
-- Break any legacy scalar inviter reference from a protected identity to a
-- disposable identity before deleting the latter.
update public.members m set invited_by_id = null
where exists (select 1 from protected_sandbox_members p where p.member_id = m.id);
delete from public.members m
where m.id in (select member_id from disposable_sandbox_members);

-- Sanitize and hide protected identities; preserve merge and audit records.
with old as (
  select m.id, m.region_id, m.pax_name, m.real_name from public.members m
  join protected_sandbox_members p on p.member_id = m.id
), changed as (
  update public.members m set
    pax_name = 'Sandbox Archive ' || left(m.id::text, 8),
    real_name = 'SANDBOX PRESERVED IDENTITY ' || left(m.id::text, 8),
    home_ao = null, invited_by_id = null, avatar_path = null, status = 'inactive'
  from old where m.id = old.id
  returning m.id, m.region_id, old.pax_name old_pax, old.real_name old_real,
            m.pax_name new_pax, m.real_name new_real
)
insert into public.member_change_audit
  (member_id, region_id, changed_by_user_id, change_type, old_value, new_value)
select id, region_id, 'a2072e94-56ee-447c-aeb3-e820e1fc4c4d'::uuid,
       v.change_type, v.old_value, v.new_value
from changed cross join lateral (values
  ('pax_name', old_pax, new_pax), ('real_name', old_real, new_real)
) v(change_type, old_value, new_value)
where v.old_value is distinct from v.new_value;

insert into public.region_participants (region_id, member_id, status, sources)
select '8872e939-5691-450f-ba32-293a8b77d029'::uuid, member_id, 'hidden',
       array['administrative_history']::text[]
from protected_sandbox_members;

-- Thirty fictional members distributed across the seven existing AOs.
with roster(member_no, pax_name, status, first_post_date, invited_by_no) as (values
 (1,'Northstar','active','2025-01-04',null),(2,'Blueprint','active','2025-01-11',null),
 (3,'Copperwire','active','2025-02-01',1),(4,'Highbeam','active','2025-02-08',2),
 (5,'Switchback','active','2025-03-01',1),(6,'Bookend','active','2025-03-15',3),
 (7,'Trailmark','active','2025-04-05',2),(8,'Kettlebell','active','2025-04-19',4),
 (9,'Sundial','active','2025-05-03',1),(10,'Crosscheck','active','2025-05-17',5),
 (11,'Riveter','active','2025-06-07',3),(12,'Mapmaker','active','2025-06-21',6),
 (13,'Turnstile','active','2025-07-05',4),(14,'Headlamp','active','2025-07-19',7),
 (15,'Draftboard','active','2025-08-02',2),(16,'Canteen','active','2025-08-16',8),
 (17,'Yardstick','active','2025-09-06',5),(18,'Gridiron','active','2025-09-20',9),
 (19,'Lifeline','active','2025-10-04',6),(20,'Turnbuckle','active','2025-10-18',10),
 (21,'Waypoint','active','2026-01-10',7),(22,'Campfire','active','2026-02-14',11),
 (23,'Paperclip','active','2026-09-12',1),(24,'Windup','active','2026-09-19',2),
 (25,'Sidecar','active','2026-09-26',3),(26,'Moonshot','active','2026-10-03',4),
 (27,'Chalkline','active','2026-10-10',5),(28,'Longboard','inactive','2025-03-22',6),
 (29,'Trestle','inactive','2025-05-24',7),(30,'Whistlepost','inactive','2025-07-26',8)
), ao_rank as (
  select name, row_number() over (order by name, id) ao_no from public.aos
  where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
)
insert into public.members
  (id, region_id, pax_name, real_name, home_ao, invited_by_id, first_post_date, status)
select md5('sandbox-fictional-member-' || lpad(r.member_no::text,2,'0'))::uuid,
  '8872e939-5691-450f-ba32-293a8b77d029'::uuid, r.pax_name,
  'SANDBOX FICTIONAL ' || lpad(r.member_no::text,2,'0'), a.name,
  case when r.invited_by_no is null then null else
    md5('sandbox-fictional-member-' || lpad(r.invited_by_no::text,2,'0'))::uuid end,
  r.first_post_date, r.status
from roster r join ao_rank a on a.ao_no = ((r.member_no - 1) % 7) + 1;

insert into public.member_inviters (member_id, inviter_member_id, source, source_metadata)
select id, invited_by_id, 'sandbox_seed', '{"fictional":true}'::jsonb
from public.members where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
and real_name like 'SANDBOX FICTIONAL %' and invited_by_id is not null;

do $verify$
declare v_protected integer;
begin
  select count(*) into v_protected from protected_sandbox_members;
  if (select count(*) from public.aos where region_id = '8872e939-5691-450f-ba32-293a8b77d029') <> 7
     or (select count(*) from public.members where region_id = '8872e939-5691-450f-ba32-293a8b77d029') <> 30 + v_protected
     or (select count(*) from public.members where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
         and real_name like 'SANDBOX FICTIONAL %') <> 30
     or (select count(*) from public.members where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
         and real_name like 'SANDBOX FICTIONAL %' and status = 'active') <> 27 then
    raise exception 'Sandbox roster verification failed';
  end if;
  if exists (select 1 from public.sessions where region_id = '8872e939-5691-450f-ba32-293a8b77d029')
     or exists (select 1 from public.planned_workouts where region_id = '8872e939-5691-450f-ba32-293a8b77d029')
     or exists (select 1 from public.campaigns where region_id = '8872e939-5691-450f-ba32-293a8b77d029')
     or exists (select 1 from public.region_feed_events where region_id = '8872e939-5691-450f-ba32-293a8b77d029') then
    raise exception 'Disposable Sandbox activity remains';
  end if;

  if (select count(*) from public.q_slots
      where region_id = '8872e939-5691-450f-ba32-293a8b77d029')
       <> (select count(*) from sandbox_q_slots_before)
     or exists (
       select id from sandbox_q_slots_before
       except
       select id from public.q_slots
       where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
     )
     or exists (
       select id from public.q_slots
       where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
       except
       select id from sandbox_q_slots_before
     ) then
    raise exception 'Sandbox Q-slot count or IDs changed';
  end if;

  if exists (
       select * from sandbox_aos_before
       except
       select * from public.aos
       where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
     ) or exists (
       select * from public.aos
       where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
       except
       select * from sandbox_aos_before
     ) or exists (
       select * from sandbox_schedules_before
       except
       select * from public.ao_recurring_schedules
       where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
     ) or exists (
       select * from public.ao_recurring_schedules
       where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
       except
       select * from sandbox_schedules_before
     ) then
    raise exception 'Sandbox AOs or recurring schedules changed';
  end if;

  if exists (
       select 1 from public.q_slots
       where region_id = '8872e939-5691-450f-ba32-293a8b77d029'
       and q_user_id is not null
     ) or exists (
       select 1 from public.q_slot_commitments commitment
       join public.q_slots slot on slot.id = commitment.q_slot_id
       where slot.region_id = '8872e939-5691-450f-ba32-293a8b77d029'
     ) then
    raise exception 'A Sandbox Q assignment or Q-slot commitment remains';
  end if;
  if exists (select 1 from public.profiles p join public.members m on m.id = p.member_id
             where m.region_id = '8872e939-5691-450f-ba32-293a8b77d029'
             and m.real_name like 'SANDBOX FICTIONAL %') then
    raise exception 'A fictional Sandbox member is linked to a profile';
  end if;
end;
$verify$;

commit;

-- Basic read-only verification queries.
select r.id, r.slug, r.environment,
 (select count(*) from public.aos where region_id=r.id) aos,
 (select count(*) from public.sites where region_id=r.id) sites,
 (select count(*) from public.ao_recurring_schedules where region_id=r.id) schedules,
 (select count(*) from public.region_access where region_id=r.id) access_grants,
 (select count(*) from public.members where region_id=r.id) members,
 (select count(*) from public.sessions where region_id=r.id) sessions,
 (select count(*) from public.q_slots where region_id=r.id) q_slots
from public.regions r where r.id='8872e939-5691-450f-ba32-293a8b77d029';

select status, count(*) from public.members
where region_id='8872e939-5691-450f-ba32-293a8b77d029' group by status order by status;

select home_ao, count(*) fictional_members from public.members
where region_id='8872e939-5691-450f-ba32-293a8b77d029'
and real_name like 'SANDBOX FICTIONAL %' group by home_ao order by home_ao;

-- Expected empty.
select p.id profile_id, p.email, m.id member_id, m.pax_name
from public.profiles p join public.members m on m.id=p.member_id
where m.region_id='8872e939-5691-450f-ba32-293a8b77d029'
and m.real_name like 'SANDBOX FICTIONAL %';

-- Preserved identities should be inactive and hidden.
select m.id, m.pax_name, m.real_name, m.status, rp.status participant_status, rp.sources
from public.members m left join public.region_participants rp
on rp.region_id=m.region_id and rp.member_id=m.id
where m.region_id='8872e939-5691-450f-ba32-293a8b77d029'
and m.real_name like 'SANDBOX PRESERVED IDENTITY %' order by m.id;
