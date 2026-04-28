import { updateAdminFlag } from "../services/appData.js";
import { showToast } from "../utils/toast.js";

export const ADMIN_FLAG_TYPES = {
    DUPLICATE_FNG_NAME: "duplicate_fng_name",
};

export const ADMIN_FLAG_STATUS = {
    OPEN: "open",
    RESOLVED: "resolved",
};

function normalizeName(name) {
    return name.trim().toLowerCase();
}

export function createDuplicateFngNameFlags(session, members, currentUserId) {
    const flags = [];

    const fngs = Array.isArray(session.fngs) ? session.fngs : [];

    fngs.forEach(fng => {
        if (!fng.paxName) return;

        const normalizedFngName = normalizeName(fng.paxName);

        const matchingMembers = members.filter(member => {
            if (!member.paxName) return false;
            return normalizeName(member.paxName) === normalizedFngName;
        });

        if (matchingMembers.length === 0) return;

        flags.push({
            id: crypto.randomUUID(),
            type: ADMIN_FLAG_TYPES.DUPLICATE_FNG_NAME,
            status: ADMIN_FLAG_STATUS.OPEN,
            severity: "medium",
            createdAt: Date.now(),
            createdByUserId: currentUserId,
            sessionId: session.id,
            proposedPaxName: fng.paxName,
            matchedMemberIds: matchingMembers.map(member => member.id),
            message: `FNG name "${fng.paxName}" matches an existing roster name.`,
        });
    });

    return flags;
}