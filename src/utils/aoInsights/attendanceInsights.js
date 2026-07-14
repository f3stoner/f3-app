import { getTotalAttendanceCount } from "../sessionAttendance.js";

function getSessionDate(session) {
    if (!session?.date) return null;
    return new Date(`${session.date}T00:00:00`);
}

function getWeekday(session) {
    const date = getSessionDate(session);

    if (!date) return "Unknown";

    return date.toLocaleDateString(undefined, {
        weekday: "long",
    });
}

function average(items, valueGetter) {
    if (!items.length) return null;

    const total = items.reduce((sum, item) => {
        return sum + valueGetter(item);
    }, 0);

    return total / items.length;
}

function roundOne(value) {
    if (value === null || value === undefined) return null;
    return Math.round(value * 10) / 10;
}

function getPercentChange(currentValue, previousValue) {
    if (
        currentValue === null ||
        previousValue === null ||
        previousValue <= 0
    ) {
        return null;
    }

    return ((currentValue - previousValue) / previousValue) * 100;
}

function summarizeSessions(sessions) {
    return sessions.map((session) => ({
        date: session.date,
        weekday: getWeekday(session),
        attendance: getTotalAttendanceCount(session),
        session,
    }));
}

function calculateWeekdayBreakdown(currentSessionCounts, previousSessionCounts) {
    const weekdays = new Set([
        ...currentSessionCounts.map((session) => session.weekday),
        ...previousSessionCounts.map((session) => session.weekday),
    ]);

    return [...weekdays]
        .filter((weekday) => weekday !== "Unknown")
        .map((weekday) => {
            const current = currentSessionCounts.filter(
                (session) => session.weekday === weekday
            );

            const previous = previousSessionCounts.filter(
                (session) => session.weekday === weekday
            );

            const currentAverage = average(current, (session) => session.attendance);
            const previousAverage = average(previous, (session) => session.attendance);
            const percentChange = getPercentChange(currentAverage, previousAverage);

            return {
                weekday,
                currentAverage: roundOne(currentAverage),
                previousAverage: roundOne(previousAverage),
                percentChange,
                currentSessionCount: current.length,
                previousSessionCount: previous.length,
            };
        });
}

function getTrend(percentChange, { upThreshold = 10, downThreshold = -10 } = {}) {
    if (percentChange === null) return "insufficient_data";
    if (percentChange >= upThreshold) return "up";
    if (percentChange <= downThreshold) return "down";
    return "stable";
}

function calculateAttendanceMetrics(sessions = [], options = {}) {
    const {
        comparisonDays = 28,
    } = options;

    const sortedSessions = [...sessions]
        .filter((session) => session?.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const today = new Date();

    const completedSessions = sortedSessions.filter((session) => {
        const sessionDate = getSessionDate(session);
        return sessionDate && sessionDate <= today;
    });

    const now = options.anchorDate
        ? new Date(`${options.anchorDate}T23:59:59`)
        : new Date();

    const currentStartDate = new Date(now);
    currentStartDate.setDate(currentStartDate.getDate() - comparisonDays);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setDate(previousStartDate.getDate() - comparisonDays);

    const currentSessions = completedSessions.filter((session) => {
        const sessionDate = getSessionDate(session);
        return sessionDate && sessionDate > currentStartDate && sessionDate <= now;
    });

    const previousSessions = completedSessions.filter((session) => {
        const sessionDate = getSessionDate(session);
        return (
            sessionDate &&
            sessionDate > previousStartDate &&
            sessionDate <= currentStartDate
        );
    });

    const currentSessionCounts = summarizeSessions(currentSessions);
    const previousSessionCounts = summarizeSessions(previousSessions);
    const allSessionCounts = summarizeSessions(completedSessions);

    const currentAverage = average(currentSessionCounts, (session) => session.attendance);
    const previousAverage = average(previousSessionCounts, (session) => session.attendance);
    const percentChange = getPercentChange(currentAverage, previousAverage);
    const trend = getTrend(percentChange, options);

    const weekdayBreakdown = calculateWeekdayBreakdown(
        currentSessionCounts,
        previousSessionCounts
    );

    const highestSession = allSessionCounts.length
        ? [...allSessionCounts].sort((a, b) => b.attendance - a.attendance)[0]
        : null;

    const lowestSession = allSessionCounts.length
        ? [...allSessionCounts].sort((a, b) => a.attendance - b.attendance)[0]
        : null;

    return {
        currentAverage: roundOne(currentAverage),
        previousAverage: roundOne(previousAverage),
        percentChange,
        trend,
        completedSessionCount: completedSessions.length,
        currentSessions: currentSessionCounts,
        previousSessions: previousSessionCounts,
        allSessions: allSessionCounts,
        weekdayBreakdown,
        highestSession,
        lowestSession,
    };
}

function findAttendancePatterns(metrics, options = {}) {
    const {
        meaningfulWeekdayThreshold = 10,
    } = options;

    const hasLowSampleSize =
        metrics.currentSessions.length < 2 ||
        metrics.previousSessions.length < 2;

    const meaningfulWeekdayChanges = metrics.weekdayBreakdown
        .filter((weekday) => {
            return (
                weekday.percentChange !== null &&
                Math.abs(weekday.percentChange) >= meaningfulWeekdayThreshold &&
                weekday.currentSessionCount > 0 &&
                weekday.previousSessionCount > 0
            );
        })
        .sort((a, b) => {
            return Math.abs(b.percentChange) - Math.abs(a.percentChange);
        });

    const primaryWeekdayDriver = meaningfulWeekdayChanges[0] || null;

    return {
        hasLowSampleSize,
        hasMeaningfulChange:
            metrics.trend === "up" || metrics.trend === "down",
        primaryWeekdayDriver,
    };
}

function formatPercent(value) {
    if (value === null || value === undefined) return null;

    return `${Math.abs(Math.round(value))}%`;
}

function buildAttendanceNarrative(metrics, patterns, options = {}) {
    const {
        currentPeriodLabel = "the last month",
        previousPeriodLabel = "the previous month",
    } = options;

    if (metrics.trend === "insufficient_data") {
        return {
            title: "Attendance Momentum",
            status: "insufficient-data",
            headline: "Insufficient Data",
            story: "Log a few more sessions to see attendance momentum.",
            action: null,
        };
    }

    if (patterns.hasLowSampleSize) {
        return {
            title: "Attendance Momentum",
            status: "insufficient-data",
            headline: "Attendance history is still thin.",
            story: "A few more logged sessions will make this trend more useful.",
            action: null,
        };
    }

    if (metrics.trend === "up") {
        const driver = patterns.primaryWeekdayDriver;

        return {
            title: "Attendance Momentum",
            status: "up",
            headline: "Growing ↑",
            story: driver
                ? `Up ${formatPercent(metrics.percentChange)} compared with the previous month, driven by higher ${driver.weekday} participation.`
                : `Up ${formatPercent(metrics.percentChange)} compared with the previous month.`,
            action: "Celebrate the recent growth.",
        };
    }

    if (metrics.trend === "down") {
        const driver = patterns.primaryWeekdayDriver;

        return {
            title: "Attendance Momentum",
            status: "down",
            headline: "Slipping ↓",
            story: driver
                ? `Down ${formatPercent(metrics.percentChange)} compared with the previous month, with lower ${driver.weekday} participation driving most of the decline.`
                : `Down ${formatPercent(metrics.percentChange)} compared with the previous month.`,
            action: "Check recent Kotters, schedule friction, or missed regulars.",
        };
    }

    return {
        title: "Attendance Momentum",
        status: "stable",
        headline: "Stable",
        story: `Average attendance has stayed mostly consistent over ${currentPeriodLabel}.`,
        action: null,
    };
}

export function buildAttendanceInsight(sessions = [], options = {}) {
    const metrics = calculateAttendanceMetrics(sessions, options);
    const patterns = findAttendancePatterns(metrics, options);
    const narrative = buildAttendanceNarrative(metrics, patterns, options);

    return {
        ...narrative,
        metrics,
        patterns,
    };
}