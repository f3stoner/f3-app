import { state } from "../modules/state.js";

export function getMemberDisplayName(member) {
    if (!member) return "Unknown";

    const samePaxNameCount = state.members.filter(
        m => m.paxName && m.paxName === member.paxName
    ).length;

    if (samePaxNameCount <= 1) {
        return member.paxName || member.realName || "Unknown";
    }

    if (member.homeAo) {
        return `${member.paxName} - ${member.homeAo}`;
    }

    if (member.realName) {
        return `${member.paxName} - ${member.realName}`;
    }

    return member.paxName || "Unknown";
}