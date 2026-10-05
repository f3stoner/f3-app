import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { deterministicUuid } from "./importWestHoustonHistorical.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

export const V1_CANONICAL_PATH = path.join(ROOT, "import/west-houston/output/west_houston_post_human_canonical_dry_run.json");
export const V2_CANONICAL_PATH = path.join(ROOT, "import/west-houston/output/west_houston_identity_split_canonical_dry_run.json");
export const HUMAN_MANIFEST_PATH = path.join(ROOT, "import/west-houston/west_houston_human_resolution_manifest.json");
export const DEMO_MANIFEST_PATH = path.join(ROOT, "import/west-houston/output/west_houston_demo_manifest.json");
export const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20261006000000_append_west_houston_delta.sql");

export const REGION_ID = "7298b632-4d9a-542f-b65d-d416e5c1e631";
export const DOGE_MEMBER_ID = "0ec36c8a-3354-5b95-9b94-27013a04c3e6";
export const HISTORICAL_ZILLOW_ID = "70fa4a9a-b521-57d0-8fe5-07951f566a6f";
export const NEW_ZILLOW_ID = "e93a4b68-1bc4-5728-89a5-73628205286a";
export const FORBIDDEN_AGGIELAND_JUICE_ID = "69850a2d-f75e-4017-8fda-219694922b2d";
export const RETAINED_IRON_GATE_IDS = Object.freeze([
    "3847bd2c-3bb7-54f4-adfb-a7069cd51f00",
    "df0fc2bc-8ba8-57f8-8d29-9900939d2889",
]);

export const EXPECTED_HASHES = Object.freeze({
    v1Canonical: "f1c677cf99e8aa9e15595d4ed3fb796f2d624d741868395786b097108114c16a",
    v2Canonical: "38f66ec805d54576c7c017c9bf9e16b45016cef4351842753bab712105cee2fd",
    humanManifest: "8e1c752188b95ed3e04100e481a75bcac5a2294a11693604391e956ee6705c75",
    demoManifest: "ee1e1523b74e8336076d7c1f07d2cd407c8ed6d73e2065282fbef0f5807a5d36",
});

export const EXPECTED = Object.freeze({
    members: 4,
    sessions: 36,
    attendance: 393,
    qAssignments: 35,
    fngs: 3,
    baselineSessions: 3742,
    baselineAttendance: 43132,
    baselineQAssignments: 3636,
    baselineFngs: 494,
    finalSessions: 3778,
    finalAttendance: 43525,
    finalQAssignments: 3671,
    finalFngs: 497,
});

const HISTORICAL_ZILLOW_KEY = "wh-canonical-member-d6251f778bbb45c73759";
const NEW_ZILLOW_KEY = "wh-canonical-member-9e92bd757a8eb4594bc1";
const NEW_ZILLOW_SOURCE_KEY = "wh-member-ef12a3c2b13b3832c61d";
const RETAINED_IRON_GATE_CANONICAL_KEY = "wh-canonical-session-63271338ec5e2bc95b12";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function sha256File(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function stableSort(values, key) {
    return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function unique(values, label) {
    assert(values.length === new Set(values).size, `Duplicate ${label}`);
}

function pairKey(value) {
    return `${value.canonicalSessionKey}|${value.canonicalMemberKey}`;
}

function semanticSession(value) {
    return JSON.stringify({
        date: value.date,
        canonicalAo: value.canonicalAo,
        eventName: value.eventName,
        workoutType: value.workoutType,
    });
}

export function loadApprovedInputs() {
    return {
        v1: readJson(V1_CANONICAL_PATH),
        v2: readJson(V2_CANONICAL_PATH),
        manifest: readJson(HUMAN_MANIFEST_PATH),
        demo: readJson(DEMO_MANIFEST_PATH),
        hashes: {
            v1Canonical: sha256File(V1_CANONICAL_PATH),
            v2Canonical: sha256File(V2_CANONICAL_PATH),
            humanManifest: sha256File(HUMAN_MANIFEST_PATH),
            demoManifest: sha256File(DEMO_MANIFEST_PATH),
        },
    };
}

export function buildDeltaPayload(v1, v2, manifest, demo, hashes) {
    for (const [name, expected] of Object.entries(EXPECTED_HASHES)) {
        assert(hashes[name] === expected, `${name} differs from its approved hash`);
    }
    assert(v1.metadata.schemaVersion === "west-houston-post-human-canonical-v1", "Unexpected v1 schema");
    assert(v2.metadata.schemaVersion === "west-houston-post-human-canonical-v1", "Unexpected v2 schema");
    assert(v1.metadata.parserVersion === "west-houston-workbook-v1" && v2.metadata.parserVersion === "west-houston-workbook-v1",
        "The global parser version changed");
    assert(v2.metadata.humanResolutionManifestSchemaVersion === "west-houston-human-resolution-v2", "Unexpected v2 manifest schema");
    assert(manifest.schemaVersion === "west-houston-human-resolution-v2", "Unexpected human manifest schema");
    assert(v2.metadata.attendanceWorkbookSha256 === manifest.source.attendanceWorkbookSha256,
        "Workbook hashes do not agree");
    assert(demo.region.id === REGION_ID && demo.region.name === "F3 West Houston", "Unexpected demo region");

    const v1Members = new Map(v1.canonicalMembers.map(value => [value.canonicalMemberKey, value]));
    const v2Members = new Map(v2.canonicalMembers.map(value => [value.canonicalMemberKey, value]));
    unique([...v1Members.keys()], "v1 canonical member key");
    unique([...v2Members.keys()], "v2 canonical member key");
    assert([...v1Members.keys()].every(key => v2Members.has(key)), "A historical canonical member disappeared");
    for (const [key, before] of v1Members) {
        const after = v2Members.get(key);
        assert(before.canonicalF3Name === after.canonicalF3Name &&
            before.canonicalFirstPostDate === after.canonicalFirstPostDate &&
            JSON.stringify(before.sourceMemberKeys) === JSON.stringify(after.sourceMemberKeys),
        `Historical canonical identity changed: ${key}`);
    }

    const allMemberIds = new Map([...v2Members].map(([key]) => [key,
        key === "wh-canonical-member-22c3b26a90430b0dca97"
            ? DOGE_MEMBER_ID
            : deterministicUuid(`west-houston-one-time:member:${key}`),
    ]));
    const members = stableSort([...v2Members.values()].filter(value => !v1Members.has(value.canonicalMemberKey)),
        value => value.canonicalMemberKey).map(value => ({
        canonicalKey: value.canonicalMemberKey,
        sourceMemberKeys: stableSort(value.sourceMemberKeys, item => item),
        memberId: allMemberIds.get(value.canonicalMemberKey),
        paxName: value.canonicalF3Name,
        homeAo: value.canonicalHomeAo ?? null,
        firstPostDate: value.canonicalFirstPostDate,
    }));
    assert(members.length === EXPECTED.members, "New canonical member count mismatch");
    unique(members.map(value => value.memberId), "delta member UUID");

    const historicalZillow = v2Members.get(HISTORICAL_ZILLOW_KEY);
    assert(historicalZillow?.canonicalF3Name === "Zillow" &&
        historicalZillow.canonicalHomeAo === "The Branch" &&
        allMemberIds.get(HISTORICAL_ZILLOW_KEY) === HISTORICAL_ZILLOW_ID,
    "Historical Zillow identity changed");
    const newZillow = members.find(value => value.canonicalKey === NEW_ZILLOW_KEY);
    assert(newZillow?.memberId === NEW_ZILLOW_ID && newZillow.paxName === "Zillow" &&
        newZillow.homeAo === "The HOP" && newZillow.firstPostDate === "2026-10-02" &&
        JSON.stringify(newZillow.sourceMemberKeys) === JSON.stringify([NEW_ZILLOW_SOURCE_KEY]),
    "New Zillow identity differs from approval");

    const v1Sessions = new Map(v1.canonicalSessions.map(value => [value.canonicalSessionKey, value]));
    const v2Sessions = new Map(v2.canonicalSessions.map(value => [value.canonicalSessionKey, value]));
    unique([...v1Sessions.keys()], "v1 canonical session key");
    unique([...v2Sessions.keys()], "v2 canonical session key");
    const removedSessions = [...v1Sessions.keys()].filter(key => !v2Sessions.has(key));
    assert(JSON.stringify(removedSessions) === JSON.stringify([RETAINED_IRON_GATE_CANONICAL_KEY]),
        "The v2 artifact differs from v1 by an unexpected historical session");
    for (const [key, before] of v1Sessions) {
        if (v2Sessions.has(key)) assert(semanticSession(before) === semanticSession(v2Sessions.get(key)),
            `Historical session semantics changed: ${key}`);
    }
    const deltaSessionKeys = new Set([...v2Sessions.keys()].filter(key => !v1Sessions.has(key)));
    assert(deltaSessionKeys.size === EXPECTED.sessions, "Delta session count mismatch");

    const collectRelations = (document, property) => new Map(document[property].map(value => [pairKey(value), value]));
    const oldAttendance = collectRelations(v1, "canonicalAttendance");
    const oldQ = collectRelations(v1, "canonicalQAssignments");
    const oldFng = collectRelations(v1, "canonicalFngEvidence");
    const newAttendance = collectRelations(v2, "canonicalAttendance");
    const newQ = collectRelations(v2, "canonicalQAssignments");
    const newFng = collectRelations(v2, "canonicalFngEvidence");
    for (const [name, before, after] of [
        ["attendance", oldAttendance, newAttendance], ["Q/VQ", oldQ, newQ], ["FNG", oldFng, newFng],
    ]) {
        const removed = [...before.keys()].filter(key => !after.has(key));
        if (name === "attendance") {
            assert(removed.length === 9 && removed.every(key => key.startsWith(`${RETAINED_IRON_GATE_CANONICAL_KEY}|`)),
                "Unexpected historical attendance difference");
        } else assert(removed.length === 0, `Unexpected historical ${name} difference`);
        assert([...after.values()].filter(value => !before.has(pairKey(value))).every(value => deltaSessionKeys.has(value.canonicalSessionKey)),
            `A new ${name} relationship targets a historical session`);
    }

    const aoByName = new Map(demo.aos.map(value => [value.name, value]));
    const siteByName = new Map(demo.sites.map(value => [value.name, value]));
    const attendanceBySession = new Map();
    const qBySession = new Map();
    const fngBySession = new Map();
    for (const relation of v2.canonicalAttendance.filter(value => deltaSessionKeys.has(value.canonicalSessionKey))) {
        if (!attendanceBySession.has(relation.canonicalSessionKey)) attendanceBySession.set(relation.canonicalSessionKey, []);
        attendanceBySession.get(relation.canonicalSessionKey).push(allMemberIds.get(relation.canonicalMemberKey));
    }
    for (const relation of v2.canonicalQAssignments.filter(value => deltaSessionKeys.has(value.canonicalSessionKey))) {
        if (!qBySession.has(relation.canonicalSessionKey)) qBySession.set(relation.canonicalSessionKey, []);
        qBySession.get(relation.canonicalSessionKey).push({
            memberId: allMemberIds.get(relation.canonicalMemberKey),
            role: relation.evidence.map(item => item.toUpperCase()).includes("Q") ? "q" : "coq",
        });
    }
    for (const relation of v2.canonicalFngEvidence.filter(value => deltaSessionKeys.has(value.canonicalSessionKey))) {
        if (!fngBySession.has(relation.canonicalSessionKey)) fngBySession.set(relation.canonicalSessionKey, []);
        fngBySession.get(relation.canonicalSessionKey).push({
            memberId: allMemberIds.get(relation.canonicalMemberKey),
            paxName: v2Members.get(relation.canonicalMemberKey).canonicalF3Name,
        });
    }

    const sessions = stableSort([...deltaSessionKeys].map(key => v2Sessions.get(key)),
        value => `${value.date}|${value.canonicalSessionKey}`).map(value => {
        const aoName = value.canonicalAo === "Iron Gate" ? "The Iron Gate" : value.canonicalAo;
        const ao = aoByName.get(aoName);
        const site = siteByName.get(aoName);
        assert(ao && site, `Missing AO/site configuration for ${aoName}`);
        return {
            sessionKey: value.canonicalSessionKey,
            sessionId: deterministicUuid(`west-houston-one-time:session:${value.canonicalSessionKey}`),
            date: value.date,
            aoName,
            aoId: ao.id,
            siteId: site.id,
            eventName: value.eventName,
            workoutType: value.workoutType,
            attendeeIds: stableSort(attendanceBySession.get(value.canonicalSessionKey) || [], item => item),
            qAssignments: stableSort(qBySession.get(value.canonicalSessionKey) || [], item => `${item.role}|${item.memberId}`),
            fngs: stableSort(fngBySession.get(value.canonicalSessionKey) || [], item => item.memberId),
        };
    });
    unique(sessions.map(value => value.sessionId), "delta session UUID");

    const payload = {
        contract: {
            schemaVersion: "west-houston-append-only-delta-v1",
            regionId: REGION_ID,
            regionName: "F3 West Houston",
            v1CanonicalSha256: hashes.v1Canonical,
            v2CanonicalSha256: hashes.v2Canonical,
            humanManifestSha256: hashes.humanManifest,
            demoManifestSha256: hashes.demoManifest,
            attendanceWorkbookSha256: v2.metadata.attendanceWorkbookSha256,
            sourceIdentitySplitsSha256: v2.metadata.sourceIdentitySplitsSha256,
            parserVersion: v2.metadata.parserVersion,
            expected: EXPECTED,
        },
        configuration: {
            aos: stableSort(demo.aos.map(value => ({ id: value.id, name: value.name })), value => value.id),
            sites: stableSort(demo.sites.map(value => ({ id: value.id, name: value.name })), value => value.id),
        },
        members,
        sessions,
    };
    validateDeltaPayload(payload);
    return payload;
}

export function summarizePayload(payload) {
    return {
        members: payload.members.length,
        sessions: payload.sessions.length,
        attendance: payload.sessions.reduce((sum, value) => sum + value.attendeeIds.length, 0),
        qAssignments: payload.sessions.reduce((sum, value) => sum + value.qAssignments.length, 0),
        fngs: payload.sessions.reduce((sum, value) => sum + value.fngs.length, 0),
    };
}

export function validateDeltaPayload(payload) {
    const summary = summarizePayload(payload);
    for (const key of ["members", "sessions", "attendance", "qAssignments", "fngs"]) {
        assert(summary[key] === EXPECTED[key], `Delta ${key} count mismatch`);
    }
    const memberIds = new Set(payload.members.map(value => value.memberId));
    const sessionIds = new Set(payload.sessions.map(value => value.sessionId));
    assert(memberIds.size === EXPECTED.members && sessionIds.size === EXPECTED.sessions, "Delta UUIDs are not unique");
    assert(!memberIds.has(FORBIDDEN_AGGIELAND_JUICE_ID), "Aggieland Juice leaked into delta members");
    assert(RETAINED_IRON_GATE_IDS.every(id => !sessionIds.has(id)), "A retained Iron Gate session leaked into the delta");
    const relationshipDocument = JSON.stringify(payload.sessions);
    assert(!relationshipDocument.includes(FORBIDDEN_AGGIELAND_JUICE_ID), "Aggieland Juice leaked into delta sessions");
    assert(!relationshipDocument.includes(HISTORICAL_ZILLOW_ID), "Historical Zillow leaked into delta sessions");
    assert(RETAINED_IRON_GATE_IDS.every(id => !relationshipDocument.includes(id)), "A retained Iron Gate session is a delta target");
    const zillowSessions = payload.sessions.filter(value =>
        value.attendeeIds.includes(NEW_ZILLOW_ID) || value.qAssignments.some(item => item.memberId === NEW_ZILLOW_ID) ||
        value.fngs.some(item => item.memberId === NEW_ZILLOW_ID));
    assert(zillowSessions.length === 1 && zillowSessions[0].sessionId === "35d13472-68dc-59c7-88f9-f27491533777" &&
        zillowSessions[0].date === "2026-10-02" && zillowSessions[0].aoName === "The HOP" &&
        zillowSessions[0].attendeeIds.includes(NEW_ZILLOW_ID) &&
        zillowSessions[0].fngs.some(item => item.memberId === NEW_ZILLOW_ID),
    "New Zillow is not confined to the approved HOP attendance/FNG");
    for (const session of payload.sessions) {
        const attendees = new Set(session.attendeeIds);
        assert(attendees.size === session.attendeeIds.length, `Duplicate attendee in ${session.sessionId}`);
        assert(session.qAssignments.every(item => attendees.has(item.memberId)), `Non-attending Q in ${session.sessionId}`);
        assert(session.fngs.every(item => attendees.has(item.memberId)), `Non-attending FNG in ${session.sessionId}`);
        assert(session.fngs.every(item => !session.qAssignments.some(q => q.memberId === item.memberId)),
            `Q/FNG contradiction in ${session.sessionId}`);
    }
    return summary;
}

export function classifyDeltaState({ targetMembers, targetSessions, sessions, attendance, qAssignments, fngs }) {
    if (targetMembers === 0 && targetSessions === 0 &&
        sessions === EXPECTED.baselineSessions && attendance === EXPECTED.baselineAttendance &&
        qAssignments === EXPECTED.baselineQAssignments && fngs === EXPECTED.baselineFngs) return "apply";
    if (targetMembers === EXPECTED.members && targetSessions === EXPECTED.sessions &&
        sessions === EXPECTED.finalSessions && attendance === EXPECTED.finalAttendance &&
        qAssignments === EXPECTED.finalQAssignments && fngs === EXPECTED.finalFngs) return "rerun";
    throw new Error("West Houston delta state is neither exact baseline nor exact applied state");
}

function sqlBody(payloadJson) {
    return `-- Append-only West Houston delta generated by scripts/importWestHoustonDelta.js.\n-- Source of truth: import/west-houston/output/west_houston_identity_split_canonical_dry_run.json.\n-- This migration creates no persistent schema and never updates or deletes an existing member/session.\n\nbegin;\n\nset local lock_timeout = '30s';\nset local statement_timeout = '30min';\n\nselect pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('west-houston-append-only-delta-v1', 0));\nlock table public.sessions in share row exclusive mode;\nlock table public.members in share row exclusive mode;\n\ncreate temp table wh_delta_payload (document jsonb not null) on commit drop;\n\n-- BEGIN GENERATED WEST HOUSTON DELTA PAYLOAD\ninsert into wh_delta_payload (document)\nvalues ($west_houston_delta$${payloadJson}$west_houston_delta$::jsonb);\n-- END GENERATED WEST HOUSTON DELTA PAYLOAD\n\ncreate temp table wh_delta_members on commit drop as\nselect\n    item ->> 'canonicalKey' as canonical_key,\n    (item ->> 'memberId')::uuid as member_id,\n    item ->> 'paxName' as pax_name,\n    nullif(item ->> 'homeAo', '') as home_ao,\n    (item ->> 'firstPostDate')::date as first_post_date\nfrom wh_delta_payload payload\ncross join lateral jsonb_array_elements(payload.document -> 'members') member(item);\nalter table wh_delta_members add primary key (canonical_key);\ncreate unique index wh_delta_members_member_id_unique on wh_delta_members(member_id);\n\ncreate temp table wh_delta_sessions on commit drop as\nselect\n    item ->> 'sessionKey' as session_key,\n    (item ->> 'sessionId')::uuid as session_id,\n    (item ->> 'date')::date as session_date,\n    item ->> 'aoName' as ao_name,\n    (item ->> 'aoId')::uuid as ao_id,\n    (item ->> 'siteId')::uuid as site_id,\n    nullif(item ->> 'eventName', '') as event_name,\n    item ->> 'workoutType' as workout_type,\n    item -> 'attendeeIds' as attendee_ids,\n    item -> 'qAssignments' as q_assignments,\n    item -> 'fngs' as fngs\nfrom wh_delta_payload payload\ncross join lateral jsonb_array_elements(payload.document -> 'sessions') session(item);\nalter table wh_delta_sessions add primary key (session_key);\ncreate unique index wh_delta_sessions_session_id_unique on wh_delta_sessions(session_id);\n\ncreate temp table wh_delta_expected_sessions on commit drop as\nselect\n    source.*,\n    coalesce((select array_agg((assignment.value ->> 'memberId')::uuid order by (assignment.value ->> 'memberId')::uuid)\n              from jsonb_array_elements(source.q_assignments) assignment(value)), '{}'::uuid[]) as q_ids,\n    (select (assignment.value ->> 'memberId')::uuid\n     from jsonb_array_elements(source.q_assignments) assignment(value)\n     order by case when assignment.value ->> 'role' = 'q' then 0 else 1 end,\n              (assignment.value ->> 'memberId')::uuid limit 1) as q_id\nfrom wh_delta_sessions source;\n\ncreate temp table wh_delta_expected_aos on commit drop as\nselect (item ->> 'id')::uuid as id, item ->> 'name' as name\nfrom wh_delta_payload payload\ncross join lateral jsonb_array_elements(payload.document #> '{configuration,aos}') ao(item);\ncreate temp table wh_delta_expected_sites on commit drop as\nselect (item ->> 'id')::uuid as id, item ->> 'name' as name\nfrom wh_delta_payload payload\ncross join lateral jsonb_array_elements(payload.document #> '{configuration,sites}') site(item);\n\ncreate temp table wh_delta_context (apply_mode text not null, doge_profile_id uuid not null) on commit drop;\ncreate temp table wh_delta_inserted_members (id uuid primary key) on commit drop;\ncreate temp table wh_delta_inserted_sessions (id uuid primary key) on commit drop;\n\n-- Snapshot every pre-existing West Houston member/session. Postflight proves this migration changed none of them.\ncreate temp table wh_delta_preserved_members on commit drop as\nselect member.id, to_jsonb(member) as snapshot\nfrom public.members member\nwhere member.region_id = '${REGION_ID}'::uuid;\nalter table wh_delta_preserved_members add primary key (id);\ncreate temp table wh_delta_preserved_sessions on commit drop as\nselect session.id, to_jsonb(session) as snapshot\nfrom public.sessions session\nwhere session.region_id = '${REGION_ID}'::uuid;\nalter table wh_delta_preserved_sessions add primary key (id);\n\nselect region.id from public.regions region\nwhere region.id = '${REGION_ID}'::uuid for update;\n\ndo $wh_delta_preflight$\ndeclare\n    contract jsonb;\n    target_members integer;\n    target_sessions integer;\n    actual_sessions bigint;\n    actual_attendance bigint;\n    actual_qs bigint;\n    actual_fngs bigint;\n    doge_profile uuid;\nbegin\n    select document -> 'contract' into contract from wh_delta_payload;\n    if contract ->> 'schemaVersion' <> 'west-houston-append-only-delta-v1'\n       or contract ->> 'regionId' <> '${REGION_ID}'\n       or contract ->> 'v1CanonicalSha256' <> '${EXPECTED_HASHES.v1Canonical}'\n       or contract ->> 'v2CanonicalSha256' <> '${EXPECTED_HASHES.v2Canonical}'\n       or contract ->> 'humanManifestSha256' <> '${EXPECTED_HASHES.humanManifest}' then\n        raise exception 'West Houston delta embedded contract mismatch';\n    end if;\n    if (select count(*) from wh_delta_members) <> ${EXPECTED.members}\n       or (select count(*) from wh_delta_sessions) <> ${EXPECTED.sessions}\n       or (select coalesce(sum(jsonb_array_length(attendee_ids)), 0) from wh_delta_sessions) <> ${EXPECTED.attendance}\n       or (select coalesce(sum(jsonb_array_length(q_assignments)), 0) from wh_delta_sessions) <> ${EXPECTED.qAssignments}\n       or (select coalesce(sum(jsonb_array_length(fngs)), 0) from wh_delta_sessions) <> ${EXPECTED.fngs} then\n        raise exception 'West Houston delta embedded payload counts are invalid';\n    end if;\n    if not exists (select 1 from public.regions where id = '${REGION_ID}'::uuid\n                   and name = 'F3 West Houston' and environment = 'production') then\n        raise exception 'West Houston production region contract mismatch';\n    end if;\n    if exists ((select ao.id, ao.name from public.aos ao where ao.region_id = '${REGION_ID}'::uuid\n                except select id, name from wh_delta_expected_aos)\n               union all\n               (select id, name from wh_delta_expected_aos except\n                select ao.id, ao.name from public.aos ao where ao.region_id = '${REGION_ID}'::uuid)) then\n        raise exception 'West Houston AO configuration differs from the approved configuration';\n    end if;\n    if exists ((select site.id, site.name from public.sites site where site.region_id = '${REGION_ID}'::uuid\n                except select id, name from wh_delta_expected_sites)\n               union all\n               (select id, name from wh_delta_expected_sites except\n                select site.id, site.name from public.sites site where site.region_id = '${REGION_ID}'::uuid)) then\n        raise exception 'West Houston site configuration differs from the approved configuration';\n    end if;\n    select profile.id into doge_profile from public.profiles profile\n    where profile.member_id = '${DOGE_MEMBER_ID}'::uuid;\n    if doge_profile is null or (select count(*) from public.profiles where member_id = '${DOGE_MEMBER_ID}'::uuid) <> 1 then\n        raise exception 'DOGE profile contract mismatch';\n    end if;\n    if not exists (select 1 from public.members where id = '${HISTORICAL_ZILLOW_ID}'::uuid\n        and region_id = '${REGION_ID}'::uuid and pax_name = 'Zillow' and home_ao = 'The Branch'\n        and first_post_date = '2022-10-28' and status = 'active') then\n        raise exception 'Historical Zillow production precondition mismatch';\n    end if;\n    if not exists (select 1 from public.sessions where id = '${RETAINED_IRON_GATE_IDS[0]}'::uuid\n        and region_id = '${REGION_ID}'::uuid and date = '2026-09-24' and ao_name = 'The Iron Gate'\n        and jsonb_array_length(coalesce(attendee_ids, '[]'::jsonb)) = 9\n        and cardinality(coalesce(q_ids, '{}'::uuid[])) = 0 and jsonb_array_length(coalesce(fngs, '[]'::jsonb)) = 0)\n       or not exists (select 1 from public.sessions where id = '${RETAINED_IRON_GATE_IDS[1]}'::uuid\n        and region_id = '${REGION_ID}'::uuid and date = '2026-09-24' and ao_name = 'The Iron Gate'\n        and jsonb_array_length(coalesce(attendee_ids, '[]'::jsonb)) = 17\n        and cardinality(coalesce(q_ids, '{}'::uuid[])) = 5 and jsonb_array_length(coalesce(fngs, '[]'::jsonb)) = 0) then\n        raise exception 'Retained Iron Gate production precondition mismatch';\n    end if;\n    if exists (select 1 from wh_delta_sessions where session_id in ('${RETAINED_IRON_GATE_IDS[0]}'::uuid, '${RETAINED_IRON_GATE_IDS[1]}'::uuid)) then\n        raise exception 'A retained Iron Gate session is a delta target';\n    end if;\n    if exists (select 1 from wh_delta_expected_sessions source\n        cross join lateral jsonb_array_elements_text(source.attendee_ids) attendee(value)\n        where attendee.value::uuid = '${HISTORICAL_ZILLOW_ID}'::uuid)\n       or exists (select 1 from wh_delta_expected_sessions source\n        cross join lateral jsonb_array_elements(source.q_assignments) q(value)\n        where (q.value ->> 'memberId')::uuid = '${HISTORICAL_ZILLOW_ID}'::uuid)\n       or exists (select 1 from wh_delta_expected_sessions source\n        cross join lateral jsonb_array_elements(source.fngs) fng(value)\n        where (fng.value ->> 'memberId')::uuid = '${HISTORICAL_ZILLOW_ID}'::uuid) then\n        raise exception 'Historical Zillow appears in the delta session payload';\n    end if;\n    if exists (select 1 from wh_delta_expected_sessions source\n        cross join lateral jsonb_array_elements(source.q_assignments) q(value)\n        where not (source.attendee_ids ? (q.value ->> 'memberId')))\n       or exists (select 1 from wh_delta_expected_sessions source\n        cross join lateral jsonb_array_elements(source.fngs) fng(value)\n        where not (source.attendee_ids ? (fng.value ->> 'memberId'))\n           or (fng.value ->> 'memberId')::uuid = any(source.q_ids)) then\n        raise exception 'Delta contains a missing attendee or Q/FNG contradiction';\n    end if;\n    if exists (select 1 from public.sessions actual join wh_delta_expected_sessions expected on expected.session_id = actual.id\n        where actual.region_id <> '${REGION_ID}'::uuid or actual.date <> expected.session_date::text\n           or actual.ao_name is distinct from expected.ao_name or actual.ao_id is distinct from expected.ao_id\n           or actual.site_id is distinct from expected.site_id or actual.q_id is distinct from expected.q_id\n           or coalesce(actual.q_ids, '{}'::uuid[]) is distinct from expected.q_ids\n           or coalesce(actual.attendee_ids, '[]'::jsonb) is distinct from expected.attendee_ids\n           or coalesce(actual.fngs, '[]'::jsonb) is distinct from expected.fngs\n           or actual.notes is distinct from expected.event_name\n           or actual.created_at <> floor(extract(epoch from expected.session_date::timestamptz) * 1000)::bigint\n           or actual.created_by_user_id is distinct from doge_profile or actual.start_time is not null\n           or actual.attendance_review_status <> 'not_required') then\n        raise exception 'An existing delta session conflicts with the approved exact row';\n    end if;\n    if exists (select 1 from public.members actual join wh_delta_members expected on expected.member_id = actual.id\n        where actual.region_id <> '${REGION_ID}'::uuid or actual.pax_name is distinct from expected.pax_name\n           or actual.real_name is not null or actual.home_ao is distinct from expected.home_ao\n           or actual.first_post_date <> expected.first_post_date::text or actual.status <> 'active') then\n        raise exception 'An existing delta member conflicts with the approved exact row';\n    end if;\n    if exists (select 1 from public.sessions actual join wh_delta_expected_sessions expected\n        on actual.region_id = '${REGION_ID}'::uuid and actual.date = expected.session_date::text\n       and actual.ao_name = expected.ao_name and actual.id <> expected.session_id) then\n        raise exception 'A non-target West Houston session already occupies a delta AO/date';\n    end if;\n    select count(*) into target_members from public.members actual join wh_delta_members target on target.member_id = actual.id;\n    select count(*) into target_sessions from public.sessions actual join wh_delta_sessions target on target.session_id = actual.id;\n    select count(*), coalesce(sum(jsonb_array_length(coalesce(attendee_ids, '[]'::jsonb))), 0),\n           coalesce(sum(cardinality(coalesce(q_ids, '{}'::uuid[]))), 0),\n           coalesce(sum(jsonb_array_length(coalesce(fngs, '[]'::jsonb))), 0)\n    into actual_sessions, actual_attendance, actual_qs, actual_fngs\n    from public.sessions where region_id = '${REGION_ID}'::uuid;\n    if target_members = 0 and target_sessions = 0\n       and actual_sessions = ${EXPECTED.baselineSessions} and actual_attendance = ${EXPECTED.baselineAttendance}\n       and actual_qs = ${EXPECTED.baselineQAssignments} and actual_fngs = ${EXPECTED.baselineFngs} then\n        insert into wh_delta_context values ('apply', doge_profile);\n    elsif target_members = ${EXPECTED.members} and target_sessions = ${EXPECTED.sessions}\n       and actual_sessions = ${EXPECTED.finalSessions} and actual_attendance = ${EXPECTED.finalAttendance}\n       and actual_qs = ${EXPECTED.finalQAssignments} and actual_fngs = ${EXPECTED.finalFngs} then\n        insert into wh_delta_context values ('rerun', doge_profile);\n    else\n        raise exception 'West Houston delta state is neither exact baseline nor exact applied state (members %, sessions %, totals %/%/%/%)',\n            target_members, target_sessions, actual_sessions, actual_attendance, actual_qs, actual_fngs;\n    end if;\nend;\n$wh_delta_preflight$;\n\nwith inserted as (\n    insert into public.members (id, region_id, pax_name, real_name, home_ao, first_post_date, status)\n    select member_id, '${REGION_ID}'::uuid, pax_name, null, home_ao, first_post_date::text, 'active'\n    from wh_delta_members where (select apply_mode from wh_delta_context) = 'apply'\n    order by canonical_key returning id\n) insert into wh_delta_inserted_members select id from inserted;\n\nwith inserted as (\n    insert into public.sessions (id, region_id, date, ao_name, q_id, attendee_ids, fngs, notes, created_at, q_ids,\n                                 created_by_user_id, start_time, attendance_review_status, ao_id, site_id)\n    select expected.session_id, '${REGION_ID}'::uuid, expected.session_date::text, expected.ao_name, expected.q_id,\n           expected.attendee_ids, expected.fngs, expected.event_name,\n           floor(extract(epoch from expected.session_date::timestamptz) * 1000)::bigint, expected.q_ids,\n           context.doge_profile_id, null, 'not_required', expected.ao_id, expected.site_id\n    from wh_delta_expected_sessions expected cross join wh_delta_context context\n    where context.apply_mode = 'apply' order by expected.session_date, expected.session_id returning id\n) insert into wh_delta_inserted_sessions select id from inserted;\n\ndo $wh_delta_derived_data$\ndeclare target record; context record;\nbegin\n    select * into context from wh_delta_context;\n    if context.apply_mode = 'apply' then\n        if (select count(*) from wh_delta_inserted_members) <> ${EXPECTED.members}\n           or (select count(*) from wh_delta_inserted_sessions) <> ${EXPECTED.sessions} then\n            raise exception 'West Houston delta inserted-row count mismatch';\n        end if;\n        for target in select member_id from wh_delta_members order by canonical_key loop\n            perform public.upsert_region_participant('${REGION_ID}'::uuid, target.member_id, null, 'historic_import', context.doge_profile_id);\n        end loop;\n        for target in select session_id from wh_delta_sessions order by session_date, session_id loop\n            perform public.sync_region_participants_for_session(target.session_id);\n        end loop;\n        perform public.rebuild_member_stats_for_region('${REGION_ID}'::uuid);\n    elsif (select count(*) from wh_delta_inserted_members) <> 0 or (select count(*) from wh_delta_inserted_sessions) <> 0 then\n        raise exception 'West Houston rerun unexpectedly inserted rows';\n    end if;\nend;\n$wh_delta_derived_data$;\n\ndo $wh_delta_postflight$\ndeclare\n    actual_sessions bigint; actual_attendance bigint; actual_qs bigint; actual_fngs bigint;\nbegin\n    if (select count(*) from public.members actual join wh_delta_members target on target.member_id = actual.id) <> ${EXPECTED.members}\n       or (select count(*) from public.sessions actual join wh_delta_sessions target on target.session_id = actual.id) <> ${EXPECTED.sessions} then\n        raise exception 'West Houston final target-row set mismatch';\n    end if;\n    if exists (select 1 from wh_delta_members expected join public.members actual on actual.id = expected.member_id\n        where actual.region_id <> '${REGION_ID}'::uuid or actual.pax_name is distinct from expected.pax_name\n           or actual.real_name is not null or actual.home_ao is distinct from expected.home_ao\n           or actual.first_post_date <> expected.first_post_date::text or actual.status <> 'active') then\n        raise exception 'West Houston final member content mismatch';\n    end if;\n    if exists (select 1 from wh_delta_expected_sessions expected join public.sessions actual on actual.id = expected.session_id\n        cross join wh_delta_context context\n        where actual.region_id <> '${REGION_ID}'::uuid or actual.date <> expected.session_date::text\n           or actual.ao_name is distinct from expected.ao_name or actual.ao_id is distinct from expected.ao_id\n           or actual.site_id is distinct from expected.site_id or actual.q_id is distinct from expected.q_id\n           or coalesce(actual.q_ids, '{}'::uuid[]) is distinct from expected.q_ids\n           or coalesce(actual.attendee_ids, '[]'::jsonb) is distinct from expected.attendee_ids\n           or coalesce(actual.fngs, '[]'::jsonb) is distinct from expected.fngs\n           or actual.notes is distinct from expected.event_name\n           or actual.created_at <> floor(extract(epoch from expected.session_date::timestamptz) * 1000)::bigint\n           or actual.created_by_user_id is distinct from context.doge_profile_id or actual.start_time is not null\n           or actual.attendance_review_status <> 'not_required') then\n        raise exception 'West Houston final session content mismatch';\n    end if;\n    select count(*), coalesce(sum(jsonb_array_length(coalesce(attendee_ids, '[]'::jsonb))), 0),\n           coalesce(sum(cardinality(coalesce(q_ids, '{}'::uuid[]))), 0),\n           coalesce(sum(jsonb_array_length(coalesce(fngs, '[]'::jsonb))), 0)\n    into actual_sessions, actual_attendance, actual_qs, actual_fngs\n    from public.sessions where region_id = '${REGION_ID}'::uuid;\n    if actual_sessions <> ${EXPECTED.finalSessions} or actual_attendance <> ${EXPECTED.finalAttendance}\n       or actual_qs <> ${EXPECTED.finalQAssignments} or actual_fngs <> ${EXPECTED.finalFngs} then\n        raise exception 'West Houston final totals mismatch: %/%/%/%', actual_sessions, actual_attendance, actual_qs, actual_fngs;\n    end if;\n    if exists (select 1 from wh_delta_preserved_members preserved\n        left join public.members actual on actual.id = preserved.id\n        where actual.id is null or to_jsonb(actual) is distinct from preserved.snapshot) then\n        raise exception 'A pre-existing West Houston member was mutated or deleted';\n    end if;\n    if exists (select 1 from wh_delta_preserved_sessions preserved\n        left join public.sessions actual on actual.id = preserved.id\n        where actual.id is null or to_jsonb(actual) is distinct from preserved.snapshot) then\n        raise exception 'A pre-existing West Houston session was mutated or deleted';\n    end if;\n    if exists (select 1 from wh_delta_members target\n        left join public.region_participants participant\n          on participant.region_id = '${REGION_ID}'::uuid and participant.member_id = target.member_id\n        where participant.member_id is null or participant.status <> 'active'\n           or not ('historic_import' = any(participant.sources))\n           or not ('session_attendance' = any(participant.sources))) then\n        raise exception 'West Houston delta participant synchronization mismatch';\n    end if;\n    if exists (select 1 from wh_delta_members target\n        left join public.member_stats stats on stats.region_id = '${REGION_ID}'::uuid and stats.member_id = target.member_id\n        left join lateral (select count(*)::integer posts, min(session.date::date) first_post, max(session.date::date) last_post\n            from public.sessions session where session.region_id = '${REGION_ID}'::uuid\n              and coalesce(session.attendee_ids, '[]'::jsonb) ? target.member_id::text) attendance on true\n        left join lateral (select count(*)::integer qs, max(session.date::date) last_q\n            from public.sessions session where session.region_id = '${REGION_ID}'::uuid\n              and target.member_id = any(coalesce(session.q_ids, '{}'::uuid[]))) q_history on true\n        where stats.member_id is null or stats.total_posts <> attendance.posts or stats.total_qs <> q_history.qs\n           or stats.last_post_date is distinct from attendance.last_post or stats.last_q_date is distinct from q_history.last_q\n           or stats.first_post_date is distinct from (select member.first_post_date::date from public.members member where member.id = target.member_id)) then\n        raise exception 'West Houston delta member statistics mismatch';\n    end if;\nend;\n$wh_delta_postflight$;\n\ncommit;\n`;
}

export function renderMigration(payload) {
    validateDeltaPayload(payload);
    const migration = sqlBody(JSON.stringify(payload));
    const marker = "    if exists (select 1 from public.sessions actual join wh_delta_expected_sessions expected on expected.session_id = actual.id\n";
    const safetyChecks = `    if exists (select 1 from wh_delta_expected_sessions source
        cross join lateral jsonb_array_elements_text(source.attendee_ids) attendee(value)
        left join public.members actual on actual.id = attendee.value::uuid
        left join wh_delta_members target on target.member_id = attendee.value::uuid
        where target.member_id is null
          and (actual.id is null or actual.region_id <> '${REGION_ID}'::uuid)) then
        raise exception 'A delta attendance member is absent from the West Houston canonical roster';
    end if;
    if exists (select 1 from public.members actual cross join wh_delta_members expected
        where actual.region_id = '${REGION_ID}'::uuid and actual.id <> expected.member_id
          and regexp_replace(lower(coalesce(actual.pax_name, '')), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(expected.pax_name), '[^a-z0-9]+', '', 'g')
          and not (expected.member_id = '${NEW_ZILLOW_ID}'::uuid
                   and actual.id = '${HISTORICAL_ZILLOW_ID}'::uuid)) then
        raise exception 'An unexpected existing West Houston member collides with a delta PAX name';
    end if;
`;
    assert(migration.includes(marker), "SQL safety-check insertion marker is missing");
    const withSafetyChecks = migration.replace(marker, `${safetyChecks}${marker}`);
    const statsMarker = "    if exists (select 1 from wh_delta_members target\n        left join public.member_stats stats";
    const participantDateCheck = `    if exists (select 1 from wh_delta_members target
        left join public.region_participants participant
          on participant.region_id = '${REGION_ID}'::uuid and participant.member_id = target.member_id
        left join lateral (select min(session.date::date) first_participated,
                                  max(session.date::date) last_participated
            from public.sessions session where session.region_id = '${REGION_ID}'::uuid
              and coalesce(session.attendee_ids, '[]'::jsonb) ? target.member_id::text) attendance on true
        where participant.first_participated_on is distinct from attendance.first_participated
           or participant.last_participated_on is distinct from attendance.last_participated) then
        raise exception 'West Houston delta participant dates mismatch';
    end if;
`;
    assert(withSafetyChecks.includes(statsMarker), "SQL participant-date insertion marker is missing");
    return withSafetyChecks.replace(statsMarker, `${participantDateCheck}${statsMarker}`);
}

function parseArgs(argv) {
    const [command = "validate", ...rest] = argv;
    const args = { command };
    for (let index = 0; index < rest.length; index += 1) {
        const value = rest[index];
        assert(value.startsWith("--"), `Unexpected argument: ${value}`);
        const next = rest[index + 1];
        if (!next || next.startsWith("--")) args[value.slice(2)] = true;
        else { args[value.slice(2)] = next; index += 1; }
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const inputs = loadApprovedInputs();
    const payload = buildDeltaPayload(inputs.v1, inputs.v2, inputs.manifest, inputs.demo, inputs.hashes);
    const summary = summarizePayload(payload);
    if (args.command === "validate") {
        console.log(JSON.stringify({ ...summary, hashes: inputs.hashes }, null, 2));
        return;
    }
    if (args.command === "generate-migration") {
        const output = path.resolve(args.output || MIGRATION_PATH);
        fs.writeFileSync(output, renderMigration(payload));
        console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, ...summary }, null, 2));
        return;
    }
    throw new Error(`Unsupported command: ${args.command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
