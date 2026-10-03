// scripts/materializeWestHoustonQSlotsOnce.js

const WEST_HOUSTON_REGION_ID =
    "7298b632-4d9a-542f-b65d-d416e5c1e631";

const EXPECTED_REGION_NAME = "F3 West Houston";
const DAYS_AHEAD = 365;
const CONFIRMATION = "F3-WEST-HOUSTON-GENERATE-365";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const confirmed = args.has(`--confirm=${CONFIRMATION}`);

function fail(message) {
    console.error(`\nABORTED: ${message}\n`);
    process.exit(1);
}

function countByAo(slots, aos) {
    const aoNames = new Map(
        aos.map(ao => [ao.id, ao.name])
    );

    const counts = new Map();

    for (const slot of slots) {
        const name =
            aoNames.get(slot.aoId) ||
            slot.aoId ||
            "Unknown AO";

        counts.set(
            name,
            (counts.get(name) || 0) + 1
        );
    }

    return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b));
}

function slotKey(slot) {
    return `${slot.aoId}__${slot.date}`;
}

function snapshotSlot(slot) {
    return JSON.stringify({
        id: slot.id,
        aoId: slot.aoId,
        date: slot.date,
        siteId: slot.siteId ?? null,
        startTime: slot.startTime ?? null,
        durationMinutes: slot.durationMinutes ?? null,
        qUserId: slot.qUserId ?? null,
        overrideTime: slot.overrideTime ?? null,
        overrideEmphasis: slot.overrideEmphasis ?? null,
        overrideTitle: slot.overrideTitle ?? null,
        customEmphasisLabel:
            slot.customEmphasisLabel ?? null,
    });
}

// Some application modules may expect localStorage to exist.
// Give the one-time Node runner a harmless in-memory implementation.
if (!globalThis.localStorage) {
    const store = new Map();

    globalThis.localStorage = {
        getItem(key) {
            return store.has(key)
                ? store.get(key)
                : null;
        },

        setItem(key, value) {
            store.set(key, String(value));
        },

        removeItem(key) {
            store.delete(key);
        },

        clear() {
            store.clear();
        },
    };
}

if (!process.env.SUPABASE_URL) {
    fail("SUPABASE_URL is not set.");
}

if (!process.env.SUPABASE_ANON_KEY) {
    fail("SUPABASE_ANON_KEY is not set.");
}

if (!process.env.WH_QSLOT_OPERATOR_EMAIL) {
    fail("WH_QSLOT_OPERATOR_EMAIL is not set.");
}

if (!process.env.WH_QSLOT_OPERATOR_PASSWORD) {
    fail("WH_QSLOT_OPERATOR_PASSWORD is not set.");
}

// Import only after environment + Node shims are ready.
const { supabase } = await import(
    "../src/services/supabaseClient.js"
);

const {
    loadRegionData,
} = await import(
    "../src/services/cloudData.js"
);

const {
    buildMissingQSlots,
    generateQSlotsForCurrentRegion,
} = await import(
    "../src/services/qSlotGeneration.js"
);

const {
    state,
} = await import(
    "../src/modules/state.js"
);

console.log("\nWest Houston Q-slot materializer");
console.log("--------------------------------");

//
// Authenticate as a normal application user.
//
const {
    data: authData,
    error: authError,
} = await supabase.auth.signInWithPassword({
    email: process.env.WH_QSLOT_OPERATOR_EMAIL,
    password: process.env.WH_QSLOT_OPERATOR_PASSWORD,
});

if (authError) {
    fail(`Authentication failed: ${authError.message}`);
}

if (!authData?.user?.id) {
    fail("Authentication returned no user.");
}

console.log(
    `Authenticated: ${authData.user.email || authData.user.id}`
);

//
// Load FRESH production state through existing application code.
//
console.log("\nLoading West Houston production data...");

const regionData =
    await loadRegionData(WEST_HOUSTON_REGION_ID);

if (
    regionData.regionName !==
    EXPECTED_REGION_NAME
) {
    fail(
        `Expected "${EXPECTED_REGION_NAME}" but loaded "${regionData.regionName}".`
    );
}

const aos = regionData.aos || [];
const existingSlots = regionData.qSlots || [];

if (aos.length !== 10) {
    fail(
        `Expected 10 West Houston AOs; loaded ${aos.length}.`
    );
}

const activeAos =
    aos.filter(ao => ao.isActive);

if (activeAos.length !== 10) {
    fail(
        `Expected 10 active West Houston AOs; found ${activeAos.length}.`
    );
}

//
// The six Oct. 3 seed slots are an important safety fingerprint.
//
if (existingSlots.length !== 6) {
    fail(
        `Expected exactly 6 existing West Houston Q slots before materialization; found ${existingSlots.length}.`
    );
}

if (
    existingSlots.some(
        slot => slot.date !== "2026-10-03"
    )
) {
    fail(
        "Existing West Houston slots do not match the expected 2026-10-03 seed state."
    );
}

const existingKeys =
    existingSlots.map(slotKey);

if (
    new Set(existingKeys).size !==
    existingKeys.length
) {
    fail(
        "Duplicate AO/date keys already exist in West Houston."
    );
}

//
// Preserve exact snapshots of the six existing records.
//
const originalSnapshots = new Map(
    existingSlots.map(slot => [
        slot.id,
        snapshotSlot(slot),
    ])
);

//
// Populate precisely the state consumed by the existing generator.
//
state.currentRegionId =
    WEST_HOUSTON_REGION_ID;

state.aos = aos;
state.qSlots = [...existingSlots];

//
// PREVIEW — NO WRITES
//
const proposed =
    buildMissingQSlots(
        state.aos,
        state.qSlots,
        DAYS_AHEAD
    );

if (proposed.length === 0) {
    fail(
        "Generator proposed zero new slots. Nothing will be written."
    );
}

const proposedKeys =
    proposed.map(slotKey);

if (
    new Set(proposedKeys).size !==
    proposedKeys.length
) {
    fail(
        "Generator produced duplicate AO/date keys."
    );
}

const existingKeySet =
    new Set(existingKeys);

const collisions =
    proposedKeys.filter(
        key => existingKeySet.has(key)
    );

if (collisions.length > 0) {
    fail(
        `Preview collides with ${collisions.length} existing slot(s).`
    );
}

const proposedDates =
    proposed
        .map(slot => slot.date)
        .sort();

console.log("\nPREVIEW");
console.log("--------------------------------");
console.log(`Region: ${regionData.regionName}`);
console.log(`Region ID: ${WEST_HOUSTON_REGION_ID}`);
console.log(`Active AOs: ${activeAos.length}`);
console.log(`Existing slots: ${existingSlots.length}`);
console.log(`Proposed new slots: ${proposed.length}`);
console.log(
    `Expected final total: ${
        existingSlots.length +
        proposed.length
    }`
);
console.log(
    `First proposed date: ${proposedDates[0]}`
);
console.log(
    `Last proposed date: ${
        proposedDates[
            proposedDates.length - 1
        ]
    }`
);

console.log("\nProposed slots by AO:");

for (
    const [aoName, count]
    of countByAo(proposed, aos)
) {
    console.log(
        `  ${aoName}: ${count}`
    );
}

const assignedExisting =
    existingSlots.filter(
        slot => slot.qUserId
    );

console.log(
    `\nExisting assigned Qs: ${assignedExisting.length}`
);

for (const slot of assignedExisting) {
    const ao =
        aos.find(
            item => item.id === slot.aoId
        );

    console.log(
        `  ${slot.date} — ${ao?.name || slot.aoId} — ${slot.qUserId}`
    );
}

//
// Default behavior ends here.
//
if (!apply) {
    console.log(
        "\nREAD-ONLY PREVIEW COMPLETE."
    );

    console.log(
        "\nNo database writes were performed."
    );

    console.log(
        "\nIf this preview is correct, the apply command is:"
    );

    console.log(
        `node scripts/materializeWestHoustonQSlotsOnce.js --apply --confirm=${CONFIRMATION}`
    );

    await supabase.auth.signOut();
    process.exit(0);
}

//
// Apply requires BOTH switches.
//
if (!confirmed) {
    fail(
        `--apply requires --confirm=${CONFIRMATION}`
    );
}

console.log(
    "\n*** APPLY MODE ***"
);
console.log(
    `Creating ${proposed.length} West Houston Q slots using the existing application generator...`
);

//
// IMPORTANT:
// We intentionally use the production generator rather than
// duplicating its insert behavior here.
//
const result =
    await generateQSlotsForCurrentRegion(
        DAYS_AHEAD
    );

if (
    result.createdCount !==
    proposed.length
) {
    fail(
        `Generator reported ${result.createdCount} created slots; preview expected ${proposed.length}.`
    );
}

//
// Reload from production and verify.
//
console.log(
    "\nReloading production data for verification..."
);

const refreshed =
    await loadRegionData(
        WEST_HOUSTON_REGION_ID
    );

const finalSlots =
    refreshed.qSlots || [];

const expectedFinalCount =
    existingSlots.length +
    proposed.length;

if (
    finalSlots.length !==
    expectedFinalCount
) {
    fail(
        `Expected ${expectedFinalCount} total slots after generation; found ${finalSlots.length}.`
    );
}

//
// Verify every original slot survived unchanged.
//
for (
    const [id, originalSnapshot]
    of originalSnapshots
) {
    const current =
        finalSlots.find(
            slot => slot.id === id
        );

    if (!current) {
        fail(
            `Original Q slot ${id} is missing after generation.`
        );
    }

    if (
        snapshotSlot(current) !==
        originalSnapshot
    ) {
        fail(
            `Original Q slot ${id} changed during generation.`
        );
    }
}

//
// Verify no AO/date duplicates.
//
const finalKeys =
    finalSlots.map(slotKey);

if (
    new Set(finalKeys).size !==
    finalKeys.length
) {
    fail(
        "Duplicate AO/date slots exist after generation."
    );
}

//
// Verify generator now sees nothing missing.
//
state.currentRegionId =
    WEST_HOUSTON_REGION_ID;

state.aos =
    refreshed.aos || [];

state.qSlots =
    finalSlots;

const remainingMissing =
    buildMissingQSlots(
        state.aos,
        state.qSlots,
        DAYS_AHEAD
    );

if (remainingMissing.length !== 0) {
    fail(
        `${remainingMissing.length} slots are still missing inside the 365-day horizon.`
    );
}

console.log(
    "\nWest Houston q-slot materialization succeeded"
);
console.log(
    `Existing slots preserved: ${existingSlots.length}/${existingSlots.length}`
);
console.log(
    "Existing Q assignments changed: 0"
);
console.log(
    `Created: ${result.createdCount}`
);
console.log(
    `Final total: ${finalSlots.length}`
);
console.log(
    "Remaining missing slots in 365-day horizon: 0"
);

await supabase.auth.signOut();