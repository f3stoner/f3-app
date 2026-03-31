import { formatDate } from "../utils/date.js";


export function generateBackblast (session, members) {
    const formattedDate = formatDate(session.date);
    const qMember = members.find(m => m.id === session.qId);
    const qName = qMember ? qMember.paxName : "-";
    const paxNamesArray = session.attendeeIds
        .filter(id => id !== session.qId)
        .map(id => {
        const member = members.find(m => m.id === id);
        return member ? member.paxName : "Unknown";
    });
    const paxNames = paxNamesArray.join(", ");
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

        workoutText = parts.length > 0 ? parts.join("\n\n") : "-";
    }

    console.log("generateBackblast session:", session);
    console.log("generateBackblast workout:", session.workout);

    return `AO: ${session.aoName}
    Date: ${formattedDate}
    
    Q: ${qName}
    
    PAX: ${paxNames}
    
    FNGs: ${fngText}
    
    Workout:
    ${workoutText}`;
}