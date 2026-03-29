import { state } from "./state.js";

export function getMemberStats(memberId) {
    const sessions = state.sessions;

    const attendedSessions = sessions.filter(s => s.attendeeIds.includes(memberId));
    const dates = attendedSessions.map(s => s.date);
    const posts = attendedSessions.length;
    const qs = sessions.filter(s => s.qId === memberId).length;

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
    const lastPostDate = sortedDates[dates.length - 1];

    return { posts, qs, firstPostDate, lastPostDate};
}

