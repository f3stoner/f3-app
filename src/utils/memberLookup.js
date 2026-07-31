import { state } from "../modules/state.js";

export function getMemberById(
    memberId,
    members = state.members
) {
    if (!memberId) {
        return null;
    }

    if (
        state.currentUserMember?.id ===
        memberId
    ) {
        return state.currentUserMember;
    }

    return (
        (members || []).find(
            member =>
                member.id === memberId
        ) ||
        null
    );
}

export function getMemberDirectory(
    members = state.members
) {
    const membersById = new Map();

    (members || []).forEach(member => {
        if (!member?.id) return;

        membersById.set(
            member.id,
            member
        );
    });

    if (state.currentUserMember?.id) {
        membersById.set(
            state.currentUserMember.id,
            state.currentUserMember
        );
    }

    return [...membersById.values()];
}