import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;

const SOURCE = "aggieland_official";
const IMPORT_READY_PATH = path.join(OUT_DIR, "official-baseline-import-ready.csv");
const PROPOSED_CREATES_PATH = path.join(OUT_DIR, "official-proposed-member-creates.csv");
const MANUAL_DECISIONS_PATH = path.join(OUT_DIR, "official-baseline-manual-decisions-template.csv");
const MATCHES_PATH = path.join(OUT_DIR, "official-baseline-matches.csv");
const PLAN_MD_PATH = path.join(OUT_DIR, "aggieland-baseline-import-plan.md");
const PLAN_CSV_PATH = path.join(OUT_DIR, "aggieland-baseline-import-plan.csv");

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

function normalizeDecision(value) {
    return String(value || "").trim();
}

function normalizeId(value) {
    return String(value || "").trim();
}

function getImportBatchId() {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return `${SOURCE}_${stamp}`;
}

function indexBy(rows, keyName) {
    return rows.reduce((acc, row) => {
        const key = String(row[keyName] || "").trim();
        if (key) acc.set(key, row);
        return acc;
    }, new Map());
}

function buildAutomaticRows({ importReadyRows, importBatchId }) {
    return importReadyRows.map(row => ({
        import_batch_id: importBatchId,
        baseline_date: row.baseline_cutover_date,
        source: row.source || SOURCE,
        plan_status: "ready_existing_member",
        member_id: row.member_id,
        pax_name: row.source_pax_name,
        baseline_posts: row.legacy_posts,
        baseline_qs: row.legacy_qs,
        baseline_last_post: row.source_last_post,
        decision: row.import_ready_reason,
        notes: "",
    }));
}

function buildManualRows({ manualDecisionRows, matchesByPax, importBatchId, baselineDate }) {
    const rows = [];
    const blockedRows = [];
    const duplicateSelectedMissingRows = [];

    for (const decisionRow of manualDecisionRows) {
        const officialPax = String(decisionRow.official_pax || "").trim();
        const decision = normalizeDecision(decisionRow.recommended_decision);
        const selectedMemberId = normalizeId(decisionRow.selected_member_id);
        const match = matchesByPax.get(officialPax) || {};
        const base = {
            import_batch_id: importBatchId,
            baseline_date: baselineDate,
            source: SOURCE,
            member_id: "",
            pax_name: officialPax,
            baseline_posts: match.legacy_posts || "",
            baseline_qs: match.legacy_qs || "",
            baseline_last_post: match.source_last_post || "",
            decision,
            notes: decisionRow.notes || "",
        };

        if (decision === "accept_metadata_conflict" || decision === "accept_match_after_create") {
            const memberId = selectedMemberId || match.member_id || "";
            rows.push({
                ...base,
                plan_status: decision === "accept_metadata_conflict"
                    ? "ready_manual_metadata_accept"
                    : "ready_after_related_create",
                member_id: memberId,
            });
            continue;
        }

        if (
            decision === "map_to_existing_member" ||
            decision === "resolve_duplicate_member" ||
            decision === "verify_metadata_then_import"
        ) {
            if (selectedMemberId) {
                rows.push({
                    ...base,
                    plan_status: decision === "verify_metadata_then_import"
                        ? "ready_verified_metadata_selected_member"
                        : "ready_manual_selected_member",
                    member_id: selectedMemberId,
                });
            } else {
                const blocked = {
                    ...base,
                    plan_status: "blocked_missing_selected_member_id",
                    block_reason: `${decision} requires selected_member_id`,
                };
                duplicateSelectedMissingRows.push(blocked);
            }
            continue;
        }

        if (decision === "needs_human_review") {
            blockedRows.push({
                ...base,
                plan_status: "blocked_needs_human_review",
                block_reason: "needs_human_review",
                member_id: match.member_id || "",
            });
            continue;
        }

        if (decision === "create_member") {
            continue;
        }

        if (decision) {
            blockedRows.push({
                ...base,
                plan_status: "blocked_unknown_decision",
                block_reason: `Unknown recommended_decision: ${decision}`,
                member_id: match.member_id || "",
            });
        }
    }

    return { rows, blockedRows, duplicateSelectedMissingRows };
}

function truthy(value) {
    return ["true", "yes", "1"].includes(String(value || "").trim().toLowerCase());
}

function buildCreateRows({ proposedCreateRows, manualDecisionRows, matchesByPax, importBatchId, baselineDate }) {
    const proposedCreatesByPax = indexBy(proposedCreateRows, "pax_name");
    const rows = [];

    for (const decisionRow of manualDecisionRows) {
        const officialPax = String(decisionRow.official_pax || "").trim();
        const decision = normalizeDecision(decisionRow.recommended_decision);
        if (decision !== "create_member" && !truthy(decisionRow.create_member)) continue;

        const proposedCreate = proposedCreatesByPax.get(officialPax) || {};
        const match = matchesByPax.get(officialPax) || {};
        rows.push({
            import_batch_id: importBatchId,
            baseline_date: baselineDate,
            source: SOURCE,
            plan_status: "proposed_create",
            member_id: "",
            pax_name: officialPax,
            hospital_name: proposedCreate.hospital_name || match.raw_real_name || "",
            first_ao: proposedCreate.first_ao || match.raw_first_ao || "",
            proud_papa: proposedCreate.proud_papa || match.raw_proud_papa || "",
            fng_date: proposedCreate.fng_date || match.raw_fng_date || "",
            overall_posts: proposedCreate.overall_posts || match.legacy_posts || "",
            qs: proposedCreate.qs || match.legacy_qs || "",
            bds: proposedCreate.bds || match.official_bds || "",
            csaups: proposedCreate.csaups || match.official_csaups || "",
            dd_only: proposedCreate.dd_only || match.official_dd_only || "",
            other: proposedCreate.other || match.official_other || "",
            last_post: proposedCreate.last_post || match.source_last_post || "",
            dr_posts: proposedCreate.dr_posts || "",
            decision,
            notes: decisionRow.notes || proposedCreate.reason || "Manual decision requires creating this official PAX identity before baseline import.",
        });
    }

    return rows;
}

function enforceReadyRowsHaveMemberIds(planRows, blockedRows) {
    const readyRows = [];
    for (const row of planRows) {
        if (normalizeId(row.member_id)) {
            readyRows.push(row);
            continue;
        }

        blockedRows.push({
            ...row,
            plan_status: "blocked_missing_member_id",
            block_reason: "Ready baseline row is missing member_id.",
        });
    }

    return readyRows;
}

function getPaxName(row) {
    return String(row.pax_name || row.source_pax_name || row.official_pax || "").trim();
}

function buildAccounting({ officialRows, planRows, createRows, blockedRows, duplicateSelectedMissingRows }) {
    const officialByPax = indexBy(officialRows, "source_pax_name");
    const bucketedByPax = new Map();
    const addBucket = (bucket, rows) => {
        for (const row of rows) {
            const paxName = getPaxName(row);
            if (!paxName) continue;
            if (!bucketedByPax.has(paxName)) bucketedByPax.set(paxName, []);
            bucketedByPax.get(paxName).push({ bucket, row });
        }
    };

    addBucket("ready", planRows);
    addBucket("proposed_create", createRows);
    addBucket("blocked", blockedRows);
    addBucket("duplicate_selected_member_id_missing", duplicateSelectedMissingRows);

    const unaccountedRows = [];
    const multiBucketRows = [];

    for (const [paxName, officialRow] of officialByPax.entries()) {
        const bucketEntries = bucketedByPax.get(paxName) || [];
        if (!bucketEntries.length) {
            unaccountedRows.push({
                pax_name: paxName,
                classification: officialRow.classification || "",
                reason: officialRow.reason || "",
                legacy_posts: officialRow.legacy_posts || "",
                legacy_qs: officialRow.legacy_qs || "",
                source_last_post: officialRow.source_last_post || "",
            });
            continue;
        }

        const buckets = [...new Set(bucketEntries.map(entry => entry.bucket))];
        if (bucketEntries.length !== 1 || buckets.length !== 1) {
            multiBucketRows.push({
                pax_name: paxName,
                buckets: buckets.join("; "),
                assignments: bucketEntries.map(entry => entry.bucket).join("; "),
            });
        }
    }

    const bucketTotal = planRows.length + createRows.length + blockedRows.length + duplicateSelectedMissingRows.length;
    return {
        bucketTotal,
        unaccountedRows: unaccountedRows.sort((a, b) => a.pax_name.localeCompare(b.pax_name)),
        multiBucketRows: multiBucketRows.sort((a, b) => a.pax_name.localeCompare(b.pax_name)),
    };
}

function buildMarkdownReport({ importBatchId, baselineDate, totalOfficialRows, planRows, createRows, blockedRows, duplicateSelectedMissingRows, accounting }) {
    const lines = [];
    lines.push("# Aggieland Baseline Import Plan");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Import batch ID: ${importBatchId}`);
    lines.push(`- Baseline date: ${baselineDate || "unknown"}`);
    lines.push(`- Source: ${SOURCE}`);
    lines.push(`- Total official rows: ${totalOfficialRows}`);
    lines.push(`- Rows ready for baseline insert: ${planRows.length}`);
    lines.push(`- Proposed creates: ${createRows.length}`);
    lines.push(`- Blocked rows: ${blockedRows.length}`);
    lines.push(`- Duplicate selected_member_id missing rows: ${duplicateSelectedMissingRows.length}`);
    lines.push(`- Unaccounted rows: ${accounting.unaccountedRows.length}`);
    lines.push(`- Total bucketed rows: ${accounting.bucketTotal}`);
    lines.push(`- Accounting status: ${accounting.bucketTotal === totalOfficialRows && accounting.unaccountedRows.length === 0 && accounting.multiBucketRows.length === 0 ? "clean" : "FAILED"}`);
    lines.push("");
    lines.push("## Plan Rows");
    lines.push("");
    lines.push("| Member ID | Pax Name | Posts | Qs | Last Post | Status | Decision |");
    lines.push("|---|---|---:|---:|---|---|---|");
    planRows.slice(0, 100).forEach(row => {
        lines.push(`| ${row.member_id || "-"} | ${row.pax_name || "-"} | ${row.baseline_posts || 0} | ${row.baseline_qs || 0} | ${row.baseline_last_post || "-"} | ${row.plan_status} | ${row.decision || "-"} |`);
    });
    if (planRows.length > 100) lines.push(`| ... | ${planRows.length - 100} more rows |  |  |  |  |  |`);
    lines.push("");
    lines.push("## Proposed Creates");
    lines.push("");
    if (!createRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Pax Name | Hospital Name | First AO | Posts | Qs | Last Post |");
        lines.push("|---|---|---|---:|---:|---|");
        createRows.forEach(row => {
            lines.push(`| ${row.pax_name || "-"} | ${row.hospital_name || "-"} | ${row.first_ao || "-"} | ${row.overall_posts || 0} | ${row.qs || 0} | ${row.last_post || "-"} |`);
        });
    }
    lines.push("");
    lines.push("## Blocked Rows");
    lines.push("");
    if (!blockedRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Pax Name | Decision | Block Reason | Notes |");
        lines.push("|---|---|---|---|");
        blockedRows.forEach(row => {
            lines.push(`| ${row.pax_name || "-"} | ${row.decision || "-"} | ${row.block_reason || row.plan_status} | ${row.notes || "-"} |`);
        });
    }
    lines.push("");
    lines.push("## Unaccounted Rows");
    lines.push("");
    if (!accounting.unaccountedRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Pax Name | Classification | Posts | Qs | Last Post | Reason |");
        lines.push("|---|---|---:|---:|---|---|");
        accounting.unaccountedRows.forEach(row => {
            lines.push(`| ${row.pax_name || "-"} | ${row.classification || "-"} | ${row.legacy_posts || 0} | ${row.legacy_qs || 0} | ${row.source_last_post || "-"} | ${row.reason || "-"} |`);
        });
    }
    lines.push("");
    lines.push("## Multi-Bucket Rows");
    lines.push("");
    if (!accounting.multiBucketRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Pax Name | Buckets | Assignments |");
        lines.push("|---|---|---|");
        accounting.multiBucketRows.forEach(row => {
            lines.push(`| ${row.pax_name || "-"} | ${row.buckets || "-"} | ${row.assignments || "-"} |`);
        });
    }
    lines.push("");
    lines.push("## Dry-Run Only");
    lines.push("");
    lines.push("This script does not connect to Supabase and does not insert, update, or delete records.");

    return `${lines.join("\n")}\n`;
}

function main() {
    requireInputs([
        IMPORT_READY_PATH,
        PROPOSED_CREATES_PATH,
        MANUAL_DECISIONS_PATH,
        MATCHES_PATH,
    ]);

    const importReadyRows = readCsv(IMPORT_READY_PATH);
    const proposedCreateRows = readCsv(PROPOSED_CREATES_PATH);
    const manualDecisionRows = readCsv(MANUAL_DECISIONS_PATH);
    const matchRows = readCsv(MATCHES_PATH);
    const matchesByPax = indexBy(matchRows, "source_pax_name");
    const baselineDate = importReadyRows[0]?.baseline_cutover_date || "";
    const importBatchId = getImportBatchId();
    const totalOfficialRows = matchRows.length;
    const automaticRows = buildAutomaticRows({ importReadyRows, importBatchId });
    const manual = buildManualRows({
        manualDecisionRows,
        matchesByPax,
        importBatchId,
        baselineDate,
    });
    const createRows = buildCreateRows({
        proposedCreateRows,
        manualDecisionRows,
        matchesByPax,
        importBatchId,
        baselineDate,
    });
    const initialPlanRows = [...automaticRows, ...manual.rows]
        .sort((a, b) => a.pax_name.localeCompare(b.pax_name));
    const blockedRows = manual.blockedRows
        .sort((a, b) => a.pax_name.localeCompare(b.pax_name));
    const planRows = enforceReadyRowsHaveMemberIds(initialPlanRows, blockedRows)
        .sort((a, b) => a.pax_name.localeCompare(b.pax_name));
    blockedRows.sort((a, b) => a.pax_name.localeCompare(b.pax_name));
    const duplicateSelectedMissingRows = manual.duplicateSelectedMissingRows
        .sort((a, b) => a.pax_name.localeCompare(b.pax_name));
    const accounting = buildAccounting({
        officialRows: matchRows,
        planRows,
        createRows,
        blockedRows,
        duplicateSelectedMissingRows,
    });
    const isAccountingClean =
        accounting.bucketTotal === totalOfficialRows &&
        accounting.unaccountedRows.length === 0 &&
        accounting.multiBucketRows.length === 0;
    const addSummary = row => ({
        ...row,
        total_official_rows: totalOfficialRows,
        rows_ready_for_baseline_insert: planRows.length,
        proposed_creates: createRows.length,
        blocked_rows: blockedRows.length,
        duplicate_selected_member_id_missing_rows: duplicateSelectedMissingRows.length,
        unaccounted_rows: accounting.unaccountedRows.length,
        unaccounted_pax_names: accounting.unaccountedRows.map(unaccounted => unaccounted.pax_name).join("; "),
        total_bucketed_rows: accounting.bucketTotal,
        accounting_status: isAccountingClean ? "clean" : "failed",
    });
    const planRowsWithSummary = [
        ...planRows.map(addSummary),
        ...accounting.unaccountedRows.map(row => addSummary({
            import_batch_id: importBatchId,
            baseline_date: baselineDate,
            source: SOURCE,
            plan_status: "unaccounted",
            member_id: "",
            pax_name: row.pax_name,
            baseline_posts: row.legacy_posts,
            baseline_qs: row.legacy_qs,
            baseline_last_post: row.source_last_post,
            decision: row.classification,
            notes: row.reason,
        })),
    ];

    writeCsv(
        PLAN_CSV_PATH,
        planRowsWithSummary,
        [
            "import_batch_id",
            "baseline_date",
            "source",
            "total_official_rows",
            "rows_ready_for_baseline_insert",
            "proposed_creates",
            "blocked_rows",
            "duplicate_selected_member_id_missing_rows",
            "unaccounted_rows",
            "unaccounted_pax_names",
            "total_bucketed_rows",
            "accounting_status",
            "plan_status",
            "member_id",
            "pax_name",
            "baseline_posts",
            "baseline_qs",
            "baseline_last_post",
            "decision",
            "notes",
        ]
    );

    fs.writeFileSync(
        PLAN_MD_PATH,
        buildMarkdownReport({
            importBatchId,
            baselineDate,
            totalOfficialRows,
            planRows,
            createRows,
            blockedRows,
            duplicateSelectedMissingRows,
            accounting,
        })
    );

    console.log(isAccountingClean
        ? "Aggieland baseline import plan complete."
        : "Aggieland baseline import plan failed accounting.");
    console.log(`Import batch ID: ${importBatchId}`);
    console.log(`Total official rows: ${totalOfficialRows}`);
    console.log(`Rows ready for baseline insert: ${planRows.length}`);
    console.log(`Proposed creates: ${createRows.length}`);
    console.log(`Blocked rows: ${blockedRows.length}`);
    console.log(`Duplicate selected_member_id missing rows: ${duplicateSelectedMissingRows.length}`);
    console.log(`Unaccounted rows: ${accounting.unaccountedRows.length}`);
    console.log(`Total bucketed rows: ${accounting.bucketTotal}`);
    console.log(`Report: ${path.relative(REPO_ROOT, PLAN_MD_PATH)}`);
    console.log(`CSV: ${path.relative(REPO_ROOT, PLAN_CSV_PATH)}`);

    if (!isAccountingClean) {
        const failures = [];
        if (accounting.bucketTotal !== totalOfficialRows) {
            failures.push(`ready + proposed_create + blocked + duplicate_missing = ${accounting.bucketTotal}, expected ${totalOfficialRows}`);
        }
        if (accounting.unaccountedRows.length) {
            failures.push(`unaccounted rows: ${accounting.unaccountedRows.map(row => row.pax_name).join(", ")}`);
        }
        if (accounting.multiBucketRows.length) {
            failures.push(`multi-bucket rows: ${accounting.multiBucketRows.map(row => `${row.pax_name} (${row.assignments})`).join(", ")}`);
        }
        throw new Error(`Import plan accounting failed:\n- ${failures.join("\n- ")}`);
    }
}

main();
