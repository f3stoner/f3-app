import { insertMember, updateMemberInCloud, insertSessionsBatch } from "./cloudData.js"
import Papa from "papaparse";
import { supabase } from "./supabaseClient.js";
import { normalizePaxName } from "../utils/historicImport.js";
import { state } from "../modules/state.js";

export async function importPaxMasterCsv(csvText) {

    const { data: rows, errors } = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
    });

    if (errors.length) {
        console.error(errors);
        throw new Error("CSV parse failed");
    }

    console.log("Importing Pax Master:", rows.length);

    const memberMap = {};

    for (const row of rows) {
        const paxName = (row["Name"] || "").trim();
        if (!paxName) continue;

        const member = {
            id: crypto.randomUUID(),
            paxName,
            realName: row["Hospital Name"]?.trim() || null,
            homeAo: row["First AO"]?.trim() || null,
            invitedById: null,
            firstPostDate: normalizeDate(row["FNG Date"]),
            status: "active",
        };

        const saved = await insertMember(state.currentRegionId, member);
        memberMap[normalizePaxName(paxName)] = saved;
    }

    console.log("Pass 1 complete:", Object.keys(memberMap).length);

    for (const row of rows) {
        const paxName = (row["Name"] || "").trim();
        const invitedByName = (row["Proud Papa"] || "").trim();

        if (!paxName || !invitedByName) continue;

        const member = memberMap[normalizePaxName(paxName)];
        const inviter = memberMap[normalizePaxName(invitedByName)];

        if (!member || !inviter) continue;

        member.invitedById = inviter.id;

        await updateMemberInCloud(state.currentRegionId, member);
    }

    console.log("Pass 2 complete (invitedBy)");

    return memberMap;
}

function normalizeDate(value) {
    if (!value) return null;

    const trimmed = String(value).trim();

    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
        let [, month, day, year] = match;

        if (year.length === 2) {
            year = `20${year}`;
        }

        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const date = new Date(trimmed);
    if (isNaN(date)) return null;

    return date.toISOString().split("T")[0];
}

export async function parseAoLogCsvToSessions(csvText, aoName, regionId = state.currentRegionId) {
    const cleanedCsvText = csvText.split("\n").slice(1).join("\n");
    const { data: rows, errors } = Papa.parse(cleanedCsvText, {
        header: true,
        skipEmptyLines: true,
    });

    if (errors.length) {
        console.error(errors);
        throw new Error(`CSV parse failed for ${aoName}`);
    }

    console.log(`Parsing ${aoName} rows:`, rows.length);

    const memberMap = await buildMemberNameToIdMap(regionId);
    const grouped = {};

    for (const row of rows) {
        const rawDate = (row["Date"] || "").trim();
        const paxName = (row["Pax"] || "").trim();
        const code = (row["Code"] || "").trim().toUpperCase();

        if (!rawDate || !paxName) continue;

        const normalizedDate = normalizeDate(rawDate);

        if (!normalizedDate) continue;

        const memberId = memberMap[normalizePaxName(paxName)];

        if (!memberId) {
            console.warn(`Skipping unmatched pax in ${aoName}:`, paxName);
            continue;
        }

        const key = normalizedDate;

        if (!grouped[key]) {
            grouped[key] = {
                id: crypto.randomUUID(),
                date: normalizedDate,
                aoName,
                attendeeIds: [],
                qIds: [],
                fngs: [],
                notes: "",
                workout: null,
                sourcePlannedWorkoutId: null,
                createdAt: Date.now(),
            };
        }

        if (!grouped[key].attendeeIds.includes(memberId)) {
            grouped[key].attendeeIds.push(memberId);
        }

        if (["Q", "QDD", "VQ"].includes(code)) {
            if (!grouped[key].qIds.includes(memberId)) {
                grouped[key].qIds.push(memberId);
            }
        }

        if (code === "FNG") {
            grouped[key].fngs.push({
                paxName,
                memberId,
            });
        }
    }
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
}

export async function importAoLogCsv(csvText, aoName) {
    const sessions = await parseAoLogCsvToSessions(csvText, aoName);

    console.log(`${aoName} sessions grouped:`, sessions.length);

    await insertSessionsBatch(state.currentRegionId, sessions);

    console.log(`${aoName} session import complete`);
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

async function loadExistingSessionKeysForRegion(regionId) {
    const pageSize = 1000;
    let from = 0;
    let existingSessions = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select("id, date, ao_name")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        existingSessions = existingSessions.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    const keys = new Set();

    for (const row of existingSessions) {
        keys.add(`${normalizeAoName(row.ao_name)}|${row.date}`);
    }

    return keys;
}

export async function runAggielandDeltaAoImports({ dryRun = true, regionId = state.currentRegionId }  = {}) {
    const targetRegionId = regionId;

    const aoFiles = [
        ["Forest", "/Forest_Log.csv"],
        ["Cave", "/Cave_Log.csv"],
        ["Iron", "/Iron_Log.csv"],
        ["Keep", "/Keep_Log.csv"],
        ["Rock", "/Rock_Log.csv"],
        ["Mine", "/Mine_Log.csv"],
        ["Southie", "/Southie_Log.csv"],
        ["Watch", "/Watch_Log.csv"],
        ["Dads", "/Dads_Log.csv"],
        ["BlackOps", "/BlackOps_Log.csv"],
        ["CSAUP", "/CSAUP_Log.csv"],
        ["Other", "/Other_Log.csv"],
    ];

    console.log(`Aggieland delta import starting. dryRun = ${dryRun}`);

    const existingKeys = await loadExistingSessionKeysForRegion(targetRegionId);
    let allNewSessions = [];
    let totalParsed = 0;
    let totalDuplicates = 0;

    for (const [aoName, path] of aoFiles) {
        const response = await fetch(path);

        if (!response.ok) {
            console.warn(`Skipping ${aoName}. Could not fetch ${path}`);
            continue;
        }

        const csvText = await response.text();
        const sessions = await parseAoLogCsvToSessions(csvText, aoName, targetRegionId);
        const newSessions = [];
        const duplicateSessions = [];

        for (const session of sessions) {
            const key = sessionDeltaKey(session);

            if (existingKeys.has(key)) {
                duplicateSessions.push(session);

            } else {
                newSessions.push(session);
            }
        }

        totalParsed += sessions.length;
        totalDuplicates += duplicateSessions.length;
        allNewSessions = allNewSessions.concat(newSessions);

        console.log(`AO: ${aoName}`);
        console.log(`CSV sessions found: ${sessions.length}`);
        console.log(`New sessions to insert: ${newSessions.length}`);
        console.log(`Duplicates skipped: ${duplicateSessions.length}`);

        if (newSessions.length) {
            console.table(newSessions.map(session => ({
                aoName: session.aoName,
                date: session.date,
                qCount: session.qIds.length,
                attendees: session.attendeeIds.length,
            })));
        }
    }

    console.log("Aggieland delta import summary:");
    console.log("Total parsed:", totalParsed);
    console.log("Total duplicates skipped:", totalDuplicates);
    console.log("Total new sessions:", allNewSessions.length);

    if (dryRun) {
        console.log("Dry run only. No sessions inserted.");

        return {
            dryRun,
            totalParsed,
            totalDuplicates,
            totalNewSessions: allNewSessions.length,
            newSessions: allNewSessions,
        };
    }

    if (allNewSessions.length === 0) {
        console.log("No new sessions to insert.");

        return {
            dryRun,
            totalParsed,
            totalDuplicates,
            totalNewSessions: 0,
            inserted: 0,
        };
    }

    await insertSessionsBatch(targetRegionId, allNewSessions);

    console.log(`Inserted ${allNewSessions.length} new sessions.`);

    return {
        dryRun,
        totalParsed,
        totalDuplicates,
        totalNewSessions: allNewSessions.length,
        inserted: allNewSessions.length,
    };
}

async function buildMemberNameToIdMap(regionId = state.currentRegionId) {
    const pageSize = 1000;
    let from = 0;
    let allMembers = [];

    while (true) {
        const { data, error } = await supabase
            .from("members")
            .select("id, pax_name")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allMembers = allMembers.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    const map = {};

    for (const row of allMembers) {
        map[normalizePaxName(row.pax_name)] = row.id;
    }

    console.log("Import target region ID:", regionId);
    console.log("Members loaded for import:", allMembers.length);
    console.log("Member map sample:", Object.keys(map).slice(0, 20));

    return map;
}