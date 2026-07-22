import fs from "node:fs";
import { parseOld300Csv } from "../src/services/reconciliation/parseOld300Csv.js";

const csvPath = process.argv[2];

if (!csvPath) {
    console.error("Usage: node scripts/test-old300-parser.mjs <path-to-csv>");
    process.exit(1);
}

const csvText = fs.readFileSync(csvPath, "utf8");

const parsed = parseOld300Csv(csvText);

console.log({
    members: parsed.members.length,
    sessions: parsed.sessions.length,
    warnings: parsed.warnings.length,
});

console.log("\nFirst member:");
console.dir(parsed.members[0], { depth: null });

console.log("\nFirst session:");
console.dir(parsed.sessions[0], { depth: null });