import { formatDate } from "../utils/date.js";
import { getWorkoutFieldLabel } from "../utils/workoutLabels.js";
import { state } from "./state.js";

function getBackblastIntroTemplate() {
    return state.customTemplates?.backblastIntro || "";
}

function applyBackblastTemplate(template, values) {
    if (!template) return "";

    return template
        .replaceAll("{paxCount}", values.paxCount)
        .replaceAll("{aoName}", values.aoName)
        .replaceAll("{date}", values.date)
        .replaceAll("{qName}", values.qName)
        .trim();
}

function buildConditionsLine(weather) {
    if (!weather) return null;

    const rainLabel =
        typeof weather.precipChance === "number"
            ? `${weather.precipChance}% rain`
            : "rain chance unavailable";

    const windLabel =
        typeof weather.windMph === "number"
            ? `${weather.windMph} mph wind`
            : "wind unavailable";

    return `Conditions: ${weather.temp}° and ${weather.condition}, ${rainLabel}, ${windLabel}.`;
}

export function generateBackblast (session, members) {
    const attendeeIds = session.attendeeIds || [];
    const fngs = session.fngs || [];
    const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

    const formattedDate = formatDate(session.date);

    const qNames = effectiveQIds
        .map(qId => {
            const matchedMember = members.find(m => m.id === qId)

            if (!matchedMember) {
                console.warn("Backblast Q not found in members:", {
                    qId,
                    attendeeIds,
                    memberCount: members.length,
                });
                return null;
            }
            return `@${matchedMember.paxName}`;
        })
        .filter(Boolean)
    
    const sortedQNames = qNames.sort((a, b) => a.localeCompare(b));

    const qLabel = sortedQNames.length > 0 ? sortedQNames.join("\n") : "-";

    const qSectionLabel = sortedQNames.length === 1 ? "Q" : `Qs (${sortedQNames.length})`;

    const qIdSet = new Set(effectiveQIds);
    
    const paxNamesArray = attendeeIds
        .filter(id => !qIdSet.has(id))
        .map(id => {
        const member = members.find(m => m.id === id);
        return member ? member.paxName : "Unknown";
    })
    .sort((a, b) => a.localeCompare(b));

    const paxNames = paxNamesArray.length > 0 
    ? paxNamesArray.map(name => `@${name}`).join("\n") 
    : "None";

    const fngText = fngs.length === 0
    ? "None"
    : fngs.map(fng => {
        const displayName = fng.paxName && fng.realName
            ? `${fng.paxName} (${fng.realName})` 
            : (fng.paxName || fng.realName || "Unknown");

        if (!fng.invitedById) return displayName;

        const inviter = members.find(m => m.id === fng.invitedById);
        const inviterName = inviter ? inviter.paxName : "Unknown";

        return `${displayName} (Invited by @${inviterName})`;

    })
    .sort((a, b) => a.localeCompare(b))
    .join("\n");

    const totalAttendees = attendeeIds.length + fngs.length;

    const qNamePlain = sortedQNames.length > 0
        ? sortedQNames.map(name => name.replace(/^@/, "")).join(", ")
        : "YHC";

    const backblastIntro = applyBackblastTemplate(
        getBackblastIntroTemplate(),
        {
            paxCount: String(totalAttendees),
            aoName: session.aoName || "",
            date: formattedDate,
            qName: qNamePlain,
        }
    );

    const workout = session.workout;
    let workoutText = session.notes ? session.notes : "-";

    if (workout) {
        const parts = [];

        if (workout.title) {
            parts.push(`Title: ${workout.title}`);
        }

        if (workout.introduction) {
            parts.push(`${getWorkoutFieldLabel(state, "introduction")}:\n${workout.introduction}`);
        }

        if (workout.warmorama) {
            parts.push(`${getWorkoutFieldLabel(state, "warmorama")}:\n${workout.warmorama}`);
        }

        if (workout.thangs) {
            parts.push(`${getWorkoutFieldLabel(state, "thangs")}:\n${workout.thangs}`);
        }

        if (workout.finisher) {
            parts.push(`${getWorkoutFieldLabel(state, "finisher")}:\n${workout.finisher}`);
        }

        if (workout.notes) {
            parts.push(`${getWorkoutFieldLabel(state, "notes")}:\n${workout.notes}`);
        }

        if (session.notes) {
            parts.push(`Session Notes:\n${session.notes}`);
        }

        workoutText = parts.length > 0 ? parts.join("\n\n") : "-";
    } else if (session.notes) {
        workoutText = `Notes:\n${session.notes}`;
    }

    const aoHashtag = session.aoName
        ? `#${session.aoName.replace(/\s+/g, "")}`
        : "";

    return [
        `#backblast ${aoHashtag}`.trim(),
        "",
        backblastIntro,
        backblastIntro ? "" : null,
        `AO: ${session.aoName}`,
        `Date: ${formattedDate}`,
        buildConditionsLine(session.weatherSnapshot),
        "",
        `Total Attendees: ${totalAttendees}`,
        "",
        `${qSectionLabel}: ${qLabel}`,
        "",
        `PAX (${paxNamesArray.length}):`, 
        `${paxNames}`,
        "",
        `FNGs (${fngs.length}): ${fngText}`,
        "",
        workoutText,
    ].filter(item => item !== null).join("\n");
}