#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import json
import unittest
import uuid
from pathlib import Path

from analyzeWestHoustonWorkbook import (
    apply_human_resolutions,
    apply_source_identity_splits,
    source_session_key,
    stable_key,
)


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "import/west-houston/west_houston_human_resolution_manifest.json"
CANONICAL_PATH = ROOT / "import/west-houston/output/west_houston_identity_split_canonical_dry_run.json"
LEGACY_MANIFEST_PATH = ROOT / "import/west-houston/west_houston_human_resolution_manifest_v1.json"
LEGACY_CANONICAL_PATH = ROOT / "import/west-houston/output/west_houston_post_human_canonical_dry_run.json"

HISTORICAL_ZILLOW_SOURCE_KEY = "wh-member-e230e873817939eef660"
HISTORICAL_ZILLOW_CANONICAL_KEY = "wh-canonical-member-d6251f778bbb45c73759"
HISTORICAL_ZILLOW_UUID = "70fa4a9a-b521-57d0-8fe5-07951f566a6f"
NEW_ZILLOW_SOURCE_KEY = "wh-member-ef12a3c2b13b3832c61d"
NEW_ZILLOW_CANONICAL_KEY = "wh-canonical-member-9e92bd757a8eb4594bc1"
NEW_ZILLOW_UUID = "e93a4b68-1bc4-5728-89a5-73628205286a"


def deterministic_uuid(value: str) -> str:
    digest = bytearray(hashlib.sha1(value.encode("utf-8")).digest()[:16])
    digest[6] = (digest[6] & 0x0F) | 0x50
    digest[8] = (digest[8] & 0x3F) | 0x80
    return str(uuid.UUID(bytes=bytes(digest)))


class WestHoustonHumanReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads(MANIFEST_PATH.read_text())
        cls.saved = json.loads(CANONICAL_PATH.read_text())
        cls.normalized = cls.saved["normalizedSource"]
        cls.result = apply_human_resolutions(cls.normalized, cls.manifest)
        cls.legacy_saved = json.loads(LEGACY_CANONICAL_PATH.read_text())
        cls.legacy_manifest = json.loads(LEGACY_MANIFEST_PATH.read_text())

    def test_generated_output_is_current_and_deterministic(self) -> None:
        self.assertEqual(self.result, self.saved)
        second = apply_human_resolutions(self.normalized, self.manifest)
        self.assertEqual(self.result, second)

    def test_identity_decisions_and_member_uniqueness(self) -> None:
        summary = self.result["summary"]
        self.assertEqual(summary["approvedMergeGroups"], 64)
        self.assertEqual(summary["approvedKeepSeparateGroups"], 3)
        self.assertEqual(summary["unresolvedIdentityGroups"], 1)
        self.assertEqual(summary["canonicalMembers"], 1198)
        keys = [item["canonicalMemberKey"] for item in self.result["canonicalMembers"]]
        self.assertEqual(len(keys), len(set(keys)))
        source_keys = [key for item in self.result["canonicalMembers"] for key in item["sourceMemberKeys"]]
        self.assertEqual(len(source_keys), 1265)
        self.assertEqual(len(source_keys), len(set(source_keys)))
        lightning = [item for item in self.result["canonicalMembers"] if "WH-XID-001" in item["humanReviewIds"]]
        self.assertEqual(len(lightning), 1)
        self.assertEqual(lightning[0]["canonicalF3Name"], "lightningrod")
        self.assertEqual(len(lightning[0]["sourceMemberKeys"]), 4)

    def test_primary_session_counts_and_stream_exclusions(self) -> None:
        summary = self.result["summary"]
        self.assertEqual(summary["canonicalPrimarySessions"], 3777)
        self.assertEqual(summary["canonicalAttendance"], 43516)
        self.assertEqual(summary["canonicalQAssignments"], 3671)
        self.assertEqual(summary["canonicalFngEvidence"], 497)
        self.assertEqual(summary["excludedDdSessions"], 887)
        self.assertEqual(summary["excludedDrSessions"], 116)
        self.assertTrue(all(item["canonicalAo"] not in {"DR", "Convergence"} for item in self.result["canonicalSessions"]))
        source_sessions = {item["sessionKey"]: item for item in self.normalized["sessions"]}
        for collection in ("canonicalAttendance", "canonicalQAssignments", "canonicalFngEvidence"):
            for item in self.result[collection]:
                for source_key in item["sourceSessionKeys"]:
                    source = source_sessions[source_key]
                    self.assertEqual(source["stream"], "bd")
                    self.assertNotEqual(source["proposedAo"], "DR")

    def test_workout_decisions(self) -> None:
        by_review_id = {
            review_id: session
            for session in self.result["canonicalSessions"]
            for review_id in session["humanReviewIds"]
        }
        self.assertEqual(by_review_id["WH-WO-001"]["attendanceCount"], 12)
        self.assertEqual(by_review_id["WH-WO-002"]["attendanceCount"], 8)
        convergence = by_review_id["WH-WO-003"]
        self.assertEqual(convergence["canonicalAo"], "The Corridor")
        self.assertEqual(convergence["eventName"], "The Corridor 4-year anniversary")
        self.assertEqual(convergence["sourceLocations"], ["Convergence"])

    def test_fng_first_post_rule_and_no_contradictions(self) -> None:
        self.assertEqual(len(self.result["fngDiscrepancyRepresentations"]), 19)
        for item in self.result["fngDiscrepancyRepresentations"]:
            self.assertEqual(item["decision"], "Unsure")
            self.assertLess(item["canonicalFirstPostDate"], item["laterExplicitFng"]["date"])
            self.assertEqual(item["canonicalFirstPostDate"], item["earliestRecordedAttendance"]["date"])
            self.assertTrue(item["earliestRecordedAttendance"]["provenance"])
            self.assertTrue(item["laterExplicitFng"]["provenance"])
        self.assertEqual(self.result["canonicalContradictions"], [])
        lightningrod = next(
            item for item in self.result["fngDiscrepancyRepresentations"]
            if item["reviewId"] == "WH-FNG-019"
        )
        self.assertEqual(lightningrod["decision"], "Unsure")
        self.assertEqual(lightningrod["canonicalFirstPostDate"], "2025-06-12")
        self.assertEqual(lightningrod["laterExplicitFng"]["date"], "2026-08-25")

    def test_doge_remains_matchable(self) -> None:
        candidates = self.result["existingMemberMatchCandidates"]
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["canonicalF3Name"], "DOGE")
        self.assertEqual(candidates[0]["matchExistingHint"]["strategy"], "match_existing")

    def test_provenance_is_present(self) -> None:
        for collection in ("canonicalMembers", "canonicalSessions", "canonicalAttendance", "canonicalQAssignments", "canonicalFngEvidence"):
            self.assertTrue(all(item["provenance"] for item in self.result[collection]))

    def test_zillow_split_preserves_exact_approved_identities_and_metadata(self) -> None:
        zillows = [item for item in self.result["canonicalMembers"] if item["canonicalF3Name"] == "Zillow"]
        self.assertEqual(len(zillows), 2)
        by_key = {item["canonicalMemberKey"]: item for item in zillows}
        historical = by_key[HISTORICAL_ZILLOW_CANONICAL_KEY]
        new = by_key[NEW_ZILLOW_CANONICAL_KEY]

        self.assertEqual(historical["sourceMemberKeys"], [HISTORICAL_ZILLOW_SOURCE_KEY])
        self.assertEqual(historical["canonicalHomeAo"], "The Branch")
        self.assertEqual(historical["provenance"], ["The Branch!157", "The Branch!78"])
        self.assertEqual(new["sourceMemberKeys"], [NEW_ZILLOW_SOURCE_KEY])
        self.assertEqual(new["canonicalHomeAo"], "The HOP")
        self.assertEqual(new["canonicalFirstPostDate"], "2026-10-02")
        self.assertEqual(new["provenance"], ["The HOP!8895"])
        self.assertEqual({item["canonicalF3Name"] for item in zillows}, {"Zillow"})

        self.assertEqual(
            deterministic_uuid(f"west-houston-one-time:member:{HISTORICAL_ZILLOW_CANONICAL_KEY}"),
            HISTORICAL_ZILLOW_UUID,
        )
        self.assertEqual(
            deterministic_uuid(f"west-houston-one-time:member:{NEW_ZILLOW_CANONICAL_KEY}"),
            NEW_ZILLOW_UUID,
        )

    def test_zillow_attendance_fng_and_history_are_independent(self) -> None:
        attendance = self.result["canonicalAttendance"]
        historical_attendance = [
            item for item in attendance if item["canonicalMemberKey"] == HISTORICAL_ZILLOW_CANONICAL_KEY
        ]
        new_attendance = [item for item in attendance if item["canonicalMemberKey"] == NEW_ZILLOW_CANONICAL_KEY]
        new_fng = [
            item for item in self.result["canonicalFngEvidence"]
            if item["canonicalMemberKey"] == NEW_ZILLOW_CANONICAL_KEY
        ]
        new_q = [
            item for item in self.result["canonicalQAssignments"]
            if item["canonicalMemberKey"] == NEW_ZILLOW_CANONICAL_KEY
        ]
        self.assertEqual(len(historical_attendance), 2)
        self.assertEqual(len(new_attendance), 1)
        self.assertEqual(len(new_fng), 1)
        self.assertEqual(new_q, [])
        self.assertEqual(new_fng[0]["sourceSessionKeys"], ["wh-session-ccd46cdf9fb05b4ab277"])

        legacy_historical = [
            item for item in self.legacy_saved["canonicalAttendance"]
            if item["canonicalMemberKey"] == HISTORICAL_ZILLOW_CANONICAL_KEY
        ]
        without_review_ids = lambda items: [
            {key: value for key, value in item.items() if key != "humanReviewIds"}
            for item in items
        ]
        self.assertEqual(without_review_ids(historical_attendance), without_review_ids(legacy_historical))

    def test_v1_no_split_manifest_is_exactly_backward_compatible(self) -> None:
        rebuilt = apply_human_resolutions(self.legacy_saved["normalizedSource"], self.legacy_manifest)
        self.assertEqual(rebuilt, self.legacy_saved)


class WestHoustonSourceIdentitySplitTest(unittest.TestCase):
    def setUp(self) -> None:
        self.session_key = source_session_key("2026-10-02", "The HOP", "bd", "30/30")
        self.record = {
            "date": "2026-10-02",
            "proposedAo": "The HOP",
            "stream": "bd",
            "workoutType": "30/30",
            "sourceSheet": "The HOP",
            "sourceRow": 8895,
            "nameKey": "zillow",
            "rawName": "Zillow",
        }
        self.decision = {
            "reviewId": "WH-SPLIT-001",
            "resolution": "SPLIT_OCCURRENCES",
            "baseSourceIdentityKey": HISTORICAL_ZILLOW_SOURCE_KEY,
            "approvedCanonicalF3Name": "Zillow",
            "expectedSourceIdentityKey": NEW_ZILLOW_SOURCE_KEY,
            "occurrences": [{
                "anchor": True,
                "sourceSheet": "The HOP",
                "sourceSessionKey": self.session_key,
                "expected": {
                    "date": "2026-10-02",
                    "proposedAo": "The HOP",
                    "stream": "bd",
                    "workoutType": "30/30",
                    "normalizedPaxName": "zillow",
                },
                "reviewedProvenance": {"sheet": "The HOP", "row": 8895},
            }],
        }

    def test_no_split_preserves_v1_exact_name_identity(self) -> None:
        [record] = apply_source_identity_splits([self.record], [])
        self.assertEqual(record["memberKey"], stable_key("member", "zillow"))
        self.assertNotIn("sourceIdentitySplitReviewId", record)

    def test_split_key_ignores_row_number_and_unrelated_record_order(self) -> None:
        unrelated = {**self.record, "sourceSheet": "The Branch", "sourceRow": 1, "nameKey": "bear", "rawName": "Bear"}
        original = apply_source_identity_splits([unrelated, self.record], [self.decision])
        moved = {**self.record, "sourceRow": 42}
        reordered = apply_source_identity_splits([moved, unrelated], [self.decision])
        original_zillow = next(item for item in original if item["nameKey"] == "zillow")
        reordered_zillow = next(item for item in reordered if item["nameKey"] == "zillow")
        self.assertEqual(original_zillow["memberKey"], NEW_ZILLOW_SOURCE_KEY)
        self.assertEqual(reordered_zillow["memberKey"], NEW_ZILLOW_SOURCE_KEY)

    def test_multiple_reviewed_occurrences_join_one_split_identity(self) -> None:
        second = {
            **self.record,
            "date": "2026-10-03",
            "sourceRow": 8901,
        }
        second_session = source_session_key("2026-10-03", "The HOP", "bd", "30/30")
        decision = copy.deepcopy(self.decision)
        decision["occurrences"].append({
            "anchor": False,
            "sourceSheet": "The HOP",
            "sourceSessionKey": second_session,
            "expected": {
                "date": "2026-10-03",
                "proposedAo": "The HOP",
                "stream": "bd",
                "workoutType": "30/30",
                "normalizedPaxName": "zillow",
            },
        })
        records = apply_source_identity_splits([self.record, second], [decision])
        self.assertEqual({item["memberKey"] for item in records}, {NEW_ZILLOW_SOURCE_KEY})

    def test_invalid_missing_ambiguous_duplicate_and_conflicting_selectors_abort(self) -> None:
        malformed = copy.deepcopy(self.decision)
        malformed["occurrences"] = ["not-an-object"]
        missing = copy.deepcopy(self.decision)
        missing["occurrences"][0]["expected"]["date"] = "2026-10-03"
        missing["occurrences"][0]["sourceSessionKey"] = source_session_key(
            "2026-10-03", "The HOP", "bd", "30/30"
        )
        duplicate = copy.deepcopy(self.decision)
        duplicate["occurrences"].append(copy.deepcopy(duplicate["occurrences"][0]))
        duplicate["occurrences"][1]["anchor"] = False

        cases = [
            ([self.record], [malformed]),
            ([self.record], [missing]),
            ([self.record, copy.deepcopy(self.record)], [self.decision]),
            ([self.record], [duplicate]),
        ]
        for records, decisions in cases:
            with self.subTest(decisions=decisions):
                with self.assertRaises(ValueError):
                    apply_source_identity_splits(records, decisions)

        second = {**self.record, "date": "2026-10-03", "sourceRow": 8901}
        third = {**self.record, "date": "2026-10-04", "sourceRow": 8902}
        first_decision = copy.deepcopy(self.decision)
        first_decision["expectedSourceIdentityKey"] = NEW_ZILLOW_SOURCE_KEY
        first_decision["occurrences"].append({
            "anchor": False,
            "sourceSheet": "The HOP",
            "sourceSessionKey": source_session_key("2026-10-03", "The HOP", "bd", "30/30"),
            "expected": {
                "date": "2026-10-03",
                "proposedAo": "The HOP",
                "stream": "bd",
                "workoutType": "30/30",
                "normalizedPaxName": "zillow",
            },
        })
        second_decision = copy.deepcopy(first_decision)
        second_decision["reviewId"] = "WH-SPLIT-002"
        second_decision.pop("expectedSourceIdentityKey")
        second_decision["occurrences"][0] = {
            "anchor": True,
            "sourceSheet": "The HOP",
            "sourceSessionKey": source_session_key("2026-10-04", "The HOP", "bd", "30/30"),
            "expected": {
                "date": "2026-10-04",
                "proposedAo": "The HOP",
                "stream": "bd",
                "workoutType": "30/30",
                "normalizedPaxName": "zillow",
            },
        }
        with self.assertRaisesRegex(ValueError, "conflicting source split selector"):
            apply_source_identity_splits(
                [self.record, second, third],
                [first_decision, second_decision],
            )


if __name__ == "__main__":
    unittest.main()
