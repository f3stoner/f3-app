import { state } from "../modules/state.js";

function getDefaultMemberDirectory() {
    const membersById = new Map();

    /*
     * Full home-region roster, including inactive members.
     */
    (state.members || []).forEach(member => {
        if (!member?.id) return;

        membersById.set(
            member.id,
            member
        );
    });

    /*
     * Active regional participants, including non-home PAX.
     *
     * Participant-shaped records win because they include
     * region-participation metadata used by regional views.
     */
    (state.participants || []).forEach(member => {
        if (!member?.id) return;

        membersById.set(
            member.id,
            member
        );
    });

    /*
     * Canonical authenticated identity remains available even
     * when it is outside the active roster or participant set.
     */
    if (state.currentUserMember?.id) {
        membersById.set(
            state.currentUserMember.id,
            state.currentUserMember
        );
    }

    return [...membersById.values()];
}

export function getMemberById(
    memberId,
    members = null
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

    const directory =
        members ||
        getDefaultMemberDirectory();

    return (
        directory.find(
            member =>
                member.id === memberId
        ) ||
        null
    );
}

export function getMemberDirectory(
    members = null
) {
    if (members) {
        const membersById = new Map();

        members.forEach(member => {
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

    return getDefaultMemberDirectory();
}