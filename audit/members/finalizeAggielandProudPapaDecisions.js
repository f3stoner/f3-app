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

const DETAIL_PATH = path.join(OUT_DIR, "aggieland-proud-papa-audit.csv");
const PRIOR_PLAN_PATH = path.join(OUT_DIR, "aggieland-proud-papa-relationship-plan.csv");
const HUMAN_REVIEW_PATH = path.join(OUT_DIR, "aggieland-proud-papa-human-review.csv");
const MEMBERS_PATH = path.join(REPO_ROOT, "audit/attendance/members_rows.csv");
const BASELINE_MATCHES_PATH = path.join(REPO_ROOT, "audit/attendance/official-baseline-matches.csv");
const MANUAL_DECISIONS_PATH = path.join(REPO_ROOT, "audit/attendance/official-baseline-manual-decisions-template.csv");
const PAX_MASTER_PATH = path.join(REPO_ROOT, "import/Pax_Master.csv");

const FINAL_DECISIONS_PATH = path.join(OUT_DIR, "aggieland-proud-papa-final-decisions.csv");
const FINAL_PLAN_PATH = path.join(OUT_DIR, "aggieland-proud-papa-final-relationship-plan.csv");
const FINAL_SUMMARY_PATH = path.join(OUT_DIR, "aggieland-proud-papa-final-summary.md");

const FINAL_DECISION_HEADERS = [
    "source_row_number",
    "official_invited_member_name",
    "source_identifiers_used",
    "original_selected_invited_member_id",
    "corrected_invited_member_id",
    "corrected_invited_member_display_name",
    "inviter_token",
    "selected_inviter_member_id",
    "selected_inviter_display_name",
    "final_decision",
    "include_in_future_relationship_table",
    "excluded_reason",
    "mapping_correction_required",
    "duplicate_name_group",
    "notes",
];

const FINAL_PLAN_HEADERS = [
    "invited_member_id",
    "invited_member_display_name",
    "inviter_member_id",
    "inviter_display_name",
    "source_row_number",
    "source_raw_proud_papa_value",
    "relationship_already_represented_by_current_scalar_field",
    "future_insert_required",
    "mapping_correction_applied",
    "notes",
];

const IDS = {
    bingoMaui: "facfa382-2eda-4904-91ea-4fd8741f8849",
    bingoSinko: "871402d0-39d3-4c95-9a46-83989338a5cd",
    topHatMash: "55ff451c-62dc-4875-805d-88218c5a708a",
    topHatMudder: "ce70e528-8546-4178-b435-f11121399fbc",
    topHatMudderDuplicate: "b3d5c189-6fca-40e5-9d7f-760e03ae540e",
    messi20: "be846ab0-8224-4e38-b02a-1e036e7c4723",
    messiDr: "dc346afb-2f85-4912-9d10-cb19e2349967",
};

const INVITED_CORRECTIONS_BY_ROW = new Map([
    ["14", IDS.bingoMaui],
    ["227", IDS.topHatMudder],
]);

const DUPLICATE_GROUP_BY_ROW = new Map([
    ["14", "Bingo"],
    ["29", "Bingo"],
    ["227", "Top Hat"],
]);

const ACCEPTED_INVITER_BY_NORMALIZED_TOKEN = new Map([
    ["doeboy", "faecc248-27d7-45ba-9699-c985a8e90166"],
    ["hawk", "c5f2f2c1-41f6-4ca3-93e9-ece70d25e702"],
    ["keyser", "e360f009-ab88-4082-841b-8a4a6be817b8"],
    ["landshark", "b385488e-193a-40ac-9e66-48cefc33c2c3"],
    ["thecure", "c8bbd149-9ecb-4d2e-94ae-7432682ec455"],
    ["caddy", "c74ef99f-bce9-4ad4-b66a-711f2c9bebb1"],
    ["paperboy", "26d07c10-b4a1-4330-846e-874828027544"],
    ["messi", IDS.messi20],
]);

const IGNORED_EXTERNAL_TOKENS = new Set([
    "deliverance",
    "underoosf3marshall",
    "rockytop",
    "ilt",
    "dillydilly",
    "deandavis",
]);

const ACQUISITION_SOURCE_TOKENS = new Set([
    "website",
    "texags",
    "signs",
    "walkup",
    "firstfriday",
    "other",
    "online",
    "socialmedia",
]);

const PERSONAL_REFERRAL_TOKENS = new Set(["wife"]);
const NO_INVITER_TOKENS = new Set(["self"]);

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

function displayName(member) {
    return String(member?.pax_name || "").trim();
}

function unique(values) {
    return [...new Set(values.filter(value => value !== "" && value != null))];
}

function setJoin(values) {
    return unique(values).sort((a, b) => String(a).localeCompare(String(b))).join("; ");
}

function readPaxMaster() {
    return readCsv(PAX_MASTER_PATH).map((row, index) => ({
        ...row,
        __sourceRowNumber: String(index + 2),
    }));
}

function sourceIdentifier(row) {
    if (!row) return "";
    return [
        `Name=${row.Name || ""}`,
        `Hospital Name=${row["Hospital Name"] || ""}`,
        `First AO=${row["First AO"] || ""}`,
        `FNG Date=${row["FNG Date"] || ""}`,
        `Proud Papa=${row["Proud Papa"] || ""}`,
    ].join("; ");
}

function memberSummary(member) {
    if (!member) return "";
    return `${member.id} | ${displayName(member)} | real=${member.real_name || ""} | home=${member.home_ao || ""} | first_post_date=${member.first_post_date || ""} | status=${member.status || ""} | invited_by_id=${member.invited_by_id || ""}`;
}

function parseIdList(value) {
    return String(value || "")
        .split(";")
        .map(id => id.trim())
        .filter(Boolean);
}

function splitList(value) {
    return String(value || "")
        .split(";")
        .map(item => item.trim())
        .filter(Boolean);
}

function isGenericPlanNote(value) {
    const text = String(value || "").toLowerCase();
    return text.includes("future application plan only") || text.includes("future relationship-table application plan only") || text === "no data was changed by this audit.";
}

function currentScalarMatches(membersById, invitedId, inviterId) {
    const invited = membersById.get(invitedId);
    return Boolean(invited && invited.invited_by_id && invited.invited_by_id === inviterId);
}

function addRelationship(relationships, membersById, input) {
    if (!input.invitedId || !input.inviterId) return;
    if (input.invitedId === input.inviterId) return;

    const invited = membersById.get(input.invitedId);
    const inviter = membersById.get(input.inviterId);
    if (!invited || !inviter) return;

    const key = `${input.invitedId}|${input.inviterId}`;
    const existing = relationships.get(key) || {
        invited_member_id: input.invitedId,
        invited_member_display_name: displayName(invited),
        inviter_member_id: input.inviterId,
        inviter_display_name: displayName(inviter),
        sourceRows: [],
        rawValues: [],
        mappingCorrectionApplied: false,
        notes: [],
    };

    existing.sourceRows.push(...splitList(input.sourceRows || input.sourceRow || ""));
    existing.rawValues.push(...splitList(input.rawValue || ""));
    existing.mappingCorrectionApplied = existing.mappingCorrectionApplied || Boolean(input.mappingCorrectionApplied);
    existing.notes.push(...splitList(input.notes || "").filter(note => !isGenericPlanNote(note)));
    relationships.set(key, existing);
}

function buildDecision(reviewRow, detailRow, paxByRow, membersById) {
    const sourceRow = String(reviewRow.source_row_number || "");
    const token = String(reviewRow.normalized_inviter_token || normalizeName(reviewRow.parsed_inviter_token));
    const originalInvitedId = reviewRow.invited_member_id || detailRow?.resolved_invited_member_id || "";
    const correctedInvitedId = INVITED_CORRECTIONS_BY_ROW.get(sourceRow) || originalInvitedId;
    const correctedInvited = membersById.get(correctedInvitedId);
    const duplicateGroup = DUPLICATE_GROUP_BY_ROW.get(sourceRow) || "";
    const mappingCorrection = correctedInvitedId !== originalInvitedId;
    const paxRow = paxByRow.get(sourceRow);
    const base = {
        source_row_number: sourceRow,
        official_invited_member_name: reviewRow.invited_official_name,
        source_identifiers_used: sourceIdentifier(paxRow),
        original_selected_invited_member_id: originalInvitedId,
        corrected_invited_member_id: correctedInvitedId,
        corrected_invited_member_display_name: displayName(correctedInvited) || reviewRow.invited_current_display_name,
        inviter_token: reviewRow.parsed_inviter_token,
        selected_inviter_member_id: "",
        selected_inviter_display_name: "",
        final_decision: "",
        include_in_future_relationship_table: "false",
        excluded_reason: "",
        mapping_correction_required: mappingCorrection ? "true" : "false",
        duplicate_name_group: duplicateGroup,
        notes: "",
    };

    let selectedInviterId = "";
    let finalDecision = "";
    let excludedReason = "";
    const notes = [];

    if (sourceRow === "891" || reviewRow.existing_classification === "self_reference") {
        finalDecision = "excluded_self_reference";
        excludedReason = "self_reference";
        selectedInviterId = reviewRow.possible_matched_member_id || reviewRow.current_scalar_inviter_id || "";
        notes.push("Self-references are not valid member-to-member Proud Papa relationships.");
    } else if (IGNORED_EXTERNAL_TOKENS.has(token)) {
        finalDecision = "ignored_external_reference_without_member_record";
        excludedReason = "outside_region_external_reference_without_aggieland_member_record";
        notes.push("Confirmed non-Aggieland/outside-region reference with no member relationship to create.");
    } else if (ACQUISITION_SOURCE_TOKENS.has(token)) {
        finalDecision = "excluded_acquisition_source";
        excludedReason = "acquisition_source_not_member";
        notes.push("Confirmed source/acquisition value, not a Proud Papa member.");
    } else if (PERSONAL_REFERRAL_TOKENS.has(token)) {
        finalDecision = "excluded_personal_referral_without_member_record";
        excludedReason = "personal_referral_without_member_record";
        notes.push("Confirmed personal referral label without a member record to relate.");
    } else if (NO_INVITER_TOKENS.has(token)) {
        finalDecision = "excluded_intentional_no_inviter";
        excludedReason = "intentional_no_inviter";
        notes.push("Confirmed intentional no-inviter value.");
    } else if (sourceRow === "14") {
        finalDecision = "approved_relationship_already_represented_after_duplicate_mapping_correction";
        selectedInviterId = "0880fb6e-6047-490d-9246-6ef395827cd4";
        notes.push("Corrected B-I-N-G-O (2.0) to the Maui-linked current member; the scalar invited_by_id already represents Maui.");
    } else if (sourceRow === "29") {
        finalDecision = "approved_relationship_already_represented";
        selectedInviterId = "888b44db-8ba8-4288-b9b4-fff5ed7d1fc6";
        notes.push("Confirmed separate Bingo (2.0) record maps to Sinko.");
    } else if (sourceRow === "227") {
        finalDecision = "approved_relationship_already_represented_after_duplicate_mapping_correction";
        selectedInviterId = "5fa6e2ce-c9fe-4fad-8aad-e08442ae820e";
        notes.push("Corrected Top Hat/Matthew Murphy to the Mudder-linked current member; Doug Pittman's Top Hat remains mapped to Mash.");
    } else if (ACCEPTED_INVITER_BY_NORMALIZED_TOKEN.has(token)) {
        selectedInviterId = ACCEPTED_INVITER_BY_NORMALIZED_TOKEN.get(token);
        const already = currentScalarMatches(membersById, correctedInvitedId, selectedInviterId);
        finalDecision = already ? "approved_relationship_already_represented" : "approved_relationship_ready_for_future_insert";
        if (token === "messi") {
            notes.push("Confirmed unresolved Messi token selects Messi (2.0), not Messi (DR).");
        } else {
            notes.push("Accepted parenthetical-qualified current member candidate as the confirmed inviter.");
        }
    } else if (parseIdList(reviewRow.possible_matched_member_id).length === 1) {
        selectedInviterId = parseIdList(reviewRow.possible_matched_member_id)[0];
        const already = currentScalarMatches(membersById, correctedInvitedId, selectedInviterId);
        finalDecision = already ? "approved_relationship_already_represented" : "approved_relationship_ready_for_future_insert";
        notes.push("Single candidate accepted by final audit rules.");
    } else {
        finalDecision = "unresolved_requires_human_review";
        excludedReason = "unresolved_member_reference";
        notes.push("No final correction rule selected a member relationship.");
    }

    const selectedInviter = membersById.get(selectedInviterId);
    const includeRelationship = Boolean(selectedInviterId && correctedInvitedId && selectedInviterId !== correctedInvitedId && !excludedReason);

    return {
        ...base,
        selected_inviter_member_id: selectedInviterId,
        selected_inviter_display_name: displayName(selectedInviter),
        final_decision: finalDecision,
        include_in_future_relationship_table: includeRelationship ? "true" : "false",
        excluded_reason: excludedReason,
        notes: notes.join(" "),
    };
}

function main() {
    const detailRows = readCsv(DETAIL_PATH);
    const priorPlanRows = readCsv(PRIOR_PLAN_PATH);
    const reviewRows = readCsv(HUMAN_REVIEW_PATH);
    const members = readCsv(MEMBERS_PATH);
    const baselineMatches = readCsv(BASELINE_MATCHES_PATH);
    const manualDecisions = readCsv(MANUAL_DECISIONS_PATH);
    const paxRows = readPaxMaster();

    const membersById = new Map(members.map(member => [member.id, member]));
    const paxByRow = new Map(paxRows.map(row => [row.__sourceRowNumber, row]));
    const detailByRowToken = new Map(detailRows.map(row => [`${row.official_source_row_number}|${row.normalized_inviter_token}`, row]));

    const finalDecisionRows = reviewRows.map(reviewRow => {
        const key = `${reviewRow.source_row_number}|${reviewRow.normalized_inviter_token}`;
        return buildDecision(reviewRow, detailByRowToken.get(key), paxByRow, membersById);
    });

    const relationships = new Map();
    for (const row of priorPlanRows) {
        if (row.invited_member_id === row.inviter_member_id) continue;
        if (row.recommended_action === "blocked_needs_human_review") continue;
        if (row.source_rows === "227" && row.invited_member_id === IDS.topHatMash && row.inviter_member_id === "5fa6e2ce-c9fe-4fad-8aad-e08442ae820e") continue;

        addRelationship(relationships, membersById, {
            invitedId: row.invited_member_id,
            inviterId: row.inviter_member_id,
            sourceRows: row.source_rows,
            rawValue: row.raw_official_value,
            notes: row.notes,
        });
    }

    for (const row of finalDecisionRows) {
        if (row.include_in_future_relationship_table !== "true") continue;
        addRelationship(relationships, membersById, {
            invitedId: row.corrected_invited_member_id,
            inviterId: row.selected_inviter_member_id,
            sourceRow: row.source_row_number,
            rawValue: row.inviter_token,
            mappingCorrectionApplied: row.mapping_correction_required === "true",
            notes: row.notes,
        });
    }

    const finalPlanRows = [...relationships.values()]
        .map(row => {
            const already = currentScalarMatches(membersById, row.invited_member_id, row.inviter_member_id);
            return {
                invited_member_id: row.invited_member_id,
                invited_member_display_name: row.invited_member_display_name,
                inviter_member_id: row.inviter_member_id,
                inviter_display_name: row.inviter_display_name,
                source_row_number: setJoin(row.sourceRows),
                source_raw_proud_papa_value: setJoin(row.rawValues),
                relationship_already_represented_by_current_scalar_field: already ? "true" : "false",
                future_insert_required: already ? "false" : "true",
                mapping_correction_applied: row.mappingCorrectionApplied ? "true" : "false",
                notes: setJoin([
                    SOURCE,
                    "Future relationship-table application plan only; no data was changed by this audit.",
                    ...row.notes.filter(note => !isGenericPlanNote(note)),
                ]),
            };
        })
        .sort((a, b) => a.invited_member_display_name.localeCompare(b.invited_member_display_name) || a.inviter_display_name.localeCompare(b.inviter_display_name));

    const summary = buildSummary({
        members,
        membersById,
        finalDecisionRows,
        finalPlanRows,
        baselineMatches,
        manualDecisions,
    });

    writeCsv(FINAL_DECISIONS_PATH, finalDecisionRows, FINAL_DECISION_HEADERS);
    writeCsv(FINAL_PLAN_PATH, finalPlanRows, FINAL_PLAN_HEADERS);
    fs.writeFileSync(FINAL_SUMMARY_PATH, summary);

    console.log(`Wrote ${FINAL_DECISIONS_PATH}`);
    console.log(`Wrote ${FINAL_PLAN_PATH}`);
    console.log(`Wrote ${FINAL_SUMMARY_PATH}`);
}

function buildSummary({ members, membersById, finalDecisionRows, finalPlanRows, baselineMatches, manualDecisions }) {
    const count = predicate => finalPlanRows.filter(predicate).length;
    const approvedRelationships = finalPlanRows.length;
    const alreadyRepresented = count(row => row.relationship_already_represented_by_current_scalar_field === "true");
    const readyForInsert = count(row => row.future_insert_required === "true");
    const excludedAcquisition = finalDecisionRows.filter(row => [
        "excluded_acquisition_source",
        "excluded_personal_referral_without_member_record",
        "excluded_intentional_no_inviter",
    ].includes(row.final_decision));
    const ignoredExternal = finalDecisionRows.filter(row => row.final_decision === "ignored_external_reference_without_member_record");
    const unresolved = finalDecisionRows.filter(row => row.final_decision === "unresolved_requires_human_review");

    const bingoMembers = [IDS.bingoMaui, IDS.bingoSinko].map(id => membersById.get(id));
    const topHatMembers = [IDS.topHatMash, IDS.topHatMudder, IDS.topHatMudderDuplicate].map(id => membersById.get(id));
    const messiMembers = [IDS.messi20, IDS.messiDr].map(id => membersById.get(id));

    const baselineTopHat = baselineMatches
        .filter(row => normalizeName(row.source_pax_name) === "tophat" || normalizeName(row.raw_pax_master_name) === "tophat")
        .map(row => `${row.source_pax_name || row.raw_pax_master_name} | member_id=${row.member_id || ""} | candidates=${row.candidate_member_ids || ""} | raw_real_name=${row.raw_real_name || ""} | raw_first_ao=${row.raw_first_ao || ""} | raw_fng_date=${row.raw_fng_date || ""} | raw_proud_papa=${row.raw_proud_papa || ""}`);
    const manualDuplicateRows = manualDecisions
        .filter(row => ["bingo20", "bingo20", "tophat"].includes(normalizeName(row.official_pax)))
        .map(row => `${row.official_pax} -> selected_member_id=${row.selected_member_id || ""} (${row.notes || ""})`);

    const lines = [
        "# Aggieland Proud Papa Final Decisions",
        "",
        "This is an audit-only correction package. It does not modify runtime code, migrations, schemas, policies, tests, or database data.",
        "",
        "## Final relationship plan",
        "",
        `- Total approved unique member-to-member relationships: ${approvedRelationships}`,
        `- Relationships already represented by current scalar invited_by_id: ${alreadyRepresented}`,
        `- Additional relationships ready for future relationship-table insert: ${readyForInsert}`,
        `- Excluded acquisition/non-member review rows: ${excludedAcquisition.length}`,
        `- Ignored external DR/outside-region references without member records: ${ignoredExternal.length}`,
        `- Remaining unresolved review rows: ${unresolved.length}`,
        "",
        "The final plan is safe to use as a future migration input after identity cleanup noted below. Apply only rows where `future_insert_required=true` if the future migration is additive.",
        "",
        "## Duplicate Bingo result",
        "",
        `Current Aggieland Bingo/equivalent records found: ${bingoMembers.filter(Boolean).length}`,
        "",
        ...bingoMembers.map(member => `- ${memberSummary(member)}`),
        "",
        `- Source row 14, B-I-N-G-O (2.0), Hospital Name Maui 2.0, First AO F3Dads, FNG Date 7/27/24, Proud Papa Maui -> ${IDS.bingoMaui} (${displayName(membersById.get(IDS.bingoMaui))}) -> Maui.`,
        `- Source row 29, Bingo (2.0), Hospital Name Meadow (Sinko 2.0), First AO F3Dads, FNG Date 8/9/25, Proud Papa Sinko -> ${IDS.bingoSinko} (${displayName(membersById.get(IDS.bingoSinko))}) -> Sinko.`,
        "- The earlier Proud Papa audit collapsed row 14 onto the Sinko-linked Bingo record. The baseline manual selections contain the separate B-I-N-G-O/Bingo IDs, so the correction affects Proud Papa reconstruction rather than attendance totals.",
        "",
        "## Duplicate Top Hat result",
        "",
        "Current exact `Top Hat` records found: 2. Current Top Hat-family records including `Top Hat (inactive)`: 3.",
        "",
        ...topHatMembers.map(member => `- ${memberSummary(member)}`),
        "",
        `- Official Doug Pittman Top Hat, The Iron, 2026-06-17, Proud Papa Mash -> ${IDS.topHatMash} (${displayName(membersById.get(IDS.topHatMash))}) -> Mash.`,
        `- Source row 227, Top Hat, Matthew Murphy, Watch, 9/11/25, Proud Papa Mudder -> ${IDS.topHatMudder} (${displayName(membersById.get(IDS.topHatMudder))}) -> Mudder.`,
        `- ${IDS.topHatMudderDuplicate} (${displayName(membersById.get(IDS.topHatMudderDuplicate))}) appears to duplicate Matthew Murphy / Watch / 2025-09-11 / Mudder and should be repaired or merged before applying relationship migrations that depend on canonical member identity.`,
        "- The Proud Papa audit had mapped row 227 to Doug Pittman's Mash-linked Top Hat. Attendance baseline data is not modified here, but the duplicate Top Hat (inactive) current record is an identity cleanup issue for a separate repair pass.",
        "",
        "## Messi result",
        "",
        ...messiMembers.map(member => `- ${memberSummary(member)}`),
        "",
        `- Rows 795 (Betty) and 936 (Spellchek) use raw token Messi and are resolved to ${IDS.messi20} (Messi (2.0)).`,
        "- Rows whose raw token is explicitly `Messi (DR)` remain matched to Messi (DR); this finalizer only changes unresolved raw token `Messi`.",
        "",
        "## Exclusions",
        "",
        `- Acquisition/non-member tokens excluded: ${setJoin(excludedAcquisition.map(row => row.inviter_token))}`,
        `- Ignored external references: ${setJoin(ignoredExternal.map(row => row.inviter_token))}`,
        "- Self-reference excluded: Mufasa -> Mufasa.",
        "",
        "## Baseline and duplicate-name observations",
        "",
        `- Manual duplicate-name selections found: ${manualDuplicateRows.length ? manualDuplicateRows.join("; ") : "none in manual decision template"}`,
        `- Top Hat baseline match rows inspected: ${baselineTopHat.length ? baselineTopHat.join("; ") : "none"}`,
        "- No additional duplicate display-name collapses were accepted by the final Proud Papa audit beyond the explicitly corrected Bingo and Top Hat cases. Parenthetical DR matches were accepted only as inviter matches, not as duplicate invited-member collapses.",
        "- Correcting these mappings changes the Proud Papa reconstruction artifacts only. It does not change attendance baseline data or production member rows.",
        "",
        "## Output files",
        "",
        `- ${path.relative(REPO_ROOT, FINAL_DECISIONS_PATH)}`,
        `- ${path.relative(REPO_ROOT, FINAL_PLAN_PATH)}`,
        `- ${path.relative(REPO_ROOT, FINAL_SUMMARY_PATH)}`,
        "",
    ];

    return `${lines.join("\n")}\n`;
}

main();
