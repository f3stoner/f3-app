import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const REGION_ID = "7298b632-4d9a-542f-b65d-d416e5c1e631";

async function selectAll(makeQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function selectInBatches(table, columns, filterColumn, values, orderColumn, batchSize = 100) {
  const rows = [];
  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    rows.push(...await selectAll(() => client.from(table).select(columns).in(filterColumn, batch).order(orderColumn)));
  }
  return rows;
}

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Output path is required");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const members = await selectAll(() => client.from("members").select("*").eq("region_id", REGION_ID).order("id"));
const memberIds = members.map((row) => row.id);
const sessions = await selectAll(() => client.from("sessions")
  .select("id,date,ao_id,ao_name,attendee_ids,q_id,q_ids,fngs,unresolved_pax")
  .eq("region_id", REGION_ID).order("date"));
const inviters = memberIds.length
  ? await selectInBatches("member_inviters", "*", "member_id", memberIds, "member_id")
  : [];
const participants = await selectAll(() => client.from("region_participants").select("*").eq("region_id", REGION_ID).order("member_id"));
const mergeColumns = "id,canonical_member_id,duplicate_member_id,status,decision_metadata,notes,created_at,completed_at";
const mergeRows = memberIds.length
  ? await selectInBatches("member_merges", mergeColumns, "canonical_member_id", memberIds, "created_at")
  : [];
const duplicateMergeRows = memberIds.length
  ? await selectInBatches("member_merges", mergeColumns, "duplicate_member_id", memberIds, "created_at")
  : [];

const snapshot = {
  generated_at: new Date().toISOString(),
  region_id: REGION_ID,
  members,
  sessions,
  member_inviters: inviters,
  region_participants: participants,
  member_merges: [...new Map([...mergeRows, ...duplicateMergeRows].map((row) => [row.id, row])).values()],
};
await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  outputPath,
  counts: {
    members: members.length,
    sessions: sessions.length,
    memberInviters: inviters.length,
    regionParticipants: participants.length,
    memberMerges: snapshot.member_merges.length,
  },
  memberColumns: Object.keys(members[0] || {}).sort(),
}));
