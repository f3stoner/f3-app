#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest
from pathlib import Path

from analyzeWestHoustonWorkbook import apply_human_resolutions


ROOT = Path(__file__).resolve().parents[1]
NORMALIZED_PATH = ROOT / "import/west-houston/output/west_houston_historical_dry_run.json"
MANIFEST_PATH = ROOT / "import/west-houston/west_houston_human_resolution_manifest.json"
CANONICAL_PATH = ROOT / "import/west-houston/output/west_houston_post_human_canonical_dry_run.json"


class WestHoustonHumanReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.normalized = json.loads(NORMALIZED_PATH.read_text())
        cls.manifest = json.loads(MANIFEST_PATH.read_text())
        cls.result = apply_human_resolutions(cls.normalized, cls.manifest)

    def test_generated_output_is_current_and_deterministic(self) -> None:
        saved = json.loads(CANONICAL_PATH.read_text())
        self.assertEqual(self.result, saved)
        second = apply_human_resolutions(self.normalized, self.manifest)
        self.assertEqual(self.result, second)

    def test_identity_decisions_and_member_uniqueness(self) -> None:
        summary = self.result["summary"]
        self.assertEqual(summary["approvedMergeGroups"], 64)
        self.assertEqual(summary["approvedKeepSeparateGroups"], 2)
        self.assertEqual(summary["unresolvedIdentityGroups"], 1)
        self.assertEqual(summary["canonicalMembers"], 1194)
        keys = [item["canonicalMemberKey"] for item in self.result["canonicalMembers"]]
        self.assertEqual(len(keys), len(set(keys)))
        names = [item["canonicalF3Name"].casefold() for item in self.result["canonicalMembers"]]
        self.assertEqual(len(names), len(set(names)))
        source_keys = [key for item in self.result["canonicalMembers"] for key in item["sourceMemberKeys"]]
        self.assertEqual(len(source_keys), 1261)
        self.assertEqual(len(source_keys), len(set(source_keys)))
        lightning = [item for item in self.result["canonicalMembers"] if "WH-XID-001" in item["humanReviewIds"]]
        self.assertEqual(len(lightning), 1)
        self.assertEqual(lightning[0]["canonicalF3Name"], "lightningrod")
        self.assertEqual(len(lightning[0]["sourceMemberKeys"]), 4)

    def test_primary_session_counts_and_stream_exclusions(self) -> None:
        summary = self.result["summary"]
        self.assertEqual(summary["canonicalPrimarySessions"], 3742)
        self.assertEqual(summary["canonicalAttendance"], 43132)
        self.assertEqual(summary["canonicalQAssignments"], 3636)
        self.assertEqual(summary["canonicalFngEvidence"], 494)
        self.assertEqual(summary["excludedDdSessions"], 874)
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


if __name__ == "__main__":
    unittest.main()
