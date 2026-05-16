import fs from "fs/promises";
import path from "node:path";

const SPREADSHEET_ID = "1wlsKrOF_7sfGi_F2emLQKHfRa5L3AaUIme1nRFcytTA";

const OUTPUT_DIR = path.resolve("public");

const SHEETS = [
    { name: "Pax Master", gid: "1285473699", fileName: "Pax_Master.csv" },

    { name: "Forest", gid: "1711164286", fileName: "Forest_Log.csv" },
    { name: "Cave", gid: "1473899367", fileName: "Cave_Log.csv" },
    { name: "Iron", gid: "102791710", fileName: "Iron_Log.csv" },
    { name: "Keep", gid: "401669631", fileName: "Keep_Log.csv" },
    { name: "Rock", gid: "969424886", fileName: "Rock_Log.csv" },
    { name: "Mine", gid: "168818011", fileName: "Mine_Log.csv" },
    { name: "Southie", gid: "2031916410", fileName: "Southie_Log.csv" },
    { name: "Watch", gid: "691595488", fileName: "Watch_Log.csv" },
    { name: "Dads", gid: "719310773", fileName: "Dads_Log.csv" },
    { name: "BlackOps", gid: "917180202", fileName: "BlackOps_Log.csv" },
    { name: "CSAUP", gid: "1074367588", fileName: "CSAUP_Log.csv" },
    { name: "Other", gid: "1404010027", fileName: "Other_Log.csv" },
];

function buildCsvExportUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

async function downloadSheetCsv(sheet) {
    const url = buildCsvExportUrl(sheet.gid);
    const outputPath = path.join(OUTPUT_DIR, sheet.fileName);

    console.log(`Downloading ${sheet.name} → ${sheet.fileName}`);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Failed to download ${sheet.name}. Status: ${response.status} ${response.statusText}`
        );
    }

    const csvText = await response.text();

    if (!csvText.trim()) {
        throw new Error(`${sheet.name} downloaded empty CSV. Aborting.`);
    }

    await fs.writeFile(outputPath, csvText, "utf8");

    console.log(`Saved ${outputPath}`);
}

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    for (const sheet of SHEETS) {
        await downloadSheetCsv(sheet);
    }

    console.log("All CSVs refreshed successfully.");
}

    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
