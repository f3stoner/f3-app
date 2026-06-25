import fs from "fs";
import path from "path";
import Papa from "papaparse";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { classifyLibraryItem } from "./classifyLibraryItem.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

const DEFAULT_CSV_PATH = "data/exicon/f3-codex-export.csv";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function slugify(value) {
    return normalizeName(value).replaceAll(" ", "-");
}

function stripHtml(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function buildLibraryRow(record) {
    const name = String(record.Name || "").trim();
    if (!name) return null;

    const descriptionHtml = String(record.Description || "").trim();
    const description = stripHtml(descriptionHtml);
    const normalizedName = normalizeName(name);
    const sourceId = String(record.ID || "").trim() || normalizedName;

    const classification = classifyLibraryItem({
        name,
        description,
        descriptionHtml,
        sourceType: "f3_nation_exicon",
    });

    return {
        item_type: classification.itemType,
        name,
        normalized_name: normalizedName,
        slug: slugify(name),

        description,
        description_html: descriptionHtml,
        aliases: [],

        tags: classification.metadata.tags,
        equipment: classification.metadata.equipment,
        emphasis: classification.metadata.emphasis,
        movement_patterns: classification.metadata.movementPatterns,
        body_parts: classification.metadata.bodyParts,

        source_type: "f3_nation_exicon",
        source_id: sourceId,
        source_meta: {
            nation_id: String(record.ID || "").trim() || null,
            raw_aliases: record.Aliases || null,
            classification_reasons: classification.reasons,
        },

        classification_confidence: classification.confidence,
        review_status: "imported",
        updated_at: new Date().toISOString(),
    };
}

async function upsertInBatches(rows, batchSize = 100) {
    let count = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        const { error } = await supabase
            .from("library_items")
            .upsert(batch, {
                onConflict: "source_type,source_id",
            });

        if (error) {
            throw error;
        }

        count += batch.length;
        console.log(`Upserted ${count}/${rows.length}`);
    }
}

async function main() {
    const csvPath =
        process.argv.find((arg) => !arg.startsWith("--") && arg.endsWith(".csv")) ||
        DEFAULT_CSV_PATH;
    const absolutePath = path.resolve(csvPath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`CSV not found: ${absolutePath}`);
    }

    const csvText = fs.readFileSync(absolutePath, "utf8");

    const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
    });
    
    if (parsed.errors.length) {
        console.warn("CSV parse warnings:");
        console.table(parsed.errors.slice(0, 5));
    }
    
    const rows = parsed.data
        .map(buildLibraryRow)
        .filter(Boolean);

    const summary = rows.reduce(
        (acc, row) => {
            acc.total += 1;
            acc[row.item_type || "unclassified"] =
                (acc[row.item_type || "unclassified"] || 0) + 1;
            acc[row.review_status] = (acc[row.review_status] || 0) + 1;
            return acc;
        },
        { total: 0 }
    );

    console.log("Import summary:", summary);

if (DRY_RUN) {
    console.log("\n*** DRY RUN - Nothing written to Supabase. ***");

    console.log("\nSample rows:");
    console.dir(rows.slice(0, 5), { depth: null });

    const needsReview = rows
        .filter((row) => row.review_status === "needs_review")
        .slice(0, 20)
        .map((row) => ({
            name: row.name,
            item_type: row.item_type,
            confidence: row.classification_confidence,
            reasons: row.source_meta.classification_reasons,
        }));

    console.log("\nNeeds review sample:");
    console.dir(needsReview, { depth: null });

    return;
}

await upsertInBatches(rows);

console.log("Done.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});