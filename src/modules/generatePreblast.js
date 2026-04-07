import { formatDate } from "../utils/date.js";

export function generatePreblast(workout, aos = []) {
    const ao = aos.find(a => a.name === workout.aoName);

    const formattedDate = workout.date ? formatDate(workout.date) : "TBD";
    const aoName = workout.aoName || "AO";
    const aoTime = ao?.time || "";
    const locationName = ao?.locationName || "";
    const title = workout.title?.trim() || "F3 Workout";

    const lines = [];

    lines.push(`#Preblast #${normalizeTag(aoName)}`);

    lines.push("");

    lines.push(`What: ${title}`);
    lines.push("");
    lines.push(`Where: ${buildWhereLine(aoName, locationName)}`);
    lines.push("");
    lines.push(`When: ${buildWhenLine(formattedDate, aoTime)}`);
    lines.push("");
    lines.push(`Who: All HIM, bring an FNG`);
    lines.push("");
    lines.push(`Why: To get 1% better`);
    lines.push("");
    lines.push(`What to bring: Water`);
    lines.push("");
    lines.push("HC below!");

    return lines.join("\n");
}

function normalizeTag(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function buildWhereLine(aoName, locationName) {
    if (locationName) {
        return `${aoName} - ${locationName}`;
    }

    return aoName;
}

function buildWhenLine(formattedDate, aoTime) {
    if (aoTime) {
        return `${formattedDate} at ${aoTime}`;
    }

    return formattedDate;
}

function buildExtraText(workout) {
    const intro = String(workout.introduction || "").trim();
    const notes = String(workout.notes || "").trim();

    if (intro) return intro;
    if (notes) return notes;

    return "";
}