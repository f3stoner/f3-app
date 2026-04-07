import Papa from "papaparse";
import { insertMember, updateMemberInCloud, insertSessionsBatch } from "./cloudData.js";
import { state } from "../modules/state.js";

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

function normalizeName(value) {
    return normalize(value).toLowerCase();
}

function parseDateString(value) {
    const raw = normalize(value);
    if (!raw) return null;

    const parts = raw.split("/");
    if (parts.length !== 3) return null;

    let [month, day, year] = parts.map((p) => p.trim());

    if (year.length === 2) {
        year = `20${year}`;
    }

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

function isFutureDatePastCutoff(dateString) {
    if (!dateString) return false;

    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 14);

    const yyyy = cutoff.getFullYear();
    const mm = String(cutoff.getMonth() + 1).padStart(2, "0");
    const dd = String(cutoff.getDate()).padStart(2, "0");
    const cutoffString = `${yyyy}-${mm}-${dd}`;

    return dateString > cutoffString;
}

export async function importOld300AttendanceCsv(csvText) {
    if (!state.currentRegionId) {
        throw new Error("No active region id found on state.currentRegionId");
    }

    const parsed = Papa.parse(csvText, {
        skipEmptyLines: false,
    });

    if (parsed.errors.length) {
        console.error(parsed.errors);
        throw new Error("Old 300 attendance CSV parse failed");
    }

    const rows = parsed.data;

    const headerRow = rows[HEADER_ROW_INDEX];
    if (!headerRow) {
        throw new Error("Could not find expected header row in Old 300 attendance CSV.");
    }

    const lastPostIndex = headerRow.findIndex(
        (col) => String(col).trim() === "Last Post"
    );

    if (lastPostIndex === -1) {
        throw new Error('Could not find "Last Post" column in header row.');
    }

    const dateStartIndex = lastPostIndex + 1;

    const rawMemberRows = rows.slice(DATA_START_INDEX).filter((row) => {
        return Array.isArray(row) && row.some((cell) => normalize(cell) !== "");
    });

    console.log("Old 300 raw member rows:", rawMemberRows.length);

    // Pass 1: Build local member objects
    const localMembers = [];
    const rowToMemberMeta = [];

    for (const row of rawMemberRows) {
        const rawPaxName = normalize(row[COLS.paxName]);
        const realName = normalize(row[COLS.realName]);
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
            firstPostDate: isFutureDatePastCutoff(firstPostDate) ? null : firstPostDate,
            status: "active",
        };

        localMembers.push(member);

        rowToMemberMeta.push({
            row,
            paxName,
            proudPapaName,
        });
    }

    console.log("Old 300 local members built:", localMembers.length);

    // Pass 2: Insert members
    const savedMemberMap = {};

    for (const member of localMembers) {
        const saved = await insertMember(state.currentRegionId, member);
        savedMemberMap[normalizeName(member.paxName)] = saved;
    }

    console.log("Old 300 members inserted:", Object.keys(savedMemberMap).length);

    // Pass 3: Resolve invitedById and update members in cloud
    let invitedByUpdates = 0;

    for (const item of rowToMemberMeta) {
        if (!item.proudPapaName) continue;

        const member = savedMemberMap[normalizeName(item.paxName)];
        const inviter = savedMemberMap[normalizeName(item.proudPapaName)];

        if (!member || !inviter) continue;

        member.invitedById = inviter.id;
        await updateMemberInCloud(state.currentRegionId, member);
        invitedByUpdates += 1;
    }

    console.log("Old 300 invitedBy updates:", invitedByUpdates);

    // Pass 4: Build sessions from inserted member ids
    const sessionMap = new Map();
    let skippedFutureDateCells = 0;
    let unmatchedSessionMembers = 0;

    for (const item of rowToMemberMeta) {
        const { row, paxName } = item;
        const member = savedMemberMap[normalizeName(paxName)];

        if (!member) {
            unmatchedSessionMembers += 1;
            continue;
        }

        for (let colIndex = dateStartIndex; colIndex < headerRow.length; colIndex++) {
            const headerCell = headerRow[colIndex];
            const sessionDate = parseDateString(headerCell);

            if (!sessionDate) continue;

            if (isFutureDatePastCutoff(sessionDate)) {
                skippedFutureDateCells += 1;
                continue;
            }

            const attendance = parseAttendanceCode(row[colIndex]);
            if (!attendance) continue;

            const sessionKey = `${sessionDate}__${attendance.aoName}`;

            if (!sessionMap.has(sessionKey)) {
                sessionMap.set(sessionKey, {
                    id: crypto.randomUUID(),
                    date: sessionDate,
                    aoName: attendance.aoName,
                    attendeeIds: [],
                    qIds: [],
                    fngs: [],
                    notes: "",
                    workout: null,
                    sourcePlannedWorkoutId: null,
                    createdAt: Date.now(),
                });
            }

            const session = sessionMap.get(sessionKey);

            if (!session.attendeeIds.includes(member.id)) {
                session.attendeeIds.push(member.id);
            }

            if (attendance.isQ && !session.qIds.includes(member.id)) {
                session.qIds.push(member.id);
            }

            if (attendance.isFNG) {
                const alreadyTracked = session.fngs.some(
                    (fng) => fng.memberId === member.id
                );

                if (!alreadyTracked) {
                    session.fngs.push({
                        paxName: member.paxName || null,
                        realName: member.realName || null,
                        invitedById: member.invitedById || null,
                        memberId: member.id,
                    });
                }
            }
        }
    }

    const sessions = Array.from(sessionMap.values()).sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.aoName.localeCompare(b.aoName);
    });

    console.log("Old 300 sessions built:", sessions.length);
    console.log("Old 300 unmatched session members:", unmatchedSessionMembers);
    console.log("Old 300 skipped future date cells:", skippedFutureDateCells);

    // Pass 5: Insert sessions
    await insertSessionsBatch(state.currentRegionId, sessions);

    console.log("Old 300 session import complete");

    return {
        membersInserted: Object.keys(savedMemberMap).length,
        invitedByUpdates,
        sessionsInserted: sessions.length,
        skippedFutureDateCells,
        unmatchedSessionMembers,
    };
}