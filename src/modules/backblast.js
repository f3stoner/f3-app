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
        const displayName = fng.paxName || fng.realName;

        if (!fng.invitedById) return displayName;

        const inviter = members.find(m => m.id === fng.invitedById);
        const inviterName = inviter ? inviter.paxName : "Unknown";

        return `${displayName} (Invited by ${inviterName})`;

    }).join(", ");

    const notesText = session.notes ? session.notes : "-";

    return `AO: ${session.aoName}
    Date: ${formattedDate}
    
    Q: ${qName}
    
    PAX: ${paxNames}
    
    FNGs: ${fngText}
    
    Workout:
    ${notesText}`;
}