import Papa from "papaparse";
import {
    insertMember,
    updateMemberInCloud,
    insertSessionsBatch,
    loadAllMembers,
    loadAllSessionsPaginated,
    mapMemberFromDb,
    mapSessionFromDb,
} from "./cloudData.js";
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

function normalizeAoName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^the\s+/, "");
}

function sessionDeltaKey(session) {
    return `${normalizeAoName(session.aoName)}|${session.date}`;
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

async function loadExistingOld300SessionKeys(regionId) {
    const existingSessions = await loadAllSessionsPaginated(regionId);

    return new Set(
        existingSessions.map(row => {
            const session = mapSessionFromDb(row);
            return sessionDeltaKey(session);
        })
    );
}

export async function importOld300AttendanceCsv(csvText, options = {}) {
    const {
        dryRun = true,
        regionId = state.currentRegionId,
    } = options;

    if (!regionId) {
        throw new Error("No active region id found.");
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

    const dateLabelIndex = headerRow.findIndex(
        (col) => normalize(col) === "Date"
    );

    if (dateLabelIndex === -1) {
        throw new Error('Could not find "Date" column in header row.');
    }

    const dateStartIndex = dateLabelIndex + 1;

    const rawMemberRows = rows.slice(DATA_START_INDEX).filter((row) => {
        return Array.isArray(row) && row.some((cell) => normalize(cell) !== "");
    });

    console.log("Old 300 raw member rows:", rawMemberRows.length);

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

    const existingMembers = (await loadAllMembers(regionId)).map(mapMemberFromDb);
    const savedMemberMap = {};

    for (const existingMember of existingMembers) {
        savedMemberMap[normalizeName(existingMember.paxName)] = existingMember;
    }

    let membersInserted = 0;
    let membersUpdated = 0;

    for (const member of localMembers) {
        const key = normalizeName(member.paxName);
        const existing = savedMemberMap[key];

        if (!existing) {
            if (!dryRun) {
                const saved = await insertMember(regionId, member);
                savedMemberMap[key] = saved;
            } else {
                savedMemberMap[key] = member;
            }

            membersInserted += 1;
            continue;
        }

        const merged = {
            ...existing,
            realName: member.realName || existing.realName,
            homeAo: member.homeAo || existing.homeAo,
            firstPostDate: member.firstPostDate || existing.firstPostDate,
            status: "active",
        };

        savedMemberMap[key] = merged;

        if (!dryRun) {
            await updateMemberInCloud(regionId, merged);
        }

        membersUpdated += 1;
    }

    let invitedByUpdates = 0;

    for (const item of rowToMemberMeta) {
        if (!item.proudPapaName) continue;

        const member = savedMemberMap[normalizeName(item.paxName)];
        const inviter = savedMemberMap[normalizeName(item.proudPapaName)];

        if (!member || !inviter) continue;
        if (member.invitedById === inviter.id) continue;

        const updatedMember = {
            ...member,
            invitedById: inviter.id,
        };

        savedMemberMap[normalizeName(item.paxName)] = updatedMember;

        if (!dryRun) {
            await updateMemberInCloud(regionId, updatedMember);
        }

        invitedByUpdates += 1;
    }

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
            const sessionDate = parseDateString(headerRow[colIndex]);

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
                    createdByUserId: null,
                    backblastText: "",
                    unresolvedPax: [],
                    weatherSnapshot: null,
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

    const existingSessionKeys = await loadExistingOld300SessionKeys(regionId);

    const newSessions = [];
    const duplicateSessions = [];

    for (const session of sessions) {
        const key = sessionDeltaKey(session);

        if (existingSessionKeys.has(key)) {
            duplicateSessions.push(session);
        } else {
            newSessions.push(session);
        }
    }

    console.log("Old 300 delta import summary:");
    console.log("Total parsed:", sessions.length);
    console.log("Duplicates skipped:", duplicateSessions.length);
    console.log("New sessions to insert:", newSessions.length);
    console.log("Unmatched session members:", unmatchedSessionMembers);
    console.log("Skipped future date cells:", skippedFutureDateCells);

    if (newSessions.length) {
        console.table(newSessions.map(session => ({
            aoName: session.aoName,
            date: session.date,
            qCount: session.qIds.length,
            attendees: session.attendeeIds.length,
        })));
    }

    if (dryRun) {
        console.log("Dry run only. No Old 300 sessions inserted.");

        return {
            dryRun,
            totalParsed: sessions.length,
            totalDuplicates: duplicateSessions.length,
            totalNewSessions: newSessions.length,
            newSessions,
            duplicateSessions,
            membersInserted,
            membersUpdated,
            invitedByUpdates,
            skippedFutureDateCells,
            unmatchedSessionMembers,
        };
    }

    if (!newSessions.length) {
        console.log("No new Old 300 sessions to insert.");

        return {
            dryRun,
            totalParsed: sessions.length,
            totalDuplicates: duplicateSessions.length,
            totalNewSessions: 0,
            inserted: 0,
            membersInserted,
            membersUpdated,
            invitedByUpdates,
            skippedFutureDateCells,
            unmatchedSessionMembers,
        };
    }

    await insertSessionsBatch(regionId, newSessions);

    console.log(`Inserted ${newSessions.length} Old 300 sessions.`);

    return {
        dryRun,
        totalParsed: sessions.length,
        totalDuplicates: duplicateSessions.length,
        totalNewSessions: newSessions.length,
        inserted: newSessions.length,
        membersInserted,
        membersUpdated,
        invitedByUpdates,
        skippedFutureDateCells,
        unmatchedSessionMembers,
    };
}