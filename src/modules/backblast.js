import { formatDate } from "../utils/date.js";


export function generateBackblast (session, members) {
    const formattedDate = formatDate(session.date);

    const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

    const qNames = effectiveQIds
        .map(qId => {
            const matchedMember = members.find(m => m.id === qId)

            if (!matchedMember) {
                console.warn("Backblast Q not found in members:", {
                    qId,
                    attendeeIds: session.attendeeIds,
                    memberCount: members.length,
                });
                return null;
            }
            return matchedMember.paxName;
        })
        .filter(Boolean)

    const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";

    const qIdSet = new Set(effectiveQIds);
    
    const paxNamesArray = session.attendeeIds
        .filter(id => !qIdSet.has(id))
        .map(id => {
        const member = members.find(m => m.id === id);
        return member ? member.paxName : "Unknown";
    });
    const paxNames = paxNamesArray.length > 0 ? paxNamesArray.join(", ") : "-";
    const fngText = session.fngs.length === 0
    ? "None"
    : session.fngs.map(fng => {
        const displayName = fng.paxName && fng.realName
            ? `${fng.paxName} (${fng.realName})` 
            : (fng.paxName || fng.realName || "Unknown");

        if (!fng.invitedById) return displayName;

        const inviter = members.find(m => m.id === fng.invitedById);
        const inviterName = inviter ? inviter.paxName : "Unknown";

        return `${displayName} (Invited by ${inviterName})`;

    }).join(", ");

    const workout = session.workout;
    let workoutText = session.notes ? session.notes : "-";

    if (workout) {
        const parts = [];

        if (workout.title) {
            parts.push(`Title: ${workout.title}`);
        }

        if (workout.warmorama) {
            parts.push(`Warm-O-Rama:\n${workout.warmorama}`);
        }

        if (workout.thangs) {
            parts.push(`Thangs:\n${workout.thangs}`);
        }

        if (workout.finisher) {
            parts.push(`Mary / Finisher:\n${workout.finisher}`);
        }

        if (workout.notes) {
            parts.push(`Planner Notes:\n${workout.notes}`);
        }

        if (session.notes) {
            parts.push(`Session Notes:\n${session.notes}`);
        }

        workoutText = parts.length > 0 ? parts.join("\n\n") : "-";
    } else if (session.notes) {
        workoutText = `Notes:\n${session.notes}`;
    }

    return `AO: ${session.aoName}
Date: ${formattedDate}
    
Q: ${qLabel}
PAX: ${paxNames}
FNGs: ${fngText}
    
${workoutText}`;
}