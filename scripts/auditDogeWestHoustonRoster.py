import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

import openpyxl


SENSITIVE_HEADERS = {"address", "city", "st", "state", "zip", "blood type", "birthday", "emergency contact", "emergency #", "ec number", "home address"}
CLASSIFICATIONS = ["HIGH_CONFIDENCE_EXISTING", "NEEDS_HUMAN_REVIEW", "ROSTER_ONLY", "NO_ACTION"]


def text(value):
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def key(value):
    value = unicodedata.normalize("NFKD", text(value) or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", value)


def phone_key(value):
    digits = re.sub(r"\D", "", text(value) or "")
    return digits[-10:] if len(digits) >= 10 else digits or None


def iso_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)) and 20000 < value < 80000:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()
    raw = text(value)
    if not raw:
        return None
    for pattern in (r"(\d{1,2})/(\d{1,2})/(\d{2,4})", r"(\d{4})-(\d{1,2})-(\d{1,2})"):
        match = re.search(pattern, raw)
        if not match:
            continue
        parts = [int(part) for part in match.groups()]
        if pattern.startswith("(\\d{1,2})"):
            month, day, year = parts
            year += 2000 if year < 50 else 1900 if year < 100 else 0
        else:
            year, month, day = parts
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None
    return None


def embedded_ao(value):
    if isinstance(value, (datetime, date, int, float)) and iso_date(value):
        return None
    raw = text(value)
    if not raw:
        return None
    without_date = re.sub(r"\d{1,4}[/-]\d{1,2}[/-]\d{1,4}", "", raw).strip(" (){}-,")
    return without_date or (raw if not iso_date(raw) else None)


def row_values(sheet):
    return [(number, list(row)) for number, row in enumerate(sheet.iter_rows(values_only=True), 1)]


def find_header(rows, required):
    for number, values in rows[:20]:
        labels = [key(value) for value in values]
        if all(any(candidate in labels for candidate in options) for options in required):
            return number, values
    raise ValueError(f"Header not found; expected {required}")


def first_index(headers, *names):
    normalized = [key(value) for value in headers]
    for name in names:
        target = key(name)
        if target in normalized:
            return normalized.index(target)
    return None


def get(values, index):
    return values[index] if index is not None and index < len(values) else None


def parse_workbook(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    records = []
    sheet_meta = []
    for sheet in workbook.worksheets:
        rows = row_values(sheet)
        if sheet.title in {"Tower", "The Iron Gate"}:
            header_row, headers = find_header(rows, [({"name"}), ({"f3name"})])
            indexes = dict(real=first_index(headers, "Name"), f3=first_index(headers, "F3 Name"), phone=first_index(headers, "Phone"), inviter=first_index(headers, "Proud Papa"), first=first_index(headers, "First Date / Orig AO"), vq=first_index(headers, "VQ"))
            semantics = "original_first_post_or_origin_mixed"
        elif sheet.title == "Valhalla":
            header_row, headers = find_header(rows, [({"hospitalname"}), ({"f3name"})])
            indexes = dict(real=first_index(headers, "Hospital Name"), f3=first_index(headers, "F³ Name"), phone=first_index(headers, "Phone №"), home=first_index(headers, "Home AO"), first=first_index(headers, "First BD Date"))
            semantics = "ao_specific_first_workout"
        elif sheet.title == "The Branch":
            header_row, headers = find_header(rows, [({"f3name"}), ({"firstname"}), ({"lastname"})])
            indexes = dict(f3=first_index(headers, "F3 Name"), first_name=first_index(headers, "First Name"), last_name=first_index(headers, "Last Name"), phone=first_index(headers, "Phone Number"), inviter=first_index(headers, "Proud Papa"), first=first_index(headers, "First WO Date"))
            semantics = "ao_specific_or_ambiguous_first_workout"
        elif sheet.title == "The Oasis":
            header_row, headers = find_header(rows, [({"paxname"}), ({"hospitalname"})])
            indexes = dict(f3=first_index(headers, "PAX Name"), real=first_index(headers, "Hospital Name"), email=first_index(headers, "Email Address"), phone=first_index(headers, "Phone Number"))
            semantics = "no_first_post_field"
        elif sheet.title == "The Point":
            header_row, headers = find_header(rows, [({"location"}), ({"firstname"}), ({"lastname"})])
            indexes = dict(f3=0, first_name=first_index(headers, "First Name"), last_name=first_index(headers, "Last Name"), phone=first_index(headers, "Phone"), email=first_index(headers, "Email"), home=first_index(headers, "Home AO"), first=first_index(headers, "Orig Date AO"), inviter=first_index(headers, "Proud Papa"), location=first_index(headers, "Location"))
            semantics = "original_date_and_ao_mixed"
        elif sheet.title == "The Valley":
            header_row, headers = find_header(rows, [({"f3name"}), ({"hospitalname"})])
            indexes = dict(f3=first_index(headers, "F3 Name"), real=first_index(headers, "Hospital Name"), phone=first_index(headers, "Phone Number"), email=first_index(headers, "Email Address"), inviter=first_index(headers, "Proud Papa"), home=first_index(headers, "First Posting AO"), first=first_index(headers, "First Post Date"))
            semantics = "explicit_original_first_post"
        elif sheet.title == "The Knot":
            header_row, headers = find_header(rows, [({"birthname"}), ({"f3name"})])
            indexes = dict(real=first_index(headers, "Birth Name"), f3=first_index(headers, "F3 Name"), phone=first_index(headers, "Phone #"), inviter=first_index(headers, "Proud Papa"), first=first_index(headers, "First WO Date"))
            semantics = "ao_specific_or_ambiguous_first_workout"
        elif sheet.title == "The Corridor":
            header_row, headers = find_header(rows, [({"name"}), ({"f3name"})])
            indexes = dict(real=first_index(headers, "Name"), f3=first_index(headers, "F3 Name"), phone=first_index(headers, "Phone #"), inviter=first_index(headers, "Proud Papa"), first=first_index(headers, "First WO"))
            semantics = "original_date_or_ao_mixed"
        elif sheet.title == "The HOP":
            header_row, headers = find_header(rows, [({"name"}), ({"f3name"}), ({"homeao"})])
            indexes = dict(real=first_index(headers, "Name"), f3=first_index(headers, "F3 Name"), home=first_index(headers, "Home AO"), first=first_index(headers, "First WO Date"), inviter=first_index(headers, "Proud Papa"), phone=first_index(headers, "Phone Number"))
            semantics = "ao_specific_or_ambiguous_first_workout"
        else:
            continue

        count = 0
        for row_number, values in rows:
            if row_number <= header_row:
                continue
            f3 = text(get(values, indexes.get("f3")))
            first_name = text(get(values, indexes.get("first_name")))
            last_name = text(get(values, indexes.get("last_name")))
            real = text(get(values, indexes.get("real"))) or text(" ".join(part for part in (first_name, last_name) if part))
            if not f3 or key(f3) in {"f3name", "paxname", "name"}:
                continue
            first_raw = get(values, indexes.get("first"))
            record = {
                "source_sheet": sheet.title,
                "source_row": row_number,
                "f3_name": f3,
                "hospital_name": real,
                "email": text(get(values, indexes.get("email"))),
                "phone": text(get(values, indexes.get("phone"))),
                "home_or_original_ao": text(get(values, indexes.get("home"))) or embedded_ao(first_raw),
                "first_workout_raw": text(first_raw),
                "first_workout_date": iso_date(first_raw),
                "first_workout_semantics": semantics,
                "proud_papa": text(get(values, indexes.get("inviter"))),
                "vq_date": iso_date(get(values, indexes.get("vq"))),
                "location_type": text(get(values, indexes.get("location"))),
            }
            records.append(record)
            count += 1
        sheet_meta.append({"sheet": sheet.title, "header_row": header_row, "record_count": count, "first_workout_semantics": semantics})
    return records, sheet_meta


class UnionFind:
    def __init__(self, size):
        self.parent = list(range(size))

    def find(self, value):
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left, right):
        left, right = self.find(left), self.find(right)
        if left != right:
            self.parent[right] = left


def group_records(records):
    uf = UnionFind(len(records))
    by_f3 = defaultdict(list)
    for index, record in enumerate(records):
        by_f3[key(record["f3_name"])].append(index)
    for indexes in by_f3.values():
        for pos, left in enumerate(indexes):
            for right in indexes[pos + 1:]:
                a, b = records[left], records[right]
                real_a, real_b = key(a["hospital_name"]), key(b["hospital_name"])
                phone_a, phone_b = phone_key(a["phone"]), phone_key(b["phone"])
                if (real_a and real_a == real_b) or (phone_a and phone_a == phone_b) or (not real_a and not real_b):
                    uf.union(left, right)
    groups = defaultdict(list)
    for index, record in enumerate(records):
        groups[uf.find(index)].append(record)
    return sorted(groups.values(), key=lambda group: (key(group[0]["f3_name"]), key(group[0]["hospital_name"]), group[0]["source_sheet"], group[0]["source_row"]))


def distinct(group, field, normalizer=lambda value: key(value)):
    values = []
    seen = set()
    for record in group:
        value = record.get(field)
        normalized = normalizer(value) if value else None
        if value and normalized not in seen:
            seen.add(normalized)
            values.append(value)
    return values


def make_current(member, inviter_names, first_attendance, first_q):
    return {
        "id": member["id"], "f3_name": member.get("pax_name"), "hospital_name": member.get("real_name"),
        "home_ao": member.get("home_ao"), "first_post_date": member.get("first_post_date"),
        "status": member.get("status"), "inviter_member_ids": inviter_names.get(member["id"], []),
        "first_attendance_date": first_attendance.get(member["id"]), "first_q_date": first_q.get(member["id"]),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook")
    parser.add_argument("snapshot")
    parser.add_argument("output_dir")
    args = parser.parse_args()
    records, sheet_meta = parse_workbook(args.workbook)
    snapshot = json.loads(Path(args.snapshot).read_text())
    members = snapshot["members"]
    member_by_id = {member["id"]: member for member in members}
    by_pax = defaultdict(list)
    by_real = defaultdict(list)
    for member in members:
        by_pax[key(member.get("pax_name"))].append(member)
        if key(member.get("real_name")):
            by_real[key(member.get("real_name"))].append(member)
    first_attendance, first_q = {}, {}
    attendance_aos = defaultdict(set)
    for session in snapshot["sessions"]:
        for member_id in session.get("attendee_ids") or []:
            if member_id in member_by_id:
                first_attendance[member_id] = min(first_attendance.get(member_id, session["date"]), session["date"])
                attendance_aos[member_id].add(session.get("ao_name"))
        for member_id in set((session.get("q_ids") or []) + ([session.get("q_id")] if session.get("q_id") else [])):
            if member_id in member_by_id:
                first_q[member_id] = min(first_q.get(member_id, session["date"]), session["date"])
    inviter_ids = defaultdict(list)
    for row in snapshot.get("member_inviters", []):
        inviter_ids[row["member_id"]].append(row["inviter_member_id"])
    for member in members:
        legacy = member.get("invited_by_id")
        if legacy and legacy not in inviter_ids[member["id"]]:
            inviter_ids[member["id"]].append(legacy)

    results = []
    for sequence, group in enumerate(group_records(records), 1):
        f3_values = distinct(group, "f3_name")
        real_values = distinct(group, "hospital_name")
        phone_values = distinct(group, "phone", phone_key)
        email_values = distinct(group, "email", lambda value: (text(value) or "").lower())
        home_values = distinct(group, "home_or_original_ao")
        inviter_values = distinct(group, "proud_papa")
        vq_values = distinct(group, "vq_date", lambda value: value)
        date_records = [record for record in group if record.get("first_workout_date")]
        explicit_dates = sorted({record["first_workout_date"] for record in date_records if record["first_workout_semantics"] in {"explicit_original_first_post", "original_first_post_or_origin_mixed", "original_date_and_ao_mixed", "original_date_or_ao_mixed"}})
        ambiguous_dates = sorted({record["first_workout_date"] for record in date_records if record["first_workout_semantics"] not in {"explicit_original_first_post", "original_first_post_or_origin_mixed", "original_date_and_ao_mixed", "original_date_or_ao_mixed"}})
        f3_key = key(f3_values[0])
        exact = by_pax.get(f3_key, [])
        evidence, conflicts, enrichments = [], [], {}
        candidates = exact[:]
        roster_real_keys = {key(value) for value in real_values if key(value)}
        if len(exact) == 1:
            member = exact[0]
            current_real = key(member.get("real_name"))
            if current_real and roster_real_keys and current_real not in roster_real_keys:
                classification = "NEEDS_HUMAN_REVIEW"
                conflicts.append({"field": "hospital_name", "current": member.get("real_name"), "doge": real_values, "reason": "Exact F3 name points to a different hospital name."})
            else:
                evidence.append("Unique exact normalized F3-name match")
                if current_real and current_real in roster_real_keys:
                    evidence.append("Hospital name agrees")
                classification = "HIGH_CONFIDENCE_EXISTING"
        elif len(exact) > 1:
            classification = "NEEDS_HUMAN_REVIEW"
            conflicts.append({"field": "identity", "reason": "Multiple canonical members share this normalized F3 name.", "candidate_ids": [m["id"] for m in exact]})
        else:
            real_candidates = {m["id"]: m for real_key in roster_real_keys for m in by_real.get(real_key, [])}
            candidates = list(real_candidates.values())
            if len(candidates) == 1:
                classification = "NEEDS_HUMAN_REVIEW"
                evidence.append("Hospital name exactly matches one canonical member, but F3 name differs")
            elif len(candidates) > 1:
                classification = "NEEDS_HUMAN_REVIEW"
                conflicts.append({"field": "identity", "reason": "Hospital name matches multiple canonical members.", "candidate_ids": [m["id"] for m in candidates]})
            else:
                fuzzy = []
                for member in members:
                    ratio = SequenceMatcher(None, f3_key, key(member.get("pax_name"))).ratio()
                    if len(f3_key) >= 5 and ratio >= 0.88:
                        fuzzy.append(member)
                if fuzzy:
                    candidates = fuzzy[:5]
                    classification = "NEEDS_HUMAN_REVIEW"
                    evidence.append("Only spelling-similar canonical F3-name candidates exist")
                else:
                    classification = "ROSTER_ONLY"
        matched = candidates[0] if len(candidates) == 1 and len(exact) == 1 and classification == "HIGH_CONFIDENCE_EXISTING" else None
        current = make_current(matched, inviter_ids, first_attendance, first_q) if matched else None
        if matched:
            if real_values and not matched.get("real_name"):
                enrichments["hospital_name"] = real_values[0] if len(real_values) == 1 else None
            if home_values and not matched.get("home_ao") and len(home_values) == 1:
                enrichments["home_ao"] = home_values[0]
            candidate_fng = explicit_dates[0] if len(explicit_dates) == 1 else None
            existing_fng = matched.get("first_post_date")
            if len(explicit_dates) > 1:
                conflicts.append({"field": "first_post_date", "current": existing_fng, "doge": explicit_dates, "reason": "DOGE supplies multiple dates represented as original/FNG dates."})
            elif candidate_fng:
                earliest_attendance = first_attendance.get(matched["id"])
                if existing_fng and existing_fng != candidate_fng:
                    conflicts.append({"field": "first_post_date", "current": existing_fng, "doge": candidate_fng, "earliest_attendance": earliest_attendance, "reason": "Canonical and DOGE original dates differ."})
                elif not existing_fng and (not earliest_attendance or candidate_fng <= earliest_attendance):
                    enrichments["first_post_date"] = candidate_fng
            if inviter_values:
                resolved_inviter_ids = set()
                unresolved = []
                for inviter in inviter_values:
                    choices = by_pax.get(key(inviter), [])
                    if len(choices) == 1:
                        resolved_inviter_ids.add(choices[0]["id"])
                    else:
                        unresolved.append({"name": inviter, "candidate_ids": [m["id"] for m in choices]})
                existing = set(inviter_ids.get(matched["id"], []))
                if unresolved:
                    conflicts.append({"field": "inviter", "reason": "One or more Proud Papa names do not resolve uniquely.", "unresolved": unresolved})
                if len(resolved_inviter_ids) == 1 and not existing:
                    enrichments["inviter_member_id"] = next(iter(resolved_inviter_ids))
                elif resolved_inviter_ids and existing and resolved_inviter_ids != existing:
                    conflicts.append({"field": "inviter", "current": sorted(existing), "doge": sorted(resolved_inviter_ids), "reason": "Canonical inviter relationship and DOGE Proud Papa differ."})
                elif len(resolved_inviter_ids) > 1:
                    conflicts.append({"field": "inviter", "doge": sorted(resolved_inviter_ids), "reason": "DOGE records disagree or identify multiple Proud Papas."})
            if conflicts:
                classification = "NEEDS_HUMAN_REVIEW"
            elif not enrichments and not phone_values and not email_values and not vq_values:
                classification = "NO_ACTION"
            elif not enrichments and (phone_values or email_values or vq_values):
                classification = "NO_ACTION"
        doge_values = {
            "f3_names": f3_values, "hospital_names": real_values, "phones": phone_values, "emails": email_values,
            "home_or_original_aos": home_values, "explicit_original_first_post_dates": explicit_dates,
            "ambiguous_or_ao_specific_first_workout_dates": ambiguous_dates, "proud_papas": inviter_values, "vq_dates": vq_values,
        }
        reason = None
        question = None
        if classification == "NEEDS_HUMAN_REVIEW":
            reasons = [item.get("reason") for item in conflicts if item.get("reason")]
            if not reasons and len(candidates) == 1:
                reasons = ["Hospital name matches, but F3 name differs; identity cannot be assumed."]
            reason = " ".join(dict.fromkeys(reasons)) or "Identity evidence is ambiguous or contradictory."
            label = f3_values[0]
            if real_values:
                question = f"{label} — DOGE records show hospital name(s) {', '.join(real_values)}. Please confirm the correct person, F3 name, original FNG date, and Proud Papa where applicable."
            else:
                question = f"{label} — Please confirm whether these roster records refer to one person and provide the hospital name or another non-sensitive identity detail."
        elif classification == "ROSTER_ONLY":
            reason = "No sufficiently reliable canonical West Houston match was found."
        results.append({
            "identity_id": f"DOGE-WH-{sequence:04d}", "classification": classification,
            "source_roster_records": group, "proposed_canonical_member_matches": [make_current(m, inviter_ids, first_attendance, first_q) for m in candidates[:5]],
            "confidence_and_evidence": evidence, "current_the_q_values": current, "doge_values": doge_values,
            "proposed_enrichment_values": {k: v for k, v in enrichments.items() if v is not None}, "conflicts": conflicts,
            "human_review_reason": reason, "suggested_question_for_doge": question,
        })

    # Cross-record F3 collisions are always escalated.
    identities_by_f3 = defaultdict(list)
    for result in results:
        identities_by_f3[key(result["doge_values"]["f3_names"][0])].append(result)
    collision_groups = []
    for f3_key, identities in identities_by_f3.items():
        if len(identities) <= 1:
            continue
        names = sorted({name for item in identities for name in item["doge_values"]["hospital_names"]})
        collision_groups.append({"normalized_f3_name": f3_key, "f3_names": sorted({name for item in identities for name in item["doge_values"]["f3_names"]}), "hospital_names": names, "identity_ids": [item["identity_id"] for item in identities], "reason": "The same normalized F3 name appears in multiple normalized identities."})
        has_unknown_cluster = any(not item["doge_values"]["hospital_names"] for item in identities)
        dates = sorted({value for item in identities for value in item["doge_values"]["explicit_original_first_post_dates"] + item["doge_values"]["ambiguous_or_ao_specific_first_workout_dates"]})
        if len(names) > 1:
            collision_question = f"{identities[0]['doge_values']['f3_names'][0]} — roster records associate this F3 name with {', '.join(names)}. Are these different PAX, aliases, or incorrect records?"
        elif has_unknown_cluster:
            collision_question = f"{identities[0]['doge_values']['f3_names'][0]} — one roster record lacks enough identity detail to link it safely to {names[0] if names else 'the named roster record'}. Does it refer to the same PAX?"
        else:
            collision_question = f"{identities[0]['doge_values']['f3_names'][0]} — duplicate-looking roster records did not consolidate safely. Do they all refer to {names[0] if names else 'one PAX'}?"
        if len(dates) > 1:
            collision_question += f" If so, which date is the original FNG date: {', '.join(dates)}?"
        for item in identities:
            item["classification"] = "NEEDS_HUMAN_REVIEW"
            prior_reason = item.get("human_review_reason")
            collision_reason = "The same normalized F3 name is associated with multiple identity clusters."
            item["human_review_reason"] = f"{collision_reason} {prior_reason}" if prior_reason and prior_reason != collision_reason else collision_reason
            item["suggested_question_for_doge"] = collision_question

    counts = Counter(item["classification"] for item in results)
    enrichment_counts = Counter(field for item in results for field in item["proposed_enrichment_values"])
    conflict_counts = Counter(conflict["field"] for item in results for conflict in item["conflicts"])
    canonical_pax_collisions = [{"normalized_f3_name": pax, "members": [make_current(m, inviter_ids, first_attendance, first_q) for m in group]} for pax, group in by_pax.items() if pax and len(group) > 1]
    potential_aliases = [item for item in results if item["classification"] == "NEEDS_HUMAN_REVIEW" and any("spelling-similar" in evidence for evidence in item["confidence_and_evidence"])]
    duplicate_report = {"doge_f3_identity_collisions": collision_groups, "canonical_same_f3_collisions": canonical_pax_collisions, "likely_alias_or_spelling_variants": [{"identity_id": item["identity_id"], "doge_f3_names": item["doge_values"]["f3_names"], "candidate_members": item["proposed_canonical_member_matches"]} for item in potential_aliases]}
    package = {
        "audit_contract": {"mode": "read_only", "production_mutations": False, "workbook": Path(args.workbook).name, "region_id": snapshot["region_id"], "matching_policy": "Conservative: exact normalized F3 name must be unique and cannot contradict populated hospital-name evidence. Fuzzy or contradictory evidence requires human review."},
        "counts": {"workbook_rows": len(records), "normalized_unique_identities": len(results), **{name.lower(): counts[name] for name in CLASSIFICATIONS}, "suspected_duplicate_collision_groups": len(collision_groups) + len(canonical_pax_collisions)},
        "sheet_normalization": sheet_meta,
        "field_enrichment_counts": dict(sorted(enrichment_counts.items())), "field_conflict_counts": dict(sorted(conflict_counts.items())),
        "identities": results,
    }
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "reconciliation.json").write_text(json.dumps(package, indent=2, sort_keys=True) + "\n")

    summary = ["# DOGE West Houston roster reconciliation", "", "## Executive summary", "", "This package is a read-only audit. It does not apply or recommend automatic identity merges or production updates.", "", f"- Workbook roster rows: {len(records):,}", f"- Normalized unique identities: {len(results):,}"]
    summary += [f"- {name}: {counts[name]:,}" for name in CLASSIFICATIONS]
    summary += [f"- Suspected duplicate/collision groups: {len(collision_groups) + len(canonical_pax_collisions):,}", "", "## Potential enrichments", ""]
    summary += [f"- {field}: {count:,}" for field, count in sorted(enrichment_counts.items())] or ["- None"]
    summary += ["", "## Existing-data conflicts", ""]
    summary += [f"- {field}: {count:,}" for field, count in sorted(conflict_counts.items())] or ["- None"]
    summary += ["", "## Schema observations", "", "- `members` is the canonical human identity table. It stores F3 name (`pax_name`), hospital name (`real_name`), text home AO (`home_ao`), canonical first-post date (`first_post_date`), status, and a legacy scalar inviter reference (`invited_by_id`).", "- `member_inviters` is the authoritative multi-inviter/Proud Papa relationship. Both sides are foreign keys to canonical `members` rows. `invited_by_id` remains a transitional scalar mirror.", "- Region membership/activity is modeled with `region_participants`; authenticated access is separate in `region_access` through user profiles.", "- FNG details also appear in session `fngs` JSON, and attendance history supplies corroborating first-post evidence.", "- Q/VQ history is represented by session Q assignments (`q_ids`/`q_id`); there is no separate member VQ-date field.", "- Member email and phone are not modeled on the canonical `members` row. The workbook's email/phone values are retained as audit evidence only.", "- Home AO is currently text, not an immutable AO foreign key.", "- Durable duplicate resolution exists through `member_merges`. Import staging also supports explicit reviewed identity resolutions; no general member-alias table was found.", "- Emergency contacts, addresses, blood type, birthdays, and similar sensitive fields were intentionally excluded from reconciliation output.", "", "## First-workout interpretation", ""]
    summary += [f"- {row['sheet']}: {row['first_workout_semantics']} ({row['record_count']:,} records)" for row in sheet_meta]
    summary += ["", "## Future Admin/Data Review dashboard", "", "Useful review data would include side-by-side source and canonical values, source-sheet citations, identity candidates and evidence, attendance corroboration, field-level conflicts, inviter resolution, collision groups, reviewer decision and notes, and a clear stale-snapshot indicator. Any future apply action should remain separate from review and require explicit confirmation.", ""]
    (output_dir / "summary.md").write_text("\n".join(summary))

    questions = ["# Questions for DOGE", ""]
    seen_questions = set()
    for item in results:
        if item["classification"] == "NEEDS_HUMAN_REVIEW" and item.get("suggested_question_for_doge"):
            question = item["suggested_question_for_doge"]
            if question not in seen_questions:
                seen_questions.add(question)
                questions.append(f"- {question}")
    (output_dir / "doge_review.md").write_text("\n".join(questions) + "\n")

    coverage = """# DOGE field coverage

| DOGE field | The Q status | Audit treatment | Product value / recommendation |
|---|---|---|---|
| F3 name | Already modeled as `members.pax_name` | Used for conservative candidate matching | Core identity field. |
| Hospital/real name | Already modeled as `members.real_name` | Candidate enrichment or conflict | Useful for identity disambiguation. |
| Home/original AO | Modeled differently as text `members.home_ao` | Candidate only when semantics are clear | Useful profile context, but text storage limits stable AO linkage. Do not redesign in this audit. |
| FNG/first-post date | Already modeled as `members.first_post_date` and supported by session history | Earlier credible original dates may be candidates; AO-specific dates never overwrite them | Useful for history and FNG reporting. |
| Proud Papa/inviter | Already modeled as canonical `member_inviters` relationships; legacy `members.invited_by_id` mirror | Resolve only to one canonical member; ambiguity stays unresolved | Useful relationship/history field. |
| VQ date | Modeled differently through session Q assignments, not a member date field | Compare as historical evidence only | Existing session history already supports leadership chronology; no new field is justified solely by this workbook. |
| Email | Not on canonical member schema | Retained as source evidence; no proposed mutation | Could help account claiming/contact workflows, but needs a defined privacy and ownership model before schema expansion. |
| Phone | Not on canonical member schema | Retained as source evidence; no proposed mutation | Could help identity verification, but storing it needs a defined operational use and privacy controls. |
| Attendance/post counts and last-post fields | Derived from sessions/statistics | Corroboration only | Existing history should remain authoritative. |
| Address, ZIP, birthday, emergency contact, blood type | Intentionally ignored | Excluded from reconciliation output | No demonstrated product need for this audit and materially higher privacy risk. |
| AO roster location/status | Modeled through member home AO, region participation, and attendance | Context/evidence only | Useful for reviewer context, not direct identity proof. |
"""
    (output_dir / "field_coverage.md").write_text(coverage)

    duplicate_lines = ["# Duplicate and identity-collision candidates", "", "No records in this report are approved for merge.", "", "## DOGE F3-name collisions", ""]
    if collision_groups:
        for group in collision_groups:
            duplicate_lines += [f"### {', '.join(group['f3_names'])}", "", f"- Identity records: {', '.join(group['identity_ids'])}", f"- Hospital names: {', '.join(group['hospital_names']) or 'Not supplied'}", f"- Evidence: {group['reason']}", ""]
    else:
        duplicate_lines += ["None found.", ""]
    duplicate_lines += ["## Existing canonical same-F3 collisions", ""]
    if canonical_pax_collisions:
        for group in canonical_pax_collisions:
            duplicate_lines += [f"### {group['normalized_f3_name']}", ""] + [f"- {member['id']}: {member['f3_name']} / {member['hospital_name'] or 'hospital name missing'}" for member in group["members"]] + [""]
    else:
        duplicate_lines += ["None found.", ""]
    duplicate_lines += ["## Likely aliases or spelling variants", ""]
    if potential_aliases:
        for item in potential_aliases:
            candidate_names = [f"{member['f3_name']} ({member['id']})" for member in item["proposed_canonical_member_matches"]]
            duplicate_lines.append(f"- {item['identity_id']}: {', '.join(item['doge_values']['f3_names'])} → {', '.join(candidate_names)}")
    else:
        duplicate_lines.append("None found.")
    (output_dir / "duplicate_candidates.md").write_text("\n".join(duplicate_lines) + "\n")
    print(json.dumps({"output_dir": str(output_dir), "counts": package["counts"], "enrichments": dict(enrichment_counts), "conflicts": dict(conflict_counts)}, indent=2))


if __name__ == "__main__":
    main()
