import { state } from "../modules/state.js";

export function getMemberDisplayName(member) {
    if (!member) return "Unknown PAX";

    const paxName = String(member.paxName || "").trim();
    const realName = String(member.realName || "").trim();
    const homeAo = String(member.homeAo || "").trim();

    const baseName = paxName || realName || "Unknown PAX";

    // Only run duplicate PAX-name logic when there is an actual PAX name.
    if (!paxName) {
        return baseName;
    }

    const samePaxNameMembers = (state.members || []).filter(
        m => String(m.paxName || "").trim() === paxName
    );

    if (samePaxNameMembers.length <= 1) {
        return baseName;
    }

    const samePaxAndAoMembers = samePaxNameMembers.filter(
        m => String(m.homeAo || "").trim() === homeAo
    );

    if (samePaxAndAoMembers.length <= 1 && homeAo) {
        return `${baseName} - ${homeAo}`;
    }

    if (realName) {
        return `${baseName} - ${realName}`;
    }

    if (homeAo) {
        return `${baseName} - ${homeAo}`;
    }

    return baseName;
}