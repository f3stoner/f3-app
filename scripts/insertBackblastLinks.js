import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_PATH = path.join(
    __dirname,
    "../import/output/backblast_session_match_report.json"
);

const SAFE_METHODS = new Set([
    "date_ao_q",
    "nearby_date_ao_q",
    "date_ao_single_session",
    "nearby_date_ao_single_session",
]);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildInsertRows(matches = []) {
    return matches
        .filter(match => SAFE_METHODS.has(match.method))
        .map(match => ({
            session_id: match.session.id,

            band_post_key: match.backblast.postKey,

            link_method: match.method,
            confidence_score: match.confidence || 0,

            backblast_date: match.backblast.date || null,
            backblast_ao_name: match.backblast.aoName || null,
            backblast_q_names: match.backblast.qNames || [],
            author_name: match.backblast.authorName || null,

            raw_content: match.backblast.rawContent || null,
            cleaned_content: match.backblast.cleanedContent || null,

            parsed_backblast: match.backblast,
        }));
}

async function fetchExistingBackblastLinks() {
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
        const { data, error } = await supabase
            .from("session_backblast_links")
            .select("session_id, band_post_key")
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows = rows.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return {
        linkedSessionIds: new Set(rows.map(row => row.session_id)),
        linkedBandPostKeys: new Set(rows.map(row => row.band_post_key)),
    };
}

async function fetchSessionsWithAppBackblasts() {
    const { data, error } = await supabase
        .from("sessions")
        .select("id, backblast_text")
        .not("backblast_text", "is", null);

    if (error) throw error;

    return new Set(
        data
            .filter(row => row.backblast_text && row.backblast_text.trim())
            .map(row => row.id)
    );
}

async function main() {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));

    const matches = [
        ...(report.exactMatches || []),
        ...(report.probableMatches || []),
    ];

    const candidateRows = buildInsertRows(matches);

    const { linkedSessionIds, linkedBandPostKeys } =
        await fetchExistingBackblastLinks();

    const sessionsWithAppBackblasts =
        await fetchSessionsWithAppBackblasts();

    const rows = candidateRows.filter(row => {
        if (linkedSessionIds.has(row.session_id)) return false;
        if (linkedBandPostKeys.has(row.band_post_key)) return false;
        if (sessionsWithAppBackblasts.has(row.session_id)) return false;

        return true;
    });

    console.log(`Safe candidate rows: ${candidateRows.length}`);
    console.log(`Prepared new gap-fill rows: ${rows.length}`);

    if (process.argv.includes("--dry-run")) {
        console.log("Dry run only. First 25 rows:");

        console.table(rows.slice(0, 25).map(row => ({
            date: row.backblast_date,
            ao: row.backblast_ao_name,
            q: row.backblast_q_names?.join(", "),
            method: row.link_method,
            session_id: row.session_id,
            band_post_key: row.band_post_key,
        })));

        return;
    }

    const chunkSize = 500;

    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);

        const { error } = await supabase
            .from("session_backblast_links")
            .upsert(chunk, {
                onConflict: "band_post_key",
            });

        if (error) {
            console.error("Insert failed:", error);
            process.exit(1);
        }

        console.log(
            `Inserted ${Math.min(i + chunk.length, rows.length)} / ${rows.length}`
        );
    }

    console.log("Done");
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});