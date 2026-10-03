import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    DOGE_CANONICAL_KEY,
    DOGE_MEMBER_ID,
    EXPECTED,
    EXPECTED_HASHES,
    LATE_DEMO_SESSION_DATES,
    MIGRATION_PATH,
    NEWBIE_DEMO_MEMBER_ID,
    REGION_ID,
    buildOneTimePayload,
    loadApprovedInputs,
    renderMigration,
    summarizePayload,
} from "../scripts/importWestHoustonHistorical.js";
import { reconcileSnapshot } from "../scripts/reconcileWestHoustonHistoricalImport.js";

const inputs = loadApprovedInputs();
const payload = buildOneTimePayload(inputs.canonical, inputs.manifest, inputs.demo, inputs.hashes);

test("approved sources compile to the exact one-time payload", () => {
    assert.deepEqual(inputs.hashes, EXPECTED_HASHES);
    assert.deepEqual(summarizePayload(payload), {
        members: EXPECTED.members,
        newMembers: EXPECTED.newMembers,
        reusedMembers: 1,
        sessions: EXPECTED.sessions,
        attendance: EXPECTED.attendance,
        qAssignments: EXPECTED.qAssignments,
        fngs: EXPECTED.fngs,
        demoMembers: EXPECTED.demoMembers,
        demoSessions: EXPECTED.demoSessions,
        aos: EXPECTED.aos,
        sites: EXPECTED.sites,
        unresolvedFng: EXPECTED.unresolvedFng,
    });
});

test("deterministic member/session mappings are unique and DOGE is reused", () => {
    assert.equal(new Set(payload.members.map(value => value.memberId)).size, EXPECTED.members);
    assert.equal(new Set(payload.sessions.map(value => value.sessionId)).size, EXPECTED.sessions);
    assert.deepEqual(payload.members.filter(value => value.isDoge), [{
        canonicalKey: DOGE_CANONICAL_KEY,
        memberId: DOGE_MEMBER_ID,
        paxName: "DOGE",
        firstPostDate: "2025-04-17",
        isDoge: true,
    }]);
    const wh009 = payload.members.filter(value => [
        "wh-canonical-member-ba141425b009841ed440",
        "wh-canonical-member-d9670249013c1aabc599",
    ].includes(value.canonicalKey));
    assert.equal(wh009.length, 2);
    assert.equal(new Set(wh009.map(value => value.memberId)).size, 2);
});

test("FNGs are attendees, Q/FNG contradictions are absent, and DD/DR are excluded", () => {
    for (const session of payload.sessions) {
        const attendees = new Set(session.attendeeKeys);
        const qs = new Set(session.qAssignments.map(value => value.memberKey));
        for (const fng of session.fngs) {
            assert.equal(attendees.has(fng.memberKey), true);
            assert.equal(qs.has(fng.memberKey), false);
        }
        assert.equal(["DD", "DR", "Convergence"].includes(session.aoName), false);
    }
    assert.equal(payload.unresolvedFng.length, 19);
    assert.equal(payload.unresolvedFng.every(value => value.canonicalFirstPostDate < value.laterExplicitFngDate), true);
    assert.deepEqual(payload.unresolvedFng.find(value => value.reviewId === "WH-FNG-019"), {
        reviewId: "WH-FNG-019",
        memberKey: "wh-canonical-member-f4b03eb85ad94681bf0a",
        canonicalFirstPostDate: "2025-06-12",
        laterExplicitFngDate: "2026-08-25",
    });
});

test("cleanup scope includes only the approved late demo additions", () => {
    assert.equal(payload.demo.memberIds.includes(NEWBIE_DEMO_MEMBER_ID), true);
    assert.equal(payload.demo.memberIds.length, 219);
    assert.deepEqual(payload.demo.lateSessionDates, LATE_DEMO_SESSION_DATES);
    assert.equal(payload.demo.sessionIds.length, 314);
});

test("checked-in migration is exactly the deterministic compiler output", () => {
    const checkedIn = fs.readFileSync(MIGRATION_PATH, "utf8");
    assert.equal(renderMigration(payload), checkedIn);
});

test("migration is one transaction with temporary staging and no generic capability changes", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /^-- Approved one-time West Houston historical data migration\./);
    assert.match(sql, /begin;[\s\S]*commit;\s*$/);
    assert.match(sql, /create temp table wh_payload/);
    assert.match(sql, /delete from public\.sessions[\s\S]*using wh_demo_sessions/);
    assert.match(sql, /delete from public\.members[\s\S]*using wh_demo_members/);
    assert.match(sql, /select public\.rebuild_member_stats_for_region/);
    assert.match(sql, /perform public\.sync_region_participants_for_session/);
    assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?function/i);
    assert.doesNotMatch(sql, /commit_region_import_(identities|sessions)/i);
    assert.doesNotMatch(sql, /\bgrant\b|\brevoke\b|security\s+definer/i);
    assert.doesNotMatch(sql, /create table public\./i);
    assert.doesNotMatch(sql, /alter table public\.(?!members\b|sessions\b)/i);
});

test("migration carries exact hashes, counts, preservation checks, and rollback assertions", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    for (const hash of Object.values(EXPECTED_HASHES)) assert.match(sql, new RegExp(hash));
    assert.match(sql, /West Houston sessions are not the exact approved demo set/);
    assert.match(sql, /West Houston members are not the exact approved demo set/);
    assert.match(sql, /DOGE must retain existing West Houston access/);
    assert.match(sql, /WH-ID-009 is not represented by two independent identities/);
    assert.match(sql, /actual_attendance <> 43132 or actual_qs <> 3636 or actual_fngs <> 494/);
    assert.match(sql, /af927c72-5147-4595-aaf7-aa30340573e8/);
    assert.match(sql, /2026-09-18/);
    assert.match(sql, /2026-09-22/);
    assert.match(sql, /Each approved late demo date must identify exactly one West Houston session/);
    assert.match(sql, /West Houston must have exactly one registered profile and it must belong to DOGE/);
    assert.match(sql, /Protected West Houston configuration, DOGE identity, or access changed unexpectedly/);
});

function syntheticSnapshot() {
    const memberIdByKey = new Map(payload.members.map(value => [value.canonicalKey, value.memberId]));
    const members = payload.members.map(value => ({
        id: value.memberId,
        region_id: REGION_ID,
        pax_name: value.paxName,
        first_post_date: value.firstPostDate,
        status: "active",
    }));
    const sessions = payload.sessions.map(value => {
        const qAssignments = value.qAssignments.map(item => ({
            memberId: memberIdByKey.get(item.memberKey),
            role: item.role,
        }));
        const primary = [...qAssignments].sort((left, right) => {
            const role = (left.role === "q" ? 0 : 1) - (right.role === "q" ? 0 : 1);
            return role || left.memberId.localeCompare(right.memberId);
        })[0];
        return {
            id: value.sessionId,
            region_id: REGION_ID,
            date: value.date,
            ao_name: value.aoName,
            ao_id: value.aoId,
            site_id: value.siteId,
            q_id: primary?.memberId || null,
            attendee_ids: value.attendeeKeys.map(key => memberIdByKey.get(key)).sort(),
            q_ids: qAssignments.map(item => item.memberId).sort(),
            fngs: value.fngs.map(item => ({
                memberId: memberIdByKey.get(item.memberKey),
                paxName: item.paxName,
            })).sort((left, right) => left.memberId.localeCompare(right.memberId)),
        };
    });
    const memberStats = members.map(member => {
        const attended = sessions.filter(session => session.attendee_ids.includes(member.id));
        const qd = sessions.filter(session => session.q_ids.includes(member.id));
        return attended.length ? {
            region_id: REGION_ID,
            member_id: member.id,
            total_posts: attended.length,
            total_qs: qd.length,
            first_post_date: member.first_post_date,
            last_post_date: attended.map(value => value.date).sort().at(-1) || null,
            last_q_date: qd.map(value => value.date).sort().at(-1) || null,
        } : null;
    }).filter(Boolean);
    const regionParticipants = members.map(member => {
        const attendedDates = sessions.filter(session => session.attendee_ids.includes(member.id))
            .map(session => session.date).sort();
        const hasQ = sessions.some(session => session.q_ids.includes(member.id));
        return {
            region_id: REGION_ID,
            member_id: member.id,
            status: "active",
            sources: [
                "historic_import",
                ...(attendedDates.length ? ["session_attendance"] : []),
                ...(hasQ ? ["q_history"] : []),
            ],
            first_participated_on: attendedDates[0] || null,
            last_participated_on: attendedDates.at(-1) || null,
        };
    });
    const profile = { id: "00000000-0000-4000-8000-000000000001", member_id: DOGE_MEMBER_ID };
    return {
        region: { id: REGION_ID, name: "F3 West Houston", environment: "production" },
        members,
        sessions,
        memberStats,
        regionParticipants,
        aos: payload.configuration.aos,
        sites: payload.configuration.sites,
        profiles: [profile],
        regionAccess: [{ region_id: REGION_ID, user_id: profile.id }],
    };
}

test("read-only reconciliation requires exact deterministic content and rebuilt stats", () => {
    const snapshot = syntheticSnapshot();
    const result = reconcileSnapshot(payload, snapshot);
    assert.equal(result.passed, true);
    assert.equal(result.issueCount, 0);

    snapshot.sessions[0].attendee_ids.pop();
    const failed = reconcileSnapshot(payload, snapshot);
    assert.equal(failed.passed, false);
    assert.ok(failed.issues.some(value => value.includes("session content mismatch")));
});
