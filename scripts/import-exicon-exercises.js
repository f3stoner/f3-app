import fs from "fs";
import path from "path";
import Papa from "papaparse";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXICON_DIR = path.join(process.cwd(), "data", "exicon");

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function categoryFromFileName(fileName) {
  return fileName
    .replace(/^F3 exercises - /i, "")
    .replace(/\.csv$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function upsertExercise(name, description) {
  const normalizedName = normalizeName(name);

  const { data, error } = await supabase
    .from("exercises")
    .upsert(
      {
        name: name.trim(),
        normalized_name: normalizedName,
        description: description?.trim() || null,
        source: "f3_exicon",
      },
      { onConflict: "normalized_name" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function addCategory(exerciseId, category, sourceTab) {
  const { error } = await supabase
    .from("exercise_categories")
    .upsert(
      {
        exercise_id: exerciseId,
        category,
        source_tab: sourceTab,
      },
      { onConflict: "exercise_id,category" }
    );

  if (error) throw error;
}

function getCell(row, possibleKeys) {
    for (const key of possibleKeys) {
      if (row[key]?.trim()) return row[key].trim();
    }
  
    const actualKey = Object.keys(row).find((rowKey) =>
      possibleKeys.some(
        (possibleKey) =>
          rowKey.trim().toLowerCase() === possibleKey.toLowerCase()
      )
    );
  
    return actualKey ? row[actualKey]?.trim() : "";
  }

async function importFile(fileName) {
  const filePath = path.join(EXICON_DIR, fileName);
  const csv = fs.readFileSync(filePath, "utf8");

  const category = categoryFromFileName(fileName);
  const sourceTab = fileName.replace(/\.csv$/i, "");

  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    beforeFirstChunk: (chunk) => {
      const lines = chunk.split("\n");
  
      const headerIndex = lines.findIndex((line) =>
        line.toLowerCase().includes("name")
      );
  
      if (headerIndex === -1) {
        return chunk;
      }
  
      return lines.slice(headerIndex).join("\n");
    },
  });

  console.log(fileName, parsed.meta.fields);

  let count = 0;

  for (const row of parsed.data) {
    const name = getCell(row, ["Name", "Exercise", "Exercise Name"]);
    const description = getCell(row, ["Description", "Instructions", "Notes"]);
  
    if (!name) continue;
  
    const exerciseId = await upsertExercise(name, description);
    await addCategory(exerciseId, category, sourceTab);
  
    count++;
  }
  console.log(`${fileName}: imported ${count}`);
}

async function main() {
  const files = fs
    .readdirSync(EXICON_DIR)
    .filter((file) => file.endsWith(".csv"))
    .filter((file) => !file.toLowerCase().includes("all exercises"));

  for (const file of files) {
    await importFile(file);
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});