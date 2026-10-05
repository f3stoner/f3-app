import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
    EXPECTED,
    FORBIDDEN_AGGIELAND_JUICE_ID,
    HISTORICAL_ZILLOW_ID,
    MIGRATION_PATH,
    NEW_ZILLOW_ID,
    RETAINED_IRON_GATE_IDS,
    buildDeltaPayload,
    classifyDeltaState,
    loadApprovedInputs,
    renderMigration,
    summarizePayload,
} from "../scripts/importWestHoustonDelta.js";
import { deterministicUuid } from "../scripts/importWestHoustonHistorical.js";

function approvedPayload() {
    const inputs = loadApprovedInputs();
    return buildDeltaPayload(inputs.v1, inputs.v2, inputs.manifest, inputs.demo, inputs.hashes);
}

test("the generated delta exactly matches the approved v1-to-v2 canonical difference", () => {
    const payload = approvedPayload();
    assert.deepEqual(summarizePayload(payload), {
        members: 4,
        sessions: 36,
        attendance: 393,
        qAssignments: 35,
        fngs: 3,
    });
    assert.equal(new Set(payload.members.map(value => value.memberId)).size, 4);
    assert.equal(new Set(payload.sessions.map(value => value.sessionId)).size, 36);
    assert.deepEqual(payload.members.map(value => value.memberId).sort(), [
        "640ec3a4-4e9e-55b0-bb0b-f9a654a26d94",
        "ac2736a2-638a-5598-b5f2-7e26b0c435fc",
        "c49024db-3ce6-5475-ab6e-edd40712974d",
        NEW_ZILLOW_ID,
    ].sort());
    for (const member of payload.members) {
        assert.equal(member.memberId, deterministicUuid(`west-houston-one-time:member:${member.canonicalKey}`));
    }
    for (const session of payload.sessions) {
        assert.equal(session.sessionId, deterministicUuid(`west-houston-one-time:session:${session.sessionKey}`));
    }
});

test("the delta excludes forbidden and retained historical identities", () => {
    const payload = approvedPayload();
    const sessionJson = JSON.stringify(payload.sessions);
    assert.ok(!JSON.stringify(payload).includes(FORBIDDEN_AGGIELAND_JUICE_ID));
    assert.ok(!sessionJson.includes(HISTORICAL_ZILLOW_ID));
    for (const retainedId of RETAINED_IRON_GATE_IDS) assert.ok(!sessionJson.includes(retainedId));

    const oldKeys = new Set(loadApprovedInputs().v1.canonicalMembers.map(value => value.canonicalMemberKey));
    assert.deepEqual(payload.members.map(value => value.canonicalKey),
        loadApprovedInputs().v2.canonicalMembers
            .filter(value => !oldKeys.has(value.canonicalMemberKey))
            .map(value => value.canonicalMemberKey).sort());
});

test("the approved new Zillow owns only the reviewed HOP attendance and FNG", () => {
    const payload = approvedPayload();
    const zillow = payload.members.find(value => value.memberId === NEW_ZILLOW_ID);
    assert.deepEqual(zillow, {
        canonicalKey: "wh-canonical-member-9e92bd757a8eb4594bc1",
        sourceMemberKeys: ["wh-member-ef12a3c2b13b3832c61d"],
        memberId: NEW_ZILLOW_ID,
        paxName: "Zillow",
        homeAo: "The HOP",
        firstPostDate: "2026-10-02",
    });
    const references = payload.sessions.filter(session => JSON.stringify(session).includes(NEW_ZILLOW_ID));
    assert.equal(references.length, 1);
    assert.equal(references[0].sessionId, "35d13472-68dc-59c7-88f9-f27491533777");
    assert.equal(references[0].date, "2026-10-02");
    assert.equal(references[0].aoName, "The HOP");
    assert.ok(references[0].attendeeIds.includes(NEW_ZILLOW_ID));
    assert.deepEqual(references[0].fngs.filter(value => value.memberId === NEW_ZILLOW_ID), [
        { memberId: NEW_ZILLOW_ID, paxName: "Zillow" },
    ]);
});

test("preflight classification accepts only exact first-run and rerun states", () => {
    assert.equal(classifyDeltaState({
        targetMembers: 0, targetSessions: 0,
        sessions: EXPECTED.baselineSessions, attendance: EXPECTED.baselineAttendance,
        qAssignments: EXPECTED.baselineQAssignments, fngs: EXPECTED.baselineFngs,
    }), "apply");
    assert.equal(classifyDeltaState({
        targetMembers: EXPECTED.members, targetSessions: EXPECTED.sessions,
        sessions: EXPECTED.finalSessions, attendance: EXPECTED.finalAttendance,
        qAssignments: EXPECTED.finalQAssignments, fngs: EXPECTED.finalFngs,
    }), "rerun");
    for (const state of [
        { targetMembers: 1, targetSessions: 0, sessions: 3742, attendance: 43132, qAssignments: 3636, fngs: 494 },
        { targetMembers: 4, targetSessions: 35, sessions: 3777, attendance: 43510, qAssignments: 3670, fngs: 497 },
        { targetMembers: 0, targetSessions: 0, sessions: 3778, attendance: 43525, qAssignments: 3671, fngs: 497 },
    ]) assert.throws(() => classifyDeltaState(state), /neither exact baseline nor exact applied/);
});

test("checked-in SQL is reproducible and has the required append-only safety structure", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    assert.equal(sql, renderMigration(approvedPayload()));
    assert.match(sql, /^-- Append-only West Houston delta/);
    assert.match(sql, /begin;[\s\S]*commit;\n$/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /apply_mode = 'apply'/);
    assert.match(sql, /'rerun'/);
    assert.match(sql, /sync_region_participants_for_session/);
    assert.match(sql, /rebuild_member_stats_for_region/);
    assert.match(sql, /A pre-existing West Houston member was mutated or deleted/);
    assert.match(sql, /A pre-existing West Houston session was mutated or deleted/);
    assert.doesNotMatch(sql, /delete\s+from\s+public\.(members|sessions)/i);
    assert.doesNotMatch(sql, /update\s+public\.(members|sessions)/i);
    assert.equal((sql.match(/\$wh_delta_preflight\$/g) || []).length, 2);
    assert.equal((sql.match(/\$wh_delta_derived_data\$/g) || []).length, 2);
    assert.equal((sql.match(/\$wh_delta_postflight\$/g) || []).length, 2);
    assert.ok(!sql.includes(FORBIDDEN_AGGIELAND_JUICE_ID));
});
