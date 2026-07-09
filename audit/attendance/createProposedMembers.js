import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";
const PROPOSED_CREATES_PATH = path.join(OUT_DIR, "official-proposed-member-creates.csv");
const MEMBERS_EXPORT_PATH = path.join(OUT_DIR, "members_rows.csv");
const CREATED_CSV_PATH = path.join(OUT_DIR, "created-proposed-members.csv");
const CREATED_REPORT_PATH = path.join(OUT_DIR, "created-proposed-members.md");

const IS_COMMIT = process.argv.includes("--commit");

function readCsv(filePath) {
    return parse(fs.readFileSync(filePath, "utf8"), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
    });
}

function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
}

function writeCsv(filePath, rows, headers) {
    const lines = [
        headers.join(","),
        ...rows.map(row => headers.map(header => csvEscape(row[header])).join(",")),
    ];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function requireInputs(paths) {
    const missing = paths.filter(filePath => !fs.existsSync(filePath));
    if (missing.length) {
        throw new Error(`Missing input file(s):\n${missing.map(filePath => `- ${path.relative(REPO_ROOT, filePath)}`).join("\n")}`);
    }
}

function normalize(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]/g, "");
}

function normalizeDate(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";

    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
        let [, month, day, year] = match;
        if (year.length === 2) year = `20${year}`;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

function getRequiredEnv() {
    const supabaseUrl = process.env.PROJECT_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey =
        process.env.PROJECT_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Missing Supabase admin env vars. Set PROJECT_SUPABASE_URL/SUPABASE_URL and PROJECT_SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY.");
    }

    return { supabaseUrl, serviceRoleKey };
}

function buildIndexes(members) {
    const regionMembers = members.filter(row => row.region_id === REGION_ID);
    const byPaxName = new Map();
    const homeAoByNormalized = new Map();

    for (const member of regionMembers) {
        const paxKey = normalize(member.pax_name);
        if (paxKey) {
            if (!byPaxName.has(paxKey)) byPaxName.set(paxKey, []);
            byPaxName.get(paxKey).push(member);
        }

        const homeAo = String(member.home_ao || "").trim();
        const homeAoKey = normalize(homeAo);
        if (homeAoKey) {
            if (!homeAoByNormalized.has(homeAoKey)) homeAoByNormalized.set(homeAoKey, new Set());
            homeAoByNormalized.get(homeAoKey).add(homeAo);
        }
    }

    return { byPaxName, homeAoByNormalized };
}

function resolveSchema(headers) {
    return {
        hasRegionId: headers.includes("region_id"),
        hasPaxName: headers.includes("pax_name"),
        hasRealName: headers.includes("real_name"),
        hasHomeAo: headers.includes("home_ao"),
        hasInvitedById: headers.includes("invited_by_id"),
        hasFirstPostDate: headers.includes("first_post_date"),
        hasStatus: headers.includes("status"),
    };
}

function resolveHomeAo(firstAo, schema, indexes) {
    const value = String(firstAo || "").trim();
    if (!value) return { value: "", note: "No first_ao supplied; home_ao skipped." };
    if (!schema.hasHomeAo) return { value: "", note: "members export has no home_ao column; first_ao skipped." };
    if (/^(dr|downrange|unknown|n\/a|na)$/i.test(value)) {
        return { value: "", note: `first_ao "${value}" is not a home AO; home_ao left null.` };
    }

    const candidates = [...(indexes.homeAoByNormalized.get(normalize(value)) || [])];
    if (candidates.length !== 1) {
        return { value: "", note: `first_ao "${value}" did not safely match one Aggieland AO; home_ao left null. Candidates: ${candidates.join("; ") || "none"}.` };
    }

    return { value: candidates[0], note: "" };
}

function resolveProudPapa(paxName, schema, indexes) {
    const value = String(paxName || "").trim();
    if (!value) return { value: "", note: "No proud_papa supplied; invited_by_id skipped." };
    if (!schema.hasInvitedById) return { value: "", note: "members export has no invited_by_id column; proud_papa skipped." };

    const candidates = indexes.byPaxName.get(normalize(value)) || [];
    if (candidates.length !== 1) {
        throw new Error(`Ambiguous or unsupported proud_papa "${value}". Candidate count: ${candidates.length}`);
    }

    return { value: candidates[0].id, note: "" };
}

function inferStatus(paxName, schema) {
    if (!schema.hasStatus) return { value: "", note: "members export has no status column; status skipped." };
    return {
        value: /\binactive\b/i.test(String(paxName || "")) ? "inactive" : "active",
        note: "",
    };
}

function buildInsertPayload(row, schema, indexes) {
    const paxName = String(row.pax_name || "").trim();
    if (!paxName) throw new Error("Missing required pax_name in proposed create row.");
    if (!schema.hasRegionId || !schema.hasPaxName) {
        throw new Error("members export does not include required region_id and pax_name columns.");
    }

    const payload = {
        region_id: REGION_ID,
        pax_name: paxName,
    };
    const skipped = [];
    const notes = [];

    if (schema.hasRealName) {
        payload.real_name = String(row.hospital_name || "").trim() || null;
    } else {
        skipped.push("real_name");
    }

    const homeAo = resolveHomeAo(row.first_ao, schema, indexes);
    if (homeAo.value) payload.home_ao = homeAo.value;
    if (homeAo.note) notes.push(homeAo.note);

    const proudPapa = resolveProudPapa(row.proud_papa, schema, indexes);
    if (proudPapa.value) payload.invited_by_id = proudPapa.value;
    if (proudPapa.note) notes.push(proudPapa.note);

    if (schema.hasFirstPostDate) {
        const firstPostDate = normalizeDate(row.fng_date);
        if (firstPostDate) payload.first_post_date = firstPostDate;
    } else {
        skipped.push("first_post_date");
    }

    const status = inferStatus(paxName, schema);
    if (status.value) payload.status = status.value;
    if (status.note) notes.push(status.note);

    return {
        payload,
        skipped,
        notes,
    };
}

async function assertNoSupabaseDuplicate(supabase, paxName) {
    const { data, error } = await supabase
        .from("members")
        .select("id,pax_name")
        .eq("region_id", REGION_ID)
        .eq("pax_name", paxName);

    if (error) throw error;
    if (data.length) {
        throw new Error(`Exact pax_name already exists in Supabase for "${paxName}": ${data.map(row => row.id).join("; ")}`);
    }
}

async function insertMember(supabase, payload) {
    const { data, error } = await supabase
        .from("members")
        .insert(payload)
        .select("id,pax_name")
        .single();

    if (error) throw error;
    return data;
}

function buildReport(rows) {
    const lines = [];
    lines.push("# Created Proposed Aggieland Members");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Mode: ${IS_COMMIT ? "commit" : "dry-run"}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Region ID: ${REGION_ID}`);
    lines.push(`- Proposed create rows: ${rows.length}`);
    lines.push(`- Created rows: ${rows.filter(row => row.status === "created").length}`);
    lines.push(`- Dry-run rows: ${rows.filter(row => row.status === "dry_run_ready").length}`);
    lines.push("");
    lines.push("## Rows");
    lines.push("");
    lines.push("| Status | Member ID | Pax Name | Real Name | Home AO | Invited By ID | First Post Date | Member Status | Skipped Optional Metadata | Notes |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|");
    rows.forEach(row => {
        lines.push(`| ${row.status} | ${row.created_member_id || "-"} | ${row.pax_name} | ${row.real_name || "-"} | ${row.home_ao || "-"} | ${row.invited_by_id || "-"} | ${row.first_post_date || "-"} | ${row.member_status || "-"} | ${row.skipped_optional_metadata || "-"} | ${row.notes || "-"} |`);
    });
    lines.push("");
    lines.push("## Safety");
    lines.push("");
    lines.push("- This script is dry-run by default.");
    lines.push("- Use `--commit` to insert members.");
    lines.push("- No schema or app runtime code is modified.");

    return `${lines.join("\n")}\n`;
}

async function main() {
    requireInputs([PROPOSED_CREATES_PATH, MEMBERS_EXPORT_PATH]);

    const proposedCreates = readCsv(PROPOSED_CREATES_PATH);
    const members = readCsv(MEMBERS_EXPORT_PATH);
    const memberHeaders = Object.keys(members[0] || {});
    const schema = resolveSchema(memberHeaders);
    const indexes = buildIndexes(members);
    const supabase = IS_COMMIT
        ? createClient(getRequiredEnv().supabaseUrl, getRequiredEnv().serviceRoleKey)
        : null;

    const rows = [];

    for (const sourceRow of proposedCreates) {
        const paxName = String(sourceRow.pax_name || "").trim();
        const exactLocalMatches = indexes.byPaxName.get(normalize(paxName)) || [];
        if (exactLocalMatches.length) {
            throw new Error(`Exact pax_name already exists in local members export for "${paxName}": ${exactLocalMatches.map(row => row.id).join("; ")}`);
        }

        const { payload, skipped, notes } = buildInsertPayload(sourceRow, schema, indexes);
        let created = null;

        if (IS_COMMIT) {
            await assertNoSupabaseDuplicate(supabase, paxName);
            created = await insertMember(supabase, payload);
        }

        rows.push({
            status: IS_COMMIT ? "created" : "dry_run_ready",
            created_member_id: created?.id || "",
            pax_name: payload.pax_name,
            real_name: payload.real_name || "",
            home_ao: payload.home_ao || "",
            invited_by_id: payload.invited_by_id || "",
            first_post_date: payload.first_post_date || "",
            member_status: payload.status || "",
            skipped_optional_metadata: skipped.join("; "),
            notes: notes.join("; "),
            source_hospital_name: sourceRow.hospital_name || "",
            source_first_ao: sourceRow.first_ao || "",
            source_proud_papa: sourceRow.proud_papa || "",
            source_fng_date: sourceRow.fng_date || "",
        });
    }

    writeCsv(
        CREATED_CSV_PATH,
        rows,
        [
            "status",
            "created_member_id",
            "pax_name",
            "real_name",
            "home_ao",
            "invited_by_id",
            "first_post_date",
            "member_status",
            "skipped_optional_metadata",
            "notes",
            "source_hospital_name",
            "source_first_ao",
            "source_proud_papa",
            "source_fng_date",
        ]
    );
    fs.writeFileSync(CREATED_REPORT_PATH, buildReport(rows));

    console.log(`Proposed member create ${IS_COMMIT ? "commit" : "dry-run"} complete.`);
    console.log(`Rows: ${rows.length}`);
    console.log(`Created: ${rows.filter(row => row.status === "created").length}`);
    console.log(`Report: ${path.relative(REPO_ROOT, CREATED_REPORT_PATH)}`);
    console.log(`CSV: ${path.relative(REPO_ROOT, CREATED_CSV_PATH)}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
