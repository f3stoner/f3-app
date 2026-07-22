import Papa from "papaparse";

/**
 * Parse an Old 300 attendance spreadsheet.
 *
 * This function is intentionally pure.
 *
 * Responsibilities:
 *  - Parse CSV
 *  - Validate structure
 *  - Produce normalized spreadsheet objects
 *  - Collect warnings
 *
 * It does NOT:
 *  - Read Supabase
 *  - Match members
 *  - Match sessions
 *  - Write data
 *  - Generate UUIDs
 */

const HEADER_ROW_INDEX = 4;
const DATA_START_INDEX = 5;

const COLS = {
    paxName: 0,
    realName: 1,
    homeAo: 2,
    proudPapa: 3,
    fngDate: 4,
};

const AO_MAP = {
    H: "Hub",
    M: "Melt Shop",
};

function normalize(value) {
    return String(value ?? "").trim();
}

function parseDateString(value) {
    const raw = normalize(value);
    if (!raw) return null;

    const parts = raw.split("/");
    if (parts.length !== 3) return null;

    let [month, day, year] = parts.map((p) => p.trim());

    if (year.length === 2) year = `20${year}`;

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseAttendanceCode(cellValue) {
    const raw = normalize(cellValue).toUpperCase();
    if (!raw) return null;

    const aoCode = raw[0];
    const aoName = AO_MAP[aoCode];

    if (!aoName) return null;

    return {
        aoCode,
        aoName,
        isQ: raw.includes("Q"),
        isFNG: raw.includes("FNG"),
        raw,
    };
}

export function parseOld300Csv(csvText) {
    const warnings = [];

    const result = Papa.parse(csvText, {
        skipEmptyLines: false
    });

    if (result.errors.length) {
        throw new Error(result.errors[0].message);
    }

    const rows = result.data;

    if (!Array.isArray(rows) || rows.length < 6) {
        throw new Error("Invalid Old 300 attendance spreadsheet.");
    }

    const headerRow = rows[HEADER_ROW_INDEX];

    if (!headerRow) {
        throw new Error(
            "Could not find expected header row in Old 300 attendance CSV."
        );
    }

    const dateLabelIndex = headerRow.findIndex(
        (col) => normalize(col) === "Date"
    );

    if (dateLabelIndex === -1) {
        throw new Error('Could not find "Date" column.');
    }

    const dateStartIndex = dateLabelIndex + 1;

    const rawMemberRows = rows
        .slice(DATA_START_INDEX)
        .filter((row) => {
            return (
                Array.isArray(row) &&
                row.some((cell) => normalize(cell) !== "")
            );
        });

    const members = [];
    const memberRows= [];

    for (const [index, row] of rawMemberRows.entries()) {
        const rawPaxName = normalize(row[COLS.paxName]);
        const realName = normalize(row[COLS.realName]);
    
        const paxName = rawPaxName || realName;
    
        if (!paxName) {
            warnings.push({
                severity: "warning",
                code: "missing_member_name",
                message: "Row skipped because no member name was found.",
                sourceRow: DATA_START_INDEX + index,
            });
    
            continue;
        }
    
        members.push({
            spreadsheetName: paxName,
            realName,
            homeAo: normalize(row[COLS.homeAo]) || null,
            proudPapaName: normalize(row[COLS.proudPapa]) || null,
            firstPostDate: parseDateString(row[COLS.fngDate]),
            sourceRow: DATA_START_INDEX + index,
        });
    
        memberRows.push({
            row,
            spreadsheetName: paxName,
            sourceRow: DATA_START_INDEX + index,
        });
    }

    const sessionMap = new Map();

    for (const memberRow of memberRows) {
        const { row, spreadsheetName, sourceRow } = memberRow;

        for (
            let colIndex = dateStartIndex;
            colIndex < headerRow.length;
            colIndex++
        ) {
            const sessionDate = parseDateString(headerRow[colIndex]);

            if (!sessionDate) {
                continue;
            }

            const attendance = parseAttendanceCode(row[colIndex]);

            if (!attendance) {
                continue;
            }

            const sessionKey = `${sessionDate}|${attendance.aoName}`;

            if (!sessionMap.has(sessionKey)) {
                sessionMap.set(sessionKey, {
                    sessionKey,
                    date: sessionDate,
                    aoName: attendance.aoName,
                    attendees: [],
                });
            }

            const session = sessionMap.get(sessionKey);

            session.attendees.push({
                spreadsheetName,
                isQ: attendance.isQ,
                isFng: attendance.isFNG,
                sourceRow,
                rawCode: attendance.raw,
            });
        }
    }

    return {
        members,
        sessions: Array.from(sessionMap.values()).sort((a, b) => {
            if (a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }
    
            return a.aoName.localeCompare(b.aoName);
        }),
        warnings,
    };
}