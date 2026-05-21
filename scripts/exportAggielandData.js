import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, "../import");

const SUPABASE_URL = process.env.PROJECT_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.PROJECT_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const AGGIELAND_REGION_ID = process.env.AGGIELAND_REGION_ID;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !AGGIELAND_REGION_ID) {
    throw new Error("Missing Supabase env vars or AGGIELAND_REGION_ID");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

async function fetchAll(tableName, select = "*") {
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
        const { data, error } = await supabase
            .from(tableName)
            .select(select)
            .eq("region_id", AGGIELAND_REGION_ID)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows = rows.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return rows;
}

async function main() {
    ensureOutputDir();

    const sessions = await fetchAll("sessions");
    const members = await fetchAll("members");

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "aggieland_sessions.json"),
        JSON.stringify(sessions, null, 2)
    );

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "aggieland_members.json"),
        JSON.stringify(members, null, 2)
    );

    console.log(`Exported ${sessions.length} sessions`);
    console.log(`Exported ${members.length} members`);
}

main();