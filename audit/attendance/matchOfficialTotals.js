import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;

const REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";
const SOURCE = "aggieland_official";
const PREVIOUS_REVIEW_REQUIRED = 187;

const MEMBERS_PATH = path.join(OUT_DIR, "members_rows.csv");
const OFFICIAL_TOTALS_PATH = path.join(OUT_DIR, "Simple Overall Totals v1 - Overall Totals.csv");
const RAW_PAX_MASTER_PATH = path.join(OUT_DIR, "Simple Overall Totals v1 - Raw_Pax_Master.csv");

function readCsv(filePath) {
    return parse(fs.readFileSync(filePath, "utf8"), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
    });
}

function normalizeName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]/g, "");
}

function normalizeBaseName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/\([^)]*\)/g, "")
        .replace(/^dr\.?\s+/i, "")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]/g, "");
}

function hasIdentitySuffix(value) {
    return /\((?:[^)]*(?:2\.0|dr|fng|inactive|liver king)[^)]*)\)/i.test(String(value || ""));
}

function hasQualifiedIdentitySuffix(value) {
    return /\((?:[^)]*(?:2\.0|dr|dj|kotter)[^)]*)\)/i.test(String(value || ""));
}

function hasParentheticalQualifier(value) {
    return /\([^)]*\)/.test(String(value || ""));
}

function parseInteger(value) {
    const normalized = String(value || "").replace(/,/g, "").trim();
    if (!normalized) return 0;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : 0;
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

function addToMapArray(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function buildIndexes({ members, rawPaxMaster, officialRows }) {
    const memberByName = new Map();
    const memberByBaseName = new Map();
    const rawByName = new Map();
    const rawByBaseName = new Map();
    const officialByBaseName = new Map();

    for (const member of members) {
        addToMapArray(memberByName, normalizeName(member.pax_name), member);
        addToMapArray(memberByBaseName, normalizeBaseName(member.pax_name), member);
    }

    for (const row of rawPaxMaster) {
        addToMapArray(rawByName, normalizeName(row.Name), row);
        addToMapArray(rawByBaseName, normalizeBaseName(row.Name), row);
    }

    for (const row of officialRows) {
        addToMapArray(officialByBaseName, normalizeBaseName(row.Pax), row);
    }

    return {
        memberByName,
        memberByBaseName,
        rawByName,
        rawByBaseName,
        officialByBaseName,
    };
}

function getCandidateSummary(candidates = []) {
    return {
        ids: unique(candidates.map(member => member.id)).join("; "),
        names: unique(candidates.map(member => member.pax_name)).join("; "),
        statuses: unique(candidates.map(member => member.status)).join("; "),
    };
}

function classifyOfficialRow(row, indexes) {
    const pax = String(row.Pax || "").trim();
    const nameKey = normalizeName(pax);
    const baseKey = normalizeBaseName(pax);
    const exactMembers = indexes.memberByName.get(nameKey) || [];
    const baseMembers = indexes.memberByBaseName.get(baseKey) || [];
    const rawMatches = indexes.rawByName.get(nameKey) || [];
    const rawBaseMatches = indexes.rawByBaseName.get(baseKey) || [];
    const officialBaseMatches = indexes.officialByBaseName.get(baseKey) || [];
    const summary = getCandidateSummary(exactMembers.length ? exactMembers : baseMembers);
    const activeBaseMemberIds = unique(baseMembers
        .filter(member => member.status !== "inactive")
        .map(member => member.id));
    const inactiveBaseMemberIds = unique(baseMembers
        .filter(member => member.status === "inactive")
        .map(member => member.id));
    const sameBaseSuffixedVariants = [
        ...baseMembers.map(member => member.pax_name),
        ...rawBaseMatches.map(raw => raw.Name),
        ...officialBaseMatches.map(official => official.Pax),
    ].filter(name => normalizeName(name) !== nameKey && hasParentheticalQualifier(name));
    const hasBaseVariants =
        baseMembers.length > exactMembers.length ||
        rawBaseMatches.length > rawMatches.length ||
        officialBaseMatches.length > 1;
    const hasActiveInactiveBaseConflict = activeBaseMemberIds.length > 0 && inactiveBaseMemberIds.length > 0 && hasBaseVariants;
    const hasMultipleActiveSameBaseCandidates = activeBaseMemberIds.length > 1;
    const hasUnqualifiedSameBaseSuffixedVariant = !hasParentheticalQualifier(pax) && sameBaseSuffixedVariants.length > 0;
    const hasQualifiedExactIdentity = exactMembers.length === 1 && hasQualifiedIdentitySuffix(pax);
    const hasSplitRisk =
        hasIdentitySuffix(pax) ||
        hasBaseVariants ||
        hasActiveInactiveBaseConflict ||
        hasMultipleActiveSameBaseCandidates ||
        hasUnqualifiedSameBaseSuffixedVariant;

    let classification = "unmatched";
    let importReadyReason = "";
    let matchedMember = null;
    let reason = "No Supabase member matched normalized official Pax name.";

    if (exactMembers.length > 1) {
        classification = "ambiguous_supabase_duplicate";
        reason = "Multiple Supabase members share the same normalized pax_name.";
    } else if (hasQualifiedExactIdentity) {
        classification = exactMembers[0].status === "inactive" ? "inactive_match" : "matched";
        importReadyReason = "exact_qualified_identity_match";
        matchedMember = exactMembers[0];
        reason = "Official Pax has a qualified identity suffix and exactly matches one Supabase pax_name.";
    } else if (exactMembers.length === 1 && hasSplitRisk) {
        classification = "possible_2_0_or_dr_identity_split";
        matchedMember = exactMembers[0];
        reason = "Official Pax matched exactly, but related qualified, inactive, or same-base variants require review.";
    } else if (exactMembers.length === 1 && exactMembers[0].status === "inactive") {
        classification = "inactive_match";
        importReadyReason = "exact_inactive_match";
        matchedMember = exactMembers[0];
        reason = "Official Pax matched exactly, and no same-base conflict was found, but Supabase member is inactive.";
    } else if (exactMembers.length === 1) {
        classification = "matched";
        importReadyReason = "exact_active_match";
        matchedMember = exactMembers[0];
        reason = "Single active Supabase member matched normalized official Pax name.";
    } else if (baseMembers.length > 0 || rawBaseMatches.length > 1 || officialBaseMatches.length > 1 || hasIdentitySuffix(pax)) {
        classification = "possible_2_0_or_dr_identity_split";
        reason = "No exact Supabase match, but related base-name or identity-suffix candidates exist.";
    }

    const rawContext = rawMatches[0] || rawBaseMatches[0] || {};
    const candidateMembers = exactMembers.length ? exactMembers : baseMembers;
    const candidateSummary = getCandidateSummary(candidateMembers);

    return {
        classification,
        importReadyReason,
        reason,
        matchedMember,
        rawContext,
        candidateMemberIds: candidateSummary.ids || summary.ids,
        candidateMemberNames: candidateSummary.names || summary.names,
        candidateMemberStatuses: candidateSummary.statuses || summary.statuses,
        rawPaxMasterNames: unique(rawBaseMatches.map(raw => raw.Name)).join("; "),
        officialBaseNames: unique(officialBaseMatches.map(official => official.Pax)).join("; "),
    };
}

function buildReport({ officialRows, matchRows, importReadyRows, baselineCutoverDate }) {
    const counts = matchRows.reduce((acc, row) => {
        acc[row.classification] = (acc[row.classification] || 0) + 1;
        return acc;
    }, {});
    const importReadyActive = importReadyRows.filter(row => row.import_ready_reason === "exact_active_match").length;
    const importReadyInactive = importReadyRows.filter(row => row.import_ready_reason === "exact_inactive_match").length;
    const importReadyQualifiedIdentity = importReadyRows.filter(row => row.import_ready_reason === "exact_qualified_identity_match").length;
    const reviewRequired = matchRows.length - importReadyRows.length;
    const reviewDelta = reviewRequired - PREVIOUS_REVIEW_REQUIRED;
    const unmatchedRows = matchRows
        .filter(row => row.classification === "unmatched")
        .sort((a, b) => Number(b.legacy_posts) - Number(a.legacy_posts) || a.source_pax_name.localeCompare(b.source_pax_name));
    const splitRows = matchRows
        .filter(row => row.classification === "possible_2_0_or_dr_identity_split")
        .sort((a, b) => Number(b.legacy_posts) - Number(a.legacy_posts) || a.source_pax_name.localeCompare(b.source_pax_name));
    const reviewRows = matchRows
        .filter(row => !row.import_ready_reason)
        .sort((a, b) => Number(b.legacy_posts) - Number(a.legacy_posts) || a.source_pax_name.localeCompare(b.source_pax_name));

    const lines = [];
    lines.push("# Official Aggieland Baseline Match Audit");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Inputs");
    lines.push("");
    lines.push(`- Supabase members export: \`${path.relative(REPO_ROOT, MEMBERS_PATH)}\``);
    lines.push(`- Official totals export: \`${path.relative(REPO_ROOT, OFFICIAL_TOTALS_PATH)}\``);
    lines.push(`- Raw Pax Master export: \`${path.relative(REPO_ROOT, RAW_PAX_MASTER_PATH)}\``);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Region ID: ${REGION_ID}`);
    lines.push(`- Source: ${SOURCE}`);
    lines.push(`- Baseline cutover date: ${baselineCutoverDate || "unknown"}`);
    lines.push(`- Total official rows: ${officialRows.length}`);
    lines.push(`- Matched: ${counts.matched || 0}`);
    lines.push(`- Unmatched: ${counts.unmatched || 0}`);
    lines.push(`- Ambiguous Supabase duplicate: ${counts.ambiguous_supabase_duplicate || 0}`);
    lines.push(`- Inactive matches: ${counts.inactive_match || 0}`);
    lines.push(`- Possible 2.0/DR identity split: ${counts.possible_2_0_or_dr_identity_split || 0}`);
    lines.push(`- Import-ready rows: ${importReadyRows.length}`);
    lines.push(`- Import-ready active: ${importReadyActive}`);
    lines.push(`- Import-ready inactive: ${importReadyInactive}`);
    lines.push(`- Import-ready qualified identity: ${importReadyQualifiedIdentity}`);
    lines.push(`- Previous review required: ${PREVIOUS_REVIEW_REQUIRED}`);
    lines.push(`- Review required: ${reviewRequired}`);
    lines.push(`- Review required delta: ${reviewDelta >= 0 ? "+" : ""}${reviewDelta}`);
    lines.push("");
    lines.push("## Classification Counts");
    lines.push("");
    lines.push("| Classification | Count |");
    lines.push("|---|---:|");
    Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .forEach(([classification, count]) => {
            lines.push(`| ${classification} | ${count} |`);
        });
    lines.push("");
    lines.push("## Top Unmatched Names");
    lines.push("");
    if (!unmatchedRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Pax | Posts | Qs | Last Post | Reason |");
        lines.push("|---|---:|---:|---|---|");
        unmatchedRows.slice(0, 50).forEach(row => {
            lines.push(`| ${row.source_pax_name} | ${row.legacy_posts} | ${row.legacy_qs} | ${row.source_last_post} | ${row.reason} |`);
        });
    }
    lines.push("");
    lines.push("## Top Suspicious 2.0/DR Split Pairs");
    lines.push("");
    if (!splitRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Pax | Posts | Qs | Supabase Candidates | Raw Pax Master Base Names | Official Base Names |");
        lines.push("|---|---:|---:|---|---|---|");
        splitRows.slice(0, 50).forEach(row => {
            lines.push(`| ${row.source_pax_name} | ${row.legacy_posts} | ${row.legacy_qs} | ${row.candidate_member_names || "-"} | ${row.raw_pax_master_base_names || "-"} | ${row.official_base_names || "-"} |`);
        });
    }
    lines.push("");
    lines.push("## Remaining Review-Required Examples");
    lines.push("");
    if (!reviewRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Classification | Pax | Posts | Qs | Supabase Candidates | Raw Pax Master Base Names | Official Base Names | Reason |");
        lines.push("|---|---|---:|---:|---|---|---|---|");
        reviewRows.slice(0, 50).forEach(row => {
            lines.push(`| ${row.classification} | ${row.source_pax_name} | ${row.legacy_posts} | ${row.legacy_qs} | ${row.candidate_member_names || "-"} | ${row.raw_pax_master_base_names || "-"} | ${row.official_base_names || "-"} | ${row.reason} |`);
        });
    }
    lines.push("");
    lines.push("## Generated Files");
    lines.push("");
    lines.push("- `audit/attendance/official-baseline-matches.csv`");
    lines.push("- `audit/attendance/official-baseline-import-ready.csv`");

    return `${lines.join("\n")}\n`;
}

function main() {
    const missingInputs = [MEMBERS_PATH, OFFICIAL_TOTALS_PATH, RAW_PAX_MASTER_PATH]
        .filter(file => !fs.existsSync(file));

    if (missingInputs.length) {
        throw new Error(`Missing input file(s):\n${missingInputs.map(file => `- ${path.relative(REPO_ROOT, file)}`).join("\n")}`);
    }

    const members = readCsv(MEMBERS_PATH)
        .filter(row => String(row.region_id || "").trim() === REGION_ID);
    const officialRows = readCsv(OFFICIAL_TOTALS_PATH)
        .filter(row => String(row.Pax || "").trim());
    const rawPaxMaster = readCsv(RAW_PAX_MASTER_PATH)
        .filter(row => String(row.Name || "").trim());
    const indexes = buildIndexes({ members, rawPaxMaster, officialRows });
    const baselineCutoverDate = officialRows
        .map(row => normalizeDate(row["Last Post"]))
        .filter(Boolean)
        .sort()
        .at(-1) || "";

    const matchRows = officialRows.map(row => {
        const result = classifyOfficialRow(row, indexes);
        const member = result.matchedMember;
        const legacyLastPost = normalizeDate(row["Last Post"]);

        return {
            classification: result.classification,
            import_ready_reason: result.importReadyReason,
            reason: result.reason,
            region_id: REGION_ID,
            member_id: member?.id || "",
            member_pax_name: member?.pax_name || "",
            member_status: member?.status || "",
            source: SOURCE,
            source_pax_name: String(row.Pax || "").trim(),
            legacy_posts: parseInteger(row.Overall),
            legacy_qs: parseInteger(row.Qs),
            legacy_fngs_eh: "",
            source_last_post: legacyLastPost,
            official_overall: parseInteger(row.Overall),
            official_qs: parseInteger(row.Qs),
            official_bds: parseInteger(row.BDs),
            official_csaups: parseInteger(row.CSAUPs),
            official_dd_only: parseInteger(row["DD Only"]),
            official_other: parseInteger(row.Other),
            raw_pax_master_name: result.rawContext.Name || "",
            raw_real_name: result.rawContext["Hospital Name"] || "",
            raw_first_ao: result.rawContext["First AO"] || "",
            raw_proud_papa: result.rawContext["Proud Papa"] || "",
            raw_fng_date: normalizeDate(result.rawContext["FNG Date"]),
            raw_clean_pp: result.rawContext.CleanPP || "",
            candidate_member_ids: result.candidateMemberIds,
            candidate_member_names: result.candidateMemberNames,
            candidate_member_statuses: result.candidateMemberStatuses,
            raw_pax_master_base_names: result.rawPaxMasterNames,
            official_base_names: result.officialBaseNames,
            source_snapshot: JSON.stringify(row),
        };
    });

    const importReadyRows = matchRows
        .filter(row => row.import_ready_reason)
        .map(row => ({
            region_id: row.region_id,
            member_id: row.member_id,
            source: row.source,
            baseline_cutover_date: baselineCutoverDate,
            import_ready_reason: row.import_ready_reason,
            legacy_posts: row.legacy_posts,
            legacy_qs: row.legacy_qs,
            legacy_fngs_eh: row.legacy_fngs_eh,
            source_pax_name: row.source_pax_name,
            source_last_post: row.source_last_post,
        }));

    writeCsv(
        path.join(OUT_DIR, "official-baseline-matches.csv"),
        matchRows,
        [
            "classification",
            "import_ready_reason",
            "reason",
            "region_id",
            "member_id",
            "member_pax_name",
            "member_status",
            "source",
            "source_pax_name",
            "legacy_posts",
            "legacy_qs",
            "legacy_fngs_eh",
            "source_last_post",
            "official_overall",
            "official_qs",
            "official_bds",
            "official_csaups",
            "official_dd_only",
            "official_other",
            "raw_pax_master_name",
            "raw_real_name",
            "raw_first_ao",
            "raw_proud_papa",
            "raw_fng_date",
            "raw_clean_pp",
            "candidate_member_ids",
            "candidate_member_names",
            "candidate_member_statuses",
            "raw_pax_master_base_names",
            "official_base_names",
            "source_snapshot",
        ]
    );

    writeCsv(
        path.join(OUT_DIR, "official-baseline-import-ready.csv"),
        importReadyRows,
        [
            "region_id",
            "member_id",
            "source",
            "baseline_cutover_date",
            "import_ready_reason",
            "legacy_posts",
            "legacy_qs",
            "legacy_fngs_eh",
            "source_pax_name",
            "source_last_post",
        ]
    );

    fs.writeFileSync(
        path.join(OUT_DIR, "official-baseline-match-report.md"),
        buildReport({ officialRows, matchRows, importReadyRows, baselineCutoverDate })
    );

    const counts = matchRows.reduce((acc, row) => {
        acc[row.classification] = (acc[row.classification] || 0) + 1;
        return acc;
    }, {});

    console.log("Official baseline match audit complete.");
    console.log(`Official rows: ${officialRows.length}`);
    console.log(`Matched: ${counts.matched || 0}`);
    console.log(`Import-ready: ${importReadyRows.length}`);
    console.log(`Report: ${path.relative(REPO_ROOT, path.join(OUT_DIR, "official-baseline-match-report.md"))}`);
}

main();
