import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;

const SUPABASE_SESSIONS_PATH = path.join(REPO_ROOT, "audit/sessions_rows.csv");
const PAX_MASTER_PATH = path.join(REPO_ROOT, "public/Pax_Master.csv");
const AGGIELAND_REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";

const CURRENT_AO_LOGS = [
    ["Forest", "public/Forest_Log.csv"],
    ["Cave", "public/Cave_Log.csv"],
    ["Iron", "public/Iron_Log.csv"],
    ["Keep", "public/Keep_Log.csv"],
    ["Rock", "public/Rock_Log.csv"],
    ["Mine", "public/Mine_Log.csv"],
    ["Southie", "public/Southie_Log.csv"],
    ["Watch", "public/Watch_Log.csv"],
    ["Dads", "public/Dads_Log.csv"],
    ["BlackOps", "public/BlackOps_Log.csv"],
    ["CSAUP", "public/CSAUP_Log.csv"],
    ["Other", "public/Other_Log.csv"],
];

const HISTORIC_LOG = ["Historic", "public/Historic_Log.csv"];

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

function loadAggielandSessions(roster) {
    const sessions = new Map();
    const unmatchedNames = new Map();
    const sourceMemberCounts = new Map();
    const sourceAoTotals = new Map();

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
        const session = ensureSession(sessions, key, { date, aoName: resolvedAo });
        const normalizedPax = normalizePaxKey(paxName);

        session.sourceFiles.add(sourceFile);

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

    return { sessions, unmatchedNames, sourceMemberCounts, sourceAoTotals };
}

function getSupabaseFngMemberIds(fngs) {
    return new Set(
        fngs
            .map(fng => fng.memberId || fng.member_id)
            .filter(Boolean)
    );
}

function loadSupabaseSessions() {
    const rows = readCsv(SUPABASE_SESSIONS_PATH);
    const sessions = new Map();
    const memberCounts = new Map();
    const memberNames = new Map();
    const aoTotals = new Map();
    const unresolvedPax = [];
    const duplicateRisks = [];

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

        for (const fng of fngs) {
            const memberId = fng.memberId || fng.member_id;
            const paxName = fng.paxName || fng.pax_name || fng.realName || fng.real_name;
            if (memberId && paxName) memberNames.set(memberId, paxName);
        }

        for (const memberId of rosteredAttendanceIds) {
            memberCounts.set(memberId, (memberCounts.get(memberId) || 0) + 1);
        }

        aoTotals.set(aoName, (aoTotals.get(aoName) || 0) + rosteredAttendanceIds.size + unrosteredFngCount);

        if (unresolved.length) {
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

    return { sessions, memberCounts, memberNames, aoTotals, unresolvedPax, duplicateRisks };
}

function compareSessions(aggieland, supabase) {
    const keys = [...new Set([...aggieland.sessions.keys(), ...supabase.sessions.keys()])].sort();

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
            status: source && db ? "matched" : source ? "missing_in_supabase" : "extra_in_supabase",
        };
    });
}

function compareMembers(aggieland, supabase, roster) {
    const supabaseByKnownName = new Map();

    for (const [memberId, count] of supabase.memberCounts.entries()) {
        const paxName = supabase.memberNames.get(memberId);
        if (!paxName) continue;

        const key = normalizePaxKey(paxName);
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
            pax_name: rosterEntry?.paxName || key,
            ag_post_count: sourceCount,
            supabase_post_count: dbCount,
            delta,
            supabase_member_ids: dbEntry?.memberIds.join("; ") || "",
            resolution_status: dbEntry ? "resolved_by_fng_metadata" : "not_resolvable_from_sessions_export",
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

function buildReport({ sessionRows, memberRows, aoRows, aggieland, supabase, roster }) {
    const mismatchedSessions = sessionRows
        .filter(row => row.attendance_delta || row.fng_delta || row.q_delta || row.status !== "matched")
        .sort((a, b) => Math.abs(b.attendance_delta) - Math.abs(a.attendance_delta));

    const top25 = mismatchedSessions.slice(0, 25);
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
    const memberUnresolvedCount = memberRows.filter(row => row.resolution_status !== "resolved_by_fng_metadata").length;

    const lines = [];
    lines.push("# Attendance Comparison Audit");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Inputs");
    lines.push("");
    lines.push(`- Supabase sessions export: \`${path.relative(REPO_ROOT, SUPABASE_SESSIONS_PATH)}\``);
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
    lines.push(`- Session rows compared: ${sessionRows.length}`);
    lines.push(`- Session mismatches: ${mismatchedSessions.length}`);
    lines.push(`- Aggieland unmatched names vs Pax_Master: ${unmatchedNames.length}`);
    lines.push(`- Supabase unresolved_pax entries: ${supabase.unresolvedPax.length}`);
    lines.push(`- Pax_Master duplicate normalized names: ${roster.duplicates.length}`);
    lines.push(`- Source duplicate attendance rows: ${sourceDuplicateRows.length}`);
    lines.push(`- Member rows not resolvable from sessions export alone: ${memberUnresolvedCount}`);
    lines.push("");
    lines.push("## AO Totals");
    lines.push("");
    lines.push("| AO | Aggieland | Supabase | Delta |");
    lines.push("|---|---:|---:|---:|");
    aoRows.forEach(row => {
        lines.push(`| ${row.aoName} | ${row.ag} | ${row.db} | ${row.delta} |`);
    });
    lines.push("");
    lines.push("## Top 25 Session Mismatches");
    lines.push("");
    lines.push("| Date | AO | Aggieland | Supabase | Delta | FNG Delta | Q Delta | Status |");
    lines.push("|---|---|---:|---:|---:|---:|---:|---|");
    top25.forEach(row => {
        lines.push(`| ${row.date} | ${row.ao_name} | ${row.ag_attendance_count} | ${row.supabase_attendance_count} | ${row.attendance_delta} | ${row.fng_delta} | ${row.q_delta} | ${row.status} |`);
    });
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
    lines.push("## Member Comparison Limitation");
    lines.push("");
    lines.push("The Supabase sessions export contains attendee UUIDs but does not include the full members table. This script resolves Supabase member names only when a session FNG row embeds `paxName` for a `memberId`. For full member-level name comparison, add a members export with member IDs and PAX names.");
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
        PAX_MASTER_PATH,
        ...CURRENT_AO_LOGS.map(([, file]) => path.join(REPO_ROOT, file)),
        path.join(REPO_ROOT, HISTORIC_LOG[1]),
    ].filter(file => !fs.existsSync(file));

    if (missingInputs.length) {
        throw new Error(`Missing input file(s):\n${missingInputs.map(file => `- ${path.relative(REPO_ROOT, file)}`).join("\n")}`);
    }

    const roster = loadRoster();
    const aggieland = loadAggielandSessions(roster);
    const supabase = loadSupabaseSessions();
    const sessionRows = compareSessions(aggieland, supabase);
    const memberRows = compareMembers(aggieland, supabase, roster);
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
        buildReport({ sessionRows, memberRows, aoRows, aggieland, supabase, roster })
    );

    console.log("Attendance audit complete.");
    console.log(`Session mismatches: ${sessionMismatchRows.length}`);
    console.log(`Member mismatches: ${memberMismatchRows.length}`);
    console.log(`Report: ${path.relative(REPO_ROOT, path.join(OUT_DIR, "report.md"))}`);
}

main();
