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
const PREVIOUS_REVIEW_REQUIRED = 113;

const MEMBERS_PATH = path.join(OUT_DIR, "members_rows.csv");
const OFFICIAL_TOTALS_PATH = path.join(OUT_DIR, "Simple Overall Totals v1 - Overall Totals.csv");
const RAW_PAX_MASTER_PATH = path.join(OUT_DIR, "Simple Overall Totals v1 - Raw_Pax_Master.csv");
const PROPOSED_MEMBER_CREATES_PATH = path.join(OUT_DIR, "official-proposed-member-creates.csv");
const REVIEW_REQUIRED_PATH = path.join(OUT_DIR, "official-baseline-review-required.csv");
const MANUAL_DECISIONS_TEMPLATE_PATH = path.join(OUT_DIR, "official-baseline-manual-decisions-template.csv");
const FINAL_DRY_RUN_PATH = path.join(OUT_DIR, "official-baseline-final-dry-run.md");

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

function hasQualifiedIdentitySuffix(value) {
    return /\((?:[^)]*(?:2\.0|dr|dj|kotter)[^)]*)\)/i.test(String(value || ""));
}

function parseInteger(value) {
    const normalized = String(value || "").replace(/,/g, "").trim();
    if (!normalized) return 0;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function addIntegerStrings(left, right) {
    return String(parseInteger(left) + parseInteger(right));
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

function getDistinctOfficialRows(rows) {
    const byPax = new Map();

    for (const row of rows) {
        const pax = String(row.Pax || "").trim();
        if (!pax) continue;

        if (!byPax.has(pax)) {
            byPax.set(pax, { ...row, Pax: pax, source_row_count: 1 });
            continue;
        }

        const existing = byPax.get(pax);
        existing.Overall = addIntegerStrings(existing.Overall, row.Overall);
        existing.Qs = addIntegerStrings(existing.Qs, row.Qs);
        existing.BDs = addIntegerStrings(existing.BDs, row.BDs);
        existing.CSAUPs = addIntegerStrings(existing.CSAUPs, row.CSAUPs);
        existing["DD Only"] = addIntegerStrings(existing["DD Only"], row["DD Only"]);
        existing.Other = addIntegerStrings(existing.Other, row.Other);

        const existingLastPost = normalizeDate(existing["Last Post"]);
        const rowLastPost = normalizeDate(row["Last Post"]);
        if (rowLastPost && (!existingLastPost || rowLastPost > existingLastPost)) {
            existing["Last Post"] = row["Last Post"];
        }

        existing.source_row_count += 1;
    }

    return [...byPax.values()];
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
    const rawByName = new Map();

    for (const member of members) {
        addToMapArray(memberByName, normalizeName(member.pax_name), member);
    }

    for (const row of rawPaxMaster) {
        addToMapArray(rawByName, normalizeName(row.Name), row);
    }

    return {
        memberByName,
        rawByName,
    };
}

function getCandidateSummary(candidates = []) {
    return {
        ids: unique(candidates.map(member => member.id)).join("; "),
        names: unique(candidates.map(member => member.pax_name)).join("; "),
        realNames: unique(candidates.map(member => member.real_name)).join("; "),
        homeAos: unique(candidates.map(member => member.home_ao)).join("; "),
        createdAts: unique(candidates.map(member => member.created_at)).join("; "),
        isActive: unique(candidates.map(member => member.status === "inactive" ? "false" : "true")).join("; "),
        totalPosts: "",
        statuses: unique(candidates.map(member => member.status)).join("; "),
    };
}

function normalizeMetadataValue(value) {
    return normalizeName(value);
}

function getMetadataConflict(member, rawMatches) {
    if (!member || !rawMatches.length) return "";

    const rawRealNames = unique(rawMatches
        .map(raw => raw["Hospital Name"])
        .filter(Boolean));
    const memberRealName = String(member.real_name || "").trim();

    if (memberRealName && rawRealNames.length) {
        const memberRealNameKey = normalizeMetadataValue(memberRealName);
        const rawRealNameKeys = unique(rawRealNames.map(normalizeMetadataValue));
        if (memberRealNameKey && rawRealNameKeys.length && !rawRealNameKeys.includes(memberRealNameKey)) {
            return `Raw Pax Master hospital name (${rawRealNames.join("; ")}) does not match Supabase real_name (${memberRealName}).`;
        }
    }

    return "";
}

function classifyOfficialRow(row, indexes) {
    const pax = String(row.Pax || "").trim();
    const nameKey = normalizeName(pax);
    const exactMembers = indexes.memberByName.get(nameKey) || [];
    const rawMatches = indexes.rawByName.get(nameKey) || [];
    const hasQualifiedExactIdentity = exactMembers.length === 1 && hasQualifiedIdentitySuffix(pax);
    const metadataConflict = exactMembers.length === 1
        ? getMetadataConflict(exactMembers[0], rawMatches)
        : "";

    let classification = "unmatched";
    let importReadyReason = "";
    let matchedMember = null;
    let reason = "No Supabase member matched normalized official Pax name.";

    if (exactMembers.length > 1) {
        classification = "ambiguous_supabase_duplicate";
        reason = "Multiple Supabase members share the same normalized pax_name.";
    } else if (metadataConflict) {
        classification = "metadata_conflict";
        matchedMember = exactMembers[0];
        reason = metadataConflict;
    } else if (hasQualifiedExactIdentity) {
        classification = exactMembers[0].status === "inactive" ? "inactive_match" : "matched";
        importReadyReason = "exact_qualified_identity_match";
        matchedMember = exactMembers[0];
        reason = "Official Pax has a qualified identity suffix and exactly matches one Supabase pax_name.";
    } else if (exactMembers.length === 1 && exactMembers[0].status === "inactive") {
        classification = "inactive_match";
        importReadyReason = "exact_inactive_match";
        matchedMember = exactMembers[0];
        reason = "Official Pax matched exactly to one inactive Supabase member.";
    } else if (exactMembers.length === 1) {
        classification = "matched";
        importReadyReason = "exact_active_match";
        matchedMember = exactMembers[0];
        reason = "Single active Supabase member matched normalized official Pax name.";
    }

    const rawContext = rawMatches[0] || {};
    const candidateMembers = exactMembers;
    const candidateSummary = getCandidateSummary(candidateMembers);

    return {
        classification,
        importReadyReason,
        reason,
        matchedMember,
        rawContext,
        candidateMemberIds: candidateSummary.ids,
        candidateMemberNames: candidateSummary.names,
        candidateRealNames: candidateSummary.realNames,
        candidateHomeAos: candidateSummary.homeAos,
        candidateCreatedAts: candidateSummary.createdAts,
        candidateIsActive: candidateSummary.isActive,
        candidateTotalPosts: candidateSummary.totalPosts,
        candidateMemberStatuses: candidateSummary.statuses,
        rawPaxMasterNames: unique(rawMatches.map(raw => raw.Name)).join("; "),
        officialBaseNames: pax,
    };
}

function getRecommendedAction(row) {
    if (row.classification === "unmatched") {
        return "Create a new member for this exact official Pax identity, then import its baseline stats.";
    }

    if (row.classification === "ambiguous_supabase_duplicate") {
        return "Choose the intended Supabase member or merge/fix duplicate member records before importing this baseline.";
    }

    if (row.classification === "metadata_conflict") {
        return "Verify Raw Pax Master hospital name against Supabase real_name; correct member metadata or confirm the exact match before importing.";
    }

    return "Review manually before importing.";
}

function getManualDecision(officialPax) {
    return MANUAL_DECISIONS[officialPax] || {};
}

function buildReviewRequiredRows(matchRows) {
    return matchRows
        .filter(row => !row.import_ready_reason)
        .sort((a, b) => Number(b.legacy_posts) - Number(a.legacy_posts) || a.source_pax_name.localeCompare(b.source_pax_name))
        .map(row => {
            const manual = getManualDecision(row.source_pax_name);
            const recommendedDecision = getRecommendedDecision({
                ...row,
                official_pax: row.source_pax_name,
            });
            return {
                classification: row.classification,
                official_pax: row.source_pax_name,
                official_hospital_name: row.raw_real_name,
                official_first_ao: row.raw_first_ao,
                official_fng_date: row.raw_fng_date,
                official_posts: row.legacy_posts,
                official_qs: row.legacy_qs,
                supabase_candidates: row.candidate_member_names,
                candidate_member_id: row.candidate_member_ids,
                candidate_pax_name: row.candidate_member_names,
                candidate_real_name: row.candidate_real_names,
                candidate_home_ao_name: row.candidate_home_aos,
                candidate_created_at: row.candidate_created_ats,
                candidate_is_active: row.candidate_is_active,
                candidate_total_posts: row.candidate_total_posts,
                candidate_member_ids: row.candidate_member_ids,
                candidate_hospital_names: row.candidate_real_names,
                reason: row.reason,
                recommended_action: getRecommendedAction(row),
                recommended_decision: recommendedDecision,
                selected_member_id: manual.selected_member_id || "",
                create_member: manual.create_member || "",
                notes: manual.notes || "",
            };
        });
}

function getRecommendedDecision(row) {
    const manual = getManualDecision(row.official_pax);
    if (hasOwn(manual, "recommended_decision")) return manual.recommended_decision;
    if (row.classification === "unmatched") return "create_member";
    if (row.classification === "ambiguous_supabase_duplicate") return "select_existing_member";
    if (row.classification === "metadata_conflict") return "verify_metadata_then_import";
    return "review";
}

const DEFAULT_MANUAL_DECISIONS = {
    "B-I-N-G-O (2.0)": {
        recommended_decision: "map_to_existing_member",
        notes: "Distinct 2.0 PAX from Bingo (2.0); choose candidate with hospital name Maui 2.0.",
    },
    "Bingo (2.0)": {
        recommended_decision: "map_to_existing_member",
        notes: "Distinct 2.0 PAX from B-I-N-G-O (2.0); choose candidate with hospital name Meadow (Sinko 2.0).",
    },
    "Trex (2.0)": {
        recommended_decision: "map_to_existing_member",
        notes: "Distinct 2.0 PAX from T-Rex (2.0); choose exact matching pax_name if available.",
    },
    "T-Rex (2.0)": {
        recommended_decision: "map_to_existing_member",
        notes: "Distinct 2.0 PAX from Trex (2.0); choose exact matching pax_name if available.",
    },
    "Jingling Johnny (DR)": {
        recommended_decision: "resolve_duplicate_member",
        notes: "All Supabase duplicates represent same PAX; choose one canonical member or clean duplicate records before import.",
    },
    "Seabiscuit": {
        recommended_decision: "accept_match_after_create",
        notes: "Official Seabiscuit is Jimmy Tillman. Jarret Baker-Wilkinson belongs to Seabiscuit (Inactive), which should be created separately.",
    },
    "Seabiscuit (Inactive)": {
        recommended_decision: "create_member",
        notes: "Create as separate official PAX identity for Jarret Baker-Wilkinson.",
    },
    "Top Hat": {
        recommended_decision: "accept_match_after_create",
        notes: "Official Top Hat is Doug Pittman. Matthew Murphy belongs to Top Hat (inactive), which should be created separately.",
    },
    "Top Hat (inactive)": {
        recommended_decision: "create_member",
        notes: "Create as separate official PAX identity for Matthew Murphy.",
    },
    Buttercream: {
        recommended_decision: "accept_metadata_conflict",
    },
    "Bus Stop": {
        recommended_decision: "accept_metadata_conflict",
    },
    "Liver King": {
        recommended_decision: "accept_metadata_conflict",
    },
    Abacus: {
        recommended_decision: "needs_human_review",
    },
    "Batman (2.0)": {
        recommended_decision: "create_member",
    },
    "Eastwood (DR)": {
        recommended_decision: "create_member",
    },
};

let MANUAL_DECISIONS = { ...DEFAULT_MANUAL_DECISIONS };

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function readManualDecisionOverrides() {
    if (!fs.existsSync(MANUAL_DECISIONS_TEMPLATE_PATH)) return {};

    return readCsv(MANUAL_DECISIONS_TEMPLATE_PATH)
        .filter(row => String(row.official_pax || "").trim())
        .reduce((acc, row) => {
            const officialPax = String(row.official_pax || "").trim();
            acc[officialPax] = {
                recommended_decision: String(row.recommended_decision || "").trim(),
                selected_member_id: String(row.selected_member_id || "").trim(),
                create_member: String(row.create_member || "").trim(),
                notes: String(row.notes || "").trim(),
            };
            return acc;
        }, {});
}

function loadManualDecisions() {
    const overrides = readManualDecisionOverrides();
    MANUAL_DECISIONS = { ...DEFAULT_MANUAL_DECISIONS };

    for (const [officialPax, override] of Object.entries(overrides)) {
        MANUAL_DECISIONS[officialPax] = {
            ...(MANUAL_DECISIONS[officialPax] || {}),
            recommended_decision: override.recommended_decision,
            selected_member_id: override.selected_member_id,
            create_member: override.create_member,
            notes: override.notes,
        };
    }
}

function buildManualDecisionRows(reviewRequiredRows) {
    return reviewRequiredRows.map(row => {
        const manual = getManualDecision(row.official_pax);
        const recommendedDecision = hasOwn(manual, "recommended_decision")
            ? manual.recommended_decision
            : getRecommendedDecision(row);
        return {
            official_pax: row.official_pax,
            classification: row.classification,
            recommended_decision: recommendedDecision,
            selected_member_id: hasOwn(manual, "selected_member_id") ? manual.selected_member_id : "",
            create_member: hasOwn(manual, "create_member") ? manual.create_member : (recommendedDecision === "create_member" ? "true" : ""),
            notes: hasOwn(manual, "notes") ? manual.notes : "",
        };
    });
}

function buildReport({ officialRows, matchRows, importReadyRows, proposedCreateRows, reviewRequiredRows, baselineCutoverDate }) {
    const counts = matchRows.reduce((acc, row) => {
        acc[row.classification] = (acc[row.classification] || 0) + 1;
        return acc;
    }, {});
    const importReadyActive = importReadyRows.filter(row => row.import_ready_reason === "exact_active_match").length;
    const importReadyInactive = importReadyRows.filter(row => row.import_ready_reason === "exact_inactive_match").length;
    const importReadyQualifiedIdentity = importReadyRows.filter(row => row.import_ready_reason === "exact_qualified_identity_match").length;
    const reviewRequired = matchRows.length - importReadyRows.length;
    const reviewDelta = reviewRequired - PREVIOUS_REVIEW_REQUIRED;
    const unmatchedOfficialPax = matchRows.filter(row => row.classification === "unmatched").length;
    const ambiguousMatches = matchRows
        .filter(row => !row.import_ready_reason && row.classification !== "unmatched")
        .length;
    const proposedBaselineStatImports = importReadyRows.length + proposedCreateRows.length;
    const unmatchedRows = matchRows
        .filter(row => row.classification === "unmatched")
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
    lines.push(`- Total official PAX rows: ${officialRows.length}`);
    lines.push(`- Matched existing members: ${importReadyRows.length}`);
    lines.push(`- Unmatched official PAX: ${unmatchedOfficialPax}`);
    lines.push(`- Ambiguous matches: ${ambiguousMatches}`);
    lines.push(`- Proposed members to create: ${proposedCreateRows.length}`);
    lines.push(`- Proposed baseline stat imports: ${proposedBaselineStatImports}`);
    lines.push(`- Existing-member import-ready rows: ${importReadyRows.length}`);
    lines.push(`- Matched: ${counts.matched || 0}`);
    lines.push(`- Unmatched: ${counts.unmatched || 0}`);
    lines.push(`- Ambiguous Supabase duplicate: ${counts.ambiguous_supabase_duplicate || 0}`);
    lines.push(`- Metadata conflicts: ${counts.metadata_conflict || 0}`);
    lines.push(`- Inactive matches: ${counts.inactive_match || 0}`);
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
    lines.push("## Dry-Run Proposed Creates");
    lines.push("");
    if (!proposedCreateRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Pax | Hospital Name | First AO | Posts | Qs | Last Post | Reason |");
        lines.push("|---|---|---|---:|---:|---|---|");
        proposedCreateRows.slice(0, 50).forEach(row => {
            lines.push(`| ${row.pax_name} | ${row.hospital_name || "-"} | ${row.first_ao || "-"} | ${row.overall_posts} | ${row.qs} | ${row.last_post || "-"} | ${row.reason} |`);
        });
    }
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
    lines.push("## Review Required");
    lines.push("");
    if (!reviewRequiredRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Classification | Official Pax | Hospital Name | First AO | FNG Date | Posts | Qs | Supabase Candidates | Candidate Hospital Names | Recommended Decision | Notes | Reason |");
        lines.push("|---|---|---|---|---|---:|---:|---|---|---|---|---|");
        reviewRequiredRows.forEach(row => {
            lines.push(`| ${row.classification} | ${row.official_pax} | ${row.official_hospital_name || "-"} | ${row.official_first_ao || "-"} | ${row.official_fng_date || "-"} | ${row.official_posts} | ${row.official_qs} | ${row.supabase_candidates || "-"} | ${row.candidate_hospital_names || "-"} | ${row.recommended_decision} | ${row.notes || "-"} | ${row.reason} |`);
        });
    }
    lines.push("");
    lines.push("## Generated Files");
    lines.push("");
    lines.push("- `audit/attendance/official-baseline-matches.csv`");
    lines.push("- `audit/attendance/official-baseline-import-ready.csv`");
    lines.push("- `audit/attendance/official-proposed-member-creates.csv`");
    lines.push("- `audit/attendance/official-baseline-review-required.csv`");
    lines.push("- `audit/attendance/official-baseline-manual-decisions-template.csv`");
    lines.push("- `audit/attendance/official-baseline-final-dry-run.md`");

    return `${lines.join("\n")}\n`;
}

function classifyFinalDecision(row) {
    const decision = row.recommended_decision || "";

    if (decision === "accept_metadata_conflict") {
        return {
            status: "existing_member_import_ready",
            reason: "Manual decision accepts metadata conflict.",
        };
    }

    if (decision === "accept_match_after_create") {
        return {
            status: "existing_member_import_ready_after_related_create",
            reason: "Manual decision accepts existing match after related create row is created.",
        };
    }

    if (decision === "create_member") {
        return {
            status: "proposed_create",
            reason: "Manual decision proposes creating a member for this official identity.",
        };
    }

    if (decision === "map_to_existing_member") {
        if (row.selected_member_id) {
            return {
                status: "manual_duplicate_mapping_import_ready",
                reason: "Manual decision maps duplicate to selected_member_id.",
            };
        }
        return {
            status: "blocked",
            reason: "map_to_existing_member requires selected_member_id.",
        };
    }

    if (decision === "resolve_duplicate_member") {
        if (row.selected_member_id) {
            return {
                status: "manual_duplicate_mapping_import_ready",
                reason: "Manual duplicate resolution selected a canonical member.",
            };
        }
        return {
            status: "blocked",
            reason: "resolve_duplicate_member remains blocked until selected_member_id is provided.",
        };
    }

    if (decision === "needs_human_review") {
        return {
            status: "blocked",
            reason: "needs_human_review remains blocked.",
        };
    }

    return {
        status: "blocked",
        reason: `Unsupported or missing recommended_decision: ${decision || "blank"}.`,
    };
}

function buildFinalDryRunReport({ officialRows, importReadyRows, reviewRequiredRows, baselineCutoverDate }) {
    const finalRows = reviewRequiredRows.map(row => ({
        ...row,
        final: classifyFinalDecision(row),
    }));
    const manuallyAcceptedMetadata = finalRows
        .filter(row => row.recommended_decision === "accept_metadata_conflict")
        .length;
    const acceptedAfterCreate = finalRows
        .filter(row => row.recommended_decision === "accept_match_after_create")
        .length;
    const manuallyMappedDuplicates = finalRows
        .filter(row => row.final.status === "manual_duplicate_mapping_import_ready")
        .length;
    const proposedCreates = finalRows
        .filter(row => row.final.status === "proposed_create")
        .length;
    const blockedRows = finalRows
        .filter(row => row.final.status === "blocked");
    const existingMembersImportReady =
        importReadyRows.length +
        manuallyAcceptedMetadata +
        acceptedAfterCreate +
        manuallyMappedDuplicates;

    const lines = [];
    lines.push("# Official Baseline Final Dry Run");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Region ID: ${REGION_ID}`);
    lines.push(`- Source: ${SOURCE}`);
    lines.push(`- Baseline cutover date: ${baselineCutoverDate || "unknown"}`);
    lines.push(`- Total official rows: ${officialRows.length}`);
    lines.push(`- Existing members import-ready: ${existingMembersImportReady}`);
    lines.push(`- Proposed creates: ${proposedCreates}`);
    lines.push(`- Manually accepted metadata conflicts: ${manuallyAcceptedMetadata}`);
    lines.push(`- Existing matches accepted after related create: ${acceptedAfterCreate}`);
    lines.push(`- Manually mapped duplicates: ${manuallyMappedDuplicates}`);
    lines.push(`- Blocked unresolved rows: ${blockedRows.length}`);
    lines.push("");
    lines.push("## Blocked Row Details");
    lines.push("");

    if (!blockedRows.length) {
        lines.push("- None");
    } else {
        lines.push("| Official Pax | Classification | Recommended Decision | Selected Member ID | Reason | Notes |");
        lines.push("|---|---|---|---|---|---|");
        blockedRows.forEach(row => {
            lines.push(`| ${row.official_pax} | ${row.classification} | ${row.recommended_decision || "-"} | ${row.selected_member_id || "-"} | ${row.final.reason} | ${row.notes || "-"} |`);
        });
    }
    lines.push("");
    lines.push("## Decision Notes");
    lines.push("");
    lines.push("- `official-baseline-import-ready.csv` contains automatic exact-match imports only.");
    lines.push("- This dry run applies manual decisions from `official-baseline-manual-decisions-template.csv` without performing inserts or updates.");
    lines.push("- Rows accepted after related create should be imported only after the corresponding proposed member create is completed.");

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
    const officialRows = getDistinctOfficialRows(readCsv(OFFICIAL_TOTALS_PATH));
    const rawPaxMaster = readCsv(RAW_PAX_MASTER_PATH)
        .filter(row => String(row.Name || "").trim());
    loadManualDecisions();
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
            candidate_real_names: result.candidateRealNames,
            candidate_home_aos: result.candidateHomeAos,
            candidate_created_ats: result.candidateCreatedAts,
            candidate_is_active: result.candidateIsActive,
            candidate_total_posts: result.candidateTotalPosts,
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

    const proposedCreateRows = matchRows
        .filter(row => row.classification === "unmatched")
        .map(row => ({
            pax_name: row.source_pax_name,
            hospital_name: row.raw_real_name,
            first_ao: row.raw_first_ao,
            proud_papa: row.raw_proud_papa,
            fng_date: row.raw_fng_date,
            overall_posts: row.legacy_posts,
            qs: row.legacy_qs,
            bds: row.official_bds,
            csaups: row.official_csaups,
            dd_only: row.official_dd_only,
            other: row.official_other,
            last_post: row.source_last_post,
            dr_posts: "",
            match_status: "proposed_create",
            reason: row.reason,
        }));
    const reviewRequiredRows = buildReviewRequiredRows(matchRows);
    const manualDecisionRows = buildManualDecisionRows(reviewRequiredRows);

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
            "candidate_real_names",
            "candidate_home_aos",
            "candidate_created_ats",
            "candidate_is_active",
            "candidate_total_posts",
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

    writeCsv(
        PROPOSED_MEMBER_CREATES_PATH,
        proposedCreateRows,
        [
            "pax_name",
            "hospital_name",
            "first_ao",
            "proud_papa",
            "fng_date",
            "overall_posts",
            "qs",
            "bds",
            "csaups",
            "dd_only",
            "other",
            "last_post",
            "dr_posts",
            "match_status",
            "reason",
        ]
    );

    writeCsv(
        REVIEW_REQUIRED_PATH,
        reviewRequiredRows,
        [
            "classification",
            "official_pax",
            "official_hospital_name",
            "official_first_ao",
            "official_fng_date",
            "official_posts",
            "official_qs",
            "supabase_candidates",
            "candidate_member_id",
            "candidate_pax_name",
            "candidate_real_name",
            "candidate_home_ao_name",
            "candidate_created_at",
            "candidate_is_active",
            "candidate_total_posts",
            "candidate_member_ids",
            "candidate_hospital_names",
            "reason",
            "recommended_action",
        ]
    );

    writeCsv(
        MANUAL_DECISIONS_TEMPLATE_PATH,
        manualDecisionRows,
        [
            "official_pax",
            "classification",
            "recommended_decision",
            "selected_member_id",
            "create_member",
            "notes",
        ]
    );

    fs.writeFileSync(
        path.join(OUT_DIR, "official-baseline-match-report.md"),
        buildReport({ officialRows, matchRows, importReadyRows, proposedCreateRows, reviewRequiredRows, baselineCutoverDate })
    );

    fs.writeFileSync(
        FINAL_DRY_RUN_PATH,
        buildFinalDryRunReport({ officialRows, importReadyRows, reviewRequiredRows, baselineCutoverDate })
    );

    const counts = matchRows.reduce((acc, row) => {
        acc[row.classification] = (acc[row.classification] || 0) + 1;
        return acc;
    }, {});

    console.log("Official baseline match audit complete.");
    console.log(`Official rows: ${officialRows.length}`);
    console.log(`Matched existing members: ${importReadyRows.length}`);
    console.log(`Unmatched official PAX: ${proposedCreateRows.length}`);
    console.log(`Ambiguous matches: ${matchRows.filter(row => !row.import_ready_reason && row.classification !== "unmatched").length}`);
    console.log(`Proposed member creates: ${proposedCreateRows.length}`);
    console.log(`Proposed baseline stat imports: ${importReadyRows.length + proposedCreateRows.length}`);
    console.log(`Report: ${path.relative(REPO_ROOT, path.join(OUT_DIR, "official-baseline-match-report.md"))}`);
}

main();
