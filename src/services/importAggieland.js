import { insertMember, updateMemberInCloud, insertSessionsBatch, deleteSessionsByAo,loadAllMembers } from "./cloudData.js"
import { REGION_ID } from "../config.js"
import Papa from "papaparse";
import { supabase } from "./supabaseClient.js";
import { normalizePaxName } from "../utils/historicImport.js";

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

        const saved = await insertMember(REGION_ID, member);
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

        await updateMemberInCloud(REGION_ID, member);
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

export async function importAoLogCsv(csvText, aoName) {
    const cleanedCsvText = csvText.split("\n").slice(1).join("\n");

    const { data: rows, errors } = Papa.parse(cleanedCsvText, {
        header: true,
        skipEmptyLines: true,
    });

    if (errors.length) {
        console.error(errors);
        throw new Error (`CSV parse failed for ${aoName}`);
    }

    console.log(`Importing ${aoName} rows:`, rows.length);

    const memberMap = await buildMemberNameToIdMap();

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
                memberId
            });
        }
    }

    const sessions = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    console.log(`${aoName} sessions grouped:`, sessions.length);

    //await deleteSessionsByAo(REGION_ID, aoName);
    await insertSessionsBatch(REGION_ID, sessions);

    console.log(`${aoName} session import complete`);
}

async function buildMemberNameToIdMap() {
    const pageSize = 1000;
    let from = 0;
    let allMembers = [];

    while (true) {
        const { data, error } = await supabase
            .from("members")
            .select("id, pax_name")
            .eq("region_id", REGION_ID)
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

    return map;
}