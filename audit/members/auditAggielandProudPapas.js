import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;

const REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";
const SOURCE = "aggieland_official_pax_master";

const PAX_MASTER_PATH = path.join(REPO_ROOT, "import/Pax_Master.csv");
const MEMBERS_PATH = path.join(REPO_ROOT, "audit/attendance/members_rows.csv");
const BASELINE_MATCHES_PATH = path.join(REPO_ROOT, "audit/attendance/official-baseline-matches.csv");
const MANUAL_DECISIONS_PATH = path.join(REPO_ROOT, "audit/attendance/official-baseline-manual-decisions-template.csv");
const IMPLEMENTATION_AUDIT_PATH = path.join(OUT_DIR, "multiple-proud-papa-implementation-audit.md");

const DETAIL_CSV_PATH = path.join(OUT_DIR, "aggieland-proud-papa-audit.csv");
const PLAN_CSV_PATH = path.join(OUT_DIR, "aggieland-proud-papa-relationship-plan.csv");
const REPORT_PATH = path.join(OUT_DIR, "aggieland-proud-papa-audit.md");

const REQUIRED_PAX_MASTER_COLUMNS = [
    "Name",
    "Hospital Name",
    "First AO",
    "Proud Papa",
    "FNG Date",
];

const DETAIL_HEADERS = [
    "official_source_row_number",
    "official_member_name",
    "official_member_stable_identifier",
    "official_member_real_name",
    "resolved_invited_member_id",
    "resolved_invited_member_display_name",
    "invited_member_resolution_method",
    "invited_member_resolution_status",
    "invited_member_resolution_confidence",
    "invited_member_ambiguity_candidates",
    "raw_proud_papa_value",
    "normalized_full_cell",
    "parser_classification",
    "parsed_inviter_count",
    "parsed_inviter_index",
    "parsed_inviter_token",
    "normalized_inviter_token",
    "parser_rule",
    "parser_warnings",
    "matched_inviter_member_id",
    "matched_inviter_display_name",
    "inviter_match_method",
    "inviter_match_confidence",
    "alternative_match_candidates",
    "inviter_unresolved_reason",
    "inviter_status",
    "current_stored_inviter_id",
    "current_stored_inviter_display_name",
    "relationship_already_present",
    "official_inviters_missing_from_current",
    "current_inviter_not_in_official_source",
    "self_reference",
    "duplicate_relationship",
    "duplicate_token",
    "cross_region_flag",
    "source_row_duplicated",
    "primary_classification",
    "recommended_decision",
    "notes",
];

const PLAN_HEADERS = [
    "invited_member_id",
    "invited_member_display_name",
    "inviter_member_id",
    "inviter_display_name",
    "source",
    "raw_official_value",
    "source_rows",
    "parsed_inviter_tokens",
    "match_methods",
    "current_relationship_status",
    "recommended_action",
    "blocked_reason",
    "human_review_required",
    "notes",
];

function readCsv(filePath, options = {}) {
    return parse(fs.readFileSync(filePath, "utf8"), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
        ...options,
    });
}

function readPaxMaster(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    const records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
    });

    const headers = Object.keys(records[0] || {});
    const missing = REQUIRED_PAX_MASTER_COLUMNS.filter(column => !headers.includes(column));
    if (missing.length) {
        throw new Error(`Missing required Pax Master column(s): ${missing.join(", ")}`);
    }

    return records.map((row, index) => ({
        ...row,
        __sourceRowNumber: index + 2,
    }));
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
        .replace(/\(inactive\)/gi, "inactive")
        .replace(/[^a-z0-9]/g, "");
}

function normalizeCell(value) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
}

function displayName(member) {
    if (!member) return "";
    return String(member.pax_name || member.Name || "").trim();
}

function unique(values) {
    return [...new Set(values.filter(value => value !== "" && value != null))];
}

function addToMapArray(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
}

function setJoin(values) {
    return unique(values).sort((a, b) => String(a).localeCompare(String(b))).join("; ");
}

function candidateSummary(candidates = []) {
    return candidates
        .map(member => `${member.id}:${displayName(member)}:${member.status || ""}:${member.region_id || ""}`)
        .sort()
        .join("; ");
}

function buildIndexes({ members, baselineMatches, manualDecisions }) {
    const membersById = new Map();
    const membersByNormalizedPax = new Map();
    const baselineByOfficial = new Map();
    const manualByOfficial = new Map();

    for (const member of members) {
        membersById.set(member.id, member);
        addToMapArray(membersByNormalizedPax, normalizeName(member.pax_name), member);
    }

    for (const row of baselineMatches) {
        const official = String(row.source_pax_name || "").trim();
        if (!official) continue;
        baselineByOfficial.set(normalizeName(official), row);
    }

    for (const row of manualDecisions) {
        const official = String(row.official_pax || "").trim();
        if (!official) continue;
        manualByOfficial.set(normalizeName(official), row);
    }

    return {
        membersById,
        membersByNormalizedPax,
        baselineByOfficial,
        manualByOfficial,
    };
}

function resolveOfficialMember(name, indexes) {
    const key = normalizeName(name);
    const baseline = indexes.baselineByOfficial.get(key);
    const manual = indexes.manualByOfficial.get(key);

    if (manual?.selected_member_id) {
        const member = indexes.membersById.get(manual.selected_member_id);
        if (member) {
            return {
                member,
                method: "prior_baseline_manual_selected_member_id",
                status: "resolved",
                confidence: "high",
                candidates: "",
                reason: "",
            };
        }
    }

    if (baseline?.member_id) {
        const member = indexes.membersById.get(baseline.member_id);
        if (member) {
            return {
                member,
                method: baseline.import_ready_reason || "prior_baseline_match_member_id",
                status: "resolved",
                confidence: "high",
                candidates: "",
                reason: "",
            };
        }
    }

    const candidates = indexes.membersByNormalizedPax.get(key) || [];
    if (candidates.length === 1) {
        return {
            member: candidates[0],
            method: "normalized_exact_pax_name",
            status: "resolved",
            confidence: "high",
            candidates: "",
            reason: "",
        };
    }

    if (candidates.length > 1) {
        return {
            member: null,
            method: "normalized_exact_pax_name",
            status: "ambiguous",
            confidence: "none",
            candidates: candidateSummary(candidates),
            reason: "Multiple current members share the same normalized PAX name.",
        };
    }

    return {
        member: null,
        method: "normalized_exact_pax_name",
        status: "unresolved",
        confidence: "none",
        candidates: "",
        reason: "No current member matched the official PAX name.",
    };
}

function resolveInviterToken(token, indexes) {
    const key = normalizeName(token);
    if (!key) {
        return {
            member: null,
            method: "",
            confidence: "none",
            alternatives: "",
            reason: "Blank parsed inviter token.",
        };
    }

    const manual = indexes.manualByOfficial.get(key);
    if (manual?.selected_member_id) {
        const member = indexes.membersById.get(manual.selected_member_id);
        if (member) {
            return {
                member,
                method: "prior_baseline_manual_selected_member_id",
                confidence: "high",
                alternatives: "",
                reason: "",
            };
        }
    }

    const baseline = indexes.baselineByOfficial.get(key);
    if (baseline?.member_id) {
        const member = indexes.membersById.get(baseline.member_id);
        if (member) {
            return {
                member,
                method: baseline.import_ready_reason || "prior_baseline_match_member_id",
                confidence: "high",
                alternatives: "",
                reason: "",
            };
        }
    }

    const candidates = indexes.membersByNormalizedPax.get(key) || [];
    if (candidates.length === 1) {
        return {
            member: candidates[0],
            method: "normalized_exact_pax_name",
            confidence: "high",
            alternatives: "",
            reason: "",
        };
    }

    if (candidates.length > 1) {
        return {
            member: null,
            method: "normalized_exact_pax_name",
            confidence: "none",
            alternatives: candidateSummary(candidates),
            reason: "Ambiguous inviter token: multiple current members share the normalized PAX name.",
        };
    }

    return {
        member: null,
        method: "normalized_exact_pax_name",
        confidence: "none",
        alternatives: "",
        reason: "No current member matched the parsed inviter token.",
    };
}

function splitOutsideParens(value, delimiterPattern) {
    const tokens = [];
    let current = "";
    let depth = 0;

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (char === "(") depth += 1;
        if (char === ")" && depth > 0) depth -= 1;

        if (depth === 0) {
            const rest = value.slice(index);
            const match = rest.match(delimiterPattern);
            if (match?.index === 0) {
                tokens.push(current.trim());
                current = "";
                index += match[0].length - 1;
                continue;
            }
        }

        current += char;
    }

    tokens.push(current.trim());
    return tokens.filter(Boolean);
}

function getDelimiterKinds(value) {
    const kinds = [];
    if (/\n/.test(value)) kinds.push("line_break");
    if (/;/.test(value)) kinds.push("semicolon");
    if (/\s+&\s+/.test(value)) kinds.push("ampersand");
    if (/\s+and\s+/i.test(value)) kinds.push("and");
    if (/\//.test(value)) kinds.push("slash");
    if (/,/.test(value)) kinds.push("comma");
    return kinds;
}

function looksLikeFreeformNote(value) {
    return /\b(unknown|n\/a|none|multiple|various|wife|signs|facebook|church|work|friend|family|coworker|co-worker|not sure|unsure|self)\b/i.test(value);
}

function parseProudPapaValue(rawValue) {
    const normalized = normalizeCell(rawValue);
    const warnings = [];

    if (!normalized) {
        return {
            normalized,
            tokens: [""],
            classification: "blank",
            rule: "blank",
            warnings: "",
        };
    }

    const delimiterKinds = getDelimiterKinds(normalized);
    const freeform = looksLikeFreeformNote(normalized);

    if (!delimiterKinds.length) {
        return {
            normalized,
            tokens: [normalized],
            classification: freeform ? "freeform_note" : "single_value",
            rule: "unsplit_single_value",
            warnings: freeform ? "Value contains wording that may not be a member name." : "",
        };
    }

    if (freeform) {
        warnings.push("Delimiter present in a value that also looks like a free-form note; split retained for review.");
    }

    const delimiterPattern = /\r?\n|;|\s+&\s+|\s+and\s+|\/|,/i;
    const tokens = splitOutsideParens(normalized, delimiterPattern);
    if (tokens.length <= 1) {
        return {
            normalized,
            tokens: [normalized],
            classification: "uncertain_parse",
            rule: "delimiter_detected_but_no_safe_split",
            warnings: "Delimiter was detected, but conservative parsing produced one token.",
        };
    }

    const classification = delimiterKinds.length > 1
        ? "mixed_delimiters"
        : `multiple_${delimiterKinds[0]}`;

    return {
        normalized,
        tokens,
        classification,
        rule: `split_outside_parentheses_on_${delimiterKinds.join("_and_")}`,
        warnings: warnings.join("; "),
    };
}

function choosePrimaryClassification({
    parse,
    invitedResolution,
    inviterResolution,
    rawValue,
    duplicateToken,
    duplicateRelationship,
    selfReference,
    crossRegion,
    relationshipAlreadyPresent,
    currentStoredInviterId,
    resolvedOfficialInviterIds,
    conflictingOfficialRows,
}) {
    if (parse.classification === "blank") {
        return currentStoredInviterId
            ? "current_relationship_not_in_official_source"
            : "no_official_inviter";
    }

    if (invitedResolution.status !== "resolved") return "invited_member_unresolved";
    if (parse.classification === "uncertain_parse") return "uncertain_source_parse";
    if (parse.classification === "freeform_note") return "uncertain_source_parse";
    if (!inviterResolution.member) {
        return inviterResolution.reason?.startsWith("Ambiguous")
            ? "ambiguous_inviter_match"
            : "inviter_not_found";
    }
    if (selfReference) return "self_reference";
    if (crossRegion) return "cross_region_inviter";
    if (duplicateToken || duplicateRelationship) return "duplicate_inviter";
    if (conflictingOfficialRows) return "conflicting_official_rows";

    const officialCount = resolvedOfficialInviterIds.length;
    if (officialCount > 1) {
        if (relationshipAlreadyPresent && resolvedOfficialInviterIds.every(id => id === currentStoredInviterId)) {
            return "multiple_relationships_all_present";
        }
        if (relationshipAlreadyPresent) return "multiple_relationships_partially_present";
        return "multiple_relationships_missing";
    }

    if (relationshipAlreadyPresent) return "single_relationship_already_correct";
    if (currentStoredInviterId && !resolvedOfficialInviterIds.includes(currentStoredInviterId)) {
        return "single_relationship_conflict";
    }
    if (rawValue) return "single_relationship_missing";
    return "needs_human_review";
}

function recommendedDecision(classification, relationshipAlreadyPresent) {
    if (relationshipAlreadyPresent) return "no_action_current_scalar_already_matches";
    if (classification === "single_relationship_missing" || classification === "multiple_relationships_missing" || classification === "multiple_relationships_partially_present") {
        return "ready_for_future_insert";
    }
    if (classification === "no_official_inviter") return "no_action_no_official_inviter";
    if (classification === "current_relationship_not_in_official_source") return "review_current_scalar_not_in_official_source";
    return "needs_human_review";
}

function buildSourceRowDuplicateMap(paxRows) {
    const counts = new Map();
    for (const row of paxRows) {
        const key = normalizeName(row.Name);
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function detectConflictingOfficialRows(rowsByInvitedId) {
    const conflicts = new Set();

    for (const [memberId, rows] of rowsByInvitedId.entries()) {
        const nonblankSets = unique(rows
            .map(row => row.resolvedOfficialInviterIds.slice().sort().join("|"))
            .filter(Boolean));
        if (nonblankSets.length > 1) conflicts.add(memberId);
    }

    return conflicts;
}

function analyzeRows({ paxRows, indexes }) {
    const sourceDuplicateCounts = buildSourceRowDuplicateMap(paxRows);
    const parsedRows = [];
    const rowSummaries = [];
    const byInvitedId = new Map();

    for (const sourceRow of paxRows) {
        const officialName = String(sourceRow.Name || "").trim();
        const invitedResolution = resolveOfficialMember(officialName, indexes);
        const parseResult = parseProudPapaValue(sourceRow["Proud Papa"]);
        const tokenResolutions = parseResult.tokens.map(token => resolveInviterToken(token, indexes));
        const resolvedOfficialInviterIds = unique(tokenResolutions
            .map(result => result.member?.id)
            .filter(Boolean));
        const invitedMemberId = invitedResolution.member?.id || "";
        const currentStoredInviterId = invitedResolution.member?.invited_by_id || "";

        const rowSummary = {
            sourceRow,
            invitedResolution,
            parseResult,
            tokenResolutions,
            resolvedOfficialInviterIds,
            currentStoredInviterId,
        };
        rowSummaries.push(rowSummary);

        if (invitedMemberId) {
            if (!byInvitedId.has(invitedMemberId)) byInvitedId.set(invitedMemberId, []);
            byInvitedId.get(invitedMemberId).push(rowSummary);
        }
    }

    const conflictingInvitedIds = detectConflictingOfficialRows(byInvitedId);
    const relationshipSeen = new Set();

    for (const rowSummary of rowSummaries) {
        const { sourceRow, invitedResolution, parseResult, tokenResolutions, resolvedOfficialInviterIds, currentStoredInviterId } = rowSummary;
        const officialName = String(sourceRow.Name || "").trim();
        const invitedMember = invitedResolution.member;
        const invitedMemberId = invitedMember?.id || "";
        const currentStoredInviter = currentStoredInviterId ? indexes.membersById.get(currentStoredInviterId) : null;
        const tokenKeyCounts = new Map();
        const sourceRowDuplicated = (sourceDuplicateCounts.get(normalizeName(officialName)) || 0) > 1;

        parseResult.tokens.forEach(token => {
            const key = normalizeName(token);
            if (!key) return;
            tokenKeyCounts.set(key, (tokenKeyCounts.get(key) || 0) + 1);
        });

        parseResult.tokens.forEach((token, index) => {
            const inviterResolution = tokenResolutions[index];
            const inviter = inviterResolution.member;
            const normalizedToken = normalizeName(token);
            const relationshipKey = invitedMemberId && inviter?.id
                ? `${invitedMemberId}|${inviter.id}`
                : "";
            const relationshipAlreadyPresent = Boolean(inviter?.id && currentStoredInviterId === inviter.id);
            const duplicateToken = Boolean(normalizedToken && (tokenKeyCounts.get(normalizedToken) || 0) > 1);
            const duplicateRelationship = Boolean(relationshipKey && relationshipSeen.has(relationshipKey));
            if (relationshipKey) relationshipSeen.add(relationshipKey);
            const selfReference = Boolean(invitedMemberId && inviter?.id && invitedMemberId === inviter.id);
            const crossRegion = Boolean(inviter?.region_id && inviter.region_id !== REGION_ID);
            const currentNotOfficial = Boolean(
                currentStoredInviterId &&
                resolvedOfficialInviterIds.length > 0 &&
                !resolvedOfficialInviterIds.includes(currentStoredInviterId)
            );
            const missingResolved = resolvedOfficialInviterIds
                .filter(id => id !== currentStoredInviterId)
                .map(id => displayName(indexes.membersById.get(id)));
            const conflictingOfficialRows = Boolean(invitedMemberId && conflictingInvitedIds.has(invitedMemberId));

            const classification = choosePrimaryClassification({
                parse: parseResult,
                invitedResolution,
                inviterResolution,
                rawValue: parseResult.normalized,
                duplicateToken,
                duplicateRelationship,
                selfReference,
                crossRegion,
                relationshipAlreadyPresent,
                currentStoredInviterId,
                resolvedOfficialInviterIds,
                conflictingOfficialRows,
            });

            const notes = [
                invitedResolution.reason,
                inviterResolution.reason,
                sourceRowDuplicated ? "Official source member appears on multiple Pax Master rows." : "",
                currentNotOfficial ? "Current scalar inviter is not included in resolved official inviter set." : "",
            ].filter(Boolean).join(" ");

            parsedRows.push({
                official_source_row_number: sourceRow.__sourceRowNumber,
                official_member_name: officialName,
                official_member_stable_identifier: normalizeName(`${officialName}|${sourceRow["Hospital Name"] || ""}|${sourceRow["FNG Date"] || ""}`),
                official_member_real_name: String(sourceRow["Hospital Name"] || "").trim(),
                resolved_invited_member_id: invitedMemberId,
                resolved_invited_member_display_name: displayName(invitedMember),
                invited_member_resolution_method: invitedResolution.method,
                invited_member_resolution_status: invitedResolution.status,
                invited_member_resolution_confidence: invitedResolution.confidence,
                invited_member_ambiguity_candidates: invitedResolution.candidates,
                raw_proud_papa_value: String(sourceRow["Proud Papa"] || ""),
                normalized_full_cell: parseResult.normalized,
                parser_classification: parseResult.classification,
                parsed_inviter_count: parseResult.classification === "blank" ? 0 : parseResult.tokens.length,
                parsed_inviter_index: parseResult.classification === "blank" ? "" : index + 1,
                parsed_inviter_token: token,
                normalized_inviter_token: normalizedToken,
                parser_rule: parseResult.rule,
                parser_warnings: parseResult.warnings,
                matched_inviter_member_id: inviter?.id || "",
                matched_inviter_display_name: displayName(inviter),
                inviter_match_method: inviterResolution.method,
                inviter_match_confidence: inviterResolution.confidence,
                alternative_match_candidates: inviterResolution.alternatives,
                inviter_unresolved_reason: inviterResolution.reason,
                inviter_status: inviter?.status || "",
                current_stored_inviter_id: currentStoredInviterId,
                current_stored_inviter_display_name: displayName(currentStoredInviter),
                relationship_already_present: relationshipAlreadyPresent ? "true" : "false",
                official_inviters_missing_from_current: setJoin(missingResolved),
                current_inviter_not_in_official_source: currentNotOfficial ? "true" : "false",
                self_reference: selfReference ? "true" : "false",
                duplicate_relationship: duplicateRelationship ? "true" : "false",
                duplicate_token: duplicateToken ? "true" : "false",
                cross_region_flag: crossRegion ? "true" : "false",
                source_row_duplicated: sourceRowDuplicated ? "true" : "false",
                primary_classification: classification,
                recommended_decision: recommendedDecision(classification, relationshipAlreadyPresent),
                notes,
            });
        });
    }

    parsedRows.sort((a, b) =>
        Number(a.official_source_row_number) - Number(b.official_source_row_number) ||
        Number(a.parsed_inviter_index || 0) - Number(b.parsed_inviter_index || 0) ||
        String(a.parsed_inviter_token).localeCompare(String(b.parsed_inviter_token))
    );

    return { parsedRows, rowSummaries };
}

function buildRelationshipPlan(detailRows) {
    const rowsByRelationship = new Map();

    for (const row of detailRows) {
        if (!row.resolved_invited_member_id || !row.matched_inviter_member_id) continue;

        const key = `${row.resolved_invited_member_id}|${row.matched_inviter_member_id}`;
        if (!rowsByRelationship.has(key)) rowsByRelationship.set(key, []);
        rowsByRelationship.get(key).push(row);
    }

    const planRows = [];
    for (const rows of rowsByRelationship.values()) {
        const first = rows[0];
        const alreadyPresent = rows.some(row => row.relationship_already_present === "true");
        const blockers = unique(rows.flatMap(row => {
            const reasons = [];
            if (row.self_reference === "true") reasons.push("self_reference");
            if (row.duplicate_relationship === "true") reasons.push("duplicate_relationship");
            if (row.cross_region_flag === "true") reasons.push("cross_region_inviter");
            if (row.primary_classification === "conflicting_official_rows") reasons.push("conflicting_official_rows");
            if (row.primary_classification === "uncertain_source_parse") reasons.push("uncertain_source_parse");
            if (row.primary_classification === "ambiguous_inviter_match") reasons.push("ambiguous_inviter_match");
            if (row.primary_classification === "invited_member_unresolved") reasons.push("invited_member_unresolved");
            return reasons;
        }));
        const ready = !alreadyPresent && blockers.length === 0;

        planRows.push({
            invited_member_id: first.resolved_invited_member_id,
            invited_member_display_name: first.resolved_invited_member_display_name,
            inviter_member_id: first.matched_inviter_member_id,
            inviter_display_name: first.matched_inviter_display_name,
            source: SOURCE,
            raw_official_value: setJoin(rows.map(row => row.raw_proud_papa_value)),
            source_rows: setJoin(rows.map(row => row.official_source_row_number)),
            parsed_inviter_tokens: setJoin(rows.map(row => row.parsed_inviter_token)),
            match_methods: setJoin(rows.map(row => row.inviter_match_method)),
            current_relationship_status: alreadyPresent ? "already_represented_by_scalar_invited_by_id" : "missing_from_current_scalar",
            recommended_action: ready ? "ready_for_future_insert" : (alreadyPresent ? "no_action_already_present" : "blocked_needs_human_review"),
            blocked_reason: blockers.join("; "),
            human_review_required: ready || alreadyPresent ? "false" : "true",
            notes: "Future application plan only; no data was changed by this audit.",
        });
    }

    return planRows.sort((a, b) =>
        a.invited_member_display_name.localeCompare(b.invited_member_display_name) ||
        a.inviter_display_name.localeCompare(b.inviter_display_name) ||
        a.invited_member_id.localeCompare(b.invited_member_id) ||
        a.inviter_member_id.localeCompare(b.inviter_member_id)
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

function buildReport({ paxRows, detailRows, planRows, filesInspected }) {
    const sourceRowsWithMultiple = unique(detailRows
        .filter(row => Number(row.parsed_inviter_count) > 1)
        .map(row => row.official_source_row_number)).length;
    const uniqueRelationships = planRows.length;
    const alreadyRepresented = planRows.filter(row => row.current_relationship_status === "already_represented_by_scalar_invited_by_id").length;
    const missingReady = planRows.filter(row => row.recommended_action === "ready_for_future_insert").length;
    const blocked = planRows.filter(row => row.human_review_required === "true").length;
    const humanReviewRows = detailRows.filter(row =>
        row.recommended_decision === "needs_human_review" ||
        row.current_inviter_not_in_official_source === "true" ||
        row.primary_classification.includes("conflict")
    );
    const parserCounts = countBy(detailRows, "parser_classification");
    const classificationCounts = countBy(detailRows, "primary_classification");
    const multipleExamples = detailRows
        .filter(row => Number(row.parsed_inviter_count) > 1 && row.parsed_inviter_index === 1)
        .slice(0, 15)
        .map(row => ({
            Row: row.official_source_row_number,
            PAX: row.official_member_name,
            "Raw Proud Papa": row.raw_proud_papa_value,
            Parser: row.parser_classification,
        }));
    const reviewExamples = humanReviewRows.slice(0, 25).map(row => ({
        Row: row.official_source_row_number,
        PAX: row.official_member_name,
        Token: row.parsed_inviter_token,
        Classification: row.primary_classification,
        Notes: row.notes || row.inviter_unresolved_reason || row.parser_warnings,
    }));
    const currentNotOfficial = detailRows.filter(row => row.current_inviter_not_in_official_source === "true").length;
    const selfReferences = detailRows.filter(row => row.self_reference === "true").length;
    const duplicateTokens = detailRows.filter(row => row.duplicate_token === "true" || row.duplicate_relationship === "true").length;
    const crossRegion = detailRows.filter(row => row.cross_region_flag === "true").length;
    const unresolvedInvited = detailRows.filter(row => row.primary_classification === "invited_member_unresolved").length;
    const unresolvedInviters = detailRows.filter(row => row.primary_classification === "inviter_not_found").length;
    const ambiguousInviters = detailRows.filter(row => row.primary_classification === "ambiguous_inviter_match").length;
    const blockedByAmbiguityOrUnresolved = unresolvedInvited + unresolvedInviters + ambiguousInviters;

    const lines = [];
    lines.push("# Aggieland Proud Papa Reconstruction Audit");
    lines.push("");
    lines.push("Generated by `audit/members/auditAggielandProudPapas.js`.");
    lines.push("");
    lines.push("## 1. Executive Summary");
    lines.push("");
    lines.push(`- Official source rows inspected: ${paxRows.length}`);
    lines.push(`- Source rows containing multiple parsed Proud Papas: ${sourceRowsWithMultiple}`);
    lines.push(`- Unique official inviter relationships reconstructed: ${uniqueRelationships}`);
    lines.push(`- Relationships already represented by current scalar data: ${alreadyRepresented}`);
    lines.push(`- Missing relationships ready for future insert: ${missingReady}`);
    lines.push(`- Unique relationship rows blocked for human review: ${blocked}`);
    lines.push(`- Detailed token/source rows requiring human review signal: ${humanReviewRows.length}`);
    lines.push(`- Detailed token/source rows blocked by unresolved or ambiguous members: ${blockedByAmbiguityOrUnresolved}`);
    lines.push("- No database records were inserted, updated, deleted, or upserted.");
    lines.push("");
    lines.push("## 2. Files and Data Sources Inspected");
    lines.push("");
    filesInspected.forEach(file => lines.push(`- \`${path.relative(REPO_ROOT, file)}\``));
    lines.push("");
    lines.push("## 3. Source-Format Findings");
    lines.push("");
    lines.push("- Proud Papa source column: `Proud Papa`.");
    lines.push("- Invited-member identifying columns: `Name`, `Hospital Name`, `First AO`, and `FNG Date`.");
    lines.push("- Blank Proud Papa cells are treated as no official inviter.");
    lines.push("- Detected delimiter/parser patterns are counted below. Commas, slashes, semicolons, spaced ampersands, spaced `and`, and line breaks are split only outside parentheses.");
    lines.push("- Values that look like notes, such as `Unknown`, `N/A`, `Self`, `Multiple`, `Wife`, `Signs`, or similar words, are flagged for review.");
    lines.push("");
    lines.push("### Parser Classification Counts");
    lines.push("");
    lines.push(markdownTable(
        Object.entries(parserCounts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([Classification, Count]) => ({ Classification, Count })),
        ["Classification", "Count"]
    ).trimEnd());
    lines.push("");
    lines.push("## 4. Parser Rules and Limitations");
    lines.push("");
    lines.push("- Reused normalization style from prior baseline audits: lowercase, trim, normalize smart apostrophes, normalize `&` to `and`, and strip non-alphanumeric characters for matching.");
    lines.push("- Intentionally different logic: this audit parses multi-value Proud Papa cells into tokens, while prior import/audit code treated Proud Papa as a single scalar.");
    lines.push("- The parser is conservative. It does not perform fuzzy matching and does not use real-name matching as an automatic acceptance path.");
    lines.push("- Parenthetical qualifiers such as `(DR)` and `(2.0)` are preserved while splitting delimiters outside parentheses.");
    lines.push("");
    lines.push("## 5. Invited-Member Resolution Results");
    lines.push("");
    lines.push(markdownTable(
        Object.entries(countBy(detailRows, "invited_member_resolution_status"))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([Status, Count]) => ({ Status, Count })),
        ["Status", "Count"]
    ).trimEnd());
    lines.push("");
    lines.push(`- Unresolved/ambiguous invited-member token rows: ${unresolvedInvited}`);
    lines.push("- Preferred resolution order: manual selected member id from prior baseline decisions, prior baseline match member id, then normalized exact PAX name.");
    lines.push("");
    lines.push("## 6. Inviter Resolution Results");
    lines.push("");
    lines.push(`- Inviter-not-found token rows: ${unresolvedInviters}`);
    lines.push(`- Ambiguous inviter token rows: ${ambiguousInviters}`);
    lines.push("- Preferred resolution order: manual selected member id from prior baseline decisions, prior baseline match member id, then normalized exact PAX name.");
    lines.push("");
    lines.push("## 7. Comparison With Current Scalar Data");
    lines.push("");
    lines.push(`- Current scalar relationships already represented: ${alreadyRepresented}`);
    lines.push(`- Current scalar inviter not present in official resolved set token rows: ${currentNotOfficial}`);
    lines.push(`- Missing ready-for-future-insert relationships: ${missingReady}`);
    lines.push("");
    lines.push("## 8. Classification Counts");
    lines.push("");
    lines.push(markdownTable(
        Object.entries(classificationCounts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([Classification, Count]) => ({ Classification, Count })),
        ["Classification", "Count"]
    ).trimEnd());
    lines.push("");
    lines.push("## 9. Exact Count of Source Rows Containing Multiple Proud Papas");
    lines.push("");
    lines.push(`- ${sourceRowsWithMultiple}`);
    lines.push("");
    lines.push("## 10. Exact Count of Unique Proposed Relationships");
    lines.push("");
    lines.push(`- ${uniqueRelationships}`);
    lines.push("");
    lines.push("## 11. Exact Count Already Represented By Current Data");
    lines.push("");
    lines.push(`- ${alreadyRepresented}`);
    lines.push("");
    lines.push("## 12. Exact Count Missing From Current Data");
    lines.push("");
    lines.push(`- ${missingReady}`);
    lines.push("");
    lines.push("## 13. Exact Count Blocked By Ambiguity Or Unresolved Members");
    lines.push("");
    lines.push(`- Detailed token/source rows blocked by unresolved or ambiguous members: ${blockedByAmbiguityOrUnresolved}`);
    lines.push(`- Unique resolved relationship-plan rows blocked for human review: ${blocked}`);
    lines.push("");
    lines.push("## 14. Self-References, Duplicates, And Cross-Region Cases");
    lines.push("");
    lines.push(`- Self-reference token rows: ${selfReferences}`);
    lines.push(`- Duplicate token/relationship rows: ${duplicateTokens}`);
    lines.push(`- Cross-region inviter rows: ${crossRegion}`);
    lines.push("");
    lines.push("## 15. Human-Review Queue Summary");
    lines.push("");
    lines.push(markdownTable(reviewExamples, ["Row", "PAX", "Token", "Classification", "Notes"]).trimEnd());
    lines.push("");
    lines.push("## 16. Source Artifact Sufficiency");
    lines.push("");
    lines.push("The cached source and prior baseline mappings are sufficient for a deterministic first-pass reconstruction audit. They are not sufficient for automatic production application because unresolved inviter names, note-like values, possible stale source data, and current scalar conflicts still need human review.");
    lines.push("");
    lines.push("## 17. Recommended Next Implementation Step");
    lines.push("");
    lines.push("Review `aggieland-proud-papa-audit.csv` and `aggieland-proud-papa-relationship-plan.csv`, resolve human-review rows, then create a future migration/relationship table only after the planned multiple-Proud-Papa schema is approved.");
    lines.push("");
    lines.push("## 18. Verification Instructions");
    lines.push("");
    lines.push("Run:");
    lines.push("");
    lines.push("```sh");
    lines.push("node audit/members/auditAggielandProudPapas.js");
    lines.push("```");
    lines.push("");
    lines.push("The script reads only local files and writes only these audit artifacts under `audit/members/`:");
    lines.push("");
    lines.push("- `aggieland-proud-papa-audit.md`");
    lines.push("- `aggieland-proud-papa-audit.csv`");
    lines.push("- `aggieland-proud-papa-relationship-plan.csv`");
    lines.push("");
    lines.push("## Representative Multiple-Value Examples");
    lines.push("");
    lines.push(markdownTable(multipleExamples, ["Row", "PAX", "Raw Proud Papa", "Parser"]).trimEnd());
    lines.push("");

    return `${lines.join("\n")}\n`;
}

function validateOutputs({ paxRows, detailRows, planRows }) {
    const sourceRowNumbers = new Set(paxRows.map(row => row.__sourceRowNumber));
    const detailSourceRows = new Set(detailRows.map(row => Number(row.official_source_row_number)));

    for (const sourceRowNumber of sourceRowNumbers) {
        if (!detailSourceRows.has(sourceRowNumber)) {
            throw new Error(`No detail row was emitted for source row ${sourceRowNumber}`);
        }
    }

    const planKeys = new Set();
    for (const row of planRows) {
        const key = `${row.invited_member_id}|${row.inviter_member_id}`;
        if (planKeys.has(key)) {
            throw new Error(`Duplicate relationship-plan row emitted for ${key}`);
        }
        planKeys.add(key);
        if (row.recommended_action === "ready_for_future_insert" && row.blocked_reason) {
            throw new Error(`Ready relationship has blocked_reason: ${key}`);
        }
    }

    parse(fs.readFileSync(DETAIL_CSV_PATH, "utf8"), { columns: true, bom: true });
    parse(fs.readFileSync(PLAN_CSV_PATH, "utf8"), { columns: true, bom: true });
}

function main() {
    const missingInputs = [
        PAX_MASTER_PATH,
        MEMBERS_PATH,
        BASELINE_MATCHES_PATH,
        MANUAL_DECISIONS_PATH,
        IMPLEMENTATION_AUDIT_PATH,
    ].filter(file => !fs.existsSync(file));

    if (missingInputs.length) {
        throw new Error(`Missing required input file(s):\n${missingInputs.map(file => `- ${path.relative(REPO_ROOT, file)}`).join("\n")}`);
    }

    const paxRows = readPaxMaster(PAX_MASTER_PATH);
    const members = readCsv(MEMBERS_PATH);
    const baselineMatches = readCsv(BASELINE_MATCHES_PATH);
    const manualDecisions = readCsv(MANUAL_DECISIONS_PATH);
    const indexes = buildIndexes({ members, baselineMatches, manualDecisions });
    const { parsedRows } = analyzeRows({ paxRows, indexes });
    const planRows = buildRelationshipPlan(parsedRows);

    writeCsv(DETAIL_CSV_PATH, parsedRows, DETAIL_HEADERS);
    writeCsv(PLAN_CSV_PATH, planRows, PLAN_HEADERS);
    fs.writeFileSync(
        REPORT_PATH,
        buildReport({
            paxRows,
            detailRows: parsedRows,
            planRows,
            filesInspected: [
                IMPLEMENTATION_AUDIT_PATH,
                PAX_MASTER_PATH,
                MEMBERS_PATH,
                BASELINE_MATCHES_PATH,
                MANUAL_DECISIONS_PATH,
            ],
        })
    );

    validateOutputs({ paxRows, detailRows: parsedRows, planRows });

    const sourceRowsWithMultiple = unique(parsedRows
        .filter(row => Number(row.parsed_inviter_count) > 1)
        .map(row => row.official_source_row_number)).length;
    const alreadyRepresented = planRows.filter(row => row.current_relationship_status === "already_represented_by_scalar_invited_by_id").length;
    const missingReady = planRows.filter(row => row.recommended_action === "ready_for_future_insert").length;
    const humanReview = parsedRows.filter(row =>
        row.recommended_decision === "needs_human_review" ||
        row.current_inviter_not_in_official_source === "true" ||
        row.primary_classification.includes("conflict")
    ).length;
    const relationshipPlanHumanReview = planRows.filter(row => row.human_review_required === "true").length;

    console.log(JSON.stringify({
        sourceRowsInspected: paxRows.length,
        sourceRowsWithMultipleProudPapas: sourceRowsWithMultiple,
        uniqueOfficialInviterRelationships: planRows.length,
        alreadyRepresented,
        proposedMissingReadyForFutureInsert: missingReady,
        detailedRowsRequiringHumanReview: humanReview,
        relationshipPlanRowsRequiringHumanReview: relationshipPlanHumanReview,
        outputs: [
            path.relative(REPO_ROOT, REPORT_PATH),
            path.relative(REPO_ROOT, DETAIL_CSV_PATH),
            path.relative(REPO_ROOT, PLAN_CSV_PATH),
        ],
    }, null, 2));
}

main();
