import { state } from "./state.js";

export function getMemberStats(memberId) {
    const sessions = state.sessions || [];

    const attendedSessions = sessions.filter((s) =>
        s.attendeeIds?.includes(memberId) ||
        s.fngs?.some((fng) => fng.memberId === memberId));

    const qSessions = sessions.filter((s) => {
        const qIds = Array.isArray(s.qIds) ? s.qIds : [];
        return qIds.includes(memberId) || s.qId === memberId;
    });

    const fngsEh = sessions.reduce((count, session) => {
        const fngs = Array.isArray(session.fngs) ? session.fngs : [];
        return count + fngs.filter((fng) => fng.invitedById === memberId).length;
    }, 0);

    const dates = attendedSessions.map((s) => s.date).filter(Boolean);
    const posts = attendedSessions.length;
    const qs = qSessions.length;

    if (dates.length === 0) {
        return {
            posts: 0,
            qs,
            fngsEh,
            firstPostDate: null,
            lastPostDate: null,
            favoriteAo: null,
        };
    }

    const sortedDates = [...dates].sort();
    const firstPostDate = sortedDates[0];
    const lastPostDate = sortedDates[sortedDates.length - 1];
    const favoriteAo = getFavoriteAo(attendedSessions);

    return {
        posts,
        qs,
        fngsEh,
        firstPostDate,
        lastPostDate,
        favoriteAo,
    };
}

function getFavoriteAo(sessions) {
    const aoCounts = sessions.reduce((counts, session) => {
        if (!session.aoName) return counts;

        counts[session.aoName] = (counts[session.aoName] || 0) + 1;
        return counts;
    }, {});

    const sortedEntries = Object.entries(aoCounts).sort((a, b) => b[1] - a[1]);

    return sortedEntries[0]?.[0] || null;
}

