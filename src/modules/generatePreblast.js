import { formatDate } from "../utils/date.js";

export function generatePreblast(
    workout,
    aos = [],
    sites = []
) {
    if (!workout) {
        console.warn(
            "Cannot generate preblast without a workout."
        );

        return "";
    }

    const safeAos = Array.isArray(aos)
        ? aos
        : [];

    const safeSites = Array.isArray(sites)
        ? sites
        : [];

    const ao =
        safeAos.find(
            candidate =>
                candidate.id === workout.aoId
        ) ||
        safeAos.find(
            candidate =>
                candidate.name === workout.aoName
        ) ||
        null;

    const site =
        safeSites.find(
            candidate =>
                candidate.id === workout.siteId
        ) ||
        null;

    const formattedDate = workout.date ? formatDate(workout.date) : "TBD";
    const aoName = workout.aoName || "AO";
    const aoTime =
        workout.startTime ||
        ao?.time ||
        "";

    const locationName =
        site?.name ||
        ao?.locationName ||
        "";

    const title = workout.title?.trim() || "F3 Workout";

    const address =
        site?.address ||
        ao?.address ||
        "";

    const mapUrl =
        site?.mapUrl ||
        ao?.mapUrl ||
        "";

    const lines = [];

    lines.push(`#preblast #${normalizeTag(aoName)}`);

    lines.push("");

    lines.push(`What: ${title}`);
    lines.push("");
    lines.push(`Where: ${buildWhereLine(aoName, locationName)}`);
    if (address) {
        lines.push(`${address}`);
    }

    /*if (mapUrl) {
        lines.push(`Map: ${mapUrl}`);
    }*/

    lines.push("");
    lines.push(`When: ${buildWhenLine(formattedDate, aoTime)}`);
    lines.push("");
    lines.push(`Who: All HIM, bring an FNG`);
    lines.push("");
    lines.push(`Why: To get 1% better`);
    lines.push("");
    lines.push(`What to bring: Water`);

    const thirdFText = String(workout.thirdFText || "").trim();

    if (thirdFText) {
        lines.push("");
        lines.push(thirdFText);
    }

    const announcementText =
        String(workout.announcementText || "").trim();

    if (announcementText) {
        lines.push("");
        lines.push("ANNOUNCEMENTS");
        lines.push("");
        lines.push(announcementText);
    }

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