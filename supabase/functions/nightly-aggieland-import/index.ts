import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse@5.4.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function insertSessionsBatch(supabase: any, regionId: string, sessions: any[]) {
    if (!sessions.length) return [];

    const rows = sessions.map(session => ({
        id: session.id,
        region_id: regionId,
        date: session.date,
        ao_name: session.aoName,
        q_ids: session.qIds || [],
        q_id: session.qIds?.[0] || null,
        attendee_ids: session.attendeeIds || [],
        fngs: session.fngs || [],
        notes: session.notes || "",
        workout: session.workout || null,
        source_planned_workout_id: session.sourcePlannedWorkoutId || null,
        created_at: session.createdAt,
        created_by_user_id: null,
        unresolved_pax: session.unresolvedPax || [],
    }));

    const { data, error } = await supabase
        .from("sessions")
        .insert(rows)
        .select();

    if (error) throw error;

    return data || [];
}

async function createUnresolvedPaxFlagsForSessions(supabase: any, regionId: string, sessions: any[]) {
    const sessionIds = sessions.map(session => session.id).filter(Boolean);
    if (!sessionIds.length) return [];

    const { data: existingFlags, error } = await supabase
        .from("admin_flags")
        .select("session_id, proposed_pax_name, type")
        .eq("region_id", regionId)
        .eq("status", "open")
        .in("session_id", sessionIds);

    if (error) throw error;

    const existingFlagKeys = new Set(
        (existingFlags || []).map(flag =>
            `${flag.session_id}|${flag.proposed_pax_name}|${flag.type}`
        )
    );

    const flags: any[] = [];

    for (const session of sessions) {
        const unresolvedPax = session.unresolved_pax || session.unresolvedPax || [];

        for (const unresolved of unresolvedPax) {
            const flagKey = `${session.id}|${unresolved.rawName}|${unresolved.reason}`;

            if (existingFlagKeys.has(flagKey)) continue;

            existingFlagKeys.add(flagKey);

            flags.push({
                id: crypto.randomUUID(),
                region_id: regionId,
                type: unresolved.reason,
                status: "open",
                severity: "high",
                created_at: Date.now(),
                created_by_user_id: null,
                session_id: session.id,
                proposed_pax_name: unresolved.rawName,
                matched_member_ids: unresolved.candidateMemberIds || [],
                message: `${session.ao_name || session.aoName} ${session.date}: could not safely assign ${unresolved.rawName} (${unresolved.code || "no code"}).`,
                resolved_at: null,
                resolved_by_user_id: null,
                resolution_notes: null,
            });
        }
    }

    if (!flags.length) return [];

    const { data, error: insertError } = await supabase
        .from("admin_flags")
        .insert(flags)
        .select();

    if (insertError) throw insertError;

    return data || [];
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

async function buildMemberImportLookup(supabase: any, regionId: string) {
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
        const { data, error } = await supabase
            .from("members")
            .select("id, pax_name, status")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data?.length) break;

        allRows = allRows.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    const rowsByKey: Record<string, any[]> = {};

    for (const row of allRows) {
        const key = normalizeImportPaxKey(row.pax_name);

        if (!key) continue;

        rowsByKey[key] ||= [];
        rowsByKey[key].push(row);
    }

    const memberIdByName: Record<string, string> = {};
    const ambiguousMembersByName: Record<string, string[]> = {};

    for (const [key, rows] of Object.entries(rowsByKey)) {
        if (rows.length === 1) {
            memberIdByName[key] = rows[0].id;
            continue;
        }

        const activeRows = rows.filter(row => row.status === "active");

        if (activeRows.length === 1) {
            memberIdByName[key] = activeRows[0].id;
            continue;
        }

        ambiguousMembersByName[key] = rows.map(row => row.id);
    }

    return {
        memberIdByName,
        ambiguousMembersByName,
    };
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

async function syncPaxMaster(
    supabase: any,
    regionId: string,
    csvText: string,
    existingMemberKeys: Set<string>,
    memberIdByName: Record<string, string>,
    shouldApply: boolean
) {
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
            continue;
        }

        const member = {
            id: crypto.randomUUID(),
            region_id: regionId,
            pax_name: paxName,
            real_name: String(row["Hospital Name"] || "").trim() || null,
            home_ao: String(row["First AO"] || "").trim() || null,
            invited_by_id: null,
            first_post_date: normalizeDate(row["FNG Date"]),
            status: "active",
        };

        if (shouldApply) {
            const { data, error } = await supabase
                .from("members")
                .insert(member)
                .select("id, pax_name")
                .single();

            if (error) throw error;

            memberIdByName[key] = data.id;
            existingMemberKeys.add(key);
        }

        insertedCount += 1;
    }

    return {
        reusedCount,
        insertedCount,
        memberIdByName,
    };
}


function parseAoCsvPreview(
    csvText: string, 
    aoName: string, 
    memberIdByName: Record<string, string>,
    ambiguousMembersByName: Record<string, string[]>,
) {
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
            id: crypto.randomUUID(),
            date,
            aoName: resolvedAoName,
            weekday,
            attendeeIds: [],
            qIds: [],
            fngs: [],
            unresolvedPax: [],
            notes: "",
            workout: null,
            sourcePlannedWorkoutId: null,
            createdAt: Date.now(),
        };

        const normalizedName = normalizeImportPaxKey(paxName);

        if (ambiguousMembersByName[normalizedName]) {
            grouped[date].unresolvedPax.push({
                rawName: paxName,
                normalizedName,
                code,
                reason: "ambiguous_member_match",
                candidateMemberIds: ambiguousMembersByName[normalizedName],
            });
        
            continue;
        }
        
        const memberId = memberIdByName[normalizedName];
        
        if (!memberId) {
            grouped[date].unresolvedPax.push({
                rawName: paxName,
                normalizedName: normalizeImportPaxKey(paxName),
                code,
                reason: "unmatched_member_reference",
                candidateMemberIds: [],
            });
            continue;
        }

        if (!grouped[date].attendeeIds.includes(memberId)) {
            grouped[date].attendeeIds.push(memberId);
        }

        const normalizedCode = code.replace(/[^A-Z]/g, "");

        if (normalizedCode.includes("Q")) {
            if (!grouped[date].qIds.includes(memberId)) {
                grouped[date].qIds.push(memberId);
            }
        }

        if (code === "FNG") {
            grouped[date].fngs.push({
                paxName,
                memberId,
            });
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

serve(async (req) => {
    const startedAt = Date.now();

    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders,
        });
    }

    const requestBody = await req.json().catch(() => ({}));
    const shouldApply = requestBody?.apply === true;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !AGGIELAND_REGION_ID) {
        return new Response(
            JSON.stringify({ error: "Missing required environment variables" }),
            { 
                status: 500,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                }
            }
        );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    try {
        const initialLookup = await buildMemberImportLookup(
            supabase,
            AGGIELAND_REGION_ID
        );
        
        let memberIdByName = initialLookup.memberIdByName;
        let ambiguousMembersByName = initialLookup.ambiguousMembersByName;
        const existingMemberKeys = new Set(Object.keys(memberIdByName));        
        const existingSessionKeys = await loadExistingSessionKeys(supabase, AGGIELAND_REGION_ID);

        const paxMasterSheet = SHEETS.find(sheet => sheet.name === "Pax Master");
        if (!paxMasterSheet) throw new Error("Pax Master sheet config missing");

        const paxMasterCsv = await fetchCsv(paxMasterSheet.gid);
        const paxMasterResult = await syncPaxMaster(
            supabase,
            AGGIELAND_REGION_ID,
            paxMasterCsv,
            existingMemberKeys,
            memberIdByName,
            shouldApply
        );
        
        if (shouldApply) {
            const refreshedLookup = await buildMemberImportLookup(
                supabase,
                AGGIELAND_REGION_ID
            );
        
            memberIdByName = refreshedLookup.memberIdByName;
            ambiguousMembersByName = refreshedLookup.ambiguousMembersByName;
        }
                
        let totalParsed = 0;
        let totalDuplicates = 0;
        let totalNewSessions = 0;
        let unresolvedSessionCount = 0;

        const newSessions: any[] = [];

        for (const sheet of SHEETS.filter(sheet => sheet.name !== "Pax Master")) {
            const csvText = await fetchCsv(sheet.gid);
            const sessions = parseAoCsvPreview(
                csvText, 
                sheet.name, 
                memberIdByName,
                ambiguousMembersByName,
            );

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
            paxMasterInserted: paxMasterResult.insertedCount,
            paxMasterReused: paxMasterResult.reusedCount,
            paxMasterInvitedByUpdates: 0,
            totalParsed,
            totalDuplicates,
            totalNewSessions,
            unresolvedSessionCount,
            durationMs: Date.now() - startedAt,
            newSessions: newSessions.map(session => ({
                date: session.date,
                aoName: session.aoName,
                attendeeCount: session.attendeeIds?.length || 0,
                qCount: session.qIds?.length || 0,
                unresolvedCount: session.unresolvedPax?.length || 0,
                unresolvedPax: session.unresolvedPax || [],
            })),
        };

        let insertedSessions: any[] = [];
        let createdFlags: any[] = [];

        if (shouldApply && newSessions.length > 0) {
            insertedSessions = await insertSessionsBatch(
                supabase,
                AGGIELAND_REGION_ID,
                newSessions
            );

            createdFlags = await createUnresolvedPaxFlagsForSessions(
                supabase,
                AGGIELAND_REGION_ID,
                insertedSessions
            );
        }

        summary.inserted = insertedSessions.length;
        summary.createdAdminFlags = createdFlags.length;

        await insertImportRun(supabase, AGGIELAND_REGION_ID, {
            type: "aggieland_sync",
            mode: shouldApply ? "apply" : "dry_run",
            status: "success",
            summary,
        });

        return new Response(JSON.stringify({ 
            ok: true, 
            applied: shouldApply,
            summary 
        }), {
            headers: { 
                ...corsHeaders,
                "Content-Type": "application/json" 
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        try {
            await insertImportRun(supabase, AGGIELAND_REGION_ID, {
                type: "aggieland_sync",
                mode: shouldApply ? "apply" : "dry_run",
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
            headers: { 
                ...corsHeaders,
                "Content-Type": "application/json" 
            },
        });
    }
});