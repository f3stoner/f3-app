#!/usr/bin/env python3
"""Read-only, deterministic transformer for West Houston attendance workbooks.

Requires Python 3 and openpyxl. The source workbook is never modified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import openpyxl


PARSER_VERSION = "west-houston-workbook-v1"
DERIVED_SHEETS = {"Posting Table", "FNG", "Combined"}
AO_MAP = {
    "the branch": "The Branch",
    "the point": "The Point",
    "the hop": "The HOP",
    "corridor": "The Corridor",
    "the corridor": "The Corridor",
    "the valley": "The Valley",
    "the tower": "The Tower",
    "valhalla": "Valhalla",
    "the oasis": "The Oasis",
    "the iron gate": "The Iron Gate",
    "the knot": "The Knot",
    "dr": "DR",
    "convergence": "Convergence",
}
SPECIAL_AO_TERMS = re.compile(
    r"\b(dr|converg|launch|annivers|closed|black\s*ops|otb|special|csaup)\b",
    re.IGNORECASE,
)


def text(value: Any) -> str:
    return " ".join(str(value or "").replace("\u00a0", " ").split())


def mechanical_name_key(value: Any) -> str:
    return text(value).casefold()


def loose_name_key(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", text(value).casefold())
    return re.sub(r"[^a-z0-9]+", "", normalized)


def slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "unknown"


def stable_key(prefix: str, *parts: str) -> str:
    material = "|".join([PARSER_VERSION, prefix, *parts])
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:20]
    return f"wh-{prefix}-{digest}"


def iso_date(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)) and 1 <= value <= 100000:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()
    raw = text(value)
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def truthy_marker(value: Any) -> bool:
    if isinstance(value, (int, float)):
        return value != 0
    return text(value).casefold() in {"1", "true", "yes", "x"}


def normalize_bd_type(value: Any) -> str | None:
    raw = text(value)
    key = raw.casefold()
    aliases = {
        "bc": "Bootcamp",
        "bootcamp": "Bootcamp",
        "sb": "SB",
        "ruck": "Ruck",
        "run": "Run",
        "run/ruck": "Run/Ruck",
        "30/30": "30/30",
        "wod": "WOD",
        "dev": "Dev",
    }
    return aliases.get(key, raw or None)


def normalize_ao(value: Any, fallback: str) -> str:
    raw = text(value) or fallback
    return AO_MAP.get(raw.casefold(), raw)


def representative(items: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    return items[:limit]


def analyze(workbook_path: Path) -> dict[str, Any]:
    workbook_bytes = workbook_path.read_bytes()
    workbook_hash = hashlib.sha256(workbook_bytes).hexdigest()
    workbook = openpyxl.load_workbook(workbook_path, data_only=True, read_only=False)
    source_sheets = [name for name in workbook.sheetnames if name not in DERIVED_SHEETS]

    raw_rows_examined = 0
    nonempty_rows = 0
    rejected: list[dict[str, Any]] = []
    input_records: list[dict[str, Any]] = []
    ao_inventory: Counter[tuple[str, str]] = Counter()
    sheet_summaries: list[dict[str, Any]] = []

    for sheet_name in source_sheets:
        sheet = workbook[sheet_name]
        headers = [text(cell.value).casefold() for cell in sheet[1][:15]]

        def column(*names: str) -> int | None:
            for name in names:
                if name.casefold() in headers:
                    return headers.index(name.casefold())
            return None

        date_index = column("Date")
        name_index = column("Name")
        bd_type_index = column("BD Type")
        bd_index = column("BD")
        dd_index = column("DD")
        dd_type_index = column("DD Type")
        location_index = column("Location Comment")
        pax_comment_index = column("Pax Comment", "PAX Comment")
        home_index = column("Home AO or Visitor")
        bd_comment_index = column("BD Comment")
        if date_index is None or name_index is None or bd_index is None or dd_index is None:
            raise ValueError(f"Required source columns are missing from {sheet_name}")
        sheet_nonempty = 0
        sheet_candidates = 0

        for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
            raw_rows_examined += 1
            values = list(row[:15]) + [None] * max(0, 15 - len(row))
            if not any(value not in (None, "") for value in values):
                continue
            nonempty_rows += 1
            sheet_nonempty += 1

            source_date = iso_date(values[date_index])
            raw_name = text(values[name_index])
            provenance = {"sheet": sheet_name, "row": row_number}

            if not source_date or not raw_name:
                rejected.append({
                    **provenance,
                    "reason": "missing_or_invalid_date_or_name",
                    "rawDate": text(values[date_index]),
                    "rawName": raw_name,
                })
                continue
            if mechanical_name_key(raw_name) in {"dd count", "bd count", "name", "pax"}:
                rejected.append({**provenance, "reason": "summary_or_header_row", "rawName": raw_name})
                continue

            is_bd = truthy_marker(values[bd_index])
            is_dd = truthy_marker(values[dd_index])
            if not is_bd and not is_dd:
                rejected.append({
                    **provenance,
                    "reason": "no_attendance_marker",
                    "rawName": raw_name,
                    "date": source_date,
                })
                continue

            sheet_candidates += 1
            raw_location = text(values[location_index]) if location_index is not None else ""
            raw_location = raw_location or sheet_name
            proposed_ao = normalize_ao(raw_location, sheet_name)
            ao_inventory[(raw_location, proposed_ao)] += 1
            pax_comment = text(values[pax_comment_index]) if pax_comment_index is not None else ""
            home_or_visitor = text(values[home_index]) if home_index is not None else ""
            bd_comment = text(values[bd_comment_index]) if bd_comment_index is not None else ""

            base = {
                "sourceSheet": sheet_name,
                "sourceRow": row_number,
                "date": source_date,
                "rawName": raw_name,
                "nameKey": mechanical_name_key(raw_name),
                "rawLocation": raw_location,
                "proposedAo": proposed_ao,
                "paxComment": pax_comment or None,
                "homeAoOrVisitor": home_or_visitor or None,
                "bdComment": bd_comment or None,
            }
            if is_bd:
                input_records.append({
                    **base,
                    "stream": "bd",
                    "workoutType": (
                        normalize_bd_type(values[bd_type_index])
                        if bd_type_index is not None
                        else None
                    ) or "Unspecified BD",
                    "isQ": pax_comment.casefold() in {"q", "vq"},
                    "qEvidence": pax_comment if pax_comment.casefold() in {"q", "vq"} else None,
                    "isFng": pax_comment.casefold() == "fng",
                })
            if is_dd:
                dd_type = normalize_bd_type(values[dd_type_index]) if dd_type_index is not None else None
                dd_type = dd_type or "Unspecified DD"
                input_records.append({
                    **base,
                    "stream": "dd",
                    "workoutType": dd_type,
                    "isQ": False,
                    "qEvidence": None,
                    "isFng": False,
                })

        sheet_summaries.append({
            "sheet": sheet_name,
            "physicalDataRows": max(sheet.max_row - 1, 0),
            "nonemptyRows": sheet_nonempty,
            "acceptedSourceRows": sheet_candidates,
            "dateColumn": date_index + 1,
            "nameColumn": name_index + 1,
        })

    variants_by_name: dict[str, Counter[str]] = defaultdict(Counter)
    member_dates: dict[str, list[str]] = defaultdict(list)
    member_provenance: dict[str, list[dict[str, Any]]] = defaultdict(list)
    explicit_fng_dates: dict[str, list[str]] = defaultdict(list)
    for record in input_records:
        key = record["nameKey"]
        variants_by_name[key][record["rawName"]] += 1
        member_dates[key].append(record["date"])
        member_provenance[key].append({"sheet": record["sourceSheet"], "row": record["sourceRow"]})
        if record["isFng"]:
            explicit_fng_dates[key].append(record["date"])

    members: list[dict[str, Any]] = []
    member_key_by_name: dict[str, str] = {}
    variant_collapses: list[dict[str, Any]] = []
    for name_key in sorted(variants_by_name):
        variants = variants_by_name[name_key]
        canonical_name = sorted(variants, key=lambda item: (-variants[item], item.casefold(), item))[0]
        dates = sorted(member_dates[name_key])
        fng_dates = sorted(set(explicit_fng_dates[name_key]))
        member_key = stable_key("member", name_key)
        member_key_by_name[name_key] = member_key
        member = {
            "memberKey": member_key,
            "proposedF3Name": canonical_name,
            "rawNameVariants": [
                {"value": variant, "occurrences": variants[variant]}
                for variant in sorted(variants, key=lambda item: (item.casefold(), item))
            ],
            "firstKnownAttendanceDate": dates[0],
            "lastKnownAttendanceDate": dates[-1],
            "explicitFngDates": fng_dates,
            "proposedFirstPostDate": fng_dates[0] if fng_dates else None,
            "firstPostSource": "explicit_fng" if fng_dates else None,
            "provenance": sorted(
                {f"{item['sheet']}!{item['row']}" for item in member_provenance[name_key]}
            ),
        }
        members.append(member)
        if len(variants) > 1:
            variant_collapses.append({
                "memberKey": member_key,
                "proposedF3Name": canonical_name,
                "variants": member["rawNameVariants"],
            })

    loose_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for member in members:
        loose_groups[loose_name_key(member["proposedF3Name"])].append(member)
    identity_collisions = [
        {
            "looseKey": key,
            "members": [
                {"memberKey": member["memberKey"], "proposedF3Name": member["proposedF3Name"]}
                for member in sorted(group, key=lambda item: item["proposedF3Name"].casefold())
            ],
            "reason": "punctuation_or_spacing_insensitive_names_collide",
        }
        for key, group in sorted(loose_groups.items())
        if key and len(group) > 1
    ]

    session_groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in input_records:
        group_key = (
            record["date"],
            record["proposedAo"],
            record["stream"],
            record["workoutType"],
        )
        session_groups[group_key].append(record)

    sessions: list[dict[str, Any]] = []
    attendance: list[dict[str, Any]] = []
    q_assignments: list[dict[str, Any]] = []
    fng_events: list[dict[str, Any]] = []
    duplicate_attendance: list[dict[str, Any]] = []
    contradictions: list[dict[str, Any]] = []

    for group_key in sorted(session_groups):
        session_date, proposed_ao, stream, workout_type = group_key
        records = sorted(session_groups[group_key], key=lambda item: (item["sourceSheet"], item["sourceRow"]))
        session_key = stable_key("session", session_date, proposed_ao.casefold(), stream, workout_type.casefold())
        raw_locations = sorted({record["rawLocation"] for record in records})
        comments = sorted({record["bdComment"] for record in records if record["bdComment"]})
        seen_members: dict[str, dict[str, Any]] = {}
        q_members: set[str] = set()
        fng_members: set[str] = set()
        for record in records:
            member_key = member_key_by_name[record["nameKey"]]
            if member_key in seen_members:
                duplicate_attendance.append({
                    "sessionKey": session_key,
                    "memberKey": member_key,
                    "kept": seen_members[member_key],
                    "removed": {"sheet": record["sourceSheet"], "row": record["sourceRow"]},
                })
            source = {"sheet": record["sourceSheet"], "row": record["sourceRow"]}
            if member_key not in seen_members:
                seen_members[member_key] = source
                attendance.append({"sessionKey": session_key, "memberKey": member_key, "provenance": source})
            if record["isQ"] and member_key not in q_members:
                q_members.add(member_key)
                q_assignments.append({
                    "sessionKey": session_key,
                    "memberKey": member_key,
                    "evidence": record["qEvidence"],
                    "provenance": source,
                })
            if record["isFng"] and member_key not in fng_members:
                fng_members.add(member_key)
                fng_events.append({"sessionKey": session_key, "memberKey": member_key, "provenance": source})
        for member_key in sorted(q_members & fng_members):
            contradictions.append({
                "type": "fng_and_q_same_session",
                "sessionKey": session_key,
                "memberKey": member_key,
                "provenance": [
                    {"sheet": record["sourceSheet"], "row": record["sourceRow"]}
                    for record in records
                    if member_key_by_name[record["nameKey"]] == member_key
                    and (record["isQ"] or record["isFng"])
                ],
            })
        sessions.append({
            "sessionKey": session_key,
            "date": session_date,
            "sourceLocations": raw_locations,
            "proposedAo": proposed_ao,
            "stream": stream,
            "bdType": workout_type,
            "bdComments": comments,
            "sourceSheets": sorted({record["sourceSheet"] for record in records}),
            "provenance": [{"sheet": record["sourceSheet"], "row": record["sourceRow"]} for record in records],
        })

    q_by_session = Counter(item["sessionKey"] for item in q_assignments)
    attendance_by_session = Counter(item["sessionKey"] for item in attendance)
    for session in sessions:
        session["attendanceCount"] = attendance_by_session[session["sessionKey"]]
        session["qCount"] = q_by_session[session["sessionKey"]]

    fng_discrepancies = [
        {
            "memberKey": member["memberKey"],
            "proposedF3Name": member["proposedF3Name"],
            "earliestAttendance": member["firstKnownAttendanceDate"],
            "earliestExplicitFng": member["explicitFngDates"][0],
        }
        for member in members
        if member["explicitFngDates"]
        and member["firstKnownAttendanceDate"] != member["explicitFngDates"][0]
    ]

    date_ao_sessions: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for session in sessions:
        date_ao_sessions[(session["date"], session["proposedAo"])].append(session)
    ambiguous_groupings = [
        {
            "date": key[0],
            "proposedAo": key[1],
            "reason": "multiple_workout_streams_or_types_same_date_and_ao",
            "sessions": [
                {"sessionKey": item["sessionKey"], "stream": item["stream"], "bdType": item["bdType"]}
                for item in group
            ],
        }
        for key, group in sorted(date_ao_sessions.items())
        if len(group) > 1
    ]

    unusual_aos = [
        {"rawLocation": raw, "proposedAo": proposed, "attendanceRecords": count}
        for (raw, proposed), count in sorted(ao_inventory.items())
        if proposed not in set(AO_MAP.values()) - {"DR", "Convergence"}
        or proposed in {"DR", "Convergence"}
    ]
    special_comments = []
    for session in sessions:
        matched = [comment for comment in session["bdComments"] if SPECIAL_AO_TERMS.search(comment)]
        if matched:
            special_comments.append({
                "sessionKey": session["sessionKey"],
                "date": session["date"],
                "proposedAo": session["proposedAo"],
                "comments": matched,
            })

    inviter_mentions = []
    seen_inviter_mentions: set[tuple[str, int]] = set()
    for record in input_records:
        marker = (record["sourceSheet"], record["sourceRow"])
        if marker in seen_inviter_mentions:
            continue
        if text(record["paxComment"]).casefold() in {"pp", "bb"} or re.search(
            r"\b(proud\s*papa|papa|pp|bb)\b", record["bdComment"] or "", re.IGNORECASE
        ):
            seen_inviter_mentions.add(marker)
            inviter_mentions.append({
                "sheet": record["sourceSheet"],
                "row": record["sourceRow"],
                "date": record["date"],
                "rawName": record["rawName"],
                "paxComment": record["paxComment"],
                "bdComment": record["bdComment"],
                "finding": "inviter-like notation without a reliable invited-member-to-inviter mapping",
            })

    sessions_by_year_ao = Counter((s["date"][:4], s["proposedAo"], s["stream"]) for s in sessions)
    session_lookup = {session["sessionKey"]: session for session in sessions}
    attendance_by_year_ao = Counter(
        (session_lookup[item["sessionKey"]]["date"][:4], session_lookup[item["sessionKey"]]["proposedAo"], session_lookup[item["sessionKey"]]["stream"])
        for item in attendance
    )

    output = {
        "metadata": {
            "parserVersion": PARSER_VERSION,
            "workbookFilename": workbook_path.name,
            "workbookSha256": workbook_hash,
            "sourceSheets": source_sheets,
            "excludedDerivedSheets": sorted(DERIVED_SHEETS),
            "sessionIdentityRule": "date + proposed AO + stream (BD/DD) + normalized workout type",
        },
        "summary": {
            "physicalRowsExamined": raw_rows_examined,
            "nonemptyRowsExamined": nonempty_rows,
            "legitimateSourceAttendanceRows": len({(r["sourceSheet"], r["sourceRow"]) for r in input_records}),
            "normalizedAttendanceRecords": len(attendance),
            "proposedMembers": len(members),
            "mechanicalVariantGroups": len(variant_collapses),
            "possibleIdentityCollisions": len(identity_collisions),
            "proposedSessions": len(sessions),
            "explicitQAssignments": len(q_assignments),
            "sessionsWithZeroQs": sum(1 for s in sessions if s["qCount"] == 0),
            "sessionsWithOneQ": sum(1 for s in sessions if s["qCount"] == 1),
            "sessionsWithMultipleQs": sum(1 for s in sessions if s["qCount"] > 1),
            "explicitFngEvents": len(fng_events),
            "membersWithExplicitFirstPost": sum(1 for m in members if m["proposedFirstPostDate"]),
            "fngEarliestAttendanceDiscrepancies": len(fng_discrepancies),
            "duplicateAttendanceRemoved": len(duplicate_attendance),
            "ambiguousSessionGroupings": len(ambiguous_groupings),
            "rejectedRows": len(rejected),
            "sourceContradictions": len(contradictions),
        },
        "sheetAnalysis": sheet_summaries,
        "aoInventory": [
            {"rawLocation": raw, "proposedAo": proposed, "sourceRecords": count}
            for (raw, proposed), count in sorted(ao_inventory.items())
        ],
        "members": members,
        "sessions": sessions,
        "attendance": attendance,
        "qAssignments": q_assignments,
        "fngEvidence": fng_events,
        "inviterRelationships": [],
        "review": {
            "mechanicalVariantGroups": variant_collapses,
            "possibleIdentityCollisions": identity_collisions,
            "fngEarliestAttendanceDiscrepancies": fng_discrepancies,
            "duplicateAttendanceRemoved": duplicate_attendance,
            "unusualAoValues": unusual_aos,
            "specialEventComments": special_comments,
            "inviterMentions": inviter_mentions,
            "ambiguousSessionGroupings": ambiguous_groupings,
            "rejectedRows": rejected,
            "sourceContradictions": contradictions,
            "inviterFinding": "No explicit inviter target field exists. PP/BB tags do not identify the inviter and were not converted into relationships.",
        },
        "aggregates": {
            "sessionsByYearAo": [
                {"year": key[0], "ao": key[1], "stream": key[2], "count": count}
                for key, count in sorted(sessions_by_year_ao.items())
            ],
            "attendanceByYearAo": [
                {"year": key[0], "ao": key[1], "stream": key[2], "count": count}
                for key, count in sorted(attendance_by_year_ao.items())
            ],
        },
    }
    return output


def markdown_report(result: dict[str, Any]) -> str:
    metadata = result["metadata"]
    summary = result["summary"]
    review = result["review"]

    def table(rows: list[dict[str, Any]], columns: list[tuple[str, str]]) -> list[str]:
        if not rows:
            return ["None."]
        lines = [
            "| " + " | ".join(label for _, label in columns) + " |",
            "| " + " | ".join("---" for _ in columns) + " |",
        ]
        for row in rows:
            values = []
            for key, _ in columns:
                value = row.get(key, "")
                if isinstance(value, (list, dict)):
                    value = json.dumps(value, ensure_ascii=False, sort_keys=True)
                values.append(str(value).replace("|", "\\|").replace("\n", " "))
            lines.append("| " + " | ".join(values) + " |")
        return lines

    lines = [
        "# West Houston historical workbook dry run",
        "",
        "## Source selection",
        "",
        f"- Workbook: `{metadata['workbookFilename']}`",
        f"- SHA-256: `{metadata['workbookSha256']}`",
        f"- Parser version: `{metadata['parserVersion']}`",
        f"- Canonical source sheets: {', '.join(metadata['sourceSheets'])}",
        f"- Excluded derived sheets: {', '.join(metadata['excludedDerivedSheets'])}",
        "- Reason: the AO sheets hold the imported row-level records. `Combined` unions those sheets, while `Posting Table` and `FNG` are calculated summaries.",
        "- Session identity: date + proposed AO + BD/DD stream + normalized workout type.",
        "",
        "## Reconciliation totals",
        "",
        *table([{"metric": key, "value": value} for key, value in summary.items()], [("metric", "Metric"), ("value", "Value")]),
        "",
        "## Source sheets",
        "",
        *table(result["sheetAnalysis"], [("sheet", "Sheet"), ("physicalDataRows", "Physical rows"), ("nonemptyRows", "Nonempty rows"), ("acceptedSourceRows", "Accepted source rows"), ("dateColumn", "Date column"), ("nameColumn", "Name column")]),
        "",
        "Valhalla is the column-order exception: its header and cached rows place Name in G and Date in H; the other AO sheets place Date in G and Name in H.",
        "",
        "## AO/location inventory",
        "",
        *table(result["aoInventory"], [("rawLocation", "Raw location"), ("proposedAo", "Proposed AO"), ("sourceRecords", "Accepted records")]),
        "",
        "## Sessions by year and AO",
        "",
        *table(result["aggregates"]["sessionsByYearAo"], [("year", "Year"), ("ao", "AO"), ("stream", "Stream"), ("count", "Sessions")]),
        "",
        "## Attendance by year and AO",
        "",
        *table(result["aggregates"]["attendanceByYearAo"], [("year", "Year"), ("ao", "AO"), ("stream", "Stream"), ("count", "Attendance")]),
        "",
        "## Review findings",
        "",
        "### Possible identity collisions",
        "",
        *table(representative(review["possibleIdentityCollisions"]), [("looseKey", "Loose key"), ("members", "Proposed members"), ("reason", "Reason")]),
        "",
        "### Mechanical name-variant collapses",
        "",
        *table(representative(review["mechanicalVariantGroups"]), [("proposedF3Name", "Proposed name"), ("variants", "Variants")]),
        "",
        "### FNG date discrepancies",
        "",
        *table(representative(review["fngEarliestAttendanceDiscrepancies"]), [("proposedF3Name", "Member"), ("earliestAttendance", "Earliest attendance"), ("earliestExplicitFng", "Earliest explicit FNG")]),
        "",
        "### Duplicate attendance removed",
        "",
        *table(representative(review["duplicateAttendanceRemoved"]), [("sessionKey", "Session"), ("memberKey", "Member"), ("kept", "Kept"), ("removed", "Removed")]),
        "",
        "### Unusual AO values",
        "",
        *table(representative(review["unusualAoValues"]), [("rawLocation", "Raw location"), ("proposedAo", "Proposed AO"), ("attendanceRecords", "Records")]),
        "",
        "### Special-event comments",
        "",
        *table(representative(review["specialEventComments"]), [("date", "Date"), ("proposedAo", "AO"), ("comments", "Comments")]),
        "",
        "### Ambiguous session groupings",
        "",
        *table(representative(review["ambiguousSessionGroupings"]), [("date", "Date"), ("proposedAo", "AO"), ("sessions", "Candidate sessions")]),
        "",
        "### Rejected rows",
        "",
        *table(representative(review["rejectedRows"]), [("sheet", "Sheet"), ("row", "Row"), ("reason", "Reason"), ("rawName", "Name"), ("rawDate", "Date")]),
        "",
        "### Source contradictions",
        "",
        *table(representative(review["sourceContradictions"]), [("type", "Type"), ("sessionKey", "Session"), ("memberKey", "Member"), ("provenance", "Source")]),
        "",
        "### Q-assignment examples",
        "",
        *table(representative(result["qAssignments"]), [("sessionKey", "Session"), ("memberKey", "Member"), ("evidence", "Evidence"), ("provenance", "Source")]),
        "",
        "### Multiple-Q session examples",
        "",
        *table(representative([item for item in result["sessions"] if item["qCount"] > 1]), [("date", "Date"), ("proposedAo", "AO"), ("stream", "Stream"), ("bdType", "Type"), ("qCount", "Q count")]),
        "",
        "### Explicit FNG examples",
        "",
        *table(representative(result["fngEvidence"]), [("sessionKey", "Session"), ("memberKey", "Member"), ("provenance", "Source")]),
        "",
        "### Inviter/Proud Papa",
        "",
        review["inviterFinding"],
        "",
        *table(representative(review["inviterMentions"]), [("sheet", "Sheet"), ("row", "Row"), ("date", "Date"), ("rawName", "Name"), ("paxComment", "PAX comment"), ("bdComment", "BD comment"), ("finding", "Finding")]),
        "",
        "## Decisions requiring review",
        "",
        "- Confirm that DD markers represent separate historical workout sessions rather than metadata on the primary BD. They are kept as separate `dd` sessions so same-date activity is not lost.",
        "- Review every punctuation-insensitive identity collision before merging people.",
        "- Review FNG records whose explicit FNG date is later than earliest attendance. The output retains the explicit FNG date and does not rewrite earlier attendance.",
        "- Confirm whether `DR` and `Convergence` should remain distinct AOs, map to event locations, or carry a separate event classification.",
        "- Review launch, anniversary, closure, OTB, Black Ops, and convergence comments before normalizing special events.",
        "- Decide whether `VQ` should remain Q evidence. This parser treats it as explicit Q evidence.",
        "- No inviter relationships are proposed because PP/BB markers do not identify a target inviter.",
        "",
        "## Current region-import framework differences",
        "",
        "- Staged session participants currently support only attendee, Q, and co-Q roles. This output stores FNG evidence separately while also keeping the member in attendance.",
        "- The current session commit RPC writes `sessions.fngs` as an empty array, so it cannot preserve this output's explicit FNG events.",
        "- The framework has no first-class fields for BD/DD stream, workout type, BD comment, raw location variants, or row-level provenance on committed sessions.",
        "- The framework can stage notes, but flattening structured comments and provenance into notes would lose semantics.",
        "- The current identity normalizer does not directly accept this output's complete name-variant and collision-review structure.",
        "- No write mapping has been implemented in this phase.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--json-output", type=Path, required=True)
    parser.add_argument("--report-output", type=Path, required=True)
    args = parser.parse_args()

    result = analyze(args.workbook.resolve())
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.report_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    args.report_output.write_text(markdown_report(result), encoding="utf-8")
    print(json.dumps(result["summary"], indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
