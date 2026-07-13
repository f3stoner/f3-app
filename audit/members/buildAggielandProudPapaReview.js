import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;

const DETAIL_PATH = path.join(OUT_DIR, "aggieland-proud-papa-audit.csv");
const PLAN_PATH = path.join(OUT_DIR, "aggieland-proud-papa-relationship-plan.csv");
const AUDIT_REPORT_PATH = path.join(OUT_DIR, "aggieland-proud-papa-audit.md");
const MEMBERS_PATH = path.join(REPO_ROOT, "audit/attendance/members_rows.csv");
const BASELINE_MATCHES_PATH = path.join(REPO_ROOT, "audit/attendance/official-baseline-matches.csv");
const MANUAL_DECISIONS_PATH = path.join(REPO_ROOT, "audit/attendance/official-baseline-manual-decisions-template.csv");
const PAX_MASTER_PATH = path.join(REPO_ROOT, "import/Pax_Master.csv");

const HUMAN_REVIEW_PATH = path.join(OUT_DIR, "aggieland-proud-papa-human-review.csv");
const SOURCE_REVIEW_PATH = path.join(OUT_DIR, "aggieland-proud-papa-source-attribution-review.csv");
const SUMMARY_PATH = path.join(OUT_DIR, "aggieland-proud-papa-review-summary.md");

const HUMAN_REVIEW_HEADERS = [
    "source_row_number",
    "invited_official_name",
    "invited_member_id",
    "invited_current_display_name",
    "raw_proud_papa_value",
    "parsed_inviter_token",
    "normalized_inviter_token",
    "existing_classification",
    "proposed_review_category",
    "possible_matched_member_id",
    "possible_matched_member_display_name",
    "candidate_match_method",
    "current_scalar_inviter_id",
    "current_scalar_inviter_display_name",
    "official_resolved_inviter_set",
    "recommended_decision",
    "selected_inviter_member_id",
    "accept_relationship",
    "ignore_as_non_member_source",
    "clear_existing_scalar_relationship",
    "human_notes",
    "blocked_reason",
];

const SOURCE_REVIEW_HEADERS = [
    "normalized_source_token",
    "raw_variants",
    "occurrence_count",
    "invited_member_names",
    "proposed_canonical_source",
    "confidence",
    "human_decision",
    "notes",
];

const ACQUISITION_SOURCE_CANONICAL = new Map([
    ["website", "website"],
    ["texags", "texags"],
    ["walkup", "walk_up"],
    ["signs", "signs"],
    ["firstfriday", "first_friday"],
    ["other", "other"],
]);

const PERSONAL_REFERRAL_TOKENS = new Set([
    "wife",
    "friend",
    "family",
    "coworker",
    "co-worker",
    "church",
    "facebook",
]);

const NO_INVITER_TOKENS = new Set([
    "self",
    "none",
    "unknown",
    "na",
    "n/a",
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

function normalizeName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/&/g, "and")
        .replace(/^dr\.\s*/i, "")
        .replace(/[^a-z0-9]/g, "");
}

function stripParenthetical(value) {
    return String(value || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeWithoutParenthetical(value) {
    return normalizeName(stripParenthetical(value));
}

function displayName(member) {
    return String(member?.pax_name || "").trim();
}

function unique(values) {
    return [...new Set(values.filter(value => value !== "" && value != null))];
}

function setJoin(values) {
    return unique(values).sort((a, b) => String(a).localeCompare(String(b))).join("; ");
}

function addToMapArray(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
}

function buildIndexes({ members, baselineMatches, manualDecisions }) {
    const membersById = new Map();
    const membersByNormalizedPax = new Map();
    const membersByQualifierStrippedPax = new Map();
    const baselineByOfficial = new Map();
    const manualByOfficial = new Map();

    for (const member of members) {
        membersById.set(member.id, member);
        addToMapArray(membersByNormalizedPax, normalizeName(member.pax_name), member);
        addToMapArray(membersByQualifierStrippedPax, normalizeWithoutParenthetical(member.pax_name), member);
    }

    for (const row of baselineMatches) {
        const official = String(row.source_pax_name || "").trim();
        if (official) baselineByOfficial.set(normalizeName(official), row);
    }

    for (const row of manualDecisions) {
        const official = String(row.official_pax || "").trim();
        if (official) manualByOfficial.set(normalizeName(official), row);
    }

    return {
        membersById,
        membersByNormalizedPax,
        membersByQualifierStrippedPax,
        baselineByOfficial,
        manualByOfficial,
    };
}

function describeCandidates(candidates) {
    return candidates
        .map(member => ({
            id: member.id,
            name: displayName(member),
            status: member.status || "",
            regionId: member.region_id || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function summarizeCandidateIds(candidates) {
    return describeCandidates(candidates)
        .map(candidate => candidate.id)
        .join("; ");
}

function summarizeCandidateNames(candidates) {
    return describeCandidates(candidates)
        .map(candidate => `${candidate.name}${candidate.status ? ` (${candidate.status})` : ""}`)
        .join("; ");
}

function findPossibleCandidates(token, indexes) {
    const normalized = normalizeName(token);
    const normalizedNoParen = normalizeWithoutParenthetical(token);
    const candidates = [];

    const manual = indexes.manualByOfficial.get(normalized);
    if (manual?.selected_member_id) {
        const member = indexes.membersById.get(manual.selected_member_id);
        if (member) {
            return {
                candidates: [member],
                method: "prior_manual_selected_member_id",
                strength: "strong",
                notes: "Existing baseline manual decision selected this member.",
            };
        }
    }

    const baseline = indexes.baselineByOfficial.get(normalized);
    if (baseline?.member_id) {
        const member = indexes.membersById.get(baseline.member_id);
        if (member) {
            return {
                candidates: [member],
                method: baseline.import_ready_reason || "prior_baseline_member_id",
                strength: "strong",
                notes: "Existing baseline match resolved this official name.",
            };
        }
    }

    const exact = indexes.membersByNormalizedPax.get(normalized) || [];
    if (exact.length) {
        return {
            candidates: exact,
            method: exact.length === 1 ? "normalized_exact_member_name" : "ambiguous_normalized_exact_member_name",
            strength: exact.length === 1 ? "strong" : "ambiguous",
            notes: exact.length === 1 ? "Exact normalized current member name match." : "Multiple exact normalized current member name matches.",
        };
    }

    if (normalizedNoParen && normalizedNoParen !== normalized) {
        const tokenNoParenMatches = indexes.membersByNormalizedPax.get(normalizedNoParen) || [];
        if (tokenNoParenMatches.length) {
            return {
                candidates: tokenNoParenMatches,
                method: "token_parenthetical_removed_exact_member_name",
                strength: tokenNoParenMatches.length === 1 ? "strong_candidate_review_required" : "ambiguous",
                notes: "Token parenthetical qualifier may explain failed exact match.",
            };
        }
    }

    const qualifierStripped = indexes.membersByQualifierStrippedPax.get(normalized) || [];
    if (qualifierStripped.length) {
        candidates.push(...qualifierStripped);
        return {
            candidates,
            method: qualifierStripped.length === 1 ? "member_parenthetical_removed_candidate" : "ambiguous_member_parenthetical_removed_candidate",
            strength: qualifierStripped.length === 1 ? "strong_candidate_review_required" : "ambiguous",
            notes: "Current member name differs by parenthetical qualifier such as (DR), region, or suffix.",
        };
    }

    return {
        candidates: [],
        method: "no_exact_or_approved_mapping_candidate",
        strength: "none",
        notes: "",
    };
}

function isReviewRequired(row) {
    return (
        row.recommended_decision === "needs_human_review" ||
        row.current_inviter_not_in_official_source === "true" ||
        row.self_reference === "true" ||
        row.primary_classification.includes("conflict") ||
        row.primary_classification === "inviter_not_found" ||
        row.primary_classification === "uncertain_source_parse" ||
        row.primary_classification === "conflicting_official_rows"
    );
}

function classifyReviewCategory(row, candidateInfo) {
    const token = String(row.parsed_inviter_token || "").trim();
    const normalized = normalizeName(token);

    if (row.self_reference === "true") return "self_reference";
    if (row.primary_classification === "single_relationship_conflict") return "official_current_conflict";
    if (row.primary_classification === "conflicting_official_rows" || row.source_row_duplicated === "true") {
        return "duplicate_official_member";
    }
    if (ACQUISITION_SOURCE_CANONICAL.has(normalized)) return "non_member_acquisition_source";
    if (PERSONAL_REFERRAL_TOKENS.has(token.toLowerCase()) || PERSONAL_REFERRAL_TOKENS.has(normalized)) {
        return "personal_referral_without_member_record";
    }
    if (NO_INVITER_TOKENS.has(token.toLowerCase()) || NO_INVITER_TOKENS.has(normalized)) {
        return "intentional_no_inviter";
    }
    if (candidateInfo.candidates.length === 1 && candidateInfo.strength.startsWith("strong")) {
        return "resolved_relationship_requires_confirmation";
    }
    if (candidateInfo.candidates.length > 1) return "probable_member_reference";
    if (row.primary_classification === "inviter_not_found") return "probable_member_reference";
    if (row.primary_classification === "uncertain_source_parse") return "unclassified";
    return "unclassified";
}

function recommendedDecisionFor(row, category, candidateInfo) {
    if (category === "non_member_acquisition_source") return "ignore_as_non_member_source_candidate";
    if (category === "personal_referral_without_member_record") return "review_personal_referral_no_member_record";
    if (category === "intentional_no_inviter") return "review_as_no_inviter";
    if (category === "self_reference") return "do_not_insert_self_reference";
    if (category === "official_current_conflict") return "review_official_current_conflict";
    if (category === "duplicate_official_member") return "review_duplicate_official_member_mapping";
    if (category === "resolved_relationship_requires_confirmation") return "confirm_candidate_before_future_insert";
    if (category === "probable_member_reference" && candidateInfo.candidates.length === 0) return "research_member_reference";
    if (category === "probable_member_reference") return "choose_candidate_or_leave_unresolved";
    return row.recommended_decision || "needs_human_review";
}

function buildBlockedReason(row, candidateInfo, category) {
    return setJoin([
        row.primary_classification,
        row.inviter_unresolved_reason,
        row.parser_warnings,
        row.notes,
        candidateInfo.notes,
        category === "non_member_acquisition_source" ? "Token appears to describe acquisition source, not a member relationship." : "",
    ]);
}

function buildHumanReviewRows({ detailRows, indexes }) {
    return detailRows
        .filter(isReviewRequired)
        .map(row => {
            const candidateInfo = findPossibleCandidates(row.parsed_inviter_token, indexes);
            const category = classifyReviewCategory(row, candidateInfo);
            const recommendedDecision = recommendedDecisionFor(row, category, candidateInfo);
            const possibleIds = summarizeCandidateIds(candidateInfo.candidates);
            const possibleNames = summarizeCandidateNames(candidateInfo.candidates);
            const conclusivelyMapped = category === "resolved_relationship_requires_confirmation"
                && candidateInfo.method.startsWith("prior_");

            return {
                source_row_number: row.official_source_row_number,
                invited_official_name: row.official_member_name,
                invited_member_id: row.resolved_invited_member_id,
                invited_current_display_name: row.resolved_invited_member_display_name,
                raw_proud_papa_value: row.raw_proud_papa_value,
                parsed_inviter_token: row.parsed_inviter_token,
                normalized_inviter_token: row.normalized_inviter_token,
                existing_classification: row.primary_classification,
                proposed_review_category: category,
                possible_matched_member_id: possibleIds,
                possible_matched_member_display_name: possibleNames,
                candidate_match_method: candidateInfo.method,
                current_scalar_inviter_id: row.current_stored_inviter_id,
                current_scalar_inviter_display_name: row.current_stored_inviter_display_name,
                official_resolved_inviter_set: row.official_inviters_missing_from_current || row.matched_inviter_display_name || "",
                recommended_decision: recommendedDecision,
                selected_inviter_member_id: conclusivelyMapped ? possibleIds : "",
                accept_relationship: "",
                ignore_as_non_member_source: "",
                clear_existing_scalar_relationship: "",
                human_notes: "",
                blocked_reason: buildBlockedReason(row, candidateInfo, category),
            };
        })
        .sort((a, b) =>
            Number(a.source_row_number) - Number(b.source_row_number) ||
            a.invited_official_name.localeCompare(b.invited_official_name) ||
            a.parsed_inviter_token.localeCompare(b.parsed_inviter_token)
        );
}

function buildSourceReviewRows(humanRows) {
    const grouped = new Map();

    for (const row of humanRows) {
        if (row.proposed_review_category !== "non_member_acquisition_source") continue;
        const normalized = row.normalized_inviter_token;
        if (!grouped.has(normalized)) {
            grouped.set(normalized, {
                normalized_source_token: normalized,
                rawVariants: new Set(),
                invitedNames: new Set(),
                canonical: ACQUISITION_SOURCE_CANONICAL.get(normalized) || normalized,
            });
        }

        const group = grouped.get(normalized);
        group.rawVariants.add(row.parsed_inviter_token);
        group.invitedNames.add(row.invited_official_name);
    }

    return [...grouped.values()]
        .map(group => ({
            normalized_source_token: group.normalized_source_token,
            raw_variants: [...group.rawVariants].sort().join("; "),
            occurrence_count: group.invitedNames.size,
            invited_member_names: [...group.invitedNames].sort().join("; "),
            proposed_canonical_source: group.canonical,
            confidence: "high",
            human_decision: "",
            notes: "Candidate acquisition-source value; not proposed as a member relationship.",
        }))
        .sort((a, b) =>
            Number(b.occurrence_count) - Number(a.occurrence_count) ||
            a.normalized_source_token.localeCompare(b.normalized_source_token)
        );
}

function countBy(rows, key) {
    return rows.reduce((acc, row) => {
        const value = row[key] || "";
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

function markdownTable(rows, headers) {
    if (!rows.length) return "- None\n";
    const lines = [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map(row => `| ${headers.map(header => String(row[header] ?? "").replace(/\|/g, "\\|") || "-").join(" | ")} |`),
    ];
    return `${lines.join("\n")}\n`;
}

function buildSummary({ humanRows, sourceRows, planRows }) {
    const categoryCounts = countBy(humanRows, "proposed_review_category");
    const strongCandidateRows = humanRows.filter(row => row.possible_matched_member_id);
    const noCandidateRows = humanRows.filter(row => !row.possible_matched_member_id);
    const blockedPlanRows = planRows.filter(row => row.human_review_required === "true");
    const currentScalarConflictRows = humanRows.filter(row =>
        row.existing_classification === "single_relationship_conflict" ||
        (
            row.existing_classification === "conflicting_official_rows" &&
            row.current_scalar_inviter_id &&
            row.blocked_reason.includes("Current scalar inviter is not included")
        )
    );
    const duplicateConflictRows = humanRows.filter(row => row.proposed_review_category === "duplicate_official_member");
    const readyRows = planRows.filter(row => row.recommended_action === "ready_for_future_insert");
    const readyAffected = readyRows.filter(planRow =>
        humanRows.some(row =>
            row.invited_member_id === planRow.invited_member_id &&
            row.possible_matched_member_id.split("; ").includes(planRow.inviter_member_id)
        )
    );

    const lines = [];
    lines.push("# Aggieland Proud Papa Human Review Package");
    lines.push("");
    lines.push("Generated by `audit/members/buildAggielandProudPapaReview.js`.");
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Total review rows: ${humanRows.length}`);
    lines.push(`- Probable member-reference rows: ${categoryCounts.probable_member_reference || 0}`);
    lines.push(`- Source-attribution rows: ${categoryCounts.non_member_acquisition_source || 0}`);
    lines.push(`- Personal/non-member referral rows: ${categoryCounts.personal_referral_without_member_record || 0}`);
    lines.push(`- Self-references: ${categoryCounts.self_reference || 0}`);
    lines.push(`- Official/current conflicts: ${categoryCounts.official_current_conflict || 0}`);
    lines.push(`- Duplicate official-member conflicts: ${categoryCounts.duplicate_official_member || 0}`);
    lines.push(`- Rows with a strong candidate match: ${strongCandidateRows.length}`);
    lines.push(`- Rows with no candidate: ${noCandidateRows.length}`);
    lines.push(`- Existing ready-for-future-insert relationships affected by unresolved review rows: ${readyAffected.length}`);
    lines.push("");
    lines.push("## Review Category Counts");
    lines.push("");
    lines.push(markdownTable(
        Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([Category, Count]) => ({ Category, Count })),
        ["Category", "Count"]
    ).trimEnd());
    lines.push("");
    lines.push("## One Relationship-Plan Row Currently Blocked");
    lines.push("");
    lines.push(markdownTable(
        blockedPlanRows.map(row => ({
            "Invited Member": row.invited_member_display_name,
            "Invited ID": row.invited_member_id,
            "Inviter": row.inviter_display_name,
            "Inviter ID": row.inviter_member_id,
            "Source Rows": row.source_rows,
            "Blocked Reason": row.blocked_reason,
        })),
        ["Invited Member", "Invited ID", "Inviter", "Inviter ID", "Source Rows", "Blocked Reason"]
    ).trimEnd());
    lines.push("");
    lines.push("## Current Scalar Conflicts");
    lines.push("");
    lines.push(markdownTable(
        currentScalarConflictRows.map(row => ({
            Row: row.source_row_number,
            PAX: row.invited_official_name,
            Official: row.official_resolved_inviter_set || row.parsed_inviter_token,
            Current: row.current_scalar_inviter_display_name,
            Category: row.proposed_review_category,
            Decision: row.recommended_decision,
        })),
        ["Row", "PAX", "Official", "Current", "Category", "Decision"]
    ).trimEnd());
    lines.push("");
    lines.push("## Duplicate Official-Member Conflicts");
    lines.push("");
    lines.push(markdownTable(
        duplicateConflictRows.map(row => ({
            Row: row.source_row_number,
            PAX: row.invited_official_name,
            Token: row.parsed_inviter_token,
            Current: row.current_scalar_inviter_display_name,
            "Possible Member": row.possible_matched_member_display_name,
            Reason: row.blocked_reason,
        })),
        ["Row", "PAX", "Token", "Current", "Possible Member", "Reason"]
    ).trimEnd());
    lines.push("");
    lines.push("## Source Attribution Review");
    lines.push("");
    lines.push(markdownTable(
        sourceRows.map(row => ({
            Token: row.normalized_source_token,
            Variants: row.raw_variants,
            Count: row.occurrence_count,
            Canonical: row.proposed_canonical_source,
        })),
        ["Token", "Variants", "Count", "Canonical"]
    ).trimEnd());
    lines.push("");
    lines.push("## Recommended Manual-Review Order");
    lines.push("");
    lines.push("1. Resolve duplicate official-member rows for `B-I-N-G-O (2.0)` and `Bingo (2.0)`.");
    lines.push("2. Decide the `Top Hat` official/current scalar conflict.");
    lines.push("3. Mark source-attribution values such as `Website`, `TexAgs`, `Signs`, and `Walk-Up` as non-member sources where appropriate.");
    lines.push("4. Review probable member references with strong candidates, especially DR-qualified candidates like `Hawk`, `Keyser`, and `Doe Boy`.");
    lines.push("5. Review remaining probable member references with no candidate, such as `Deliverance` and `Underoos (F3 Marshall)`.");
    lines.push("6. Confirm self-reference handling for `Mufasa`.");
    lines.push("");
    lines.push("## Ready Relationship Safety");
    lines.push("");
    if (readyAffected.length === 0) {
        lines.push("The 31 relationships currently marked `ready_for_future_insert` are not affected by unresolved, conflicting, or self-reference review rows in this package.");
    } else {
        lines.push(`${readyAffected.length} of the 31 relationships currently marked \`ready_for_future_insert\` overlaps with a review row and should be held until review is complete.`);
        lines.push("");
        lines.push(markdownTable(
            readyAffected.map(row => ({
                "Invited Member": row.invited_member_display_name,
                "Inviter": row.inviter_display_name,
                "Recommended Action": row.recommended_action,
                "Reason": "Official/current scalar conflict in human-review CSV",
            })),
            ["Invited Member", "Inviter", "Recommended Action", "Reason"]
        ).trimEnd());
    }
    lines.push("");
    lines.push("## Generated Files");
    lines.push("");
    lines.push("- `audit/members/aggieland-proud-papa-human-review.csv`");
    lines.push("- `audit/members/aggieland-proud-papa-source-attribution-review.csv`");
    lines.push("- `audit/members/aggieland-proud-papa-review-summary.md`");
    lines.push("");
    lines.push("## Safety");
    lines.push("");
    lines.push("- This package is read-only with respect to application/runtime/database data.");
    lines.push("- Human decision columns are intentionally blank unless an existing approved mapping conclusively establishes a selected member.");
    lines.push("- No Proud Papa relationships were applied.");

    return `${lines.join("\n")}\n`;
}

function validateOutputs() {
    parse(fs.readFileSync(HUMAN_REVIEW_PATH, "utf8"), { columns: true, bom: true });
    parse(fs.readFileSync(SOURCE_REVIEW_PATH, "utf8"), { columns: true, bom: true });
}

function main() {
    const missing = [
        DETAIL_PATH,
        PLAN_PATH,
        AUDIT_REPORT_PATH,
        MEMBERS_PATH,
        BASELINE_MATCHES_PATH,
        MANUAL_DECISIONS_PATH,
        PAX_MASTER_PATH,
    ].filter(file => !fs.existsSync(file));

    if (missing.length) {
        throw new Error(`Missing required input file(s):\n${missing.map(file => `- ${path.relative(REPO_ROOT, file)}`).join("\n")}`);
    }

    const detailRows = readCsv(DETAIL_PATH);
    const planRows = readCsv(PLAN_PATH);
    const members = readCsv(MEMBERS_PATH);
    const baselineMatches = readCsv(BASELINE_MATCHES_PATH);
    const manualDecisions = readCsv(MANUAL_DECISIONS_PATH);
    const indexes = buildIndexes({ members, baselineMatches, manualDecisions });
    const humanRows = buildHumanReviewRows({ detailRows, indexes });
    const sourceRows = buildSourceReviewRows(humanRows);

    writeCsv(HUMAN_REVIEW_PATH, humanRows, HUMAN_REVIEW_HEADERS);
    writeCsv(SOURCE_REVIEW_PATH, sourceRows, SOURCE_REVIEW_HEADERS);
    fs.writeFileSync(SUMMARY_PATH, buildSummary({ humanRows, sourceRows, planRows }));

    validateOutputs();

    const categoryCounts = countBy(humanRows, "proposed_review_category");
    const strongCandidateRows = humanRows.filter(row => row.possible_matched_member_id).length;
    const noCandidateRows = humanRows.filter(row => !row.possible_matched_member_id).length;

    console.log(JSON.stringify({
        humanReviewRows: humanRows.length,
        probableMemberReferences: categoryCounts.probable_member_reference || 0,
        acquisitionSources: categoryCounts.non_member_acquisition_source || 0,
        personalNonMemberReferrals: categoryCounts.personal_referral_without_member_record || 0,
        strongCandidateMatches: strongCandidateRows,
        noCandidateRows,
        outputs: [
            path.relative(REPO_ROOT, HUMAN_REVIEW_PATH),
            path.relative(REPO_ROOT, SOURCE_REVIEW_PATH),
            path.relative(REPO_ROOT, SUMMARY_PATH),
        ],
    }, null, 2));
}

main();
