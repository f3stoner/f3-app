import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;

const SUPABASE_SESSIONS_PATH = path.join(REPO_ROOT, "audit/sessions_rows.csv");
const SUPABASE_MEMBERS_PATH = path.join(REPO_ROOT, "audit/attendance/members_rows.csv");
const PAX_MASTER_PATH = path.join(REPO_ROOT, "import/Pax_Master.csv");
const AGGIELAND_REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";

const CURRENT_AO_LOGS = [
    ["Forest", "import/Forest_Log.csv"],
    ["Cave", "import/Cave_Log.csv"],
    ["Iron", "import/Iron_Log.csv"],
    ["Keep", "import/Keep_Log.csv"],
    ["Rock", "import/Rock_Log.csv"],
    ["Mine", "import/Mine_Log.csv"],
    ["Southie", "import/Southie_Log.csv"],
    ["Watch", "import/Watch_Log.csv"],
    ["Dads", "import/Dads_Log.csv"],
    ["BlackOps", "import/BlackOps_Log.csv"],
    ["CSAUP", "import/CSAUP_Log.csv"],
    ["Other", "import/Other_Log.csv"],
];

const HISTORIC_LOG = ["Historic", "import/Historic_Log.csv"];
const BLACKOPS_SPLIT_AOS = new Set([
    "moat am",
    "moat pm",
    "run club",
    "austin's colony",
    "lbj",
]);
const NON_BUNDLED_SUPABASE_AOS = new Set([
    "f3 franklin",
    "moat am",
    "moat pm",
    "run club",
    "austin's colony",
    "lbj",
    "csaup",
]);

const HISTORIC_AO_CODE_MAP = {
    C: "Cave",
    F: "Forest",
    K: "Keep",
    R: "Rock",
    S: "Southie",
    M: "Mine",
    I: "Iron",
    W: "Watch",
    D: "Dads",
    B: "BlackOps",
    X: "CSAUP",
    Z: "Other",
};

function readCsv(filePath, options = {}) {
    const text = fs.readFileSync(filePath, "utf8");
    return parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
        ...options,
    });
}

function readTitledCsv(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    const withoutTitle = text.split(/\r?\n/).slice(1).join("\n");
    return parse(withoutTitle, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
    });
}

function normalizeDate(value) {
    if (!value) return null;

    const trimmed = String(value).trim();
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

    if (match) {
        let [, month, day, year] = match;
        if (year.length === 2) year = `20${year}`;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function getWeekdayNameFromDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    return date.toLocaleDateString("en-US", { weekday: "short" });
}

function normalizeAoName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^the\s+/, "");
}

function displayAoName(value) {
    const normalized = normalizeAoName(value);
    const labels = {
        forest: "The Forest",
        cave: "The Cave",
        iron: "The Iron",
        keep: "The Keep",
        rock: "The Rock",
        mine: "The Mine",
        southie: "Southie",
        watch: "The Watch",
        "watch (d)": "Watch (D)",
        "watch (w)": "Watch (W)",
        dads: "Dads",
        "dads (the mine)": "Dads (The Mine)",
        "convergence (cave)": "Convergence (Cave)",
        blackops: "BlackOps",
        csaup: "CSAUP",
        other: "Other",
    };
    return labels[normalized] || String(value || "Unknown AO").trim() || "Unknown AO";
}

function resolveImportedAoName(aoName, weekday) {
    const normalizedAo = normalizeAoName(aoName);
    const normalizedWeekday = String(weekday || "").trim().toLowerCase();

    if (normalizedAo === "watch") {
        if (normalizedWeekday.startsWith("tue")) return "Watch (D)";
        if (normalizedWeekday.startsWith("fri")) return "Watch (W)";
        return "Watch";
    }

    if (normalizedAo === "dads") return "Dads (The Mine)";

    if (normalizedAo === "cave" && normalizedWeekday.startsWith("sat")) {
        return "Convergence (Cave)";
    }

    return aoName;
}

function sessionKey(date, aoName, weekday = null) {
    const resolvedAo = resolveImportedAoName(aoName, weekday || getWeekdayNameFromDate(date));
    return `${date}|${normalizeAoName(resolvedAo)}`;
}

function normalizePaxKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function parseJsonField(value, fallback) {
    if (value == null || value === "") return fallback;
    if (Array.isArray(value) || typeof value === "object") return value;

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
}

function writeCsv(filePath, rows, headers) {
    const lines = [
        headers.join(","),
        ...rows.map(row => headers.map(header => csvEscape(row[header])).join(",")),
    ];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function ensureSession(map, key, seed) {
    if (!map.has(key)) {
        map.set(key, {
            key,
            date: seed.date,
            aoName: seed.aoName,
            sourceFiles: new Set(),
            attendanceNames: new Set(),
            qNames: new Set(),
            fngNames: [],
            unresolvedNames: [],
            duplicateRows: [],
        });
    }

    return map.get(key);
}

function decodeCurrentCode(rawCode) {
    const code = String(rawCode || "").trim().toUpperCase();
    const normalizedCode = code.replace(/[^A-Z]/g, "");

    return {
        code,
        isQ: normalizedCode.includes("Q"),
        isFng: code === "FNG",
    };
}

function decodeHistoricCode(rawCode) {
    const normalizedCode = String(rawCode || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[^A-Z]/g, "");

    const result = {
        normalizedCode,
        aoName: null,
        isAttendance: false,
        isQ: false,
        isFng: false,
        skipReason: null,
    };

    if (!normalizedCode) {
        result.skipReason = "Blank code";
        return result;
    }

    if (["DR", "DRQ", "DD"].includes(normalizedCode)) {
        result.skipReason = `Standalone ${normalizedCode} code with no AO`;
        result.isQ = normalizedCode === "DRQ";
        return result;
    }

    let remainingCode = normalizedCode;
    let keepParsing = true;

    while (keepParsing) {
        keepParsing = false;

        if (remainingCode.endsWith("FNG") && remainingCode !== "FNG") {
            result.isFng = true;
            remainingCode = remainingCode.slice(0, -3);
            keepParsing = true;
            continue;
        }

        if (remainingCode.endsWith("VQ") && remainingCode !== "VQ") {
            result.isQ = true;
            remainingCode = remainingCode.slice(0, -2);
            keepParsing = true;
            continue;
        }

        if (remainingCode.endsWith("DD") && remainingCode !== "DD") {
            remainingCode = remainingCode.slice(0, -2);
            keepParsing = true;
            continue;
        }

        if (remainingCode.endsWith("Q") && remainingCode !== "Q") {
            result.isQ = true;
            remainingCode = remainingCode.slice(0, -1);
            keepParsing = true;
        }
    }

    const aoName = HISTORIC_AO_CODE_MAP[remainingCode];
    if (!aoName) {
        result.skipReason = `Unknown AO code: ${remainingCode}`;
        return result;
    }

    result.aoName = aoName;
    result.isAttendance = true;
    return result;
}

function loadRoster() {
    const rows = readCsv(PAX_MASTER_PATH);
    const byName = new Map();
    const duplicates = [];

    for (const row of rows) {
        const paxName = String(row.Name || "").trim();
        if (!paxName) continue;

        const key = normalizePaxKey(paxName);
        if (byName.has(key)) {
            duplicates.push({
                normalizedName: key,
                firstName: byName.get(key).paxName,
                duplicateName: paxName,
            });
        }

        byName.set(key, {
            paxName,
            realName: String(row["Hospital Name"] || "").trim(),
            firstAo: String(row["First AO"] || "").trim(),
            proudPapa: String(row["Proud Papa"] || "").trim(),
            fngDate: String(row["FNG Date"] || "").trim(),
        });
    }

    return { rows, byName, duplicates };
}

function loadSupabaseMembers() {
    const rows = readCsv(SUPABASE_MEMBERS_PATH)
        .filter(row => String(row.region_id || "").trim() === AGGIELAND_REGION_ID);
    const byId = new Map();
    const byName = new Map();
    const duplicatePaxNames = [];

    for (const row of rows) {
        const id = String(row.id || "").trim();
        const paxName = String(row.pax_name || "").trim();
        const realName = String(row.real_name || "").trim();
        const normalizedName = normalizePaxKey(paxName || realName || id);

        if (!id) continue;

        const member = {
            id,
            regionId: String(row.region_id || "").trim(),
            paxName,
            realName,
            homeAo: String(row.home_ao || "").trim(),
            firstPostDate: String(row.first_post_date || "").trim(),
            invitedById: String(row.invited_by_id || "").trim(),
            status: String(row.status || "").trim(),
            normalizedName,
            displayName: paxName || realName || id,
        };

        byId.set(id, member);

        if (!byName.has(normalizedName)) {
            byName.set(normalizedName, []);
        }

        byName.get(normalizedName).push(member);
    }

    for (const [normalizedName, members] of byName.entries()) {
        if (members.length <= 1) continue;

        duplicatePaxNames.push({
            normalizedName,
            count: members.length,
            memberIds: members.map(member => member.id),
            names: members.map(member => member.displayName),
            activeCount: members.filter(member => member.status !== "inactive").length,
        });
    }

    duplicatePaxNames.sort((a, b) => b.count - a.count || a.normalizedName.localeCompare(b.normalizedName));

    return { rows, byId, byName, duplicatePaxNames };
}

function loadAggielandSessions(roster) {
    const sessions = new Map();
    const unmatchedNames = new Map();
    const sourceMemberCounts = new Map();
    const sourceAoTotals = new Map();
    const sourceCoverage = new Map();

    function addUnmatched(name, sourceFile) {
        const key = normalizePaxKey(name);
        if (!unmatchedNames.has(key)) {
            unmatchedNames.set(key, { paxName: name, sourceFiles: new Set(), count: 0 });
        }
        const entry = unmatchedNames.get(key);
        entry.sourceFiles.add(sourceFile);
        entry.count += 1;
    }

    function addAttendance({ date, aoName, weekday, paxName, code, sourceFile, isQ, isFng }) {
        const key = sessionKey(date, aoName, weekday);
        const resolvedAo = displayAoName(resolveImportedAoName(aoName, weekday || getWeekdayNameFromDate(date)));
        const normalizedAo = normalizeAoName(resolvedAo);
        const session = ensureSession(sessions, key, { date, aoName: resolvedAo });
        const normalizedPax = normalizePaxKey(paxName);
        const coverage = sourceCoverage.get(normalizedAo) || {
            normalizedAo,
            aoName: resolvedAo,
            minDate: date,
            maxDate: date,
            sourceFiles: new Set(),
        };

        session.sourceFiles.add(sourceFile);
        coverage.minDate = date < coverage.minDate ? date : coverage.minDate;
        coverage.maxDate = date > coverage.maxDate ? date : coverage.maxDate;
        coverage.sourceFiles.add(sourceFile);
        sourceCoverage.set(normalizedAo, coverage);

        if (session.attendanceNames.has(normalizedPax)) {
            session.duplicateRows.push({ paxName, code, sourceFile });
        }

        session.attendanceNames.add(normalizedPax);
        if (isQ) session.qNames.add(normalizedPax);
        if (isFng) session.fngNames.push(normalizedPax);

        sourceMemberCounts.set(normalizedPax, (sourceMemberCounts.get(normalizedPax) || 0) + 1);
        sourceAoTotals.set(resolvedAo, (sourceAoTotals.get(resolvedAo) || 0) + 1);

        if (!roster.byName.has(normalizedPax)) {
            addUnmatched(paxName, sourceFile);
        }
    }

    for (const [aoName, relativePath] of CURRENT_AO_LOGS) {
        const fullPath = path.join(REPO_ROOT, relativePath);
        const rows = readTitledCsv(fullPath);

        for (const row of rows) {
            const date = normalizeDate(row.Date);
            const paxName = String(row.Pax || "").trim();
            const weekday = String(row.Weekday || "").trim();
            if (!date || !paxName) continue;

            const decoded = decodeCurrentCode(row.Code);
            addAttendance({
                date,
                aoName,
                weekday,
                paxName,
                code: decoded.code,
                sourceFile: relativePath,
                isQ: decoded.isQ,
                isFng: decoded.isFng,
            });
        }
    }

    {
        const [aoName, relativePath] = HISTORIC_LOG;
        const rows = readTitledCsv(path.join(REPO_ROOT, relativePath));

        for (const row of rows) {
            const date = normalizeDate(row.Date);
            const paxName = String(row.Pax || "").trim();
            if (!date || !paxName) continue;

            const decoded = decodeHistoricCode(row.Code);
            if (!decoded.isAttendance) continue;

            addAttendance({
                date,
                aoName: decoded.aoName,
                weekday: String(row.Weekday || "").trim(),
                paxName,
                code: decoded.normalizedCode,
                sourceFile: relativePath,
                isQ: decoded.isQ,
                isFng: decoded.isFng,
            });
        }
    }

    return { sessions, unmatchedNames, sourceMemberCounts, sourceAoTotals, sourceCoverage };
}

function getSupabaseFngMemberIds(fngs) {
    return new Set(
        fngs
            .map(fng => fng.memberId || fng.member_id)
            .filter(Boolean)
    );
}

function loadSupabaseSessions(supabaseMembers) {
    const rows = readCsv(SUPABASE_SESSIONS_PATH);
    const sessions = new Map();
    const memberCounts = new Map();
    const aoTotals = new Map();
    const unresolvedPax = [];
    const unrosteredFngs = [];
    const duplicateRisks = [];
    const unresolvedUuids = new Map();
    const unresolvedSessionKeys = new Set();
    const uuidReferenceCounts = {
        attendee: 0,
        q: 0,
        fng: 0,
        total: 0,
        resolved: 0,
        unresolved: 0,
    };

    function recordUuid(memberId, type, sessionMeta) {
        if (!memberId) return;

        uuidReferenceCounts[type] += 1;
        uuidReferenceCounts.total += 1;

        if (supabaseMembers.byId.has(memberId)) {
            uuidReferenceCounts.resolved += 1;
            return;
        }

        uuidReferenceCounts.unresolved += 1;

        if (!unresolvedUuids.has(memberId)) {
            unresolvedUuids.set(memberId, {
                memberId,
                count: 0,
                types: new Set(),
                examples: [],
            });
        }

        const entry = unresolvedUuids.get(memberId);
        entry.count += 1;
        entry.types.add(type);

        if (entry.examples.length < 5) {
            entry.examples.push(sessionMeta);
        }
    }

    for (const row of rows) {
        if (String(row.region_id || "").trim() !== AGGIELAND_REGION_ID) continue;

        const date = String(row.date || "").trim();
        const rawAoName = String(row.ao_name || "").trim();
        if (!date || !rawAoName) continue;

        const qIds = unique([
            ...parseJsonField(row.q_ids, []),
            row.q_id,
        ]);
        const attendeeIds = unique(parseJsonField(row.attendee_ids, []));
        const fngs = parseJsonField(row.fngs, []);
        const unresolved = parseJsonField(row.unresolved_pax, []);
        const fngMemberIds = getSupabaseFngMemberIds(fngs);
        const rosteredAttendanceIds = new Set([...attendeeIds, ...fngMemberIds].filter(Boolean));
        const unrosteredFngCount = fngs.filter(fng => !(fng.memberId || fng.member_id)).length;
        const key = sessionKey(date, rawAoName);
        const aoName = displayAoName(resolveImportedAoName(rawAoName, getWeekdayNameFromDate(date)));
        const sessionMeta = { date, aoName, sessionId: row.id };

        attendeeIds.forEach(memberId => recordUuid(memberId, "attendee", sessionMeta));
        qIds.forEach(memberId => recordUuid(memberId, "q", sessionMeta));

        for (const fng of fngs) {
            const memberId = fng.memberId || fng.member_id;
            recordUuid(memberId, "fng", sessionMeta);

            if (!memberId) {
                unrosteredFngs.push({
                    date,
                    aoName,
                    sessionId: row.id,
                    paxName: fng.paxName || fng.pax_name || "",
                    realName: fng.realName || fng.real_name || "",
                    invitedById: fng.invitedById || fng.invited_by_id || "",
                });
            }
        }

        for (const memberId of rosteredAttendanceIds) {
            memberCounts.set(memberId, (memberCounts.get(memberId) || 0) + 1);
        }

        aoTotals.set(aoName, (aoTotals.get(aoName) || 0) + rosteredAttendanceIds.size + unrosteredFngCount);

        if (unresolved.length) {
            unresolvedSessionKeys.add(key);
            unresolvedPax.push(...unresolved.map(item => ({
                date,
                aoName,
                rawName: item.rawName || item.raw_name || "",
                normalizedName: item.normalizedName || item.normalized_name || "",
                reason: item.reason || "",
                code: item.code || "",
            })));
        }

        const duplicateAttendees = attendeeIds.filter((id, index) => attendeeIds.indexOf(id) !== index);
        if (duplicateAttendees.length) {
            duplicateRisks.push({
                date,
                aoName,
                type: "duplicate_attendee_ids",
                detail: unique(duplicateAttendees).join("; "),
            });
        }

        sessions.set(key, {
            key,
            id: row.id,
            date,
            aoName,
            attendeeIds,
            qIds,
            fngs,
            attendanceCount: rosteredAttendanceIds.size + unrosteredFngCount,
            fngCount: fngs.length,
            qCount: qIds.length,
            unresolvedCount: unresolved.length,
            rosteredAttendanceIds,
        });
    }

    return {
        sessions,
        memberCounts,
        aoTotals,
        unresolvedPax,
        unrosteredFngs,
        duplicateRisks,
        unresolvedUuids,
        unresolvedSessionKeys,
        uuidReferenceCounts,
    };
}

function compareSessions(aggieland, supabase) {
    const keys = [...new Set([...aggieland.sessions.keys(), ...supabase.sessions.keys()])].sort();
    const sourceBlackOpsDates = new Set(
        [...aggieland.sessions.values()]
            .filter(session => normalizeAoName(session.aoName) === "blackops")
            .map(session => session.date)
    );
    const supabaseBlackOpsSplitDates = new Set(
        [...supabase.sessions.values()]
            .filter(session => BLACKOPS_SPLIT_AOS.has(normalizeAoName(session.aoName)))
            .map(session => session.date)
    );

    return keys.map(key => {
        const source = aggieland.sessions.get(key);
        const db = supabase.sessions.get(key);
        const [date, normalizedAo] = key.split("|");
        const aoName = source?.aoName || db?.aoName || displayAoName(normalizedAo);
        const agAttendance = source?.attendanceNames.size || 0;
        const dbAttendance = db?.attendanceCount || 0;
        const agFng = source?.fngNames.length || 0;
        const dbFng = db?.fngCount || 0;
        const agQ = source?.qNames.size || 0;
        const dbQ = db?.qCount || 0;
        const coverage = aggieland.sourceCoverage.get(normalizedAo);
        let status = "extra_in_supabase";

        if (source && db) {
            status = "matched";
        } else if (source) {
            status = "missing_in_supabase";
        } else if (db && coverage?.maxDate && date > coverage.maxDate) {
            status = "outside_aggieland_csv_coverage";
        } else if (db && coverage?.minDate && date < coverage.minDate) {
            status = "before_aggieland_csv_coverage";
        }

        let classification = "needs_review";
        if (status === "outside_aggieland_csv_coverage" || status === "before_aggieland_csv_coverage") {
            classification = status;
        } else if (
            normalizedAo === "blackops" &&
            source &&
            !db &&
            supabaseBlackOpsSplitDates.has(date)
        ) {
            classification = "blackops_split_ao_mapping";
        } else if (
            db &&
            !source &&
            BLACKOPS_SPLIT_AOS.has(normalizedAo) &&
            sourceBlackOpsDates.has(date)
        ) {
            classification = "blackops_split_ao_mapping";
        } else if (db && !source && NON_BUNDLED_SUPABASE_AOS.has(normalizedAo)) {
            classification = "non_bundled_ao_session_source";
        } else if (db && source && dbAttendance === agAttendance && dbFng !== agFng) {
            classification = "fng_code_interpretation";
        } else if (db && source && dbAttendance !== agAttendance && supabase.unresolvedSessionKeys.has(key)) {
            classification = "unresolved_pax_related";
        }

        return {
            key,
            date,
            ao_name: aoName,
            ag_attendance_count: agAttendance,
            supabase_attendance_count: dbAttendance,
            attendance_delta: dbAttendance - agAttendance,
            ag_fng_count: agFng,
            supabase_fng_count: dbFng,
            fng_delta: dbFng - agFng,
            ag_q_count: agQ,
            supabase_q_count: dbQ,
            q_delta: dbQ - agQ,
            source_files: source ? [...source.sourceFiles].join("; ") : "",
            supabase_session_id: db?.id || "",
            status,
            classification,
        };
    });
}

function compareMembers(aggieland, supabase, roster, supabaseMembers) {
    const supabaseByKnownName = new Map();

    for (const [memberId, count] of supabase.memberCounts.entries()) {
        const member = supabaseMembers.byId.get(memberId);
        if (!member) continue;

        const key = member.normalizedName;
        const existing = supabaseByKnownName.get(key) || { count: 0, memberIds: [] };
        existing.count += count;
        existing.memberIds.push(memberId);
        supabaseByKnownName.set(key, existing);
    }

    const keys = [...new Set([
        ...aggieland.sourceMemberCounts.keys(),
        ...supabaseByKnownName.keys(),
    ])].sort();

    return keys.map(key => {
        const rosterEntry = roster.byName.get(key);
        const sourceCount = aggieland.sourceMemberCounts.get(key) || 0;
        const dbEntry = supabaseByKnownName.get(key);
        const dbCount = dbEntry?.count ?? "";
        const delta = dbEntry ? dbEntry.count - sourceCount : "";

        return {
            pax_name: rosterEntry?.paxName || supabaseMembers.byName.get(key)?.[0]?.displayName || key,
            ag_post_count: sourceCount,
            supabase_post_count: dbCount,
            delta,
            supabase_member_ids: dbEntry?.memberIds.join("; ") || "",
            resolution_status: dbEntry ? "resolved_by_members_export" : "not_found_in_members_export",
        };
    });
}

function compareAoTotals(aggieland, supabase) {
    const names = [...new Set([...aggieland.sourceAoTotals.keys(), ...supabase.aoTotals.keys()])].sort();

    return names.map(aoName => {
        const ag = aggieland.sourceAoTotals.get(aoName) || 0;
        const db = supabase.aoTotals.get(aoName) || 0;

        return {
            aoName,
            ag,
            db,
            delta: db - ag,
        };
    });
}

function isCoverageStatus(status) {
    return status === "outside_aggieland_csv_coverage" ||
        status === "before_aggieland_csv_coverage";
}

function summarizeCoverageRows(rows) {
    const byAo = new Map();

    for (const row of rows) {
        const existing = byAo.get(row.ao_name) || {
            aoName: row.ao_name,
            count: 0,
            minDate: row.date,
            maxDate: row.date,
            totalSupabaseAttendance: 0,
        };

        existing.count += 1;
        existing.minDate = row.date < existing.minDate ? row.date : existing.minDate;
        existing.maxDate = row.date > existing.maxDate ? row.date : existing.maxDate;
        existing.totalSupabaseAttendance += Number(row.supabase_attendance_count || 0);
        byAo.set(row.ao_name, existing);
    }

    return [...byAo.values()]
        .sort((a, b) => b.count - a.count || a.aoName.localeCompare(b.aoName));
}

function countBy(values, getKey) {
    const counts = new Map();

    for (const value of values) {
        const key = getKey(value);
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    return [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function isNonActionableClassification(classification) {
    return classification === "outside_aggieland_csv_coverage" ||
        classification === "before_aggieland_csv_coverage" ||
        classification === "blackops_split_ao_mapping" ||
        classification === "non_bundled_ao_session_source";
}

function normalizeIdentityPairName(name) {
    return normalizePaxKey(name)
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function findIdentitySplitPairs(memberRows) {
    const byBaseName = new Map();

    for (const row of memberRows) {
        const delta = Number(row.delta || 0);
        if (!delta) continue;

        const baseName = normalizeIdentityPairName(row.pax_name);
        if (!baseName) continue;

        if (!byBaseName.has(baseName)) byBaseName.set(baseName, []);
        byBaseName.get(baseName).push({
            ...row,
            delta,
            hasIdentitySuffix: baseName !== normalizePaxKey(row.pax_name),
        });
    }

    return [...byBaseName.entries()]
        .map(([baseName, rows]) => {
            if (rows.length <= 1 || !rows.some(row => row.hasIdentitySuffix)) return null;

            const positiveRows = rows.filter(row => row.delta > 0);
            const negativeRows = rows.filter(row => row.delta < 0);
            if (!positiveRows.length || !negativeRows.length) return null;

            return {
                baseName,
                names: rows.map(row => row.pax_name).join(" / "),
                netDelta: rows.reduce((total, row) => total + row.delta, 0),
                totalAbsDelta: rows.reduce((total, row) => total + Math.abs(row.delta), 0),
                details: rows
                    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                    .map(row => `${row.pax_name}: ${row.delta}`)
                    .join("; "),
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.totalAbsDelta - a.totalAbsDelta || a.baseName.localeCompare(b.baseName));
}

function buildReport({ sessionRows, memberRows, aoRows, aggieland, supabase, roster, supabaseMembers }) {
    const mismatchedSessions = sessionRows
        .filter(row => row.attendance_delta || row.fng_delta || row.q_delta || row.status !== "matched")
        .sort((a, b) => Math.abs(b.attendance_delta) - Math.abs(a.attendance_delta));

    const coverageSessionRows = mismatchedSessions.filter(row => isCoverageStatus(row.status));
    const trueMismatchedSessions = mismatchedSessions.filter(row => !isCoverageStatus(row.status));
    const classificationCounts = countBy(mismatchedSessions, row => row.classification || "needs_review");
    const actionableMismatchedSessions = trueMismatchedSessions
        .filter(row => !isNonActionableClassification(row.classification))
        .sort((a, b) => Math.abs(b.attendance_delta) - Math.abs(a.attendance_delta));
    const knownNonActionableRows = trueMismatchedSessions
        .filter(row => isNonActionableClassification(row.classification))
        .sort((a, b) =>
            (a.classification || "").localeCompare(b.classification || "") ||
            Math.abs(b.attendance_delta) - Math.abs(a.attendance_delta)
        );
    const outsideCoverageSummary = summarizeCoverageRows(
        coverageSessionRows.filter(row => row.status === "outside_aggieland_csv_coverage")
    );
    const beforeCoverageSummary = summarizeCoverageRows(
        coverageSessionRows.filter(row => row.status === "before_aggieland_csv_coverage")
    );
    const top25 = trueMismatchedSessions.slice(0, 25);
    const unmatchedNames = [...aggieland.unmatchedNames.values()]
        .sort((a, b) => b.count - a.count || a.paxName.localeCompare(b.paxName));
    const sourceDuplicateRows = [...aggieland.sessions.values()]
        .flatMap(session => session.duplicateRows.map(row => ({
            date: session.date,
            aoName: session.aoName,
            paxName: row.paxName,
            code: row.code,
            sourceFile: row.sourceFile,
        })));
    const memberUnresolvedCount = memberRows.filter(row => row.resolution_status !== "resolved_by_members_export").length;
    const resolvedUuidRate = supabase.uuidReferenceCounts.total
        ? ((supabase.uuidReferenceCounts.resolved / supabase.uuidReferenceCounts.total) * 100).toFixed(1)
        : "100.0";
    const unresolvedUuidRows = [...supabase.unresolvedUuids.values()]
        .sort((a, b) => b.count - a.count || a.memberId.localeCompare(b.memberId));
    const topMemberMismatchRows = memberRows
        .filter(row => row.delta === "" || Number(row.delta) !== 0)
        .sort((a, b) => Math.abs(Number(b.delta || 0)) - Math.abs(Number(a.delta || 0)))
        .slice(0, 25);
    const identitySplitPairs = findIdentitySplitPairs(memberRows);

    const lines = [];
    lines.push("# Attendance Comparison Audit");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Inputs");
    lines.push("");
    lines.push(`- Supabase sessions export: \`${path.relative(REPO_ROOT, SUPABASE_SESSIONS_PATH)}\``);
    lines.push(`- Supabase members export: \`${path.relative(REPO_ROOT, SUPABASE_MEMBERS_PATH)}\``);
    lines.push(`- Roster lookup: \`${path.relative(REPO_ROOT, PAX_MASTER_PATH)}\``);
    lines.push("- Current AO logs:");
    CURRENT_AO_LOGS.forEach(([, file]) => lines.push(`  - \`${file}\``));
    lines.push(`- Historical log: \`${HISTORIC_LOG[1]}\``);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Supabase region filter: ${AGGIELAND_REGION_ID}`);
    lines.push(`- Aggieland sessions: ${aggieland.sessions.size}`);
    lines.push(`- Supabase sessions: ${supabase.sessions.size}`);
    lines.push(`- Supabase members: ${supabaseMembers.rows.length}`);
    lines.push(`- Session rows compared: ${sessionRows.length}`);
    lines.push(`- Session mismatches: ${mismatchedSessions.length}`);
    lines.push(`- True session mismatches: ${trueMismatchedSessions.length}`);
    lines.push(`- Actionable session mismatches: ${actionableMismatchedSessions.length}`);
    lines.push(`- Sessions outside bundled CSV coverage: ${outsideCoverageSummary.reduce((total, row) => total + row.count, 0)}`);
    lines.push(`- Sessions before bundled CSV coverage: ${beforeCoverageSummary.reduce((total, row) => total + row.count, 0)}`);
    lines.push(`- Aggieland unmatched names vs Pax_Master: ${unmatchedNames.length}`);
    lines.push(`- Supabase unresolved_pax entries: ${supabase.unresolvedPax.length}`);
    lines.push(`- Supabase unrostered FNG rows: ${supabase.unrosteredFngs.length}`);
    lines.push(`- Supabase unresolved UUIDs: ${unresolvedUuidRows.length}`);
    lines.push(`- Pax_Master duplicate normalized names: ${roster.duplicates.length}`);
    lines.push(`- Supabase duplicate normalized pax_name risks: ${supabaseMembers.duplicatePaxNames.length}`);
    lines.push(`- Source duplicate attendance rows: ${sourceDuplicateRows.length}`);
    lines.push(`- Member rows not found in members export: ${memberUnresolvedCount}`);
    lines.push("");
    lines.push("## Mismatch Counts By Classification");
    lines.push("");
    lines.push("| Classification | Count |");
    lines.push("|---|---:|");
    classificationCounts.forEach(row => {
        lines.push(`| ${row.key} | ${row.count} |`);
    });
    lines.push("");
    lines.push("## Member Name Resolution Rate");
    lines.push("");
    lines.push(`- UUID references resolved: ${supabase.uuidReferenceCounts.resolved} / ${supabase.uuidReferenceCounts.total} (${resolvedUuidRate}%)`);
    lines.push(`- Attendee UUID references: ${supabase.uuidReferenceCounts.attendee}`);
    lines.push(`- Q UUID references: ${supabase.uuidReferenceCounts.q}`);
    lines.push(`- FNG member UUID references: ${supabase.uuidReferenceCounts.fng}`);
    lines.push(`- Unresolved UUID references: ${supabase.uuidReferenceCounts.unresolved}`);
    lines.push(`- Distinct unresolved UUIDs: ${unresolvedUuidRows.length}`);
    lines.push("");
    lines.push("## AO Totals");
    lines.push("");
    lines.push("| AO | Aggieland | Supabase | Delta |");
    lines.push("|---|---:|---:|---:|");
    aoRows.forEach(row => {
        lines.push(`| ${row.aoName} | ${row.ag} | ${row.db} | ${row.delta} |`);
    });
    lines.push("");
    lines.push("## Sessions Outside Bundled CSV Coverage");
    lines.push("");
    lines.push("### After source max date");
    lines.push("");
    if (!outsideCoverageSummary.length) {
        lines.push("- None");
    } else {
        lines.push("| AO | Count | Min Date | Max Date | Supabase Attendance |");
        lines.push("|---|---:|---|---|---:|");
        outsideCoverageSummary.forEach(row => {
            lines.push(`| ${row.aoName} | ${row.count} | ${row.minDate} | ${row.maxDate} | ${row.totalSupabaseAttendance} |`);
        });
    }
    lines.push("");
    lines.push("### Before source min date");
    lines.push("");
    if (!beforeCoverageSummary.length) {
        lines.push("- None");
    } else {
        lines.push("| AO | Count | Min Date | Max Date | Supabase Attendance |");
        lines.push("|---|---:|---|---|---:|");
        beforeCoverageSummary.forEach(row => {
            lines.push(`| ${row.aoName} | ${row.count} | ${row.minDate} | ${row.maxDate} | ${row.totalSupabaseAttendance} |`);
        });
    }
    lines.push("");
    lines.push("## Actionable Session Mismatches");
    lines.push("");
    lines.push("| Date | AO | Aggieland | Supabase | Delta | FNG Delta | Q Delta | Status | Classification |");
    lines.push("|---|---|---:|---:|---:|---:|---:|---|---|");
    actionableMismatchedSessions.slice(0, 50).forEach(row => {
        lines.push(`| ${row.date} | ${row.ao_name} | ${row.ag_attendance_count} | ${row.supabase_attendance_count} | ${row.attendance_delta} | ${row.fng_delta} | ${row.q_delta} | ${row.status} | ${row.classification} |`);
    });
    if (!actionableMismatchedSessions.length) lines.push("| None | | | | | | | | |");
    lines.push("");
    lines.push("## Known Non-Actionable Mismatches");
    lines.push("");
    lines.push("| Date | AO | Aggieland | Supabase | Delta | Status | Classification |");
    lines.push("|---|---|---:|---:|---:|---|---|");
    knownNonActionableRows.slice(0, 75).forEach(row => {
        lines.push(`| ${row.date} | ${row.ao_name} | ${row.ag_attendance_count} | ${row.supabase_attendance_count} | ${row.attendance_delta} | ${row.status} | ${row.classification} |`);
    });
    if (!knownNonActionableRows.length) lines.push("| None | | | | | | |");
    lines.push("");
    lines.push("## Unmatched Names / Unresolved PAX");
    lines.push("");
    lines.push("### Aggieland names not found in Pax_Master");
    lines.push("");
    if (!unmatchedNames.length) {
        lines.push("- None");
    } else {
        unmatchedNames.slice(0, 50).forEach(row => {
            lines.push(`- ${row.paxName}: ${row.count} row(s), files: ${[...row.sourceFiles].join(", ")}`);
        });
    }
    lines.push("");
    lines.push("### Supabase unresolved_pax");
    lines.push("");
    if (!supabase.unresolvedPax.length) {
        lines.push("- None");
    } else {
        supabase.unresolvedPax.slice(0, 50).forEach(row => {
            lines.push(`- ${row.date} ${row.aoName}: ${row.rawName || row.normalizedName} (${row.reason || "unknown reason"}, code ${row.code || "-"})`);
        });
    }
    lines.push("");
    lines.push("### Supabase unrostered FNGs");
    lines.push("");
    if (!supabase.unrosteredFngs.length) {
        lines.push("- None");
    } else {
        supabase.unrosteredFngs.slice(0, 50).forEach(row => {
            const name = row.paxName || row.realName || "Unnamed FNG";
            lines.push(`- ${row.date} ${row.aoName}: ${name}`);
        });
    }
    lines.push("");
    lines.push("## Unresolved UUIDs");
    lines.push("");
    if (!unresolvedUuidRows.length) {
        lines.push("- None");
    } else {
        unresolvedUuidRows.slice(0, 50).forEach(row => {
            const example = row.examples[0];
            lines.push(`- ${row.memberId}: ${row.count} reference(s), types ${[...row.types].join("/")}, example ${example?.date || "-"} ${example?.aoName || ""}`);
        });
    }
    lines.push("");
    lines.push("## Duplicate Name Risks");
    lines.push("");
    lines.push("### Pax_Master duplicate normalized names");
    lines.push("");
    if (!roster.duplicates.length) {
        lines.push("- None");
    } else {
        roster.duplicates.forEach(row => {
            lines.push(`- ${row.normalizedName}: ${row.firstName} / ${row.duplicateName}`);
        });
    }
    lines.push("");
    lines.push("### Supabase members duplicate normalized pax_name risks");
    lines.push("");
    if (!supabaseMembers.duplicatePaxNames.length) {
        lines.push("- None");
    } else {
        supabaseMembers.duplicatePaxNames.slice(0, 25).forEach(row => {
            lines.push(`- ${row.normalizedName}: ${row.count} members (${row.activeCount} active), ids ${row.memberIds.join(", ")}`);
        });
    }
    lines.push("");
    lines.push("### Duplicate source attendance rows");
    lines.push("");
    if (!sourceDuplicateRows.length) {
        lines.push("- None");
    } else {
        sourceDuplicateRows.slice(0, 50).forEach(row => {
            lines.push(`- ${row.date} ${row.aoName}: ${row.paxName} (${row.code || "blank"}, ${row.sourceFile})`);
        });
    }
    lines.push("");
    lines.push("### Supabase duplicate risks");
    lines.push("");
    if (!supabase.duplicateRisks.length) {
        lines.push("- None");
    } else {
        supabase.duplicateRisks.forEach(row => {
            lines.push(`- ${row.date} ${row.aoName}: ${row.type} ${row.detail}`);
        });
    }
    lines.push("");
    lines.push("## Top 25 Member Mismatches After UUID Resolution");
    lines.push("");
    lines.push("| PAX | Aggieland Posts | Supabase Posts | Delta | Status |");
    lines.push("|---|---:|---:|---:|---|");
    topMemberMismatchRows.forEach(row => {
        lines.push(`| ${row.pax_name} | ${row.ag_post_count} | ${row.supabase_post_count} | ${row.delta} | ${row.resolution_status} |`);
    });
    lines.push("");
    lines.push("## Top Identity Split Pairs");
    lines.push("");
    if (!identitySplitPairs.length) {
        lines.push("- None");
    } else {
        lines.push("| Base Name | Names | Total Abs Delta | Net Delta | Details |");
        lines.push("|---|---|---:|---:|---|");
        identitySplitPairs.slice(0, 25).forEach(row => {
            lines.push(`| ${row.baseName} | ${row.names} | ${row.totalAbsDelta} | ${row.netDelta} | ${row.details} |`);
        });
    }
    lines.push("");
    lines.push("## Generated Files");
    lines.push("");
    lines.push("- `audit/attendance/session-mismatches.csv`");
    lines.push("- `audit/attendance/member-mismatches.csv`");

    return `${lines.join("\n")}\n`;
}

function main() {
    const missingInputs = [
        SUPABASE_SESSIONS_PATH,
        SUPABASE_MEMBERS_PATH,
        PAX_MASTER_PATH,
        ...CURRENT_AO_LOGS.map(([, file]) => path.join(REPO_ROOT, file)),
        path.join(REPO_ROOT, HISTORIC_LOG[1]),
    ].filter(file => !fs.existsSync(file));

    if (missingInputs.length) {
        throw new Error(`Missing input file(s):\n${missingInputs.map(file => `- ${path.relative(REPO_ROOT, file)}`).join("\n")}`);
    }

    const roster = loadRoster();
    const supabaseMembers = loadSupabaseMembers();
    const aggieland = loadAggielandSessions(roster);
    const supabase = loadSupabaseSessions(supabaseMembers);
    const sessionRows = compareSessions(aggieland, supabase);
    const memberRows = compareMembers(aggieland, supabase, roster, supabaseMembers);
    const aoRows = compareAoTotals(aggieland, supabase);

    const sessionMismatchRows = sessionRows
        .filter(row => row.attendance_delta || row.fng_delta || row.q_delta || row.status !== "matched")
        .sort((a, b) => Math.abs(b.attendance_delta) - Math.abs(a.attendance_delta));
    const memberMismatchRows = memberRows
        .filter(row => row.delta === "" || Number(row.delta) !== 0)
        .sort((a, b) => Math.abs(Number(b.delta || 0)) - Math.abs(Number(a.delta || 0)));

    writeCsv(
        path.join(OUT_DIR, "session-mismatches.csv"),
        sessionMismatchRows,
        [
            "date",
            "ao_name",
            "ag_attendance_count",
            "supabase_attendance_count",
            "attendance_delta",
            "ag_fng_count",
            "supabase_fng_count",
            "fng_delta",
            "ag_q_count",
            "supabase_q_count",
            "q_delta",
            "status",
            "classification",
            "source_files",
            "supabase_session_id",
            "key",
        ]
    );

    writeCsv(
        path.join(OUT_DIR, "member-mismatches.csv"),
        memberMismatchRows,
        [
            "pax_name",
            "ag_post_count",
            "supabase_post_count",
            "delta",
            "supabase_member_ids",
            "resolution_status",
        ]
    );

    fs.writeFileSync(
        path.join(OUT_DIR, "report.md"),
        buildReport({ sessionRows, memberRows, aoRows, aggieland, supabase, roster, supabaseMembers })
    );

    console.log("Attendance audit complete.");
    console.log(`Session mismatches: ${sessionMismatchRows.length}`);
    console.log(`Member mismatches: ${memberMismatchRows.length}`);
    console.log(`Report: ${path.relative(REPO_ROOT, path.join(OUT_DIR, "report.md"))}`);
}

main();
