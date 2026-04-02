import { state } from "./state.js";

export function getMemberStats(memberId) {
    const sessions = state.sessions;

    const attendedSessions = sessions.filter(s => s.attendeeIds.includes(memberId) || s.fngs?.some(fng => fng.memberId === memberId));
    const dates = attendedSessions.map(s => s.date);
    const posts = attendedSessions.length;
    const qs = sessions.filter(s => Array.isArray(s.qIds) && s.qIds.includes(memberId)).length;

    if (dates.length === 0) {
        return {
            posts: 0,
            qs,
            firstPostDate: null,
            lastPostDate: null
        };
    }
    const sortedDates = [...dates].sort();
    const firstPostDate = sortedDates[0];
    const lastPostDate = sortedDates[sortedDates.length - 1];

    return { posts, qs, firstPostDate, lastPostDate};
}

