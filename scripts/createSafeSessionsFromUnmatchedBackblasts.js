import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const BLOCKED_AO_NAMES = new Set([
    "thehub",
    "hub",
    "meltshop",
    "themeltshop",
    "ao_kokomo",
    "downrange",
    "downrangepost",
    "f3alliance",
    "f3fortbend",
    "f3boise",
    "f3knoxville",
    "f3walkerco",
    "matagordasubao",
    "thespillway",
    "thewetlands",
    "csaup"
]);

const AO_ALIASES = new Map([
    ["f3franklin", "F3 Franklin"],
    ["franklin", "F3 Franklin"],

    ["themoat", "The Moat"],
    ["moat", "The Moat"],

    ["austinscolony", "Austin's Colony"],
    ["austinscolonybc", "Austin's Colony"],

    ["f3dads", "Dads"],
    ["dads", "Dads"],

    ["runningclub", "Run Club"],

    ["thewatchtower", "The Watch"],
    ["watchtower", "The Watch"],

    ["firehouseruck", "CSAUP"],
    ["trashruck", "Other"],
    ["merryruckmas", "CSAUP"],
    ["scaryruck", "Other"],

    ["westbryan", "The Watch"],
    ["westbryanao", "The Watch"],
    ["tower", "The Watch"],
    ["thetower", "The Watch"],
    ["stella", "The Watch"],
    ["villawestpark", "The Watch"],

    ["heavymonday", "The Cave"],
    ["heavyfriday", "The Cave"],

    ["csaup", "CSAUP"],
    ["sandstonepark", "Sandstone"],
    ["sandstone", "Sandstone"],

    ["thecastle", "The Keep"],
    ["castle", "The Keep"],

    ["shadowoftheforest", "The Forest"],
    ["shadowofthecave", "The Cave"],
]);

const MIN_SESSION_DATE = "2018-01-01";
const MAX_SESSION_DATE = new Date().toISOString().split("T")[0];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_PATH = path.join(
    __dirname,
    "../import/output/backblast_session_match_report.json"
);

const MEMBERS_PATH = path.join(__dirname, "../import/aggieland_members.json");

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.PROJECT_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.PROJECT_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const AGGIELAND_REGION_ID = process.env.AGGIELAND_REGION_ID;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !AGGIELAND_REGION_ID) {
    throw new Error("Missing Supabase env vars or AGGIELAND_REGION_ID");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function normalizeName(value = "") {
    return String(value)
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

function buildMemberLookup(members = []) {
    const map = new Map();

    members.forEach(member => {
        const paxName = member.pax_name || member.paxName || "";
        const normalized = normalizeName(paxName);

        if (normalized) {
            map.set(normalized, member);
        }
    });

    return map;
}

function normalizeAo(value = "") {
    return normalizeName(value);
}

function resolveAoAlias(value = "") {
    const normalized = normalizeAo(value);
    return AO_ALIASES.get(normalized) || value;
}

function recoverAoName(backblast = {}) {
    const existingAoName = String(backblast.aoName || "").trim();

    if (existingAoName && existingAoName.toLowerCase() !== "null") {
        return resolveAoAlias(existingAoName);
    }

    const searchableText = [
        ...(backblast.hashtags || []),
        backblast.cleanedContent || "",
        backblast.rawContent || "",
    ].join(" ");

    const normalizedText = normalizeName(searchableText);

    for (const [alias, aoName] of AO_ALIASES.entries()) {
        if (normalizedText.includes(alias)) {
            return aoName;
        }
    }

    return "";
}

function buildExistingSessionKeySet(sessions = []) {
    return new Set(
        sessions.map(session => {
            const date = session.date || "";
            const aoName = session.ao_name || session.aoName || "";
            return `${date}__${normalizeAo(aoName)}`;
        })
    );
}

function getMatchedQMembers(backblast, memberLookup) {
    const qNames = backblast.qNames || [];

    return qNames
        .map(name => memberLookup.get(normalizeName(name)))
        .filter(Boolean);
}

function buildSessionRow({ backblast, qMember }) {
    return {
        region_id: AGGIELAND_REGION_ID,
        id: crypto.randomUUID(),

        date: backblast.date,
        ao_name: backblast.aoName,

        q_ids: [qMember.id],
        attendee_ids: [qMember.id],

        fngs: [],
        notes: "Created from historical Band backblast. Attendance needs review.",
        attendance_review_status: "pending",
        attendance_review_notes: "Auto-created from unmatched Band backblast. Attendance needs review.",

        backblast_text: backblast.cleanedContent || backblast.rawContent || null,

        start_time: null,
        created_by_user_id: null,
        created_at: Date.now(),
    };
}

function buildExistingSessionBackblastLinkRow({ session, backblast, method }) {
    return {
        session_id: session.id,
        band_post_key: backblast.postKey,

        link_method: method,
        confidence_score: 0.85,

        backblast_date: backblast.date || null,
        backblast_ao_name: backblast.aoName || null,
        backblast_q_names: backblast.qNames || [],
        author_name: backblast.authorName || null,

        raw_content: backblast.rawContent || null,
        cleaned_content: backblast.cleanedContent || null,

        parsed_backblast: backblast,
    };
}

function buildLinkedReviewDecisionRow({ backblast, session, notes }) {
    return {
        region_id: AGGIELAND_REGION_ID,
        band_post_key: backblast.postKey,
        session_id: session.id,
        decision_type: "linked",
        decided_by_user_id: null,
        notes,
    };
}

function buildBackblastLinkRow({ sessionRow, backblast }) {
    return {
        session_id: sessionRow.id,
        band_post_key: backblast.postKey,

        link_method: "auto_created_from_unmatched",
        confidence_score: 0.9,

        backblast_date: backblast.date || null,
        backblast_ao_name: backblast.aoName || null,
        backblast_q_names: backblast.qNames || [],
        author_name: backblast.authorName || null,

        raw_content: backblast.rawContent || null,
        cleaned_content: backblast.cleanedContent || null,

        parsed_backblast: backblast,
    };
}

async function loadExistingSessionsForRegion() {
    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select("id, date, ao_name, q_ids, q_id, attendee_ids, backblast_text")
            .eq("region_id", AGGIELAND_REGION_ID)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows.push(...data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return rows;
}

async function loadKnownAoNamesForRegion() {
    const { data, error } = await supabase
        .from("aos")
        .select("name")
        .eq("region_id", AGGIELAND_REGION_ID);

    if (error) throw error;

    return new Set((data || []).map(ao => normalizeAo(ao.name)).filter(Boolean));
}

function sessionHasAnyQ(session, qIds = []) {
    const existingQIds = [
        ...(session.q_ids || []),
        ...(session.q_id ? [session.q_id] : []),
    ];

    return qIds.some(qId => existingQIds.includes(qId));
}

async function loadExistingLinkedPostKeys() {
    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from("session_backblast_links")
            .select("band_post_key")
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows.push(...data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return new Set(rows.map(row => row.band_post_key).filter(Boolean));
}

async function loadExistingReviewDecisionPostKeys() {
    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from("backblast_review_decisions")
            .select("band_post_key, decision_type")
            .eq("region_id", AGGIELAND_REGION_ID)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows.push(...data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return {
        ignoredOrLinkedPostKeys: new Set(
            rows
                .filter(row =>
                    row.decision_type === "ignored" ||
                    row.decision_type === "linked"
                )
                .map(row => row.band_post_key)
                .filter(Boolean)
        ),

        needsReviewPostKeys: new Set(
            rows
                .filter(row => row.decision_type === "needs_review")
                .map(row => row.band_post_key)
                .filter(Boolean)
        ),
    };
}

async function insertRows(sessionRows, linkRows, reviewDecisionRows) {
    if (sessionRows.length > 0) {
        const { error: sessionError } = await supabase
            .from("sessions")
            .insert(sessionRows);
    
        if (sessionError) throw sessionError;
    }
    
    if (linkRows.length > 0) {
        const { error: linkError } = await supabase
            .from("session_backblast_links")
            .insert(linkRows);
    
        if (linkError) throw linkError;
    }

    if (reviewDecisionRows.length > 0) {
        const { error: decisionError } = await supabase
            .from("backblast_review_decisions")
            .upsert(reviewDecisionRows, {
                onConflict: "region_id,band_post_key",
            });

        if (decisionError) throw decisionError;
    }
}

function buildNeedsDateReviewDecisionRow({ backblast }) {
    return {
        region_id: AGGIELAND_REGION_ID,
        band_post_key: backblast.postKey,
        session_id: null,
        decision_type: "needs_review",
        decided_by_user_id: null,
        notes: `NEEDS_DATE_REVIEW: Auto-flagged during unmatched session creation. Parsed date "${backblast.date}" is outside expected range.`,
    };
}

function buildNeedsAoReviewDecisionRow({ backblast }) {
    return {
        region_id: AGGIELAND_REGION_ID,
        band_post_key: backblast.postKey,
        session_id: null,
        decision_type: "needs_review",
        decided_by_user_id: null,
        notes: "NEEDS_AO_REVIEW: Auto-flagged during unmatched session creation. No reliable AO could be recovered.",
    };
}

async function main() {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
    const members = JSON.parse(fs.readFileSync(MEMBERS_PATH, "utf8"));

    const memberLookup = buildMemberLookup(members);
    const linkedPostKeys = await loadExistingLinkedPostKeys();
    
    const {
        ignoredOrLinkedPostKeys,
        needsReviewPostKeys,
    } = await loadExistingReviewDecisionPostKeys();

    const existingSessions = await loadExistingSessionsForRegion();
    const existingSessionKeys = buildExistingSessionKeySet(existingSessions);

    const knownAoNames = await loadKnownAoNamesForRegion();

    const sessionRows = [];
    const linkRows = [];

    const reviewDecisionRows = [];

    const missingAoBuckets = new Map();

    const skippedExistingBuckets = new Map();

    const stats = {
        unmatched: report.unmatched?.length || 0,
        safeCandidates: 0,
        skippedAlreadyLinked: 0,
        skippedMissingDate: 0,
        skippedMissingAo: 0,
        skippedMissingPostKey: 0,
        skippedNoQMatch: 0,
        skippedMultipleQMatches: 0,
        skippedExistingSession: 0,
        skippedBlockedAo: 0,
        flaggedNeedsDateReview: 0,
        skippedAlreadyReviewed: 0,
        autoLinkedWatchFallback: 0,
    };

    for (const item of report.unmatched || []) {
        const backblast = item.backblast || {};

        if (!backblast.postKey) {
            stats.skippedMissingPostKey++;
            continue;
        }

        if (linkedPostKeys.has(backblast.postKey)) {
            stats.skippedAlreadyLinked++;
            continue;
        }

        if (ignoredOrLinkedPostKeys.has(backblast.postKey)) {
            stats.skippedAlreadyReviewed++;
            continue;
        }

        if (!backblast.date) {
            stats.skippedMissingDate++;
            continue;
        }

        if (backblast.date < MIN_SESSION_DATE || backblast.date > MAX_SESSION_DATE) {
            reviewDecisionRows.push(buildNeedsDateReviewDecisionRow({ backblast }));
            linkedPostKeys.add(backblast.postKey);
            stats.flaggedNeedsDateReview++;
            continue;
        }

        const aoName = recoverAoName(backblast);

        const fallbackAoName = "The Watch";

        const watchFallbackSession = existingSessions.find(session =>
            session.date === backblast.date &&
            normalizeAo(session.ao_name || session.aoName) === normalizeAo(fallbackAoName)
        );

        if (
            (backblast.aoName || "").match(/tower|west bryan|heavy/i)
        ) {
            console.log({
                originalAo: backblast.aoName,
                recoveredAo: aoName,
                hashtags: backblast.hashtags,
                date: backblast.date,
            });
        }

        const shouldTryWatchFallback =
            !aoName ||
            aoName.toLowerCase() === "null" ||
            normalizeAo(aoName) === normalizeAo("The Watch");

        if (shouldTryWatchFallback && watchFallbackSession) {
            linkRows.push(buildExistingSessionBackblastLinkRow({
                session: watchFallbackSession,
                backblast: {
                    ...backblast,
                    aoName: "The Watch",
                },
                method: "auto_linked_watch_date_fallback",
            }));

            reviewDecisionRows.push(buildLinkedReviewDecisionRow({
                backblast,
                session: watchFallbackSession,
                notes: "Auto-linked to The Watch by date fallback.",
            }));

            linkedPostKeys.add(backblast.postKey);
            ignoredOrLinkedPostKeys.add(backblast.postKey);
            needsReviewPostKeys.delete(backblast.postKey);
            stats.autoLinkedWatchFallback++;
            continue;
        }

        if (!aoName || aoName.toLowerCase() === "null") {
            reviewDecisionRows.push(buildNeedsAoReviewDecisionRow({ backblast }));
            linkedPostKeys.add(backblast.postKey);
            stats.skippedMissingAo++;
        
            const bucket = (backblast.hashtags || [])
                .filter(tag => tag !== "#backblast")
                .slice(0, 5)
                .join(",") || "no_hashtags";
        
            missingAoBuckets.set(
                bucket,
                (missingAoBuckets.get(bucket) || 0) + 1
            );
        
            continue;
        }

        if (BLOCKED_AO_NAMES.has(normalizeAo(aoName))) {
            stats.skippedBlockedAo++;
            continue;
        }

        if (!knownAoNames.has(normalizeAo(aoName))) {
            reviewDecisionRows.push(buildNeedsAoReviewDecisionRow({ backblast }));
            linkedPostKeys.add(backblast.postKey);
            stats.skippedMissingAo++;
            continue;
        }

        const qMembers = getMatchedQMembers(backblast, memberLookup);

        if (qMembers.length === 0) {
            stats.skippedNoQMatch++;
            continue;
        }

        if (qMembers.length > 1) {
            stats.skippedMultipleQMatches++;
            continue;
        }

        const qMember = qMembers[0];

        const existingSameDateQSession = existingSessions.find(session =>
            session.date === backblast.date &&
            sessionHasAnyQ(session, [qMember.id])
        );

        if (existingSameDateQSession) {
            stats.skippedExistingSession++;

            const bucket = `${aoName || backblast.aoName || "unknown"}__${backblast.date}`;

            skippedExistingBuckets.set(
                bucket,
                (skippedExistingBuckets.get(bucket) || 0) + 1
            );

            continue;
        }

        const sessionKey = `${backblast.date}__${normalizeAo(aoName)}`;

        if (existingSessionKeys.has(sessionKey)) {
            stats.skippedExistingSession++;

            const bucket = `${aoName || backblast.aoName || "unknown"}__${backblast.date}`;

            skippedExistingBuckets.set(
                bucket,
                (skippedExistingBuckets.get(bucket) || 0) + 1
            );

            continue;
        }

        const cleanedBackblast = {
            ...backblast,
            aoName,
        };

        const sessionRow = buildSessionRow({
            backblast: cleanedBackblast,
            qMember,
        });

        const linkRow = buildBackblastLinkRow({
            sessionRow,
            backblast: cleanedBackblast,
        });

        sessionRows.push(sessionRow);
        linkRows.push(linkRow);

        existingSessionKeys.add(sessionKey);
        linkedPostKeys.add(backblast.postKey);
        existingSessions.push(sessionRow);

        stats.safeCandidates++;
    }

    console.log("Auto-create unmatched session review:");
    console.log(stats);

    console.log("\nTop Missing AO Buckets:");

    console.table(
        [...missingAoBuckets.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([bucket, count]) => ({
                count,
                bucket,
            }))
    );

    console.log("\nTop Skipped Existing Session Buckets:");

    console.table(
        [...skippedExistingBuckets.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([bucket, count]) => ({
                count,
                bucket,
            }))
    );

    if (sessionRows.length > 0) {
        console.log("\nSample rows:");
        console.log(
            sessionRows.slice(0, 10).map(row => ({
                date: row.date,
                ao_name: row.ao_name,
                q_ids: row.q_ids,
                attendee_ids: row.attendee_ids,
                attendance_review_status: row.attendance_review_status,
                postKey: linkRows.find(link => link.session_id === row.id)?.band_post_key,
            }))
        );
    }

    if (DRY_RUN) {
        console.log(`Prepared ${reviewDecisionRows.length} review decision rows`);
        console.log(`Prepared ${linkRows.length} backblast link rows`);
        console.log(`Prepared ${sessionRows.length} session rows`);
        console.log("\nDry run only. No rows inserted.");
        return;
    }

    await insertRows(sessionRows, linkRows, reviewDecisionRows);

    console.log(`Inserted ${sessionRows.length} sessions`);
    console.log(`Inserted ${linkRows.length} backblast links`);
}

main().catch(error => {
    console.error("Failed to create sessions from unmatched backblasts:", error);
    process.exit(1);
});