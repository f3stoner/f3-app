import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse@5.4.1";

const SUPABASE_URL = Deno.env.get("PROJECT_SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SUPABASE_SERVICE_ROLE_KEY");
const AGGIELAND_REGION_ID = Deno.env.get("AGGIELAND_REGION_ID");

const SPREADSHEET_ID = "1wlsKrOF_7sfGi_F2emLQKHfRa5L3AaUIme1nRFcytTA";

const SHEETS = [
    { name: "Pax Master", gid: "1285473699", fileName: "Pax_Master.csv" },
    { name: "Forest", gid: "1711164286" },
    { name: "Cave", gid: "1473899367" },
    { name: "Iron", gid: "102791710" },
    { name: "Keep", gid: "401669631" },
    { name: "Rock", gid: "969424886" },
    { name: "Mine", gid: "168818011" },
    { name: "Southie", gid: "2031916410" },
    { name: "Watch", gid: "691595488" },
    { name: "Dads", gid: "719310773" },
    { name: "BlackOps", gid: "917180202" },
    { name: "CSAUP", gid: "1074367588" },
    { name: "Other", gid: "1404010027" },
];

const IGNORED_AGGIELAND_SESSION_KEYS = new Set([
    "blackops|2026-05-11",
]);

function buildCsvExportUrl(gid: string) {
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

function normalizeImportPaxKey(value: string) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^dr\.\s*/i, "")
        .replace(/\(.*?\)/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function normalizeAoName(value: string) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^the\s+/, "");
}

function normalizeDate(value: string) {
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
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString().split("T")[0];
}

function getWeekdayNameFromDate(dateString: string) {
    const date = new Date(`${dateString}T12:00:00`);

    return date.toLocaleDateString("en-US", {
        weekday: "short",
    });
}

function resolveImportedAoName(aoName: string, weekday = "") {
    const normalizedAo = normalizeAoName(aoName);
    const normalizedWeekday = String(weekday || "")
        .trim()
        .toLowerCase();

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

function sessionDeltaKey(session: { aoName: string; date: string; weekday?: string }) {
    const weekday = session.weekday || getWeekdayNameFromDate(session.date);
    const resolvedAoName = resolveImportedAoName(session.aoName, weekday);

    return `${normalizeAoName(resolvedAoName)}|${session.date}`;
}

async function fetchCsv(gid: string) {
    const response = await fetch(buildCsvExportUrl(gid));

    if (!response.ok) {
        throw new Error(`Failed to fetch CSV gid ${gid}: ${response.status}`);
    }

    const text = await response.text();

    if (!text.trim()) {
        throw new Error(`CSV gid ${gid} was empty`);
    }

    return text;
}

async function loadExistingMembers(supabase: any, regionId: string) {
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
        const { data, error } = await supabase
            .from("members")
            .select("id, pax_name")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data?.length) break;

        allRows = allRows.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    const memberIdByName: Record<string, string> = {};

    for (const row of allRows) {
        memberIdByName[normalizeImportPaxKey(row.pax_name)] = row.id;
    }

    return memberIdByName;
}

async function loadExistingSessionKeys(supabase: any, regionId: string) {
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select("date, ao_name")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data?.length) break;

        allRows = allRows.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    const keys = new Set<string>();

    for (const row of allRows) {
        const weekday = getWeekdayNameFromDate(row.date);
        const resolvedAoName = resolveImportedAoName(row.ao_name, weekday);
        keys.add(`${normalizeAoName(resolvedAoName)}|${row.date}`);
    }

    return keys;
}

function parsePaxMasterPreview(csvText: string, existingMemberKeys: Set<string>) {
    const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
    });

    if (parsed.errors?.length) {
        throw new Error("Pax Master CSV parse failed");
    }

    let reusedCount = 0;
    let insertedCount = 0;

    for (const row of parsed.data as any[]) {
        const paxName = String(row["Name"] || "").trim();
        if (!paxName) continue;

        const key = normalizeImportPaxKey(paxName);

        if (existingMemberKeys.has(key)) {
            reusedCount += 1;
        } else {
            insertedCount += 1;
        }
    }

    return {
        totalRows: (parsed.data as any[]).length,
        reusedCount,
        insertedCount,
    };
}

function parseAoCsvPreview(csvText: string, aoName: string, memberIdByName: Record<string, string>) {
    const cleanedCsvText = csvText.split("\n").slice(1).join("\n");

    const parsed = Papa.parse(cleanedCsvText, {
        header: true,
        skipEmptyLines: true,
    });

    if (parsed.errors?.length) {
        throw new Error(`${aoName} CSV parse failed`);
    }

    const grouped: Record<string, any> = {};

    for (const row of parsed.data as any[]) {
        const rawDate = String(row["Date"] || "").trim();
        const paxName = String(row["Pax"] || "").trim();
        const code = String(row["Code"] || "").trim().toUpperCase();
        const weekday = String(row["Weekday"] || "").trim();

        if (!rawDate || !paxName) continue;

        const date = normalizeDate(rawDate);
        if (!date) continue;

        const resolvedAoName = resolveImportedAoName(aoName, weekday);

        grouped[date] ||= {
            date,
            aoName: resolvedAoName,
            weekday,
            attendeeCount: 0,
            qCount: 0,
            unresolvedPax: [],
        };

        const memberId = memberIdByName[normalizeImportPaxKey(paxName)];

        if (!memberId) {
            grouped[date].unresolvedPax.push({
                rawName: paxName,
                code,
                reason: "unmatched_member_reference",
            });
            continue;
        }

        grouped[date].attendeeCount += 1;

        const normalizedCode = code.replace(/[^A-Z]/g, "");
        if (normalizedCode.includes("Q")) {
            grouped[date].qCount += 1;
        }
    }

    return Object.values(grouped);
}

async function insertImportRun(supabase: any, regionId: string, importRun: any) {
    const { error } = await supabase
        .from("import_runs")
        .insert({
            region_id: regionId,
            type: importRun.type,
            mode: importRun.mode,
            status: importRun.status,
            summary: importRun.summary || {},
            error: importRun.error || null,
        });

    if (error) throw error;
}

serve(async () => {
    const startedAt = Date.now();

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !AGGIELAND_REGION_ID) {
        return new Response(
            JSON.stringify({ error: "Missing required environment variables" }),
            { status: 500 }
        );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    try {
        const memberIdByName = await loadExistingMembers(supabase, AGGIELAND_REGION_ID);
        const existingMemberKeys = new Set(Object.keys(memberIdByName));
        const existingSessionKeys = await loadExistingSessionKeys(supabase, AGGIELAND_REGION_ID);

        const paxMasterSheet = SHEETS.find(sheet => sheet.name === "Pax Master");
        if (!paxMasterSheet) throw new Error("Pax Master sheet config missing");

        const paxMasterCsv = await fetchCsv(paxMasterSheet.gid);
        const paxMasterPreview = parsePaxMasterPreview(paxMasterCsv, existingMemberKeys);

        let totalParsed = 0;
        let totalDuplicates = 0;
        let totalNewSessions = 0;
        let unresolvedSessionCount = 0;

        const newSessions: any[] = [];

        for (const sheet of SHEETS.filter(sheet => sheet.name !== "Pax Master")) {
            const csvText = await fetchCsv(sheet.gid);
            const sessions = parseAoCsvPreview(csvText, sheet.name, memberIdByName);

            for (const session of sessions) {
                const key = sessionDeltaKey(session);

                totalParsed += 1;

                if (IGNORED_AGGIELAND_SESSION_KEYS.has(key)) {
                    totalDuplicates += 1;
                    continue;
                }

                if (existingSessionKeys.has(key)) {
                    totalDuplicates += 1;
                    continue;
                }

                totalNewSessions += 1;
                newSessions.push(session);

                if (session.unresolvedPax?.length) {
                    unresolvedSessionCount += 1;
                }
            }
        }

        const summary = {
            totalMembersMapped: Object.keys(memberIdByName).length,
            paxMasterInserted: paxMasterPreview.insertedCount,
            paxMasterReused: paxMasterPreview.reusedCount,
            paxMasterInvitedByUpdates: 0,
            totalParsed,
            totalDuplicates,
            totalNewSessions,
            unresolvedSessionCount,
            durationMs: Date.now() - startedAt,
            newSessions: newSessions.map(session => ({
                date: session.date,
                aoName: session.aoName,
                attendeeCount: session.attendeeCount,
                qCount: session.qCount,
                unresolvedCount: session.unresolvedPax?.length || 0,
                unresolvedPax: session.unresolvedPax || [],
            })),
        };

        await insertImportRun(supabase, AGGIELAND_REGION_ID, {
            type: "aggieland_sync",
            mode: "dry_run",
            status: "success",
            summary,
        });

        return new Response(JSON.stringify({ ok: true, summary }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        try {
            await insertImportRun(supabase, AGGIELAND_REGION_ID, {
                type: "aggieland_sync",
                mode: "dry_run",
                status: "error",
                summary: {
                    durationMs: Date.now() - startedAt,
                },
                error: message,
            });
        } catch {
            // Do not mask original error.
        }

        return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});