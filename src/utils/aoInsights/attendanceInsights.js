export function buildAttendanceInsight(sessions = [], options = {}) {
    const {
        currentPeriodLabel = "the last 4 weeks",
        previousPeriodLabel = "the previous 4 weeks",
        upThreshold = 10,
        downThreshold = -10,
    } = options;

    const sortedSessions = [...sessions]
        .filter((session) => session?.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const completedSessions = sortedSessions.filter((session) => {
        const sessionDate = new Date(`${session.date}T00:00:00`);
        return sessionDate <= new Date();
    });

    const currentSessions = completedSessions.slice(-8).slice(-4);
    const previousSessions = completedSessions.slice(-8, -4);

    const countAttendance = (session) => {
        const attendeeIds = Array.isArray(session.attendeeIds)
            ? session.attendeeIds
            : [];

        const fngs = Array.isArray(session.fngs) ? session.fngs : [];

        const rosteredFngIds = fngs
            .map((fng) => fng?.memberId)
            .filter(Boolean);

        const unrosteredFngCount = fngs.filter((fng) => !fng?.memberId).length;

        const uniqueKnownIds = new Set([...attendeeIds, ...rosteredFngIds]);

        return uniqueKnownIds.size + unrosteredFngCount;
    };

    const average = (items) => {
        if (!items.length) return null;

        const total = items.reduce(
            (sum, session) => sum + countAttendance(session),
            0
        );

        return total / items.length;
    };

    const currentAverage = average(currentSessions);
    const previousAverage = average(previousSessions);

    const percentChange =
        currentAverage !== null &&
        previousAverage !== null &&
        previousAverage > 0
            ? ((currentAverage - previousAverage) / previousAverage) * 100
            : null;

    let status = "insufficient_data";
    let headline = "Not enough attendance history yet.";
    let summary = "Log a few more sessions to see attendance momentum.";
    let action = null;

    if (currentAverage !== null && previousAverage !== null && percentChange !== null) {
        if (percentChange >= upThreshold) {
            status = "up";
            headline = "Attendance is building momentum.";
            summary = `Average attendance is up over ${currentPeriodLabel} compared with ${previousPeriodLabel}.`;
            action = "Celebrate the recent growth.";
        } else if (percentChange <= downThreshold) {
            status = "down";
            headline = "Attendance is slipping.";
            summary = `Average attendance is down over ${currentPeriodLabel} compared with ${previousPeriodLabel}.`;
            action = "Check recent Kotters, schedule friction, or missed regulars.";
        } else {
            status = "stable";
            headline = "Attendance is holding steady.";
            summary = `Average attendance has stayed mostly consistent over ${currentPeriodLabel}.`;
            action = null;
        }
    }

    return {
        status,
        headline,
        summary,
        action,
        currentAverage,
        previousAverage,
        percentChange,
        sessions: {
            current: currentSessions.map((session) => ({
                date: session.date,
                attendance: countAttendance(session),
                session,
            })),
            previous: previousSessions.map((session) => ({
                date: session.date,
                attendance: countAttendance(session),
                session,
            })),
        },
    };
}