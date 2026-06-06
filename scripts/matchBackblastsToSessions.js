import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMPORT_DIR = path.join(__dirname, "../import");
const OUTPUT_DIR = path.join(__dirname, "../import/output");

const BACKBLASTS_PATH = path.join(OUTPUT_DIR, "band_backblasts_parsed.json");
const SESSIONS_PATH = path.join(IMPORT_DIR, "aggieland_sessions.json");
const MEMBERS_PATH = path.join(IMPORT_DIR, "aggieland_members.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "backblast_session_match_report.json");

const AO_CANONICAL_MAP = {
    blackops: "blackops",
    csaup: "csaup",

    cave: "thecave",
    thecave: "thecave",

    convergencecave: "convergencecave",

    dads: "dads",
    dadsthemine: "dadsthemine",

    forest: "theforest",
    theforest: "theforest",

    iron: "theiron",
    theiron: "theiron",

    keep: "thekeep",
    thekeep: "thekeep",

    mine: "themine",
    themine: "themine",

    rock: "therock",
    therock: "therock",

    southie: "southie",

    themoatam: "themoatam",
    themoatpm: "themoatpm",
    themoat: "themoat",

    thewatch: "thewatch",
    watch: "thewatch",
    thewatchw: "thewatchw",
    watchd: "thewatchd",

    franklin: "f3franklin",
    f3franklin: "f3franklin",
    theranch: "f3franklin",
    ranch: "f3franklin",

    austinscolony: "austinscolony",
    austincolony: "austinscolony",
};

function normalizeName(value = "") {
    return String(value)
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

function normalizeAo(value = "") {
    const normalized = normalizeName(value);
    return AO_CANONICAL_MAP[normalized] || normalized;
}

function getSessionAo(session) {
    return session.ao_name || session.aoName || "";
}

function getSessionDate(session) {
    return session.date || "";
}

function buildMemberMap(members = []) {
    const map = new Map();

    for (const member of members) {
        const id = member.id;
        const paxName = member.pax_name || member.paxName || "";

        if (id && paxName) {
            map.set(id, paxName);
        }
    }

    return map;
}

function getSessionQNames(session, memberMap) {
    const qIds = [];

    if (Array.isArray(session.q_ids)) {
        qIds.push(...session.q_ids);
    }

    if (session.q_id) {
        qIds.push(session.q_id);
    }

    return [...new Set(qIds)]
        .map(id => memberMap.get(id))
        .filter(Boolean);
}

function hasQOverlap(backblastQNames = [], sessionQNames = []) {
    const backblastNormalized = new Set(backblastQNames.map(normalizeName));

    return sessionQNames.some(name => backblastNormalized.has(normalizeName(name)));
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function findNearbyDateCandidates(backblast, sessionIndex, dayWindow = 3) {
    const matches = [];

    for (let offset = -dayWindow; offset <= dayWindow; offset += 1) {
        if (offset === 0) continue;

        const nearbyDate = addDays(backblast.date, offset);
        const key = `${nearbyDate}__${normalizeAo(backblast.aoName)}`;
        const candidates = sessionIndex.get(key) || [];

        for (const candidate of candidates) {
            matches.push({
                offset,
                session: candidate,
            });
        }
    }

    return matches;
}

function main() {
    const backblastInput = JSON.parse(fs.readFileSync(BACKBLASTS_PATH, "utf8"));
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf8"));
    const members = JSON.parse(fs.readFileSync(MEMBERS_PATH, "utf8"));

    const memberMap = buildMemberMap(members);

    const sessionRecords = sessions.map(session => ({
        id: session.id,
        date: getSessionDate(session),
        aoName: getSessionAo(session),
        normalizedAo: normalizeAo(getSessionAo(session)),
        qNames: getSessionQNames(session, memberMap),
        raw: session,
    }));

    const sessionIndex = new Map();

    for (const session of sessionRecords) {
        const key = `${session.date}__${session.normalizedAo}`;

        if (!sessionIndex.has(key)) {
            sessionIndex.set(key, []);
        }

        sessionIndex.get(key).push(session);
    }

    const exactMatches = [];
    const probableMatches = [];
    const ambiguousMatches = [];
    const unmatched = [];

    for (const backblast of backblastInput.posts || []) {
        if (!backblast.date || !backblast.aoName) {
            unmatched.push({
                reason: "missing_date_or_ao",
                backblast,
            });
            continue;
        }

        const key = `${backblast.date}__${normalizeAo(backblast.aoName)}`;
        const candidates = sessionIndex.get(key) || [];

        if (candidates.length === 0) {
            const nearbyCandidates = findNearbyDateCandidates(backblast, sessionIndex, 3);

            const nearbyQMatches = nearbyCandidates.filter(item =>
                hasQOverlap(backblast.qNames || [], item.session.qNames || [])
            );
            
            if (nearbyQMatches.length === 1) {
                exactMatches.push({
                    method: "nearby_date_ao_q",
                    confidence: 0.85,
                    dateOffset: nearbyQMatches[0].offset,
                    backblast: summarizeBackblast(backblast),
                    session: summarizeSession(nearbyQMatches[0].session),
                });
                continue;
            }

            if (nearbyCandidates.length === 1) {
                probableMatches.push({
                    method: "nearby_date_ao_single_session",
                    confidence: 0.7,
                    dateOffset: nearbyCandidates[0].offset,
                    backblast: summarizeBackblast(backblast),
                    session: summarizeSession(nearbyCandidates[0].session),
                });
                continue;
            }

            if (nearbyCandidates.length > 1) {
                ambiguousMatches.push({
                    method: "nearby_date_ao_multiple_sessions",
                    confidence: 0.45,
                    backblast: summarizeBackblast(backblast),
                    candidates: nearbyCandidates.map(item => ({
                        dateOffset: item.offset,
                        session: summarizeSession(item.session),
                    })),
                });
                continue;
            }

            unmatched.push({
                reason: "no_date_ao_match",
                backblast,
            });
            continue;
        }

        const qMatches = candidates.filter(session =>
            hasQOverlap(backblast.qNames || [], session.qNames || [])
        );

        if (qMatches.length === 1) {
            exactMatches.push({
                method: "date_ao_q",
                confidence: 0.95,
                backblast: summarizeBackblast(backblast),
                session: summarizeSession(qMatches[0]),
            });
            continue;
        }

        if (candidates.length === 1) {
            probableMatches.push({
                method: "date_ao_single_session",
                confidence: 0.8,
                backblast: summarizeBackblast(backblast),
                session: summarizeSession(candidates[0]),
            });
            continue;
        }

        ambiguousMatches.push({
            method: "date_ao_multiple_sessions",
            confidence: 0.5,
            backblast: summarizeBackblast(backblast),
            candidates: candidates.map(summarizeSession),
        });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        summary: {
            backblasts: backblastInput.posts?.length || 0,
            sessions: sessions.length,
            exactMatches: exactMatches.length,
            probableMatches: probableMatches.length,
            ambiguousMatches: ambiguousMatches.length,
            unmatched: unmatched.length,
            unmatchedReasons: unmatched.reduce((acc, item) => {
                acc[item.reason] = (acc[item.reason] || 0) + 1;
                return acc;
            }, {}),
            
            unmatchedAos: unmatched.reduce((acc, item) => {
                const ao = item.backblast?.aoName || "NO_AO";
                acc[ao] = (acc[ao] || 0) + 1;
                return acc;
            }, {}),
            
            unmatchedDateSources: unmatched.reduce((acc, item) => {
                const source = item.backblast?.dateSource || item.backblast?.inferenceSources?.date || "unknown";
                acc[source] = (acc[source] || 0) + 1;
                return acc;
            }, {}),
            matchMethods: [...exactMatches, ...probableMatches, ...ambiguousMatches].reduce((acc, item) => {
                acc[item.method] = (acc[item.method] || 0) + 1;
                return acc;
            }, {}),
        },
        exactMatches,
        probableMatches,
        ambiguousMatches,
        unmatched,
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("Match report generated");
    console.log(report.summary);
    console.log(`Output written to ${REPORT_PATH}`);
}

function summarizeBackblast(backblast) {
    return {
        postKey: backblast.postKey,
        date: backblast.date,
        aoName: backblast.aoName,
        qNames: backblast.qNames || [],
        authorName: backblast.authorName,
        workoutType: backblast.workoutType,
        dateSource: backblast.inferenceSources?.date,
        aoSource: backblast.inferenceSources?.ao,
        qSource: backblast.inferenceSources?.q,
        rawContent: backblast.rawContent || "",
        cleanedContent: backblast.cleanedContent || "",
    };
}

function summarizeSession(session) {
    return {
        id: session.id,
        date: session.date,
        aoName: session.aoName,
        qNames: session.qNames,
    };
}

main();