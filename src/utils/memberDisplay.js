import { state } from "../modules/state.js";

export function getMemberDisplayName(member) {
    if (!member) return "Unknown";

    const paxName = member.paxName || "";
    const realName = member.realName || "";
    const homeAo = member.homeAo || "";
    const baseName = paxName || realName || "Unknown";

    const samePaxNameMembers = state.members.filter(
        m => (m.paxName || "") === paxName
    );

    if (samePaxNameMembers.length <= 1) {
        return baseName;
    }

    const samePaxAndAoMembers = samePaxNameMembers.filter(
        m => (m.homeAo || "") === (homeAo)
    );

    if (samePaxAndAoMembers.length <= 1 && homeAo) {
        return `${baseName} - ${homeAo}`
    }

    if (realName) {
        return `${baseName} - ${realName}`;
    }

    if (homeAo) {
        return `${baseName} - ${homeAo}`;
    }

    return baseName;
}