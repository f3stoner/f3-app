import { state } from "./state.js";

export function addMember(
    paxName,
    inviterIds = []
) {
    const cleanInviterIds = [
        ...new Set(
            (
                Array.isArray(inviterIds)
                    ? inviterIds
                    : inviterIds
                        ? [inviterIds]
                        : []
            ).filter(Boolean)
        ),
    ];

    const newMember = {
        id: crypto.randomUUID(),
        paxName: paxName.trim(),
        inviterIds: cleanInviterIds,
        invitedById: cleanInviterIds[0] || null,
        status: "active",
        firstPostDate: null,
    };

    state.members.push(newMember);

    return newMember;
}