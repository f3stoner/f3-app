import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
const EXPECTED_SOURCE = "aggieland_official";
const PLAN_PATH = path.join(OUT_DIR, "aggieland-baseline-import-plan.csv");
const REPORT_MD_PATH = path.join(OUT_DIR, "member-stats-baseline-import-report.md");
const REPORT_CSV_PATH = path.join(OUT_DIR, "member-stats-baseline-import-report.csv");

const IS_COMMIT = process.argv.includes("--commit");
const IS_REPLACE = process.argv.includes("--replace");

const FALLBACK_BASELINE_COLUMNS = new Set([
    "id",
    "member_id",
    "region_id",
    "source",
    "baseline_date",
    "import_batch_id",
    "baseline_posts",
    "baseline_qs",
    "baseline_bds",
    "baseline_csaups",
    "baseline_dd_only",
    "baseline_other",
    "baseline_dr_posts",
    "baseline_last_post",
    "created_at",
    "created_by",
]);

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

function parseInteger(value, fieldName, paxName) {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) {
        throw new Error(`${fieldName} must be a non-negative integer for ${paxName || "unknown pax"}; got "${text}".`);
    }
    return Number.parseInt(text, 10);
}

function parseDate(value, fieldName, paxName, { required = true } = {}) {
    const text = String(value || "").trim();
    if (!text && !required) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new Error(`${fieldName} must be YYYY-MM-DD for ${paxName || "unknown pax"}; got "${text}".`);
    }
    return text;
}

function uuidFromString(value) {
    const bytes = crypto.createHash("sha256").update(String(value)).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function chunkArray(values, size = 100) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

function getIdempotencyKeyColumns(supportedColumns) {
    const required = ["region_id", "member_id"];
    for (const column of required) {
        if (!supportedColumns.has(column)) {
            throw new Error(`member_stats_baselines does not support required idempotency column "${column}".`);
        }
    }
    return supportedColumns.has("source")
        ? ["region_id", "member_id", "source"]
        : ["region_id", "member_id"];
}

function buildIdempotencyKeyFromValues(values, keyColumns) {
    return keyColumns.map(column => `${column}:${values[column] || ""}`).join("|");
}

function buildIdempotencyKey(row, keyColumns) {
    return buildIdempotencyKeyFromValues({
        region_id: REGION_ID,
        member_id: row.member_id,
        source: row.source,
    }, keyColumns);
}

function requireCleanPlan(rows) {
    if (!rows.length) throw new Error("Import plan is empty.");

    const first = rows[0];
    const summary = {
        totalOfficialRows: parseInteger(first.total_official_rows, "total_official_rows", "summary"),
        readyRows: parseInteger(first.rows_ready_for_baseline_insert, "rows_ready_for_baseline_insert", "summary"),
        proposedCreates: parseInteger(first.proposed_creates, "proposed_creates", "summary"),
        blockedRows: parseInteger(first.blocked_rows, "blocked_rows", "summary"),
        duplicateMissingRows: parseInteger(first.duplicate_selected_member_id_missing_rows, "duplicate_selected_member_id_missing_rows", "summary"),
        unaccountedRows: Object.prototype.hasOwnProperty.call(first, "unaccounted_rows") && String(first.unaccounted_rows || "").trim() !== ""
            ? parseInteger(first.unaccounted_rows, "unaccounted_rows", "summary")
            : 0,
    };

    const failures = [];
    if (summary.readyRows !== summary.totalOfficialRows) failures.push(`ready rows ${summary.readyRows} != total official rows ${summary.totalOfficialRows}`);
    if (summary.proposedCreates !== 0) failures.push(`proposed creates ${summary.proposedCreates} != 0`);
    if (summary.blockedRows !== 0) failures.push(`blocked rows ${summary.blockedRows} != 0`);
    if (summary.duplicateMissingRows !== 0) failures.push(`duplicate selected_member_id missing rows ${summary.duplicateMissingRows} != 0`);
    if (summary.unaccountedRows !== 0) failures.push(`unaccounted rows ${summary.unaccountedRows} != 0`);
    if (rows.length !== summary.readyRows) failures.push(`plan row count ${rows.length} != ready rows ${summary.readyRows}`);

    for (const row of rows) {
        if (row.total_official_rows !== first.total_official_rows) failures.push(`summary mismatch on ${row.pax_name}: total_official_rows`);
        if (row.rows_ready_for_baseline_insert !== first.rows_ready_for_baseline_insert) failures.push(`summary mismatch on ${row.pax_name}: rows_ready_for_baseline_insert`);
        if (row.proposed_creates !== first.proposed_creates) failures.push(`summary mismatch on ${row.pax_name}: proposed_creates`);
        if (row.blocked_rows !== first.blocked_rows) failures.push(`summary mismatch on ${row.pax_name}: blocked_rows`);
        if (row.duplicate_selected_member_id_missing_rows !== first.duplicate_selected_member_id_missing_rows) failures.push(`summary mismatch on ${row.pax_name}: duplicate_selected_member_id_missing_rows`);
        if (Object.prototype.hasOwnProperty.call(first, "unaccounted_rows") && row.unaccounted_rows !== first.unaccounted_rows) failures.push(`summary mismatch on ${row.pax_name}: unaccounted_rows`);
    }

    if (failures.length) {
        throw new Error(`Import plan is not perfectly clean:\n- ${failures.join("\n- ")}`);
    }

    return summary;
}

function validatePlanRows(rows) {
    const seenMemberIds = new Map();

    return rows.map(row => {
        const paxName = String(row.pax_name || "").trim();
        const memberId = String(row.member_id || "").trim();
        if (!memberId) throw new Error(`Missing selected_member_id/member_id for ${paxName || "unknown pax"}.`);
        if (seenMemberIds.has(memberId) && String(row.allow_duplicate_member_id || "").toLowerCase() !== "true") {
            throw new Error(`member_id ${memberId} appears more than once (${seenMemberIds.get(memberId)} and ${paxName}) without allow_duplicate_member_id=true.`);
        }
        seenMemberIds.set(memberId, paxName);

        const source = String(row.source || "").trim();
        if (source !== EXPECTED_SOURCE) throw new Error(`Unexpected source for ${paxName}: "${source}".`);

        return {
            ...row,
            member_id: memberId,
            pax_name: paxName,
            baseline_date: parseDate(row.baseline_date, "baseline_date", paxName),
            baseline_posts: parseInteger(row.baseline_posts, "baseline_posts", paxName),
            baseline_qs: parseInteger(row.baseline_qs, "baseline_qs", paxName),
            baseline_last_post: parseDate(row.baseline_last_post, "baseline_last_post", paxName, { required: false }),
        };
    });
}

async function getSupportedColumns(supabase) {
    if (!supabase) return FALLBACK_BASELINE_COLUMNS;

    const { data, error } = await supabase
        .from("member_stats_baselines")
        .select("*")
        .limit(1);

    if (error) throw error;
    if (data?.[0]) return new Set(Object.keys(data[0]));
    return FALLBACK_BASELINE_COLUMNS;
}

function buildPayload(row, supportedColumns, dbImportBatchId) {
    const payload = {};
    const setIfSupported = (column, value) => {
        if (supportedColumns.has(column)) payload[column] = value;
    };

    setIfSupported("member_id", row.member_id);
    setIfSupported("region_id", REGION_ID);
    setIfSupported("source", row.source);
    setIfSupported("baseline_date", row.baseline_date);
    setIfSupported("import_batch_id", dbImportBatchId);
    setIfSupported("baseline_posts", row.baseline_posts);
    setIfSupported("baseline_qs", row.baseline_qs);
    setIfSupported("baseline_bds", 0);
    setIfSupported("baseline_csaups", 0);
    setIfSupported("baseline_dd_only", 0);
    setIfSupported("baseline_other", 0);
    setIfSupported("baseline_dr_posts", 0);
    setIfSupported("baseline_last_post", row.baseline_last_post || null);

    for (const required of ["member_id", "region_id", "baseline_date", "baseline_posts", "baseline_qs"]) {
        if (!Object.prototype.hasOwnProperty.call(payload, required)) {
            throw new Error(`member_stats_baselines does not support required column "${required}".`);
        }
    }

    return payload;
}

async function findExistingRows(supabase, rows, keyColumns, supportedColumns) {
    const existingByKey = new Map();
    const duplicateErrors = [];
    const memberIds = [...new Set(rows.map(row => row.member_id))];
    const selectColumns = ["id", "member_id", "region_id"];
    if (supportedColumns.has("source")) selectColumns.push("source");
    if (supportedColumns.has("baseline_date")) selectColumns.push("baseline_date");
    if (supportedColumns.has("import_batch_id")) selectColumns.push("import_batch_id");

    for (const memberIdChunk of chunkArray(memberIds)) {
        let query = supabase
            .from("member_stats_baselines")
            .select(selectColumns.join(","))
            .eq("region_id", REGION_ID)
            .in("member_id", memberIdChunk);

        if (keyColumns.includes("source")) {
            query = query.eq("source", EXPECTED_SOURCE);
        }

        const { data, error } = await query;
        if (error) throw error;

        for (const existingRow of data || []) {
            const key = buildIdempotencyKeyFromValues(existingRow, keyColumns);
            if (!existingByKey.has(key)) existingByKey.set(key, []);
            existingByKey.get(key).push(existingRow);
        }
    }

    for (const [key, existingRows] of existingByKey.entries()) {
        if (existingRows.length > 1) {
            duplicateErrors.push(`Found ${existingRows.length} existing member_stats_baselines rows for idempotency key ${key}: ${existingRows.map(row => row.id).join(", ")}`);
        }
    }

    if (duplicateErrors.length) {
        throw new Error(`Duplicate existing baseline rows detected:\n- ${duplicateErrors.join("\n- ")}`);
    }

    return existingByKey;
}

function buildReport({ planImportBatchId, dbImportBatchId, rows, reportRows, errors, mode, existingChecked, idempotencyKeyColumns }) {
    const inserted = reportRows.filter(row => row.status === "inserted").length;
    const updated = reportRows.filter(row => row.status === "updated").length;
    const wouldInsert = reportRows.filter(row => row.status === "would_insert").length;
    const alreadyExists = reportRows.filter(row => row.status === "already_exists").length;
    const skipped = reportRows.filter(row => row.status.startsWith("skipped")).length;
    const eligible = rows.length;

    const lines = [];
    lines.push("# Member Stats Baseline Import Report");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Mode: ${mode}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Plan import batch ID: ${planImportBatchId}`);
    lines.push(`- DB import batch UUID: ${dbImportBatchId}`);
    lines.push(`- Source: ${EXPECTED_SOURCE}`);
    lines.push(`- Rows read: ${rows.length}`);
    lines.push(`- Rows eligible: ${eligible}`);
    lines.push(`- Rows that would insert: ${wouldInsert}`);
    lines.push(`- Rows inserted: ${inserted}`);
    lines.push(`- Rows updated: ${updated}`);
    lines.push(`- Rows already exist: ${alreadyExists}`);
    lines.push(`- Rows skipped: ${skipped}`);
    lines.push(`- Errors: ${errors.length}`);
    lines.push(`- Existing-row check: ${existingChecked ? "performed" : "not performed"}`);
    lines.push(`- Idempotency key: ${idempotencyKeyColumns.length ? idempotencyKeyColumns.join(" + ") : "unknown"}`);
    lines.push("");
    lines.push("## Errors");
    lines.push("");
    if (!errors.length) {
        lines.push("- None");
    } else {
        errors.forEach(error => lines.push(`- ${error}`));
    }
    lines.push("");
    lines.push("## Rows");
    lines.push("");
    lines.push("| Status | Member ID | Pax Name | Posts | Qs | Last Post | Message |");
    lines.push("|---|---|---|---:|---:|---|---|");
    reportRows.slice(0, 150).forEach(row => {
        lines.push(`| ${row.status} | ${row.member_id || "-"} | ${row.pax_name || "-"} | ${row.baseline_posts ?? "-"} | ${row.baseline_qs ?? "-"} | ${row.baseline_last_post || "-"} | ${row.message || "-"} |`);
    });
    if (reportRows.length > 150) lines.push(`| ... | ${reportRows.length - 150} more rows |  |  |  |  |`);

    return `${lines.join("\n")}\n`;
}

function writeReports({ planImportBatchId, dbImportBatchId, rows, reportRows, errors, mode, existingChecked, idempotencyKeyColumns }) {
    writeCsv(
        REPORT_CSV_PATH,
        reportRows,
        [
            "status",
            "idempotency_key",
            "idempotency_key_columns",
            "member_id",
            "pax_name",
            "baseline_posts",
            "baseline_qs",
            "baseline_last_post",
            "message",
        ]
    );
    fs.writeFileSync(
        REPORT_MD_PATH,
        buildReport({ planImportBatchId, dbImportBatchId, rows, reportRows, errors, mode, existingChecked, idempotencyKeyColumns })
    );
}

async function main() {
    if (!fs.existsSync(PLAN_PATH)) {
        throw new Error(`Missing import plan: ${path.relative(REPO_ROOT, PLAN_PATH)}`);
    }

    const rawRows = readCsv(PLAN_PATH);
    const planImportBatchId = rawRows[0]?.import_batch_id || "";
    const dbImportBatchId = uuidFromString(planImportBatchId);
    const mode = IS_COMMIT ? (IS_REPLACE ? "commit_replace" : "commit") : "dry-run";
    let rows = [];
    let reportRows = [];
    const errors = [];
    let existingChecked = false;
    let idempotencyKeyColumns = [];

    try {
        requireCleanPlan(rawRows);
        rows = validatePlanRows(rawRows);
    } catch (error) {
        errors.push(error.message);
        reportRows = rawRows.map(row => ({
            status: "skipped_validation_error",
            idempotency_key: "",
            idempotency_key_columns: "",
            member_id: row.member_id || "",
            pax_name: row.pax_name || "",
            baseline_posts: row.baseline_posts || "",
            baseline_qs: row.baseline_qs || "",
            baseline_last_post: row.baseline_last_post || "",
            message: "Validation failed before import.",
        }));
        writeReports({ planImportBatchId, dbImportBatchId, rows: rawRows, reportRows, errors, mode, existingChecked, idempotencyKeyColumns });
        throw error;
    }

    const supabase = createClient(getRequiredEnv().supabaseUrl, getRequiredEnv().serviceRoleKey);
    const supportedColumns = await getSupportedColumns(supabase);
    idempotencyKeyColumns = getIdempotencyKeyColumns(supportedColumns);
    const payloads = rows.map(row => ({
        row,
        payload: buildPayload(row, supportedColumns, dbImportBatchId),
        idempotencyKey: buildIdempotencyKey(row, idempotencyKeyColumns),
    }));
    const existingByKey = await findExistingRows(supabase, rows, idempotencyKeyColumns, supportedColumns);
    existingChecked = true;

    if (!IS_COMMIT) {
        reportRows = payloads.map(({ row, idempotencyKey }) => ({
            status: existingByKey.has(idempotencyKey) ? "already_exists" : "would_insert",
            idempotency_key: idempotencyKey,
            idempotency_key_columns: idempotencyKeyColumns.join(" + "),
            member_id: row.member_id,
            pax_name: row.pax_name,
            baseline_posts: row.baseline_posts,
            baseline_qs: row.baseline_qs,
            baseline_last_post: row.baseline_last_post,
            message: existingByKey.has(idempotencyKey)
                ? "Existing baseline row detected; dry-run would skip."
                : "Dry-run only; Supabase not modified.",
        }));
        writeReports({ planImportBatchId, dbImportBatchId, rows, reportRows, errors, mode, existingChecked, idempotencyKeyColumns });
        const wouldInsert = reportRows.filter(row => row.status === "would_insert").length;
        const alreadyExists = reportRows.filter(row => row.status === "already_exists").length;
        console.log("Member stats baseline import dry-run complete.");
        console.log(`Rows read: ${rows.length}`);
        console.log(`Rows eligible: ${rows.length}`);
        console.log(`Rows that would insert: ${wouldInsert}`);
        console.log(`Rows already exist: ${alreadyExists}`);
        console.log("Rows skipped: 0");
        console.log("Errors: 0");
        console.log(`Idempotency key: ${idempotencyKeyColumns.join(" + ")}`);
        console.log(`Report: ${path.relative(REPO_ROOT, REPORT_MD_PATH)}`);
        console.log(`CSV: ${path.relative(REPO_ROOT, REPORT_CSV_PATH)}`);
        return;
    }

    const insertPayloads = payloads
        .filter(({ idempotencyKey }) => !existingByKey.has(idempotencyKey))
        .map(({ payload }) => payload);

    let insertedRows = [];
    if (insertPayloads.length) {
        const query = supabase
            .from("member_stats_baselines")
            .insert(insertPayloads)
            .select("member_id");
        const { data, error } = await query;
        if (error) throw error;
        insertedRows = data || [];
    }

    const updatedKeys = new Set();
    if (IS_REPLACE) {
        for (const { payload, idempotencyKey } of payloads) {
            const existingRows = existingByKey.get(idempotencyKey);
            if (!existingRows?.length) continue;
            const existingRow = existingRows[0];
            const { error } = await supabase
                .from("member_stats_baselines")
                .update(payload)
                .eq("id", existingRow.id);
            if (error) throw error;
            updatedKeys.add(idempotencyKey);
        }
    }

    const insertedMemberIds = new Set(insertedRows.map(row => row.member_id));
    reportRows = payloads.map(({ row, idempotencyKey }) => {
        if (existingByKey.has(idempotencyKey) && !IS_REPLACE) {
            return {
                status: "already_exists",
                idempotency_key: idempotencyKey,
                idempotency_key_columns: idempotencyKeyColumns.join(" + "),
                member_id: row.member_id,
                pax_name: row.pax_name,
                baseline_posts: row.baseline_posts,
                baseline_qs: row.baseline_qs,
                baseline_last_post: row.baseline_last_post,
                message: "Existing row skipped.",
            };
        }
        if (updatedKeys.has(idempotencyKey)) {
            return {
                status: "updated",
                idempotency_key: idempotencyKey,
                idempotency_key_columns: idempotencyKeyColumns.join(" + "),
                member_id: row.member_id,
                pax_name: row.pax_name,
                baseline_posts: row.baseline_posts,
                baseline_qs: row.baseline_qs,
                baseline_last_post: row.baseline_last_post,
                message: "Existing row updated with --replace.",
            };
        }
        return {
            status: insertedMemberIds.has(row.member_id) ? "inserted" : "skipped_unknown",
            idempotency_key: idempotencyKey,
            idempotency_key_columns: idempotencyKeyColumns.join(" + "),
            member_id: row.member_id,
            pax_name: row.pax_name,
            baseline_posts: row.baseline_posts,
            baseline_qs: row.baseline_qs,
            baseline_last_post: row.baseline_last_post,
            message: "Inserted.",
        };
    });

    writeReports({ planImportBatchId, dbImportBatchId, rows, reportRows, errors, mode, existingChecked, idempotencyKeyColumns });
    console.log("Member stats baseline import commit complete.");
    console.log(`Rows inserted: ${reportRows.filter(row => row.status === "inserted").length}`);
    console.log(`Rows updated: ${reportRows.filter(row => row.status === "updated").length}`);
    console.log(`Rows skipped existing: ${reportRows.filter(row => row.status === "already_exists").length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Idempotency key: ${idempotencyKeyColumns.join(" + ")}`);
    console.log(`Report: ${path.relative(REPO_ROOT, REPORT_MD_PATH)}`);
    console.log(`CSV: ${path.relative(REPO_ROOT, REPORT_CSV_PATH)}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
