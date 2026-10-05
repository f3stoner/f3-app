import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deterministicUuid } from "../scripts/importWestHoustonHistorical.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_PATH = path.join(
    ROOT,
    "import/west-houston/output/west_houston_identity_split_canonical_dry_run.json"
);
const canonical = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));

const HISTORICAL = Object.freeze({
    sourceKey: "wh-member-e230e873817939eef660",
    canonicalKey: "wh-canonical-member-d6251f778bbb45c73759",
    memberId: "70fa4a9a-b521-57d0-8fe5-07951f566a6f",
    homeAo: "The Branch",
});
const NEW = Object.freeze({
    sourceKey: "wh-member-ef12a3c2b13b3832c61d",
    canonicalKey: "wh-canonical-member-9e92bd757a8eb4594bc1",
    memberId: "e93a4b68-1bc4-5728-89a5-73628205286a",
    homeAo: "The HOP",
});

function findZillow(identity) {
    return canonical.canonicalMembers.find(value =>
        value.canonicalMemberKey === identity.canonicalKey &&
        value.sourceMemberKeys.length === 1 &&
        value.sourceMemberKeys[0] === identity.sourceKey
    );
}

test("approved Zillow split derives exact deterministic identities without decorating stored names", () => {
    const historical = findZillow(HISTORICAL);
    const newZillow = findZillow(NEW);
    assert.ok(historical);
    assert.ok(newZillow);

    for (const [member, identity] of [[historical, HISTORICAL], [newZillow, NEW]]) {
        assert.equal(member.canonicalF3Name, "Zillow");
        assert.equal(member.canonicalHomeAo, identity.homeAo);
        assert.equal(
            deterministicUuid(`west-houston-one-time:member:${member.canonicalMemberKey}`),
            identity.memberId
        );
    }
    assert.equal(newZillow.canonicalFirstPostDate, "2026-10-02");
});

test("existing duplicate-name formatter qualifies the two Zillow records by home AO", async () => {
    process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
    process.env.SUPABASE_ANON_KEY ||= "offline-test-key";
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
        },
    });
    const [{ state }, { getMemberDisplayName }] = await Promise.all([
        import("../src/modules/state.js"),
        import("../src/utils/memberDisplay.js"),
    ]);
    const priorMembers = state.members;
    const members = [
        { id: HISTORICAL.memberId, paxName: "Zillow", homeAo: HISTORICAL.homeAo },
        { id: NEW.memberId, paxName: "Zillow", homeAo: NEW.homeAo },
    ];
    try {
        state.members = members;
        assert.deepEqual(members.map(getMemberDisplayName), [
            "Zillow - The Branch",
            "Zillow - The HOP",
        ]);
    } finally {
        state.members = priorMembers;
    }
});
