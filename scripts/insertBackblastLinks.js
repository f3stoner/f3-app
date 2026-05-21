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

async function main() {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));

    const matches = [
        ...(report.exactMatches || []),
        ...(report.probableMatches || []),
    ];

    const rows = buildInsertRows(matches);

    console.log(`Prepared ${rows.length} rows`);

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