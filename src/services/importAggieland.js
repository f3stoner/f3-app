import { insertMember, updateMemberInCloud, insertSessionsBatch, deleteSessionsByAo } from "./cloudData.js"
import { REGION_ID } from "../config.js"
import Papa from "papaparse";
import { insertSession } from "./cloudData.js";
import { supabase } from "./supabaseClient.js";

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
        memberMap[paxName] = saved;
    }

    console.log("Pass 1 complete:", Object.keys(memberMap).length);

    for (const row of rows) {
        const paxName = (row["Name"] || "").trim();
        const invitedByName = (row["Proud Papa"] || "").trim();

        if (!paxName || !invitedByName) continue;

        const member = memberMap[paxName];
        const inviter = memberMap[invitedByName];

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

        const memberId = memberMap[paxName];
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
                qId: null,
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
            grouped[key].qId = memberId;
        }
    }

    const sessions = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    console.log(`${aoName} sessions grouped:`, sessions.length);

    await deleteSessionsByAo(REGION_ID, sessions);
    await insertSessionsBatch(REGION_ID, sessions);

    console.log(`${aoName} session import complete`);
}

async function buildMemberNameToIdMap() {
    const { data, error } = await supabase
        .from("members")
        .select("id, pax_name")
        .eq("region_id", REGION_ID);

    if (error) throw error;

    const map = {};

    for (const row of data) {
        map[row.pax_name] = row.id;
    }

    return map;
}