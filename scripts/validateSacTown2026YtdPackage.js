import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(ROOT, "import/sactown/package");
const manifestPath = path.join(ROOT, "import/sactown/output/sactown_2026_ytd_dry_run_manifest_region_local_v2.json");
const datasetPath = path.join(packageDir, "final_dataset.json");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const assert = (value, message) => { if (!value) throw new Error(message); };
const canonical = value => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
        : value;

const manifestText = await fs.readFile(manifestPath, "utf8");
const datasetText = await fs.readFile(datasetPath, "utf8");
const dataset = JSON.parse(datasetText);
const apply = await fs.readFile(path.join(packageDir, "apply.sql"), "utf8");
const recovery = await fs.readFile(path.join(packageDir, "RECOVERY.md"), "utf8");
const c = dataset.contract.expected;
const liveMode = process.argv.includes("--live");

assert(dataset.contract.sourceManifestSha256 === sha(manifestText), "Approved manifest SHA mismatch");
assert(dataset.contract.regionId === "45a32e90-3f95-5261-bb49-5719f6f77cca", "Region mismatch");
assert(dataset.members.length === 252, "Identity count mismatch");
assert(dataset.members.filter(x => x.action === "create").length === c.createdMembers, "Created-member count mismatch");
assert(dataset.members.filter(x => x.action === "reuse_seed").length === c.reusedMembers, "Reused-member count mismatch");
assert(new Set(dataset.members.map(x => x.memberId)).size === 252, "Member IDs are not unique");
assert(dataset.sessions.length === c.sessions, "Session count mismatch");
assert(new Set(dataset.sessions.map(x => x.sessionId)).size === c.sessions, "Session IDs are not unique");
assert(new Set(dataset.sessions.map(x => `${x.date}|${x.aoId}|${x.startTime}`)).size === c.sessions, "Dataset contains an AO/date/time collision");
assert(dataset.sessions.every(x => new Set(x.attendeeIds).size === x.attendeeIds.length), "A session contains duplicate attendance");
assert(dataset.sessions.every(x => new Set(x.qIds).size === x.qIds.length), "A session contains duplicate Q relationships");
assert(dataset.sessions.reduce((n,x) => n+x.attendeeIds.length,0) === c.attendance, "Attendance mismatch");
assert(dataset.sessions.reduce((n,x) => n+x.qIds.length,0) === c.qRelationships, "Q mismatch");
assert(dataset.sessions.reduce((n,x) => n+x.fngs.length,0) === c.fngs, "FNG mismatch");
assert(dataset.sessions.every(x => x.date >= "2026-01-01" && x.date <= "2026-08-30"), "Session outside window");
assert(dataset.sessions.every(x => x.qIds.every(id => x.attendeeIds.includes(id))), "Q missing from attendance");
assert(dataset.sessions.every(x => x.fngs.every(f => x.attendeeIds.includes(f.memberId))), "FNG missing from attendance");
assert(dataset.baseline.protectedSessions.length === 40, "Protected baseline must contain 40 sessions");
assert(dataset.mergeCandidates.length === c.mergeCandidates, "Merge-candidate count mismatch");
assert(dataset.excludedSpecialEvents.length === c.excludedSpecialEvents, "Excluded-event count mismatch");
assert(dataset.rumble.name === "Rumble" && dataset.rumble.effectiveEndDate === "2026-07-04", "Rumble contract mismatch");
for (const marker of ["begin;", "commit;", "pg_advisory_xact_lock", "lifecycle_status='onboarding'", "snapshot_before", "outside the approved 252 SacTown-local identities", "already has cross-region activity", "Post-import identity isolation failed", "Inserted-ID ledger reconciliation failed"]) assert(apply.includes(marker), `apply.sql missing ${marker}`);
assert(!apply.includes("st_other_production_snapshot"), "Obsolete unrelated-production snapshot remains in apply.sql");
for (const marker of ["no generic automated rollback", "point-in-time recovery", "inserted-ID ledger"]) assert(recovery.includes(marker), `RECOVERY.md missing ${marker}`);

const result = {
    status: "valid",
    mode: liveMode ? "live_read_only" : "offline_read_only",
    sourceManifestSha256: dataset.contract.sourceManifestSha256,
    datasetFileSha256: sha(datasetText),
    totals: c,
    protectedExistingSessions: dataset.baseline.protectedSessions.length,
    expectedBefore: {members:71,sessions:40,attendance:286,qRelationships:40,fngs:7,aos:18,sites:12,schedules:18},
    expectedAfter: {members:259,sessions:580,attendance:4722,qRelationships:604,fngs:141,aos:19,sites:12,schedules:19},
};

if (liveMode) {
    dotenv.config({ path: path.join(ROOT, ".env") });
    assert(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY, "Missing read-only validation connection configuration");
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
    const query = async (table, select, configure=x=>x) => {
        const {data,error}=await configure(client.from(table).select(select));
        if(error) throw new Error(`${table}: ${error.message}`);
        return data||[];
    };
    const region=(await query("regions","*",x=>x.eq("id",dataset.contract.regionId)))[0];
    const sessions=await query("sessions","*",x=>x.eq("region_id",dataset.contract.regionId).order("id"));
    const count=async table => {
        const {count:value,error}=await client.from(table).select("*",{count:"exact",head:true}).eq("region_id",dataset.contract.regionId);
        if(error) throw new Error(`${table}: ${error.message}`);
        return value||0;
    };
    assert(region.environment==="production" && region.lifecycle_status==="onboarding" && region.include_in_reporting===false && region.activated_at===null, "Live lifecycle/environment contract mismatch");
    const protectedActual=sessions.filter(x=>dataset.baseline.protectedSessions.some(e=>e.id===x.id)).map(canonical).sort((a,b)=>a.id.localeCompare(b.id));
    assert(JSON.stringify(protectedActual)===JSON.stringify(dataset.baseline.protectedSessions), "A protected live session differs from the package baseline");
    const liveCounts={members:await count("members"),sessions:sessions.length,aos:await count("aos"),sites:await count("sites"),schedules:await count("ao_recurring_schedules")};
    const applied=sessions.some(x=>dataset.sessions.some(e=>e.sessionId===x.id));
    const expected=applied?result.expectedAfter:result.expectedBefore;
    assert(liveCounts.members===expected.members && liveCounts.sessions===expected.sessions && liveCounts.aos===expected.aos && liveCounts.sites===expected.sites && liveCounts.schedules===expected.schedules,"Live record counts are neither the approved baseline nor complete applied state");
    const relationships={attendance:sessions.reduce((n,x)=>n+(x.attendee_ids||[]).length,0),qRelationships:sessions.reduce((n,x)=>n+(x.q_ids||[]).length,0),fngs:sessions.reduce((n,x)=>n+(x.fngs||[]).length,0)};
    assert(relationships.attendance===expected.attendance && relationships.qRelationships===expected.qRelationships && relationships.fngs===expected.fngs,"Live relationship totals mismatch");
    result.live={state:applied?"applied":"baseline",counts:liveCounts,relationships,protectedSessionsVerified:40};
}

console.log(JSON.stringify(result, null, 2));
