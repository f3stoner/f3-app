import { state } from "./state.js";

export function addMember (paxName, invitedById = null) {
    const newMember = {
        id: crypto.randomUUID(),
        paxName: paxName.trim(),
        invitedById,
        status: "active",
        firstPostDate: null,
    };

    state.members.push(newMember);
}