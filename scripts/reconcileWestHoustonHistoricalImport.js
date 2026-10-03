import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
    DOGE_MEMBER_ID,
    EXPECTED,
    REGION_ID,
    buildOneTimePayload,
    loadApprovedInputs,
    summarizePayload,
} from "./importWestHoustonHistorical.js";

const __filename = fileURLToPath(import.meta.url);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

function sorted(values) {
    return [...values].sort();
}

function expectedSession(payload, session, memberIdByKey) {
    const qAssignments = session.qAssignments.map(value => ({
        memberId: memberIdByKey.get(value.memberKey),
        role: value.role,
    }));
    const primary = [...qAssignments].sort((left, right) => {
        const role = (left.role === "q" ? 0 : 1) - (right.role === "q" ? 0 : 1);
        return role || left.memberId.localeCompare(right.memberId);
    })[0];
    return {
        id: session.sessionId,
        region_id: REGION_ID,
        date: session.date,
        ao_name: session.aoName,
        ao_id: session.aoId,
        site_id: session.siteId,
        q_id: primary?.memberId || null,
        attendee_ids: sorted(session.attendeeKeys.map(key => memberIdByKey.get(key))),
        q_ids: sorted(qAssignments.map(value => value.memberId)),
        fngs: session.fngs.map(value => ({
            memberId: memberIdByKey.get(value.memberKey),
            paxName: value.paxName,
        })).sort((left, right) => left.memberId.localeCompare(right.memberId)),
    };
}

export function reconcileSnapshot(payload, snapshot) {
    const issues = [];
    const memberIdByKey = new Map(payload.members.map(value => [value.canonicalKey, value.memberId]));
    const expectedMembers = new Map(payload.members.map(value => [value.memberId, value]));
    const actualMembers = new Map(snapshot.members.map(value => [value.id, value]));
    const expectedSessions = new Map(payload.sessions.map(value => [
        value.sessionId,
        expectedSession(payload, value, memberIdByKey),
    ]));
    const actualSessions = new Map(snapshot.sessions.map(value => [value.id, value]));

    if (snapshot.region?.id !== REGION_ID || snapshot.region?.name !== "F3 West Houston" || snapshot.region?.environment !== "production") {
        issues.push("region contract mismatch");
    }
    if (expectedMembers.size !== actualMembers.size) issues.push(`member set size ${actualMembers.size}, expected ${expectedMembers.size}`);
    if (expectedSessions.size !== actualSessions.size) issues.push(`session set size ${actualSessions.size}, expected ${expectedSessions.size}`);

    for (const [id, expected] of expectedMembers) {
        const actual = actualMembers.get(id);
        if (!actual) {
            issues.push(`missing member ${expected.canonicalKey}:${id}`);
            continue;
        }
        if (actual.region_id !== REGION_ID || actual.status !== "active") issues.push(`member state mismatch ${expected.canonicalKey}`);
        if (!expected.isDoge && actual.pax_name !== expected.paxName) issues.push(`member name mismatch ${expected.canonicalKey}`);
        if (!actual.first_post_date || actual.first_post_date > expected.firstPostDate ||
            (!expected.isDoge && actual.first_post_date !== expected.firstPostDate)) {
            issues.push(`member first-post mismatch ${expected.canonicalKey}`);
        }
    }
    for (const id of actualMembers.keys()) {
        if (!expectedMembers.has(id)) issues.push(`unexpected West Houston member ${id}`);
    }

    for (const [id, expected] of expectedSessions) {
        const actual = actualSessions.get(id);
        if (!actual) {
            issues.push(`missing session ${id}`);
            continue;
        }
        const normalized = {
            id: actual.id,
            region_id: actual.region_id,
            date: actual.date,
            ao_name: actual.ao_name,
            ao_id: actual.ao_id,
            site_id: actual.site_id,
            q_id: actual.q_id,
            attendee_ids: sorted(actual.attendee_ids || []),
            q_ids: sorted(actual.q_ids || []),
            fngs: [...(actual.fngs || [])].map(value => ({ memberId: value.memberId, paxName: value.paxName }))
                .sort((left, right) => left.memberId.localeCompare(right.memberId)),
        };
        if (stableJson(normalized) !== stableJson(expected)) issues.push(`session content mismatch ${id}`);
    }
    for (const id of actualSessions.keys()) {
        if (!expectedSessions.has(id)) issues.push(`unexpected West Houston session ${id}`);
    }

    const statsByMember = new Map((snapshot.memberStats || []).map(value => [value.member_id, value]));
    for (const [memberId, expectedMember] of expectedMembers) {
        const attended = [...expectedSessions.values()].filter(value => value.attendee_ids.includes(memberId));
        const qd = [...expectedSessions.values()].filter(value => value.q_ids.includes(memberId));
        const stats = statsByMember.get(memberId);
        const lastPost = attended.map(value => value.date).sort().at(-1) || null;
        const lastQ = qd.map(value => value.date).sort().at(-1) || null;
        const actualFirstPost = actualMembers.get(memberId)?.first_post_date || null;
        if ((attended.length === 0 && stats) || (attended.length > 0 && (
            !stats || stats.total_posts !== attended.length || stats.total_qs !== qd.length ||
            stats.last_post_date !== lastPost || stats.last_q_date !== lastQ ||
            stats.first_post_date !== actualFirstPost
        ))) {
            issues.push(`member stats mismatch ${expectedMember.canonicalKey}`);
        }
    }
    for (const memberId of statsByMember.keys()) {
        if (!expectedMembers.has(memberId)) issues.push(`unexpected West Houston member stats ${memberId}`);
    }
    const participantByMember = new Map((snapshot.regionParticipants || []).map(value => [value.member_id, value]));
    for (const [memberId, expectedMember] of expectedMembers) {
        const attendedDates = [...expectedSessions.values()]
            .filter(value => value.attendee_ids.includes(memberId)).map(value => value.date).sort();
        const hasQ = [...expectedSessions.values()].some(value => value.q_ids.includes(memberId));
        const participant = participantByMember.get(memberId);
        const sources = new Set(participant?.sources || []);
        if (!participant || participant.status !== "active" || !sources.has("historic_import") ||
            participant.first_participated_on !== (attendedDates[0] || null) ||
            participant.last_participated_on !== (attendedDates.at(-1) || null) ||
            (attendedDates.length > 0 && !sources.has("session_attendance")) ||
            (hasQ && !sources.has("q_history"))) {
            issues.push(`region participant mismatch ${expectedMember.canonicalKey}`);
        }
    }
    for (const memberId of participantByMember.keys()) {
        if (!expectedMembers.has(memberId)) issues.push(`unexpected West Houston region participant ${memberId}`);
    }

    const attendance = snapshot.sessions.reduce((sum, value) => sum + new Set(value.attendee_ids || []).size, 0);
    const qs = snapshot.sessions.reduce((sum, value) => sum + new Set(value.q_ids || []).size, 0);
    const fngs = snapshot.sessions.reduce((sum, value) => sum + (value.fngs || []).length, 0);
    const fngMissingAttendance = snapshot.sessions.flatMap(session => (session.fngs || [])
        .filter(fng => !(session.attendee_ids || []).includes(fng.memberId)));
    const qFng = snapshot.sessions.flatMap(session => {
        const qIds = new Set(session.q_ids || []);
        return (session.fngs || []).filter(fng => qIds.has(fng.memberId));
    });
    if (attendance !== EXPECTED.attendance) issues.push(`attendance ${attendance}, expected ${EXPECTED.attendance}`);
    if (qs !== EXPECTED.qAssignments) issues.push(`Q/VQ ${qs}, expected ${EXPECTED.qAssignments}`);
    if (fngs !== EXPECTED.fngs) issues.push(`FNG ${fngs}, expected ${EXPECTED.fngs}`);
    if (fngMissingAttendance.length) issues.push(`${fngMissingAttendance.length} FNGs absent from attendance`);
    if (qFng.length) issues.push(`${qFng.length} Q/FNG contradictions`);

    const aoActual = snapshot.aos.map(value => ({ id: value.id, name: value.name })).sort((a, b) => a.id.localeCompare(b.id));
    const siteActual = snapshot.sites.map(value => ({ id: value.id, name: value.name })).sort((a, b) => a.id.localeCompare(b.id));
    if (stableJson(aoActual) !== stableJson(payload.configuration.aos)) issues.push("AO configuration mismatch");
    if (stableJson(siteActual) !== stableJson(payload.configuration.sites)) issues.push("site configuration mismatch");
    if (!snapshot.profiles.some(value => value.member_id === DOGE_MEMBER_ID)) issues.push("DOGE profile missing");
    if (!snapshot.regionAccess.some(value => snapshot.profiles.some(profile =>
        profile.id === value.user_id && profile.member_id === DOGE_MEMBER_ID
    ))) issues.push("DOGE region access missing");

    return {
        passed: issues.length === 0,
        counts: {
            members: snapshot.members.length,
            sessions: snapshot.sessions.length,
            attendance,
            qAssignments: qs,
            fngs,
            qFngContradictions: qFng.length,
            fngMissingAttendance: fngMissingAttendance.length,
        },
        dogeMemberId: DOGE_MEMBER_ID,
        issues: issues.slice(0, 100),
        issueCount: issues.length,
        contract: payload.contract,
    };
}

async function createReadOnlyClient() {
    const url = process.env.PROJECT_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.PROJECT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert(url && key, "Supabase URL and read credential are required only for explicit reconcile");
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function selectAll(queryFactory, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await queryFactory().range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
    }
}

export async function loadReadOnlySnapshot(client) {
    const [regionResult, members, sessions, memberStats, regionParticipants, aos, sites, profiles, regionAccess] = await Promise.all([
        client.from("regions").select("id,name,environment").eq("id", REGION_ID).single(),
        selectAll(() => client.from("members")
            .select("id,region_id,pax_name,first_post_date,status")
            .eq("region_id", REGION_ID)
            .order("id")),
        selectAll(() => client.from("sessions")
            .select("id,region_id,date,ao_name,ao_id,site_id,q_id,q_ids,attendee_ids,fngs")
            .eq("region_id", REGION_ID)
            .order("id")),
        selectAll(() => client.from("member_stats")
            .select("region_id,member_id,total_posts,total_qs,first_post_date,last_post_date,last_q_date")
            .eq("region_id", REGION_ID)
            .order("member_id")),
        selectAll(() => client.from("region_participants")
            .select("region_id,member_id,status,sources,first_participated_on,last_participated_on")
            .eq("region_id", REGION_ID)
            .order("member_id")),
        selectAll(() => client.from("aos").select("id,name").eq("region_id", REGION_ID).order("id")),
        selectAll(() => client.from("sites").select("id,name").eq("region_id", REGION_ID).order("id")),
        selectAll(() => client.from("profiles").select("id,member_id").eq("member_id", DOGE_MEMBER_ID)),
        selectAll(() => client.from("region_access").select("region_id,user_id").eq("region_id", REGION_ID)),
    ]);
    if (regionResult.error) throw new Error(regionResult.error.message);
    return { region: regionResult.data, members, sessions, memberStats, regionParticipants, aos, sites, profiles, regionAccess };
}

function parseArgs(argv) {
    const [command = "validate-source", ...rest] = argv;
    const args = { command };
    for (let index = 0; index < rest.length; index += 1) {
        const value = rest[index];
        assert(value.startsWith("--"), `Unexpected argument: ${value}`);
        const next = rest[index + 1];
        if (!next || next.startsWith("--")) args[value.slice(2)] = true;
        else {
            args[value.slice(2)] = next;
            index += 1;
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const inputs = loadApprovedInputs();
    const payload = buildOneTimePayload(inputs.canonical, inputs.manifest, inputs.demo, inputs.hashes);
    if (args.command === "validate-source") {
        console.log(JSON.stringify(summarizePayload(payload), null, 2));
        return;
    }
    assert(args.command === "reconcile", `Unsupported command: ${args.command}`);
    const report = reconcileSnapshot(payload, await loadReadOnlySnapshot(await createReadOnlyClient()));
    if (args.output) fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
