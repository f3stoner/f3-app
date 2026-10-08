import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

import openpyxl


def norm(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def phone(value):
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-10:] if len(digits) >= 10 else digits


def parse_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raw = str(value or "")
    match = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", raw)
    if match:
        try:
            return date(*map(int, match.groups())).isoformat()
        except ValueError:
            return None
    return None


def workbook_activity(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    result = {}
    for sheet in workbook.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        header_index = None
        last_index = None
        status_index = None
        for index, row in enumerate(rows[:20]):
            headers = [norm(value) for value in row]
            for candidate in ("lastpost", "lastwodate"):
                if candidate in headers:
                    header_index = index
                    last_index = headers.index(candidate)
            if "activeinactive" in headers:
                status_index = headers.index("activeinactive")
        if header_index is None:
            continue
        for row_number, row in enumerate(rows[header_index + 1:], header_index + 2):
            result[(sheet.title, row_number)] = {
                "last_activity_date": parse_date(row[last_index] if last_index < len(row) else None),
                "roster_status": str(row[status_index]).strip() if status_index is not None and status_index < len(row) and row[status_index] is not None else None,
            }
    return result


def distinct(values):
    return sorted({value for value in values if value})


def likely_name_spelling_variant(left, right, left_phones, right_phones):
    left_key, right_key = norm(left), norm(right)
    similarity = SequenceMatcher(None, left_key, right_key).ratio()
    contacts_conflict = bool(left_phones and right_phones and not (left_phones & right_phones))
    return similarity >= 0.88 and not contacts_conflict


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reconciliation")
    parser.add_argument("snapshot")
    parser.add_argument("workbook")
    parser.add_argument("output_dir")
    args = parser.parse_args()
    audit = json.loads(Path(args.reconciliation).read_text())
    snapshot = json.loads(Path(args.snapshot).read_text())
    activity = workbook_activity(args.workbook)
    reviews = [item for item in audit["identities"] if item["classification"] == "NEEDS_HUMAN_REVIEW"]
    by_f3 = defaultdict(list)
    for item in audit["identities"]:
        by_f3[norm(item["doge_values"]["f3_names"][0])].append(item)

    triaged = []
    primary_counts = Counter()
    tier_counts = Counter()
    for item in reviews:
        group = by_f3[norm(item["doge_values"]["f3_names"][0])]
        group_names = distinct(name for related in group for name in related["doge_values"]["hospital_names"])
        group_phones = defaultdict(set)
        for related in group:
            for name in related["doge_values"]["hospital_names"] or ["<missing>"]:
                group_phones[norm(name)].update(phone(value) for value in related["doge_values"]["phones"] if phone(value))
        conflict_fields = {row["field"] for row in item["conflicts"]}
        unresolved_inviter = any(row["field"] == "inviter" and row.get("unresolved") for row in item["conflicts"])
        multiple_canonical = any(row["field"] == "identity" for row in item["conflicts"]) or len(item["proposed_canonical_member_matches"]) > 1
        current = item.get("current_the_q_values") or (item["proposed_canonical_member_matches"][0] if len(item["proposed_canonical_member_matches"]) == 1 else None)
        current_date = current.get("first_post_date") if current else None
        attendance_date = current.get("first_attendance_date") if current else None
        original_dates = item["doge_values"]["explicit_original_first_post_dates"]
        ao_dates = item["doge_values"]["ambiguous_or_ao_specific_first_workout_dates"]
        all_dates = sorted(set(original_dates + ao_dates))
        has_missing_cluster = len(group) > 1 and any(not related["doge_values"]["hospital_names"] for related in group)
        same_human_name_variation = False
        if len(group_names) > 1:
            for left_index, left in enumerate(group_names):
                for right in group_names[left_index + 1:]:
                    if likely_name_spelling_variant(left, right, group_phones[norm(left)], group_phones[norm(right)]):
                        same_human_name_variation = True
        distinct_humans = len(group_names) > 1 and not same_human_name_variation

        if distinct_humans:
            primary = "F3-name collision with different hospital names"
        elif same_human_name_variation:
            primary = "Likely hospital-name spelling variation"
        elif multiple_canonical:
            primary = "Multiple canonical member candidates"
        elif "hospital_name" in conflict_fields:
            primary = "F3-name collision with different hospital names"
        elif "first_post_date" in conflict_fields:
            supported_current = current_date and attendance_date == current_date
            later_only = all(value > current_date for value in all_dates) if current_date and all_dates else False
            if supported_current and (later_only or (ao_dates and not any(value < current_date for value in ao_dates))):
                primary = "AO-specific first-workout date vs likely true FNG date"
            else:
                primary = "Conflicting FNG dates"
        elif unresolved_inviter:
            primary = "Inviter/Proud Papa cannot be resolved to canonical member"
        elif "inviter" in conflict_fields:
            primary = "Conflicting inviter/Proud Papa"
        elif has_missing_cluster or not item["doge_values"]["hospital_names"]:
            primary = "Missing identifying information"
        elif any(len(related["proposed_canonical_member_matches"]) > 1 for related in group):
            primary = "Suspected duplicate canonical members"
        else:
            primary = "Other"

        if same_human_name_variation:
            tier = "INTERNAL_HIGH_CONFIDENCE"
            resolution = "Treat the hospital-name spelling as a source variation for review; matching F3 name and non-contradictory contact evidence strongly support one human."
        elif distinct_humans or "hospital_name" in conflict_fields or multiple_canonical:
            tier = "TRUE_IDENTITY_COLLISION"
            resolution = "Keep identities separate pending high-priority adjudication; the available evidence does not support one human."
        elif primary == "AO-specific first-workout date vs likely true FNG date":
            tier = "INTERNAL_HIGH_CONFIDENCE"
            resolution = f"Retain the canonical/attendance-supported first-post date {current_date}; treat later workbook dates as AO-specific activity."
        elif has_missing_cluster and current and len(item["proposed_canonical_member_matches"]) == 1:
            tier = "INTERNAL_HIGH_CONFIDENCE"
            resolution = "Associate the detail-poor roster row with the unique canonical F3 identity only after an admin confirms the grouped source rows."
        elif primary == "Conflicting FNG dates":
            earliest = min(all_dates) if all_dates else None
            if current_date and attendance_date == current_date and earliest and earliest >= current_date:
                tier = "INTERNAL_REVIEW"
                resolution = f"The Q supports {current_date}; admin should verify source-sheet semantics before accepting any later date."
            else:
                tier = "DOGE_INPUT_REQUIRED"
                resolution = "Ask DOGE to identify the original FNG date because current attendance coverage cannot establish the earlier history."
        elif primary in {"Inviter/Proud Papa cannot be resolved to canonical member", "Conflicting inviter/Proud Papa"}:
            tier = "DOGE_INPUT_REQUIRED" if unresolved_inviter or not current or not current.get("inviter_member_ids") else "INTERNAL_REVIEW"
            resolution = "Ask DOGE to identify the correct Proud Papa." if tier == "DOGE_INPUT_REQUIRED" else "Admin should compare the canonical inviter relationship with source history."
        elif primary == "Missing identifying information":
            tier = "DOGE_INPUT_REQUIRED" if not current else "INTERNAL_REVIEW"
            resolution = "Ask DOGE for a non-sensitive identifying detail." if tier == "DOGE_INPUT_REQUIRED" else "Admin can likely resolve this from the unique canonical F3 identity and attendance context."
        else:
            tier = "INTERNAL_REVIEW" if current else "DOGE_INPUT_REQUIRED"
            resolution = "Admin should review the available canonical and roster evidence." if current else "DOGE input is needed because The Q has no reliable identity anchor."

        evidence = distinct(item["confidence_and_evidence"] + [
            f"Workbook sheets: {', '.join(distinct(row['source_sheet'] for row in item['source_roster_records']))}",
            f"Canonical first post: {current_date}" if current_date else None,
            f"Earliest The Q attendance: {attendance_date}" if attendance_date else None,
            f"DOGE hospital name(s): {', '.join(item['doge_values']['hospital_names'])}" if item["doge_values"]["hospital_names"] else None,
            f"DOGE contact evidence: {len(item['doge_values']['phones'])} phone(s), {len(item['doge_values']['emails'])} email(s)",
        ])
        triaged.append({"identity_id": item["identity_id"], "f3_names": item["doge_values"]["f3_names"], "primary_reason": primary, "review_tier": tier, "proposed_resolution": resolution, "evidence": evidence, "original_record": item})
        primary_counts[primary] += 1
        tier_counts[tier] += 1

    # Collision groups use the same-F3 group structure plus canonical duplicate names.
    collision_groups = []
    for f3, group in sorted(by_f3.items()):
        if len(group) <= 1:
            continue
        names = distinct(name for item in group for name in item["doge_values"]["hospital_names"])
        phones_by_name = defaultdict(set)
        for item in group:
            for name in item["doge_values"]["hospital_names"]:
                phones_by_name[norm(name)].update(phone(value) for value in item["doge_values"]["phones"] if phone(value))
        spelling_variant = any(likely_name_spelling_variant(a, b, phones_by_name[norm(a)], phones_by_name[norm(b)]) for index, a in enumerate(names) for b in names[index + 1:])
        canonical_ids = distinct(match["id"] for item in group for match in item["proposed_canonical_member_matches"])
        if len(canonical_ids) > 1:
            category = "possible existing canonical-data problem"
        elif len(names) > 1 and spelling_variant:
            category = "likely same human / spelling or alias variation"
        elif len(names) > 1:
            category = "likely different humans sharing F3 name"
        elif names and any(not item["doge_values"]["hospital_names"] for item in group):
            category = "likely same human / duplicate record"
        elif len(names) == 1:
            category = "likely same human / duplicate record"
        else:
            category = "insufficient evidence"
        collision_groups.append({"normalized_f3_name": f3, "f3_names": distinct(name for item in group for name in item["doge_values"]["f3_names"]), "hospital_names": names, "identity_ids": [item["identity_id"] for item in group], "canonical_member_ids": canonical_ids, "classification": category})
    canonical_by_f3 = defaultdict(list)
    for member in snapshot["members"]:
        canonical_by_f3[norm(member.get("pax_name"))].append(member)
    for f3, members in sorted(canonical_by_f3.items()):
        if f3 and len(members) > 1:
            collision_groups.append({"normalized_f3_name": f3, "f3_names": distinct(member.get("pax_name") for member in members), "hospital_names": distinct(member.get("real_name") for member in members), "identity_ids": [], "canonical_member_ids": [member["id"] for member in members], "classification": "possible existing canonical-data problem"})
    collision_counts = Counter(group["classification"] for group in collision_groups)

    roster_only = []
    roster_counts = Counter()
    recent_cutoff = "2025-10-07"
    for item in [row for row in audit["identities"] if row["classification"] == "ROSTER_ONLY"]:
        augmented = []
        dates = []
        for record in item["source_roster_records"]:
            extra = activity.get((record["source_sheet"], record["source_row"]), {})
            augmented.append({"source_sheet": record["source_sheet"], "source_row": record["source_row"], **extra})
            dates.extend(value for value in (record.get("first_workout_date"), extra.get("last_activity_date")) if value)
        if item["proposed_canonical_member_matches"]:
            category = "potentially represented under another canonical identity"
        elif any(value >= recent_cutoff for value in dates):
            category = "active/recent PAX unexpectedly missing from The Q"
        elif dates and max(dates) < recent_cutoff:
            category = "historical/inactive West Houston PAX"
        else:
            category = "insufficient evidence"
        roster_counts[category] += 1
        roster_only.append({"identity_id": item["identity_id"], "f3_names": item["doge_values"]["f3_names"], "hospital_names": item["doge_values"]["hospital_names"], "classification": category, "activity_evidence": augmented, "known_dates": sorted(set(dates))})

    # Only DOGE-required and true-collision cases produce external questions; group same F3 cases.
    external = [item for item in triaged if item["review_tier"] in {"DOGE_INPUT_REQUIRED", "TRUE_IDENTITY_COLLISION"}]
    external_by_f3 = defaultdict(list)
    for item in external:
        external_by_f3[norm(item["f3_names"][0])].append(item)
    questions = []
    for _, group in sorted(external_by_f3.items(), key=lambda pair: pair[0]):
        name = group[0]["f3_names"][0]
        originals = [item["original_record"] for item in group]
        hospital_names = distinct(value for item in originals for value in item["doge_values"]["hospital_names"])
        dates = distinct(value for item in originals for value in item["doge_values"]["explicit_original_first_post_dates"] + item["doge_values"]["ambiguous_or_ao_specific_first_workout_dates"])
        inviters = distinct(value for item in originals for value in item["doge_values"]["proud_papas"])
        tiers = {item["review_tier"] for item in group}
        if "TRUE_IDENTITY_COLLISION" in tiers and len(hospital_names) > 1:
            options = [f"{chr(65 + index)}. {value}" for index, value in enumerate(hospital_names[:3])]
            options += [f"{chr(65 + len(options))}. These are different PAX", f"{chr(66 + len(options))}. Other: ______"]
            question = f"{name} — DOGE records conflict on hospital name:\n" + "\n".join(options)
        elif dates and any(item["primary_reason"].startswith("Conflicting FNG") for item in group):
            question = f"{name} — Which is the original FNG date?\n" + "\n".join([f"{chr(65 + index)}. {value}" for index, value in enumerate(dates[:4])] + [f"{chr(65 + min(len(dates), 4))}. Other: ______"])
        elif inviters:
            question = f"{name} — Who is the correct Proud Papa?\n" + "\n".join([f"{chr(65 + index)}. {value}" for index, value in enumerate(inviters[:4])] + [f"{chr(65 + min(len(inviters), 4))}. Unknown / other: ______"])
        else:
            question = f"{name} — Are these roster records one person? If yes, please provide the correct hospital name or another non-sensitive identifying detail."
        questions.append({"f3_name": name, "question": question, "identity_ids": [item["identity_id"] for item in group], "priority": "highest" if "TRUE_IDENTITY_COLLISION" in tiers else "normal"})

    # Risks are ranked deterministically: canonical problems, conflicting humans, then broad data issues.
    risks = []
    canonical_problems = [group for group in collision_groups if group["classification"] == "possible existing canonical-data problem"]
    different_humans = [group for group in collision_groups if group["classification"] == "likely different humans sharing F3 name"]
    if canonical_problems:
        risks.append({"issue": "Possible duplicate/conflicting canonical F3 identities", "count": len(canonical_problems), "examples": [group["f3_names"] for group in canonical_problems[:3]]})
    if different_humans:
        risks.append({"issue": "Same F3 name associated with different hospital names", "count": len(different_humans), "examples": [group["f3_names"] for group in different_humans[:3]]})
    risks += [
        {"issue": "First-post dates conflict with workbook history", "count": primary_counts["Conflicting FNG dates"], "examples": []},
        {"issue": "Proud Papa references cannot be resolved canonically", "count": primary_counts["Inviter/Proud Papa cannot be resolved to canonical member"], "examples": []},
        {"issue": "Roster-only identities lack enough activity evidence", "count": roster_counts["insufficient evidence"], "examples": []},
    ]
    risks = risks[:5]

    primary_categories = [
        "F3-name collision with different hospital names", "Likely hospital-name spelling variation",
        "Multiple canonical member candidates", "Conflicting FNG dates",
        "AO-specific first-workout date vs likely true FNG date", "Conflicting inviter/Proud Papa",
        "Inviter/Proud Papa cannot be resolved to canonical member", "Conflicting phone/email",
        "Missing identifying information", "Suspected duplicate canonical members", "Other",
    ]
    for category in primary_categories:
        primary_counts.setdefault(category, 0)
    for category in ["INTERNAL_HIGH_CONFIDENCE", "INTERNAL_REVIEW", "DOGE_INPUT_REQUIRED", "TRUE_IDENTITY_COLLISION"]:
        tier_counts.setdefault(category, 0)
    for category in ["likely same human / duplicate record", "likely same human / spelling or alias variation", "likely different humans sharing F3 name", "insufficient evidence", "possible existing canonical-data problem"]:
        collision_counts.setdefault(category, 0)
    for category in ["historical/inactive West Houston PAX", "active/recent PAX unexpectedly missing from The Q", "potentially represented under another canonical identity", "insufficient evidence"]:
        roster_counts.setdefault(category, 0)

    output = {
        "contract": {"mode": "read_only", "source_review_count": len(reviews), "source_collision_count": audit["counts"]["suspected_duplicate_collision_groups"], "source_roster_only_count": audit["counts"]["roster_only"]},
        "review_primary_reason_counts": dict(sorted(primary_counts.items())), "review_tier_counts": dict(sorted(tier_counts.items())),
        "collision_group_counts": dict(sorted(collision_counts.items())), "roster_only_counts": dict(sorted(roster_counts.items())),
        "doge_question_count": len(questions), "review_cases": triaged, "collision_groups": collision_groups,
        "roster_only_identities": roster_only, "doge_questions": questions, "highest_risks": risks,
    }
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "triage.json").write_text(json.dumps(output, indent=2, sort_keys=True) + "\n")

    summary = ["# DOGE roster reconciliation triage", "", "This is a read-only second-stage review. No production records, identities, schema, or UI were changed.", "", "## Original review cases by primary reason", ""]
    summary += [f"- {name}: {count}" for name, count in sorted(primary_counts.items())]
    summary += ["", "## Review tiers", ""] + [f"- {name}: {count}" for name, count in sorted(tier_counts.items())]
    summary += ["", "## Collision groups", ""] + [f"- {name}: {count}" for name, count in sorted(collision_counts.items())]
    summary += ["", "## Roster-only identities", ""] + [f"- {name}: {count}" for name, count in sorted(roster_counts.items())]
    summary += ["", f"Questions remaining for DOGE: {len(questions)}", "", "## Five highest-risk findings", ""]
    summary += [f"{index}. {risk['issue']} ({risk['count']})" for index, risk in enumerate(risks, 1)]
    summary += ["", "## Model and tooling implications", "", "- The canonical member model supports the core audit fields, but `home_ao` remains free text and cannot reliably distinguish current home AO from original AO.", "- Proud Papa is correctly modeled as canonical member relationships, but external-region or historical inviters need an explicit unresolved-reference state instead of being forced into a member match.", "- Q/VQ history is session-derived; spreadsheet VQ dates need provenance-aware comparison rather than a new member field.", "- Reconciliation tooling should preserve field semantics by source sheet, distinguish AO-first-workout from original FNG date, and group evidence before creating questions.", "- Collision review needs explicit split/same-human/alias decisions and must never default to merging on F3 name alone.", ""]
    (output_dir / "triage_summary.md").write_text("\n".join(summary))

    question_lines = ["# Questions for DOGE", "", "Only questions that require DOGE or region knowledge are included.", "", "## Highest-priority identity collisions", ""]
    highest = [row for row in questions if row["priority"] == "highest"]
    normal = [row for row in questions if row["priority"] != "highest"]
    for row in highest:
        question_lines += [f"### {row['f3_name']}", "", row["question"], ""]
    question_lines += ["## Historical and relationship questions", ""]
    for row in normal:
        question_lines += [f"### {row['f3_name']}", "", row["question"], ""]
    (output_dir / "doge_review_triaged.md").write_text("\n".join(question_lines))

    requirements = """# Admin/Data Review requirements

The triage demonstrates these required review states and actions.

## Review states

- Internally corroborated: evidence supports a proposed resolution, but nothing is applied automatically.
- Internal approval required: an admin must accept, reject, or defer a proposed resolution.
- Region input required: the evidence cannot establish historical identity, FNG date, or Proud Papa.
- Identity collision: potentially different humans or an existing canonical split/merge problem; highest priority and no bulk action.
- Roster-only: historical/inactive, recent missing PAX, possible alternate identity, or insufficient evidence.

## Evidence the reviewer needs

- Canonical and source values side by side, with source sheet and row.
- Exact and normalized F3/hospital names, phone/email agreement indicators, and missing-value indicators.
- Earliest attendance, first-post date, Q history, AO history, and source-date semantics.
- Existing and proposed Proud Papa relationships, including unresolved external-region names.
- Other records in the same collision group and any canonical duplicate candidates.

## Reviewer actions

- Confirm same human, confirm different humans, accept spelling variation, or mark alias.
- Keep canonical value, accept source candidate, request region input, or defer.
- Resolve an inviter to a canonical member or retain it as unresolved historical evidence.
- Mark an AO-specific workout date so it cannot overwrite a true FNG date.
- Record reviewer, decision time, evidence, notes, and source-snapshot version.
- Generate a concise external question set without database IDs or implementation details.

Any future apply workflow should be separate from review, require explicit authorization, show the exact field-level effect, and block bulk merges for identity-collision cases.
"""
    (output_dir / "admin_review_requirements.md").write_text(requirements)
    print(json.dumps({"primary_reasons": dict(primary_counts), "tiers": dict(tier_counts), "collisions": dict(collision_counts), "roster_only": dict(roster_counts), "questions": len(questions)}, indent=2))


if __name__ == "__main__":
    main()
