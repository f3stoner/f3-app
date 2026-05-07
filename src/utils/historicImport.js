import Papa from "papaparse";

const AO_CODE_MAP = {
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

const FLAG_SUFFIXES = ["FNG", "VQ", "DD", "Q"];

export function decodeHistoricCode(rawCode) {
    const originalCode = String(rawCode || "");
    const normalizedCode = originalCode
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[^A-Z]/g, "");

    const result = {
        rawCode,
        normalizedCode,
        aoCode: null,
        aoName: null,
        isAttendance: false,
        isQ: false,
        isFng: false,
        isVq: false,
        isDd: false,
        skip: false,
        skipReason: null,
    };

    if (normalizedCode === "DR") {
        result.skip = true;
        result.skipReason = "Standalone DR code with no AO";
        return result;
    }

    if (normalizedCode === "DRQ") {
        result.isQ = true;
        result.skip = true;
        result.skipReason = "Standalone DRQ code with no AO";
        return result;
    }

    if (!normalizedCode) {
        result.skip = true;
        result.skipReason = "Blank code";
        return result;
    }

    if (normalizedCode === "DD") {
        result.isDd = true;
        result.skip = true;
        result.skipReason = "Standalone DD code with no AO";
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
            result.isVq = true;
            result.isQ = true; // VQ counts as Q
            remainingCode = remainingCode.slice(0, -2);
            keepParsing = true;
            continue;
        }

        if (remainingCode.endsWith("DD") && remainingCode !== "DD") {
            result.isDd = true;
            remainingCode = remainingCode.slice(0, -2);
            keepParsing = true;
            continue;
        }

        if (remainingCode.endsWith("Q") && remainingCode !== "Q") {
            result.isQ = true;
            remainingCode = remainingCode.slice(0, -1);
            keepParsing = true;
            continue;
        }
    }

    const aoCode = remainingCode.trim();

    if (!AO_CODE_MAP[aoCode]) {
        result.skip = true;
        result.skipReason = `Unknown AO code: ${aoCode}`;
        return result;
    }

    result.aoCode = aoCode;
    result.aoName = AO_CODE_MAP[aoCode];
    result.isAttendance = true;

    return result;
}

export function parseHistoricCsvText(csvText) {
    const cleanedCsvText = csvText.split("\n").slice(1).join("\n");

    const { data, errors } = Papa.parse(cleanedCsvText, {
        header: true,
        skipEmptyLines: true,
        trimHeaders: true,
    });

    if (errors.length) {
        console.error(errors);
        throw new Error("Historic CSV parse failed");
    }

    return data;
}

function normalizeHistoricDate(value) {
    const trimmed = String(value || "").trim();

    if (!trimmed) return null;

    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
        let [, month, day, year] = match;

        if (year.length === 2) {
            year = `20${year}`;
        }

        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toISOString().split("T")[0];
}

export function normalizePaxName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/^dr\.\s*/i, "")            
        .replace(/\(.*?\)/g, "")           
        .replace(/[^a-z0-9]/g, "")         
        .replace(/\s+/g, " ")
        .trim();
}

export function parseHistoricRow(row) {
    const rawDate = String(row["Date"] || "").trim();
    const paxName = String(row["Pax"] || row["PAX"] || "").trim();
    const rawCode = String(row["Code"] || row["code"] || "").trim();

    const result = {
        date: null,
        paxName,
        rawCode,
        weekday: String(row["Weekday"] || "").trim(),
        comments: String(row["Comments"] || "").trim(),
        decodedCode: null,
        skip: false,
        skipReason: null,
    };

    if (!rawDate) {
        result.skip = true;
        result.skipReason = "Blank date";
        return result;
    }

    const normalizedDate = normalizeHistoricDate(rawDate);
    if (!normalizedDate) {
        result.skip = true;
        result.skipReason = `Invalid date: ${rawDate}`;
        return result;
    }

    result.date = normalizedDate;

    if (!paxName) {
        result.skip = true;
        result.skipReason = "Blank pax name";
        return result;
    }

    if (!rawCode) {
        result.skip = true;
        result.skipReason = "Blank code";
        return result;
    }

    const decodedCode = decodeHistoricCode(rawCode);
    result.decodedCode = decodedCode;

    if (decodedCode.skip) {
        result.skip = true;
        result.skipReason = decodedCode.skipReason;
        return result;
    }

    return result;
}

export function summarizeParsedHistoricRows(parsedRows) {
    const summary = {
        totalRows: parsedRows.length,
        validRows: 0,
        skippedRows: 0,
        skipReasons: {},
        aoCounts: {},
        qRows: 0,
        vqRows: 0,
        fngRows: 0,
        ddRows: 0,
    };

    for (const row of parsedRows) {
        if (row.skip) {
            summary.skippedRows += 1;
            summary.skipReasons[row.skipReason] =
                (summary.skipReasons[row.skipReason] || 0) + 1;
            continue;
        }

        summary.validRows += 1;

        const aoName = row.decodedCode?.aoName || "Unknown";
        summary.aoCounts[aoName] = (summary.aoCounts[aoName] || 0) + 1;

        if (row.decodedCode?.isQ) summary.qRows += 1;
        if (row.decodedCode?.isVq) summary.vqRows += 1;
        if (row.decodedCode?.isFng) summary.fngRows += 1;
        if (row.decodedCode?.isDd) summary.ddRows += 1;
    }

    return summary;
}

export function parseHistoricCsvToPreview(csvText) {
    const rawRows = parseHistoricCsvText(csvText);
    const parsedRows = rawRows.map(parseHistoricRow);
    const summary = summarizeParsedHistoricRows(parsedRows);

    return {
        rawRows,
        parsedRows,
        summary,
    }
}

export function groupHistoricRowsIntoSessions(parsedRows) {
    const sessionMap = new Map();

    for (const row of parsedRows) {
        if (row.skip) continue;

        const { date } = row;
        const { aoName, isQ, isFng } = row.decodedCode;

        const key = `${date}|${aoName}`;

        if (!sessionMap.has(key)) {
            sessionMap.set(key, {
                date,
                aoName,
                attendees: new Set(),
                qPax: new Set(),
                fngPax: new Set(),
            });
        }

        const session = sessionMap.get(key);

        session.attendees.add(row.paxName);

        if (isQ) {
            session.qPax.add(row.paxName);
        }

        if (isFng) {
            session.fngPax.add(row.paxName);
        }
    }

    return Array.from(sessionMap.values()).map(session => ({
        ...session,
        attendees: Array.from(session.attendees),
        qPax: Array.from(session.qPax),
        fngPax: Array.from(session.fngPax),
    }));
}

export function mapGroupedSessionsToAppFormat(groupedSessions, members) {
    const memberMap = new Map();

    for (const member of members) {
        memberMap.set(normalizePaxName(member.paxName), member);
    }

    const convertedSessions = [];
    const missingPax = new Set();

    for (const session of groupedSessions) {
        const attendeeIds = [];
        const qIds = [];
        const fngs = [];

        for (const paxName of session.attendees) {
            const matchedMember = memberMap.get(normalizePaxName(paxName));

            if (!matchedMember) {
                missingPax.add(paxName);
                continue;
            }

            attendeeIds.push(matchedMember.id);

            if (session.qPax.includes(paxName)) {
                qIds.push(matchedMember.id);
            }

            if (session.fngPax.includes(paxName)) {
                fngs.push({
                    paxName,
                    realName: null,
                    invitedById: matchedMember.invitedById || null,
                    memberId: matchedMember.id,
                });
            }
        }

        convertedSessions.push({
            id: crypto.randomUUID(),
            date: session.date,
            aoName: session.aoName,
            attendeeIds,
            qIds,
            fngs,
            notes: "",
            workout: null,
            sourcePlannedWorkoutId: null,
            createdAt: Date.now(),
        });
    }

    return {
        sessions: convertedSessions,
        missingPax: Array.from(missingPax).sort(),
    }
}

export function normalizeImportPaxKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9()]+/g, " ")
        .replace(/[()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}