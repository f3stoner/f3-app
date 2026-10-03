import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

export const CANONICAL_PATH = path.join(ROOT, "import/west-houston/output/west_houston_post_human_canonical_dry_run.json");
export const HUMAN_MANIFEST_PATH = path.join(ROOT, "import/west-houston/west_houston_human_resolution_manifest.json");
export const DEMO_MANIFEST_PATH = path.join(ROOT, "import/west-houston/output/west_houston_demo_manifest.json");
export const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260930000000_support_west_houston_historical_import.sql");

export const REGION_ID = "7298b632-4d9a-542f-b65d-d416e5c1e631";
export const DOGE_MEMBER_ID = "0ec36c8a-3354-5b95-9b94-27013a04c3e6";
export const NEWBIE_DEMO_MEMBER_ID = "af927c72-5147-4595-aaf7-aa30340573e8";
export const LATE_DEMO_SESSION_DATES = Object.freeze(["2026-09-18", "2026-09-22"]);
export const DOGE_CANONICAL_KEY = "wh-canonical-member-22c3b26a90430b0dca97";
export const EXPECTED_HASHES = Object.freeze({
    canonical: "f1c677cf99e8aa9e15595d4ed3fb796f2d624d741868395786b097108114c16a",
    humanManifest: "aba7d5a90ff8e8e4d1e3c280aee2f112cd620f5877ffc651ff23ebcf240833c2",
    demoManifest: "ee1e1523b74e8336076d7c1f07d2cd407c8ed6d73e2065282fbef0f5807a5d36",
});
export const EXPECTED = Object.freeze({
    members: 1194,
    newMembers: 1193,
    sessions: 3742,
    attendance: 43132,
    qAssignments: 3636,
    fngs: 494,
    demoManifestMembers: 218,
    demoMembers: 219,
    demoManifestSessions: 314,
    demoLateSessions: 2,
    demoSessions: 316,
    aos: 10,
    sites: 10,
    excludedDd: 874,
    excludedDdAttendance: 1951,
    excludedDr: 116,
    excludedDrAttendance: 241,
    excludedDrQAssignments: 1,
    unresolvedFng: 19,
});

const WH_ID_009_KEYS = Object.freeze([
    "wh-canonical-member-ba141425b009841ed440",
    "wh-canonical-member-d9670249013c1aabc599",
]);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

export function sha256File(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function deterministicUuid(value) {
    const hash = crypto.createHash("sha1").update(value).digest();
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values, label) {
    assert(values.length === new Set(values).size, `Duplicate ${label}`);
}

function pairKey(sessionKey, memberKey) {
    return `${sessionKey}|${memberKey}`;
}

function stableSort(values, key) {
    return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

export function loadApprovedInputs() {
    return {
        canonical: readJson(CANONICAL_PATH),
        manifest: readJson(HUMAN_MANIFEST_PATH),
        demo: readJson(DEMO_MANIFEST_PATH),
        hashes: {
            canonical: sha256File(CANONICAL_PATH),
            humanManifest: sha256File(HUMAN_MANIFEST_PATH),
            demoManifest: sha256File(DEMO_MANIFEST_PATH),
        },
    };
}

export function buildOneTimePayload(canonical, manifest, demo, hashes) {
    assert(hashes.canonical === EXPECTED_HASHES.canonical, "Canonical artifact hash differs from the approved hash");
    assert(hashes.humanManifest === EXPECTED_HASHES.humanManifest, "Human-resolution manifest hash differs from the approved hash");
    assert(hashes.demoManifest === EXPECTED_HASHES.demoManifest, "Demo manifest hash differs from the approved hash");
    assert(canonical.metadata.schemaVersion === "west-houston-post-human-canonical-v1", "Unexpected canonical schema version");
    assert(canonical.metadata.parserVersion === "west-houston-workbook-v1", "Unexpected parser version");
    assert(manifest.schemaVersion === "west-houston-human-resolution-v1", "Unexpected human manifest schema version");
    assert(canonical.metadata.attendanceWorkbookSha256 === manifest.source.attendanceWorkbookSha256,
        "Attendance workbook hashes do not agree");
    assert(canonical.metadata.humanReviewWorkbookSha256 === manifest.source.humanReviewWorkbookSha256,
        "Human-review workbook hashes do not agree");
    assert(demo.region.id === REGION_ID && demo.region.name === "F3 West Houston", "Unexpected demo region identity");

    const summary = canonical.summary;
    assert(summary.canonicalMembers === EXPECTED.members, "Canonical member count mismatch");
    assert(summary.canonicalPrimarySessions === EXPECTED.sessions, "Canonical session count mismatch");
    assert(summary.canonicalAttendance === EXPECTED.attendance, "Canonical attendance count mismatch");
    assert(summary.canonicalQAssignments === EXPECTED.qAssignments, "Canonical Q/VQ count mismatch");
    assert(summary.canonicalFngEvidence === EXPECTED.fngs, "Canonical FNG count mismatch");
    assert(summary.canonicalContradictions === 0, "Canonical source contains Q/FNG contradictions");
    assert(summary.excludedDdSessions === EXPECTED.excludedDd, "Excluded DD count mismatch");
    assert(summary.excludedDrSessions === EXPECTED.excludedDr, "Excluded DR count mismatch");
    assert(summary.unresolvedFngDiscrepancies === EXPECTED.unresolvedFng, "Unresolved FNG count mismatch");

    assert(demo.members.length === EXPECTED.demoManifestMembers, "Base demo manifest member count mismatch");
    assert(demo.sessions.length === EXPECTED.demoManifestSessions, "Base demo manifest session count mismatch");
    assert(demo.aos.length === EXPECTED.aos && demo.sites.length === EXPECTED.sites, "Demo AO/site count mismatch");
    unique(demo.members.map(value => value.id), "demo member UUID");
    unique(demo.sessions.map(value => value.id), "demo session UUID");
    assert(demo.members.filter(value => value.id === DOGE_MEMBER_ID && value.paxName === "DOGE").length === 1,
        "DOGE is not uniquely represented in the demo manifest");
    assert(!demo.members.some(value => value.id === NEWBIE_DEMO_MEMBER_ID),
        "Newbie must remain a separately approved late demo member");
    unique(LATE_DEMO_SESSION_DATES, "late demo session date");
    assert(canonical.canonicalMembers.filter(value =>
        value.canonicalMemberKey === DOGE_CANONICAL_KEY && value.matchExistingHint?.strategy === "match_existing"
    ).length === 1, "DOGE is not uniquely approved for match_existing");

    const wh009 = manifest.identityDecisions.find(value => value.reviewId === "WH-ID-009");
    assert(wh009?.resolution === "UNRESOLVED", "WH-ID-009 must remain unresolved");
    assert(wh009.reviewSignature === "wh-collision-c992888fcabfdd0a74da", "WH-ID-009 signature mismatch");
    assert(JSON.stringify([...wh009.sourceIdentityKeys].sort()) === JSON.stringify([
        "wh-member-30fe4aff70503a26e0b6",
        "wh-member-c665fd21ebeb83c77f47",
    ]), "WH-ID-009 source identities changed");

    const whFng019 = manifest.fngDiscrepancyDecisions.find(value => value.reviewId === "WH-FNG-019");
    assert(whFng019?.decision === "Unsure", "WH-FNG-019 must remain Unsure");
    assert(whFng019.reviewSignature === "wh-fng-0e9c6cecb7955e9d5cb8", "WH-FNG-019 signature mismatch");
    assert(whFng019.sourceMemberKey === "wh-member-3e49686b36a6a3c67be6" &&
        whFng019.earliestAttendance.date === "2025-06-12" &&
        whFng019.explicitFng.date === "2026-08-25", "WH-FNG-019 evidence changed");

    const aoByName = new Map(demo.aos.map(value => [value.name, value]));
    const siteByName = new Map(demo.sites.map(value => [value.name, value]));
    unique([...aoByName.keys()], "AO name");
    unique([...siteByName.keys()], "site name");

    const members = stableSort(canonical.canonicalMembers, value => value.canonicalMemberKey).map(value => ({
        canonicalKey: value.canonicalMemberKey,
        memberId: value.canonicalMemberKey === DOGE_CANONICAL_KEY
            ? DOGE_MEMBER_ID
            : deterministicUuid(`west-houston-one-time:member:${value.canonicalMemberKey}`),
        paxName: value.canonicalF3Name,
        firstPostDate: value.canonicalFirstPostDate,
        isDoge: value.canonicalMemberKey === DOGE_CANONICAL_KEY,
    }));
    unique(members.map(value => value.canonicalKey), "canonical member key");
    unique(members.map(value => value.memberId), "canonical member UUID");
    assert(members.length === EXPECTED.members, "Compiled member count mismatch");
    assert(members.filter(value => value.isDoge).length === 1, "Compiled DOGE mapping is not unique");
    assert(WH_ID_009_KEYS.every(key => members.some(value => value.canonicalKey === key)), "WH-ID-009 canonical keys are absent");
    assert(new Set(members.filter(value => WH_ID_009_KEYS.includes(value.canonicalKey)).map(value => value.memberId)).size === 2,
        "WH-ID-009 did not compile to two independent UUIDs");
    assert(members.every(value => value.paxName && /^\d{4}-\d{2}-\d{2}$/.test(value.firstPostDate)),
        "Every canonical member must have a name and approved first-post date");

    const memberByKey = new Map(members.map(value => [value.canonicalKey, value]));
    const sessionByKey = new Map(canonical.canonicalSessions.map(value => [value.canonicalSessionKey, value]));
    assert(sessionByKey.size === EXPECTED.sessions, "Duplicate canonical session key");
    const ironGateAliasSessions = canonical.canonicalSessions.filter(value => value.canonicalAo === "Iron Gate");
    assert(ironGateAliasSessions.length === 1 && ironGateAliasSessions[0].date === "2026-09-24",
        "Expected exactly the approved 2026-09-24 Iron Gate source alias");
    const attendanceBySession = new Map();
    const attendancePairs = new Set();
    for (const value of canonical.canonicalAttendance) {
        const key = pairKey(value.canonicalSessionKey, value.canonicalMemberKey);
        assert(!attendancePairs.has(key), `Duplicate attendance ${key}`);
        assert(sessionByKey.has(value.canonicalSessionKey) && memberByKey.has(value.canonicalMemberKey), `Invalid attendance ${key}`);
        attendancePairs.add(key);
        if (!attendanceBySession.has(value.canonicalSessionKey)) attendanceBySession.set(value.canonicalSessionKey, []);
        attendanceBySession.get(value.canonicalSessionKey).push(value.canonicalMemberKey);
    }

    const qBySession = new Map();
    const qPairs = new Set();
    for (const value of canonical.canonicalQAssignments) {
        const key = pairKey(value.canonicalSessionKey, value.canonicalMemberKey);
        assert(!qPairs.has(key), `Duplicate Q/VQ assignment ${key}`);
        assert(attendancePairs.has(key), `Q/VQ is not an attendee: ${key}`);
        const evidence = value.evidence.map(item => item.toUpperCase());
        assert(evidence.every(item => item === "Q" || item === "VQ"), `Unsupported Q evidence ${key}`);
        qPairs.add(key);
        if (!qBySession.has(value.canonicalSessionKey)) qBySession.set(value.canonicalSessionKey, []);
        qBySession.get(value.canonicalSessionKey).push({
            memberKey: value.canonicalMemberKey,
            role: evidence.includes("Q") ? "q" : "coq",
        });
    }

    const fngBySession = new Map();
    const fngPairs = new Set();
    for (const value of canonical.canonicalFngEvidence) {
        const key = pairKey(value.canonicalSessionKey, value.canonicalMemberKey);
        assert(!fngPairs.has(key), `Duplicate FNG evidence ${key}`);
        assert(attendancePairs.has(key), `FNG is not an attendee: ${key}`);
        assert(!qPairs.has(key), `Q/FNG contradiction: ${key}`);
        fngPairs.add(key);
        if (!fngBySession.has(value.canonicalSessionKey)) fngBySession.set(value.canonicalSessionKey, []);
        fngBySession.get(value.canonicalSessionKey).push({
            memberKey: value.canonicalMemberKey,
            paxName: memberByKey.get(value.canonicalMemberKey).paxName,
        });
    }
    assert(attendancePairs.size === EXPECTED.attendance, "Compiled attendance count mismatch");
    assert(qPairs.size === EXPECTED.qAssignments, "Compiled Q/VQ count mismatch");
    assert(fngPairs.size === EXPECTED.fngs, "Compiled FNG count mismatch");

    const sessions = stableSort(canonical.canonicalSessions, value => value.canonicalSessionKey).map(value => {
        const configuredAoName = value.canonicalAo === "Iron Gate" ? "The Iron Gate" : value.canonicalAo;
        const ao = aoByName.get(configuredAoName);
        const site = siteByName.get(configuredAoName);
        assert(ao && site, `Canonical AO/site configuration is missing for ${value.canonicalAo}`);
        assert(!["DR", "DD", "Convergence"].includes(value.canonicalAo),
            `Excluded or synthetic AO leaked into canonical sessions: ${value.canonicalAo}`);
        return {
            sessionKey: value.canonicalSessionKey,
            sessionId: deterministicUuid(`west-houston-one-time:session:${value.canonicalSessionKey}`),
            date: value.date,
            aoName: configuredAoName,
            sourceAoName: value.canonicalAo,
            aoId: ao.id,
            siteId: site.id,
            eventName: value.eventName,
            workoutType: value.workoutType,
            attendeeKeys: stableSort(attendanceBySession.get(value.canonicalSessionKey) || [], item => item),
            qAssignments: stableSort(qBySession.get(value.canonicalSessionKey) || [], item => `${item.role}:${item.memberKey}`),
            fngs: stableSort(fngBySession.get(value.canonicalSessionKey) || [], item => item.memberKey),
        };
    });
    unique(sessions.map(value => value.sessionId), "canonical session UUID");
    assert(sessions.length === EXPECTED.sessions, "Compiled session count mismatch");

    assert(canonical.fngDiscrepancyRepresentations.length === EXPECTED.unresolvedFng,
        "Approved FNG discrepancy representation count mismatch");
    for (const discrepancy of canonical.fngDiscrepancyRepresentations) {
        assert(discrepancy.decision === "Unsure", `${discrepancy.reviewId} is not preserved as Unsure`);
        assert(discrepancy.canonicalFirstPostDate === discrepancy.earliestRecordedAttendance.date,
            `${discrepancy.reviewId} does not preserve earliest attendance`);
        assert(discrepancy.canonicalFirstPostDate < discrepancy.laterExplicitFng.date,
            `${discrepancy.reviewId} does not retain later explicit FNG evidence`);
    }
    const excluded = canonical.excludedSourceSessions.reduce((result, value) => {
        result[value.reason] = (result[value.reason] || 0) + 1;
        return result;
    }, {});
    assert(excluded.DD_EXCLUDED_BY_POLICY === EXPECTED.excludedDd, "DD exclusion payload mismatch");
    assert(excluded.DR_UNRESOLVED_PENDING_AOQ === EXPECTED.excludedDr, "DR exclusion payload mismatch");
    assert(summary.excludedDdAttendance === EXPECTED.excludedDdAttendance, "Excluded DD attendance mismatch");
    assert(summary.excludedDrAttendance === EXPECTED.excludedDrAttendance, "Excluded DR attendance mismatch");
    assert(summary.excludedDrQAssignments === EXPECTED.excludedDrQAssignments, "Excluded DR Q mismatch");

    return {
        contract: {
            schemaVersion: "west-houston-one-time-migration-v1",
            regionId: REGION_ID,
            regionName: "F3 West Houston",
            canonicalSha256: hashes.canonical,
            humanManifestSha256: hashes.humanManifest,
            demoManifestSha256: hashes.demoManifest,
            attendanceWorkbookSha256: canonical.metadata.attendanceWorkbookSha256,
            humanReviewWorkbookSha256: canonical.metadata.humanReviewWorkbookSha256,
            parserVersion: canonical.metadata.parserVersion,
            expected: EXPECTED,
        },
        configuration: {
            aos: stableSort(demo.aos.map(value => ({ id: value.id, name: value.name })), value => value.id),
            sites: stableSort(demo.sites.map(value => ({ id: value.id, name: value.name })), value => value.id),
        },
        demo: {
            memberIds: [...demo.members.map(value => value.id), NEWBIE_DEMO_MEMBER_ID].sort(),
            sessionIds: demo.sessions.map(value => value.id).sort(),
            lateSessionDates: [...LATE_DEMO_SESSION_DATES],
        },
        members,
        sessions,
        unresolvedFng: canonical.fngDiscrepancyRepresentations.map(value => ({
            reviewId: value.reviewId,
            memberKey: value.canonicalMemberKey,
            canonicalFirstPostDate: value.canonicalFirstPostDate,
            laterExplicitFngDate: value.laterExplicitFng.date,
        })),
    };
}

export function summarizePayload(payload) {
    return {
        members: payload.members.length,
        newMembers: payload.members.filter(value => !value.isDoge).length,
        reusedMembers: payload.members.filter(value => value.isDoge).length,
        sessions: payload.sessions.length,
        attendance: payload.sessions.reduce((sum, value) => sum + value.attendeeKeys.length, 0),
        qAssignments: payload.sessions.reduce((sum, value) => sum + value.qAssignments.length, 0),
        fngs: payload.sessions.reduce((sum, value) => sum + value.fngs.length, 0),
        demoMembers: payload.demo.memberIds.length,
        demoSessions: payload.demo.sessionIds.length + payload.demo.lateSessionDates.length,
        aos: payload.configuration.aos.length,
        sites: payload.configuration.sites.length,
        unresolvedFng: payload.unresolvedFng.length,
    };
}

export function renderMigration(payload) {
    const payloadJson = JSON.stringify(payload);
    const template = fs.readFileSync(MIGRATION_PATH, "utf8");
    const start = "-- BEGIN GENERATED WEST HOUSTON PAYLOAD\n";
    const end = "\n-- END GENERATED WEST HOUSTON PAYLOAD";
    const startIndex = template.indexOf(start);
    const endIndex = template.indexOf(end);
    assert(startIndex >= 0 && endIndex > startIndex, "Migration payload markers are missing");
    const statement = `insert into wh_payload (document)\nvalues ($west_houston_payload$${payloadJson}$west_houston_payload$::jsonb);`;
    return `${template.slice(0, startIndex + start.length)}${statement}${template.slice(endIndex)}`;
}

function parseArgs(argv) {
    const [command = "validate", ...rest] = argv;
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

function main() {
    const args = parseArgs(process.argv.slice(2));
    const inputs = loadApprovedInputs();
    const payload = buildOneTimePayload(inputs.canonical, inputs.manifest, inputs.demo, inputs.hashes);
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
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
