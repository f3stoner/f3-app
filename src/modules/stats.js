import { state } from "./state.js";

export function getMemberStats(memberId) {
    const sessions = state.sessions;

    const posts = sessions.filter(s => s.attendeeIds.includes(memberId)).length;

    const qs = sessions.filter(s => s.qId === memberId).length;

    return { posts, qs};
}