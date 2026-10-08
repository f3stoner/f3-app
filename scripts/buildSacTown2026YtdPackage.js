import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const INPUT = path.join(ROOT, "import/sactown/output/sactown_2026_ytd_dry_run_manifest_region_local_v2.json");
const LIVE = process.argv[2] || "/tmp/sactown_lifecycle_audit.json";
const OUT = path.join(ROOT, "import/sactown/package");
const REGION_ID = "45a32e90-3f95-5261-bb49-5719f6f77cca";
const ADMIN_ID = "a2072e94-56ee-447c-aeb3-e820e1fc4c4d";
const LEDGER = "sactown_2026_ytd_extension_ledger";

function assert(value, message) {
    if (!value) throw new Error(message);
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function uuidFromKey(key) {
    const bytes = crypto.createHash("sha1").update(key).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = bytes.toString("hex");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
}

function sqlJson(value) {
    return JSON.stringify(value).replaceAll("$sactown_payload$", "$sactown_payload_broken$");
}

const manifestText = await fs.readFile(INPUT, "utf8");
const manifest = JSON.parse(manifestText);
const live = JSON.parse(await fs.readFile(LIVE, "utf8"));
const manifestSha = sha256(manifestText);

assert(manifest.manifestVersion === 2, "Approved manifest version must be 2");
assert(manifest.target.region.id === REGION_ID, "Target region changed");
assert(manifest.counts.finalImportableSessions === 540, "Session count changed");
assert(manifest.counts.attendanceRelationships === 4436, "Attendance count changed");
assert(manifest.counts.qRelationships === 564, "Q count changed");
assert(manifest.counts.fngRecords === 134, "FNG count changed");
assert(manifest.counts.sacTownLocalIdentitiesToCreate === 188, "New identity count changed");
assert(manifest.counts.existingSacTownSeedIdentitiesReused === 64, "Reused identity count changed");
assert(manifest.counts.mergeCandidatePairs === 42, "Merge candidate count changed");
assert(manifest.counts.excludedSpecialEventSessions === 2, "Special-event exclusion changed");

const region = live.region;
assert(region.id === REGION_ID, "Live snapshot region changed");
assert(region.environment === "production", "SacTown must remain production");
assert(region.lifecycle_status === "onboarding", "SacTown must remain onboarding");
assert(region.include_in_reporting === false, "SacTown reporting must remain disabled");
assert(region.activated_at === null, "SacTown must remain unactivated");
assert(live.sessions.length === 40, "Expected exactly 40 protected sessions");
assert(live.members.length === 71, "Expected exactly 71 baseline members");

const identityByName = new Map(manifest.identityReview.map(identity => [identity.sourceIdentity, identity]));
assert(identityByName.size === 252, "Source identities are not unique");

const aoByName = new Map();
for (const ao of manifest.aoCoverage) {
    aoByName.set(ao.aoName, {
        name: ao.aoName,
        id: ao.existingAoId || ao.proposedAoId,
        siteId: ao.existingSiteId || ao.proposedSiteId,
        startTime: ao.startTime,
        durationMinutes: ao.durationMinutes,
        retired: ao.retired,
        firstDate: ao.firstDate,
        lastDate: ao.lastDate,
    });
}
assert(aoByName.size === 19, "AO mapping changed");

const members = manifest.identityReview.map(identity => ({
    sourceIdentity: identity.sourceIdentity,
    sourceIdentityKey: identity.sourceIdentityKey,
    normalizedLookupKey: identity.normalizedLookupKey,
    memberId: identity.memberId,
    sourceIdentityId: uuidFromKey(`sactown-2026-ytd:source-identity:${identity.sourceIdentityKey}`),
    resolutionId: uuidFromKey(`sactown-2026-ytd:identity-resolution:${identity.sourceIdentityKey}`),
    action: identity.status === "create_sactown_local" ? "create" : "reuse_seed",
    firstSeen: identity.firstSeen,
    lastSeen: identity.lastSeen,
    sourceRows: identity.sourceRows,
    sourceRosterRows: identity.sourceRosterRows,
    mergeEvidence: identity.externalCandidates || [],
}));

const sessions = manifest.sessions.map(session => {
    const ao = aoByName.get(session.aoName);
    assert(ao?.id && ao?.siteId, `Unresolved AO/site for ${session.sourceSessionKey}`);
    const attendeeIds = session.attendeeNames.map(name => identityByName.get(name)?.memberId);
    const qIds = session.qNames.map(name => identityByName.get(name)?.memberId);
    const fngs = session.fngNames.map(name => ({
        paxName: name,
        memberId: identityByName.get(name)?.memberId,
        realName: "",
        inviterIds: [],
        invitedById: null,
    }));
    assert(attendeeIds.every(Boolean), `Unresolved attendee in ${session.sourceSessionKey}`);
    assert(qIds.every(Boolean), `Unresolved Q in ${session.sourceSessionKey}`);
    assert(fngs.every(row => row.memberId), `Unresolved FNG in ${session.sourceSessionKey}`);
    assert(qIds.every(id => attendeeIds.includes(id)), `Q is not an attendee in ${session.sourceSessionKey}`);
    assert(fngs.every(row => attendeeIds.includes(row.memberId)), `FNG is not an attendee in ${session.sourceSessionKey}`);
    return {
        sessionId: session.id,
        stagedSessionId: session.stagedSessionId,
        sourceSessionKey: session.sourceSessionKey,
        date: session.date,
        aoName: session.aoName,
        aoId: ao.id,
        siteId: ao.siteId,
        startTime: session.startTime,
        attendeeIds,
        qIds,
        fngs,
        sourceRows: session.sourceRows,
        rawPostFlags: session.rawPostFlags,
        rawQSourceFlags: session.rawQSourceFlags,
    };
});

const createdMembers = members.filter(row => row.action === "create");
const reusedMembers = members.filter(row => row.action === "reuse_seed");
assert(createdMembers.length === 188 && reusedMembers.length === 64, "Identity action totals changed");
assert(sessions.reduce((n, row) => n + row.attendeeIds.length, 0) === 4436, "Resolved attendance total changed");
assert(sessions.reduce((n, row) => n + row.qIds.length, 0) === 564, "Resolved Q total changed");
assert(sessions.reduce((n, row) => n + row.fngs.length, 0) === 134, "Resolved FNG total changed");

const protectedSessions = live.sessions.map(row => canonical(row)).sort((a,b) => a.id.localeCompare(b.id));
const baseline = {
    region: canonical(region),
    counts: manifest.databaseCounts.before,
    protectedSessions,
    protectedSessionsSha256: sha256(JSON.stringify(protectedSessions)),
};

const rumble = aoByName.get("Rumble");
assert(rumble?.retired && rumble.id === "04740d41-2143-54b7-af02-1eff4c7a69d0", "Rumble contract changed");
const scheduleId = manifest.insertedIdLedger.plannedRows.ao_recurring_schedules[0];

const dataset = canonical({
    contract: {
        schemaVersion: "sactown-2026-ytd-region-local-v1",
        sourceManifestPath: "import/sactown/output/sactown_2026_ytd_dry_run_manifest_region_local_v2.json",
        sourceManifestSha256: manifestSha,
        regionId: REGION_ID,
        adminProfileId: ADMIN_ID,
        projectId: manifest.ids.importProjectId,
        batchId: manifest.ids.batchId,
        windowStart: "2026-01-01",
        windowEnd: "2026-08-30",
        expected: {
            sourceIdentities: 252, createdMembers: 188, reusedMembers: 64,
            sessions: 540, attendance: 4436, qRelationships: 564, fngs: 134,
            mergeCandidates: 42, excludedSpecialEvents: 2,
        },
    },
    baseline,
    members,
    sessions,
    rumble: {
        id: rumble.id,
        scheduleId,
        siteId: rumble.siteId,
        name: "Rumble",
        slug: "rumble",
        startTime: rumble.startTime,
        durationMinutes: rumble.durationMinutes,
        weekday: 6,
        effectiveStartDate: rumble.firstDate,
        effectiveEndDate: rumble.lastDate,
    },
    excludedSpecialEvents: manifest.excludedSpecialEvents,
    mergeCandidates: manifest.mergeCandidates.map(row => ({
        ...row,
        mergeCandidateId: uuidFromKey(`sactown-2026-ytd:merge:${row.sactownSourceIdentity}:${row.externalMemberId}`),
    })),
});
const datasetJson = JSON.stringify(dataset);
const datasetSha = sha256(datasetJson);

const applySql = `-- GENERATED FILE. Build with: node scripts/buildSacTown2026YtdPackage.js /tmp/sactown_lifecycle_audit.json
-- Dataset SHA-256: ${datasetSha}
\\set ON_ERROR_STOP on
begin;
set local lock_timeout = '30s';
set local statement_timeout = '30min';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sactown-2026-ytd-region-local-v1', 0));
lock table public.regions, public.members, public.sessions, public.aos, public.sites,
  public.ao_recurring_schedules, public.region_participants, public.member_stats,
  public.region_import_projects, public.region_import_batches in share row exclusive mode;

create table if not exists public.${LEDGER} (
  ledger_id uuid primary key,
  project_id uuid not null,
  batch_id uuid not null,
  target_table text not null,
  target_id uuid,
  source_key text not null,
  operation text not null check (operation in ('inserted','snapshot_before','information')),
  dependency_rank integer not null,
  row_snapshot jsonb,
  row_hash text,
  state text not null default 'applied' check (state in ('applied','rolled_back')),
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique(project_id, target_table, source_key, operation)
);

create temp table st_payload(document jsonb not null) on commit drop;
insert into st_payload values ($sactown_payload$${datasetJson}$sactown_payload$::jsonb);

do $preflight$
declare p jsonb := (select document from st_payload); c jsonb := p->'contract';
begin
  if c->>'schemaVersion'<>'sactown-2026-ytd-region-local-v1' or c->>'sourceManifestSha256'<>'${manifestSha}' then raise exception 'Source manifest/package contract mismatch'; end if;
  if c->>'regionId'<>'${REGION_ID}' or c->>'projectId'<>'${manifest.ids.importProjectId}' or c->>'batchId'<>'${manifest.ids.batchId}' or c->>'windowStart'<>'2026-01-01' or c->>'windowEnd'<>'2026-08-30' then raise exception 'Target IDs or historical window changed'; end if;
  if jsonb_array_length(p->'members')<>252 or (select count(*) from jsonb_array_elements(p->'members') m where m->>'action'='reuse_seed')<>64 or (select count(*) from jsonb_array_elements(p->'members') m where m->>'action'='create')<>188 then raise exception 'Approved region-local identity partition changed'; end if;
  if (select count(distinct m->>'memberId') from jsonb_array_elements(p->'members') m)<>252 or (select count(distinct m->>'sourceIdentityKey') from jsonb_array_elements(p->'members') m)<>252 or (select count(distinct m->>'sourceIdentityId') from jsonb_array_elements(p->'members') m)<>252 or (select count(distinct m->>'resolutionId') from jsonb_array_elements(p->'members') m)<>252 then raise exception 'Deterministic identity IDs or source keys are not unique'; end if;
  if jsonb_array_length(p->'sessions')<>540 or (select count(distinct e->>'sessionId') from jsonb_array_elements(p->'sessions') e)<>540 or (select count(distinct concat_ws('|',e->>'date',e->>'aoId',e->>'startTime')) from jsonb_array_elements(p->'sessions') e)<>540 then raise exception 'Deterministic session IDs or business keys changed'; end if;
  if (select coalesce(sum(jsonb_array_length(e->'attendeeIds')),0) from jsonb_array_elements(p->'sessions') e)<>4436 or (select coalesce(sum(jsonb_array_length(e->'qIds')),0) from jsonb_array_elements(p->'sessions') e)<>564 or (select coalesce(sum(jsonb_array_length(e->'fngs')),0) from jsonb_array_elements(p->'sessions') e)<>134 then raise exception 'Embedded relationship totals changed'; end if;
  if exists(select 1 from jsonb_array_elements(p->'sessions') e where e->>'date'<'2026-01-01' or e->>'date'>'2026-08-30') then raise exception 'Embedded session falls outside the approved window'; end if;
  if not exists(select 1 from public.profiles where id='${ADMIN_ID}'::uuid and role='superadmin') then raise exception 'Approved superadmin profile missing'; end if;
  if not exists(select 1 from public.regions where id='${REGION_ID}'::uuid and name='F3 SacTown Demo' and slug='sactown-demo' and environment='production' and lifecycle_status='onboarding' and include_in_reporting=false and activated_at is null and timezone='America/Los_Angeles') then raise exception 'SacTown lifecycle/environment contract mismatch'; end if;
  if (select count(*) from public.members where region_id='${REGION_ID}')<>71 or (select count(*) from public.sessions where region_id='${REGION_ID}')<>40 or (select count(*) from public.aos where region_id='${REGION_ID}')<>18 or (select count(*) from public.sites where region_id='${REGION_ID}')<>12 or (select count(*) from public.ao_recurring_schedules where region_id='${REGION_ID}')<>18 then raise exception 'SacTown baseline record counts changed'; end if;
  if (select coalesce(sum(jsonb_array_length(coalesce(attendee_ids,'[]'::jsonb))),0) from public.sessions where region_id='${REGION_ID}')<>286 or (select coalesce(sum(cardinality(coalesce(q_ids,'{}'::uuid[]))),0) from public.sessions where region_id='${REGION_ID}')<>40 or (select coalesce(sum(jsonb_array_length(coalesce(fngs,'[]'::jsonb))),0) from public.sessions where region_id='${REGION_ID}')<>7 then raise exception 'SacTown baseline relationship counts changed'; end if;
  if exists(select 1 from jsonb_array_elements(p#>'{baseline,protectedSessions}') e left join public.sessions s on s.id=(e->>'id')::uuid where s.id is null or to_jsonb(s) is distinct from e) or (select count(*) from jsonb_array_elements(p#>'{baseline,protectedSessions}'))<>40 then raise exception 'A protected SacTown session changed or is missing'; end if;
  if exists(select 1 from jsonb_array_elements(p->'members') m left join public.members x on x.id=(m->>'memberId')::uuid where m->>'action'='reuse_seed' and (x.id is null or x.region_id<>'${REGION_ID}'::uuid or x.pax_name is distinct from m->>'sourceIdentity' or x.status<>'active')) then raise exception 'A reused SacTown seed identity is unresolved or changed'; end if;
  if exists(select 1 from jsonb_array_elements(p->'members') m join public.members x on x.id=(m->>'memberId')::uuid where m->>'action'='create') then raise exception 'A planned new member ID already exists'; end if;
  if exists(select 1 from jsonb_array_elements(p->'members') m join public.members x on x.region_id='${REGION_ID}'::uuid and lower(btrim(x.pax_name))=lower(btrim(m->>'sourceIdentity')) where m->>'action'='create') then raise exception 'A planned new source identity now collides with an existing SacTown name'; end if;
  if exists(
    select 1
    from jsonb_array_elements(p->'sessions') e
    cross join lateral (
      select value member_id from jsonb_array_elements_text(e->'attendeeIds')
      union all select value from jsonb_array_elements_text(e->'qIds')
      union all select f->>'memberId' from jsonb_array_elements(e->'fngs') f
      union all select f->>'invitedById' from jsonb_array_elements(e->'fngs') f where nullif(f->>'invitedById','') is not null
      union all select value from jsonb_array_elements(e->'fngs') f cross join lateral jsonb_array_elements_text(coalesce(f->'inviterIds','[]'::jsonb))
    ) referenced
    where not exists(select 1 from jsonb_array_elements(p->'members') m where m->>'memberId'=referenced.member_id)
  ) then raise exception 'An imported session references a member outside the approved 252 SacTown-local identities'; end if;
  if exists(select 1 from jsonb_array_elements(p->'members') m join public.members x on x.id=(m->>'memberId')::uuid where x.region_id<>'${REGION_ID}'::uuid) then raise exception 'An imported identity resolves to an external-region canonical member'; end if;
  if exists(select 1 from jsonb_array_elements(p->'members') m join public.region_participants rp on rp.member_id=(m->>'memberId')::uuid where m->>'action'='reuse_seed' and rp.region_id<>'${REGION_ID}'::uuid)
     or exists(select 1 from jsonb_array_elements(p->'members') m join public.member_stats ms on ms.member_id=(m->>'memberId')::uuid where m->>'action'='reuse_seed' and ms.region_id<>'${REGION_ID}'::uuid)
     or exists(select 1 from jsonb_array_elements(p->'members') m join public.sessions s on s.region_id<>'${REGION_ID}'::uuid and (coalesce(s.attendee_ids,'[]'::jsonb) ? (m->>'memberId') or (m->>'memberId')::uuid=any(coalesce(s.q_ids,'{}'::uuid[])) or s.q_id=(m->>'memberId')::uuid or exists(select 1 from jsonb_array_elements(coalesce(s.fngs,'[]'::jsonb)) f where f->>'memberId'=m->>'memberId')) where m->>'action'='reuse_seed'
  then raise exception 'An approved reused SacTown seed identity already has cross-region activity'; end if;
  if exists(select 1 from jsonb_array_elements(p->'sessions') e join public.sessions s on s.id=(e->>'sessionId')::uuid) then raise exception 'A planned session ID already exists'; end if;
  if exists(select 1 from jsonb_array_elements(p->'sessions') e join public.sessions s on s.region_id='${REGION_ID}'::uuid and s.date=e->>'date' and s.ao_id=(e->>'aoId')::uuid and nullif(s.start_time,'') is not distinct from nullif(e->>'startTime','')) then raise exception 'A SacTown AO/date/time session collision exists'; end if;
  if exists(select 1 from public.region_import_projects where id='${manifest.ids.importProjectId}'::uuid) or exists(select 1 from public.region_import_batches where id='${manifest.ids.batchId}'::uuid) or exists(select 1 from public.${LEDGER} where project_id='${manifest.ids.importProjectId}'::uuid) then raise exception 'Extension project, batch, or ledger already exists'; end if;
  if exists(select 1 from jsonb_array_elements(p->'sessions') e left join public.aos a on a.id=(e->>'aoId')::uuid left join public.sites s on s.id=(e->>'siteId')::uuid where (e->>'aoName')<>'Rumble' and (a.id is null or a.region_id<>'${REGION_ID}'::uuid or a.name is distinct from e->>'aoName' or s.id is null or s.region_id<>'${REGION_ID}'::uuid)) then raise exception 'An AO/site reference is unresolved'; end if;
  if not exists(select 1 from public.sites where id=(p#>>'{rumble,siteId}')::uuid and region_id='${REGION_ID}'::uuid) or exists(select 1 from public.aos where id=(p#>>'{rumble,id}')::uuid or (region_id='${REGION_ID}'::uuid and (name=p#>>'{rumble,name}' or slug=p#>>'{rumble,slug}'))) or exists(select 1 from public.ao_recurring_schedules where id=(p#>>'{rumble,scheduleId}')::uuid) then raise exception 'Rumble site, name, slug, or deterministic IDs conflict'; end if;
end $preflight$;

insert into public.${LEDGER}(ledger_id,project_id,batch_id,target_table,target_id,source_key,operation,dependency_rank,row_snapshot,row_hash)
select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','sessions',s.id,'baseline:'||s.id,'snapshot_before',100,to_jsonb(s),md5(to_jsonb(s)::text) from public.sessions s where s.region_id='${REGION_ID}';
insert into public.region_import_projects(id,region_id,name,source_system,status,parser_version,matching_version,expected_member_count,expected_session_count,created_by_user_id,completed_at,activated_at,updated_at)
values('${manifest.ids.importProjectId}','${REGION_ID}','F3 SacTown 2026 YTD historical extension','260917_F3 SacTown Data.xlsx','completed','sactown-2026-ytd-v2','region-local-no-global-merge-v1',252,540,'${ADMIN_ID}',now(),now(),now());
insert into public.region_import_batches(id,project_id,batch_type,filename,file_hash,source_format,status,parser_version,uploaded_by_user_id,row_count)
values('${manifest.ids.batchId}','${manifest.ids.importProjectId}','historical_attendance','260917_F3 SacTown Data.xlsx',(select document#>>'{contract,sourceManifestSha256}' from st_payload),'json','normalized','sactown-2026-ytd-v2','${ADMIN_ID}',4705);

insert into public.${LEDGER}(ledger_id,project_id,batch_id,target_table,target_id,source_key,operation,dependency_rank)
values(gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','region_import_projects','${manifest.ids.importProjectId}','project','inserted',10),
      (gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','region_import_batches','${manifest.ids.batchId}','batch','inserted',20);

insert into public.members(id,region_id,pax_name,real_name,home_ao,first_post_date,status)
select (m->>'memberId')::uuid,'${REGION_ID}'::uuid,m->>'sourceIdentity',null,null,m->>'firstSeen','active' from st_payload p cross join lateral jsonb_array_elements(p.document->'members') m where m->>'action'='create';
insert into public.${LEDGER}(ledger_id,project_id,batch_id,target_table,target_id,source_key,operation,dependency_rank,row_snapshot,row_hash)
select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','members',x.id,m->>'sourceIdentityKey','inserted',40,to_jsonb(x),md5(to_jsonb(x)::text) from st_payload p cross join lateral jsonb_array_elements(p.document->'members') m join public.members x on x.id=(m->>'memberId')::uuid where m->>'action'='create';

insert into public.region_import_source_identities(id,project_id,source_identity_key,display_name,source_f3_name,source_home_region,normalized_f3_name,first_seen_date,last_seen_date,source_identity_status,source_summary)
select (m->>'sourceIdentityId')::uuid,'${manifest.ids.importProjectId}',m->>'sourceIdentityKey',m->>'sourceIdentity',m->>'sourceIdentity','SacTown',m->>'normalizedLookupKey',(m->>'firstSeen')::date,(m->>'lastSeen')::date,'resolved',jsonb_build_object('identityPolicy','region_local_by_default','action',m->>'action','sourceRows',m->'sourceRows','sourceRosterRows',m->'sourceRosterRows','futureMergeEvidence',m->'mergeEvidence') from st_payload p cross join lateral jsonb_array_elements(p.document->'members') m;
insert into public.region_import_identity_resolutions(id,source_identity_id,resolution_type,canonical_member_id,created_member_id,resolved_by_user_id,notes)
select (m->>'resolutionId')::uuid,(m->>'sourceIdentityId')::uuid,case when m->>'action'='create' then 'create_new' else 'match_existing' end,case when m->>'action'='reuse_seed' then (m->>'memberId')::uuid end,case when m->>'action'='create' then (m->>'memberId')::uuid end,'${ADMIN_ID}','Approved region-local identity policy; no cross-region canonical merge.' from st_payload p cross join lateral jsonb_array_elements(p.document->'members') m;
insert into public.${LEDGER}(ledger_id,project_id,batch_id,target_table,target_id,source_key,operation,dependency_rank,row_snapshot,row_hash)
select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','region_import_source_identities',x.id,m->>'sourceIdentityKey','inserted',25,to_jsonb(x),md5(to_jsonb(x)::text) from st_payload p cross join lateral jsonb_array_elements(p.document->'members') m join public.region_import_source_identities x on x.id=(m->>'sourceIdentityId')::uuid
union all select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','region_import_identity_resolutions',x.id,m->>'sourceIdentityKey','inserted',45,to_jsonb(x),md5(to_jsonb(x)::text) from st_payload p cross join lateral jsonb_array_elements(p.document->'members') m join public.region_import_identity_resolutions x on x.id=(m->>'resolutionId')::uuid;

insert into public.aos(id,region_id,name,slug,time,days_of_week,time_schedule,default_site_id,location_name,weather_enabled,is_active,is_public)
select (r->>'id')::uuid,'${REGION_ID}',r->>'name',r->>'slug',r->>'startTime',array[(r->>'weekday')::integer],jsonb_build_object(r->>'weekday',r->>'startTime'),(r->>'siteId')::uuid,(select name from public.sites where id=(r->>'siteId')::uuid),false,false,false from st_payload p cross join lateral jsonb_array_elements(jsonb_build_array(p.document->'rumble')) r;
insert into public.ao_recurring_schedules(id,region_id,ao_id,site_id,weekday,start_time,duration_minutes,effective_start_date,effective_end_date,is_active)
select (r->>'scheduleId')::uuid,'${REGION_ID}',(r->>'id')::uuid,(r->>'siteId')::uuid,(r->>'weekday')::integer,(r->>'startTime')::time,(r->>'durationMinutes')::integer,(r->>'effectiveStartDate')::date,(r->>'effectiveEndDate')::date,false from st_payload p cross join lateral jsonb_array_elements(jsonb_build_array(p.document->'rumble')) r;
insert into public.${LEDGER}(ledger_id,project_id,batch_id,target_table,target_id,source_key,operation,dependency_rank,row_snapshot,row_hash)
select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','aos',a.id,'ao:rumble','inserted',30,to_jsonb(a),md5(to_jsonb(a)::text) from public.aos a where a.id='${rumble.id}'
union all select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','ao_recurring_schedules',s.id,'schedule:rumble:6:05:30','inserted',35,to_jsonb(s),md5(to_jsonb(s)::text) from public.ao_recurring_schedules s where s.id='${scheduleId}';

insert into public.sessions(id,region_id,date,ao_name,ao_id,site_id,start_time,q_id,q_ids,attendee_ids,fngs,notes,workout,created_at,created_by_user_id,backblast_text,backblast_status,attendance_review_status)
select (e->>'sessionId')::uuid,'${REGION_ID}',e->>'date',e->>'aoName',(e->>'aoId')::uuid,(e->>'siteId')::uuid,e->>'startTime',nullif(e#>>'{qIds,0}','')::uuid,array(select jsonb_array_elements_text(e->'qIds')::uuid),e->'attendeeIds',e->'fngs',null,null,(extract(epoch from (e->>'date')::date::timestamptz)*1000)::bigint,'${ADMIN_ID}','',null,'not_required' from st_payload p cross join lateral jsonb_array_elements(p.document->'sessions') e;
insert into public.${LEDGER}(ledger_id,project_id,batch_id,target_table,target_id,source_key,operation,dependency_rank,row_snapshot,row_hash)
select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','sessions',s.id,e->>'sourceSessionKey','inserted',50,to_jsonb(s),md5(to_jsonb(s)::text) from st_payload p cross join lateral jsonb_array_elements(p.document->'sessions') e join public.sessions s on s.id=(e->>'sessionId')::uuid;

insert into public.${LEDGER}(ledger_id,project_id,batch_id,target_table,target_id,source_key,operation,dependency_rank,row_snapshot)
select gen_random_uuid(),'${manifest.ids.importProjectId}','${manifest.ids.batchId}','merge_candidate',(m->>'mergeCandidateId')::uuid,concat('merge:',m->>'sactownSourceIdentity',':',m->>'externalMemberId'),'information',5,m from st_payload p cross join lateral jsonb_array_elements(p.document->'mergeCandidates') m;

do $derived$ declare x record; begin
  for x in select (e->>'sessionId')::uuid id from st_payload p cross join lateral jsonb_array_elements(p.document->'sessions') e loop perform public.sync_region_participants_for_session(x.id); end loop;
  perform public.rebuild_member_stats_for_region('${REGION_ID}'::uuid);
end $derived$;

do $postflight$
declare p jsonb := (select document from st_payload); begin
  if (select count(*) from public.members where region_id='${REGION_ID}')<>259 or (select count(*) from public.sessions where region_id='${REGION_ID}')<>580 or (select count(*) from public.aos where region_id='${REGION_ID}')<>19 or (select count(*) from public.sites where region_id='${REGION_ID}')<>12 or (select count(*) from public.ao_recurring_schedules where region_id='${REGION_ID}')<>19 then raise exception 'Final SacTown record counts mismatch'; end if;
  if (select coalesce(sum(jsonb_array_length(coalesce(attendee_ids,'[]'::jsonb))),0) from public.sessions where region_id='${REGION_ID}')<>4722 or (select coalesce(sum(cardinality(coalesce(q_ids,'{}'::uuid[]))),0) from public.sessions where region_id='${REGION_ID}')<>604 or (select coalesce(sum(jsonb_array_length(coalesce(fngs,'[]'::jsonb))),0) from public.sessions where region_id='${REGION_ID}')<>141 then raise exception 'Final SacTown relationship totals mismatch'; end if;
  if exists(select 1 from public.${LEDGER} l left join public.sessions s on s.id=l.target_id where l.project_id='${manifest.ids.importProjectId}' and l.target_table='sessions' and l.operation='snapshot_before' and (s.id is null or to_jsonb(s) is distinct from l.row_snapshot)) or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='sessions' and operation='snapshot_before')<>40 then raise exception 'A protected baseline session changed or is missing'; end if;
  if (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='region_import_projects' and operation='inserted')<>1 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='region_import_batches' and operation='inserted')<>1 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='members' and operation='inserted')<>188 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='region_import_source_identities' and operation='inserted')<>252 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='region_import_identity_resolutions' and operation='inserted')<>252 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='aos' and operation='inserted')<>1 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='ao_recurring_schedules' and operation='inserted')<>1 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='sessions' and operation='inserted')<>540 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}' and target_table='merge_candidate' and operation='information')<>42 or (select count(*) from public.${LEDGER} where project_id='${manifest.ids.importProjectId}')<>1318 then raise exception 'Inserted-ID ledger reconciliation failed'; end if;
  if exists(select 1 from jsonb_array_elements(p->'members') m join public.members x on x.id=(m->>'memberId')::uuid where x.region_id<>'${REGION_ID}'::uuid) then raise exception 'Post-import identity isolation failed'; end if;
  if not exists(select 1 from public.regions where id='${REGION_ID}' and environment='production' and lifecycle_status='onboarding' and include_in_reporting=false and activated_at is null) then raise exception 'SacTown lifecycle changed'; end if;
end $postflight$;
commit;
`;

const recovery = `# SacTown 2026 YTD post-commit recovery

There is deliberately no generic automated rollback script for this one-time import.

## Before execution

1. Take a database backup or record a point-in-time recovery marker immediately before running \`apply.sql\`.
2. Save the exact package files and successful psql output.
3. Do not allow SacTown application activity during execution and validation.

## Failure before commit

\`apply.sql\` is one PostgreSQL transaction with \`ON_ERROR_STOP\`. Any assertion, constraint, trigger, foreign-key, or SQL error before \`commit\` aborts the transaction. PostgreSQL rollback is the recovery mechanism; no cleanup script is needed.

## A bad import discovered after commit

Preferred recovery is database PITR/backup restore when operationally acceptable. Otherwise prepare and separately review a cleanup transaction from the inserted-ID ledger for project \`${manifest.ids.importProjectId}\`. That review must first check for profile claims, later sessions, cross-region participation, member merges, inviter relationships, or any other post-import dependency. Never delete extension-created members mechanically after SacTown begins application activity.
`;

const readme = `# SacTown 2026 YTD historical import package

Generated from the approved region-local v2 manifest. This directory is not a Supabase migration; nothing runs automatically.

## Contract

- Dataset SHA-256: \`${datasetSha}\`
- Source manifest SHA-256: \`${manifestSha}\`
- Window: 2026-01-01 through 2026-08-30
- Creates 188 members, 540 sessions, retired Rumble AO, and one inactive historical schedule.
- Reuses 64 exact SacTown seed members.
- Preserves 42 cross-region pairs as informational ledger rows only.
- Protects all 40 existing sessions byte-for-byte using JSONB snapshots.
- Keeps SacTown production/onboarding/reporting-disabled/unactivated.

## Execution sequence

1. Re-run the live read-only validator: \`node scripts/validateSacTown2026YtdPackage.js --live\`.
2. Review \`final_dataset.json\`, \`apply.sql\`, and the validator report.
3. Take a database backup or point-in-time recovery marker.
4. Run in a direct PostgreSQL session with \`ON_ERROR_STOP\`: \`psql "$DATABASE_URL" -f import/sactown/package/apply.sql\`.
5. Save the complete psql output and run the read-only validator again in applied mode.
6. Follow \`RECOVERY.md\` if the committed import is later judged incorrect. There is intentionally no generic automated rollback.

The apply file is one transaction. Any failed assertion or SQL statement before commit rolls the entire transaction back.
`;

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, "final_dataset.json"), JSON.stringify(dataset, null, 2) + "\n");
await fs.writeFile(path.join(OUT, "apply.sql"), applySql);
await fs.writeFile(path.join(OUT, "RECOVERY.md"), recovery);
await fs.writeFile(path.join(OUT, "README.md"), readme);
console.log(JSON.stringify({datasetSha, manifestSha, output: OUT, members: members.length, sessions: sessions.length}, null, 2));
