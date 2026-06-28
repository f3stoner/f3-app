export function getSessionQIds(session = {}) {
    return new Set([
        ...(session.qIds || []),
        ...(session.q_id ? [session.q_id] : []),
        ...(session.qId ? [session.qId] : []),
    ].filter(Boolean));
}

export function getFngMemberIdSet(session = {}) {
    return new Set(
        (session.fngs || [])
            .map(fng => fng.memberId)
            .filter(Boolean)
    );
}

export function getRosteredAttendanceIdSet(session = {}) {
    return new Set([
        ...(session.attendeeIds || []),
        ...getFngMemberIdSet(session),
    ].filter(Boolean));
}

export function getUnrosteredFngCount(session = {}) {
    return (session.fngs || []).filter(fng => !fng.memberId).length;
}

export function getTotalAttendanceCount(session = {}) {
    return getRosteredAttendanceIdSet(session).size + getUnrosteredFngCount(session);
}

export function getRegularPaxIds(session = {}, { excludeQ = true } = {}) {
    const qIds = getSessionQIds(session);
    const fngIds = getFngMemberIdSet(session);

    return [...new Set(session.attendeeIds || [])].filter(memberId => {
        if (!memberId) return false;
        if (fngIds.has(memberId)) return false;
        if (excludeQ && qIds.has(memberId)) return false;
        return true;
    });
}

export function memberAttendedSession(session = {}, memberId) {
    if (!memberId) return false;

    return getRosteredAttendanceIdSet(session).has(memberId);
}

export function getSessionDisplayCounts(session = {}) {
    return {
        totalAttendance: getTotalAttendanceCount(session),
        regularPaxCount: getRegularPaxIds(session).length,
        fngCount: session.fngs?.length || 0,
    };
}