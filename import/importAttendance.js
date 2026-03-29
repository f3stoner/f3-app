import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import crypto from "node:crypto";

const filePath = path.resolve(
    "./import/Attendance - F3 Old 300 - Attendance.csv"
);

const csvText = fs.readFileSync(filePath, "utf8");
const rows = parse(csvText, {
    relax_column_count: true,
    skip_empty_lines: false,
});

const headerRowIndex = 4;
const dataStartIndex = 5;

const headerRow = rows[headerRowIndex];

const COLS = {
    paxName: 0,
    realName: 1,
    homeAo: 2,
    proudPapa: 3,
    fngDate: 4,
};

const lastPostIndex = headerRow.findIndex((col) => String(col).trim() === "Last Post");
if (lastPostIndex === -1) {
    throw new Error('Could not find "Last Post" column in header row.');
}
const dateStartIndex = lastPostIndex + 1;

const AO_MAP = {
    H: "Hub",
    M: "Melt Shop",
};

function normalize(value) {
    return String(value ?? "").trim();
}

function normalizeName(value) {
    return normalize(value).toLowerCase();
}

function parseDateString(value) {
    const raw = normalize(value);
    if (!raw) return null;

    const parts = raw.split("/");
    if (parts.length !== 3) return null;

    const [m, d, y] = parts.map((p) => p.trim());
    const year = y.length === 2 ? `20${y}` : y;
    const month = m.padStart(2, "0");
    const day = d.padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function parseAttendanceCode(cellValue) {
    const raw = normalize(cellValue).toUpperCase();
    if (!raw) return null;

    const aoCode = raw[0];
    if (!AO_MAP[aoCode]) return  null;

    return {
        aoCode,
        aoName: AO_MAP[aoCode],
        isQ: raw.includes("Q"),
        isFNG: raw.includes("FNG"),
        raw,
    };
}

const rawMemberRows = rows.slice(dataStartIndex).filter((row) => {
    return row.some((cell) => normalize(cell) !== "");
});

//Pass 1 - build members
const members = [];
const paxNameToId = new Map();
const rowToMember = [];

for (const row of rawMemberRows) {
    const rawPaxName = normalize(row[COLS.paxName]) || "";
    const realName = normalize(row[COLS.realName]) || "";
    const paxName = rawPaxName || realName;
    if (!paxName) continue;
    const homeAo = normalize(row[COLS.homeAo]) || "";
    const proudPapaName = normalize(row[COLS.proudPapa]) || "";
    const firstPostDate = parseDateString(row[COLS.fngDate]);

    const member = {
        id: crypto.randomUUID(),
        paxName,
        realName,
        homeAo,
        invitedById: null,
        firstPostDate,
        status: "active",
    };

    members.push(member);
    paxNameToId.set(normalizeName(paxName), member.id);

    rowToMember.push({
        row,
        member,
        proudPapaName,
    });
}

//Pass 2 - resolve invitedById
for (const item of rowToMember) {
    if (!item.proudPapaName) continue;

    const invitedById = paxNameToId.get(normalizeName(item.proudPapaName)) || null;
    item.member.invitedById = invitedById;
}

//Build sessions
const sessionMap = new Map();

for (const item of rowToMember) {
    const { row, member } = item;

    for (let colIndex = dateStartIndex; colIndex < headerRow.length; colIndex++) {
        const headerCell = headerRow[colIndex];
        const sessionDate = parseDateString(headerCell);
        if (!sessionDate) continue;

        const attendance = parseAttendanceCode(row[colIndex]);
        if (!attendance) continue;

        const sessionKey = `${sessionDate}__${attendance.aoName}`;

        if (!sessionMap.has(sessionKey)) {
            sessionMap.set(sessionKey, {
                id: crypto.randomUUID(),
                date: sessionDate,
                aoName: attendance.aoName,
                attendeeIds: [],
                qId: null,
                fngs: [],
                notes: "",
            });
        }

        const session = sessionMap.get(sessionKey);

        if (!session.attendeeIds.includes(member.id)) {
            session.attendeeIds.push(member.id);
        }

        if (attendance.isQ) {
            session.qId = member.id;
        }

        if (attendance.isFNG && !member.firstPostDate) {
            member.firstPostDate = sessionDate;
        }
    }
}

const sessions = Array.from(sessionMap.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.aoName.localeCompare(b.aoName);
});

console.log(JSON.stringify({ members, sessions }, null, 2));