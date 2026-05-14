/*
Insights Metric Definitions

totalAttendance:
    attendeeIds + fngs per session

uniquePax:
    unique known/rostered humans

totalFngs:
    total FNG appearances across sessions

uniqueHumans:
    uniquePax + anonymous/unlinked FNG appearances

totalQs:
    total Q slots filled

uniqueQs:
    unique rostered Qs
*/

const DAYS_OF_WEEK = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

function normalizeAoName(aoName) {
    const trimmed = String(aoName || "Unknown AO").trim();

    const aliases = {
        "Rock": "The Rock",
        "Cave": "The Cave",
        "Keep": "The Keep",
    };

    return aliases[trimmed] || trimmed;
}

export function buildRegionInsights({
    sessions,
    members,
    startDate,
    endDate,
}) {
    const filteredSessions = sessions.filter(session => {
        if (!session.date) return false;

        return (
            session.date >= startDate &&
            session.date <= endDate
        );
    });

    const totalSessions = filteredSessions.length;

    function getSessionAttendanceCount(session) {
        return (
            (session.attendeeIds?.length || 0) +
            (session.fngs?.length || 0)
        );
    }

    const totalAttendance = filteredSessions.reduce((total, session) => {
        return total + getSessionAttendanceCount(session);
    }, 0);

    const totalFngs = filteredSessions.reduce((total, session) => {
        return total + (session.fngs?.length || 0);
    }, 0);

    const uniquePaxIds = new Set();

    filteredSessions.forEach(session => {
        (session.attendeeIds || []).forEach(id => {
            uniquePaxIds.add(id);
        });
    });

    let anonymousFngCount = 0;

    filteredSessions.forEach(session => {
        (session.fngs || []).forEach(fng => {
            if (fng.memberId) {
                uniquePaxIds.add(fng.memberId);
            } else {
                anonymousFngCount += 1;
            }
        });
    });

    const uniquePax = uniquePaxIds.size;

    const uniqueHumans =
        uniquePaxIds.size + anonymousFngCount;

    const uniqueQIds = new Set();
    let totalQs = 0;

    filteredSessions.forEach(session => {
        const qIds = session.qIds || [];

        totalQs += qIds.length;

        qIds.forEach(id => {
            uniqueQIds.add(id);
        });
    });

    const uniqueQs = uniqueQIds.size;

    const averageAttendance =
        totalSessions > 0
            ? Number((totalAttendance / totalSessions).toFixed(1))
            : 0;

    const attendanceByDayMap = new Map();

    DAYS_OF_WEEK.forEach(day => {
        attendanceByDayMap.set(day, {
            day,
            attendance: 0,
            sessions: 0,
            averageAttendance: 0,
        });
    });

    filteredSessions.forEach(session => {
        const sessionDate = new Date(`${session.date}T00:00:00`);

        const dayName = DAYS_OF_WEEK[sessionDate.getDay()];

        const entry = attendanceByDayMap.get(dayName);

        entry.attendance += getSessionAttendanceCount(session);
        entry.sessions += 1;
    });

    attendanceByDayMap.forEach(entry => {
        entry.averageAttendance =
            entry.sessions > 0
                ? Number((entry.attendance / entry.sessions).toFixed(1))
                : 0;
    });

    const attendanceByDay = Array.from(attendanceByDayMap.values());

    const attendanceByAoMap = new Map();

    filteredSessions.forEach(session => {
        const aoName = normalizeAoName(session.aoName);

        if (!attendanceByAoMap.has(aoName)) {
            attendanceByAoMap.set(aoName, {
                aoName,
                attendance: 0,
                sessions: 0,
                averageAttendance: 0,
                fngs: 0,
            });
        }

        const entry = attendanceByAoMap.get(aoName);

        entry.attendance += getSessionAttendanceCount(session);
        entry.sessions += 1;
        entry.fngs += session.fngs?.length || 0;
    });

    attendanceByAoMap.forEach(entry => {
        entry.averageAttendance =
            entry.sessions > 0
                ? Number((entry.attendance / entry.sessions).toFixed(1))
                : 0;
    });

    const attendanceByAo = Array.from(attendanceByAoMap.values())
        .sort((a, b) => b.attendance - a.attendance);

    const attendanceByAoByDayMap = new Map();

    filteredSessions.forEach(session => {
        const aoName = normalizeAoName(session.aoName);
        const sessionDate = new Date(`${session.date}T00:00:00`);
        const dayName = DAYS_OF_WEEK[sessionDate.getDay()];

        if (!attendanceByAoByDayMap.has(aoName)) {
            const days = {};

            DAYS_OF_WEEK.forEach(day => {
                days[day] = {
                    day,
                    attendance: 0,
                    sessions: 0,
                    averageAttendance: 0,
                };
            });

            attendanceByAoByDayMap.set(aoName, {
                aoName,
                days,
            });
        }

        const entry = attendanceByAoByDayMap.get(aoName);
        const dayEntry = entry.days[dayName];

        dayEntry.attendance += getSessionAttendanceCount(session);
        dayEntry.sessions += 1;
    });

    attendanceByAoByDayMap.forEach(entry => {
        DAYS_OF_WEEK.forEach(day => {
            const dayEntry = entry.days[day];

            dayEntry.averageAttendance =
                dayEntry.sessions > 0
                    ? Number((dayEntry.attendance / dayEntry.sessions).toFixed(1))
                    : 0;
        });
    });

    const attendanceByAoByDay = Array.from(attendanceByAoByDayMap.values())
        .sort((a, b) => {
            const aTotal = Object.values(a.days).reduce((sum, day) => sum + day.attendance, 0);
            const bTotal = Object.values(b.days).reduce((sum, day) => sum + day.attendance, 0);

            return bTotal - aTotal;
        });

    const qFrequencyMap = new Map();

    filteredSessions.forEach(session => {
        const qIds = session.qIds || [];

        qIds.forEach(qId => {
            const member = members.find(m => m.id === qId);

            if (!qFrequencyMap.has(qId)) {
                qFrequencyMap.set(qId, {
                    memberId: qId,
                    paxName: member?.paxName || "Unknown",
                    qCount: 0,
                    attendanceCount: 0,
                    fngsBrought: 0,
                });
            }

            const entry = qFrequencyMap.get(qId);

            entry.qCount += 1;

            entry.attendanceCount += getSessionAttendanceCount(session);

            entry.fngsBrought += session.fngs?.filter(
                fng => fng.invitedById === qId
            ).length || 0;
        });
    });

    const qFrequency = Array.from(qFrequencyMap.values())
        .map(entry => ({
            ...entry,
            averageAttendance:
                entry.qCount > 0
                    ? Number((entry.attendanceCount / entry.qCount).toFixed(1))
                    : 0,
        }))
        .sort((a, b) => b.qCount - a.qCount);

    

    const rosteredFngs = filteredSessions.reduce((total, session) => {
        return total + (session.fngs || []).filter(fng => fng.memberId).length;
    }, 0);

    const unrosteredFngs = totalFngs - rosteredFngs;

    const rosterCaptureRate =
        totalFngs > 0
            ? Number(((rosteredFngs / totalFngs) * 100).toFixed(1))
            : 0;

    const fngStats = {
        totalFngs,
        rosteredFngs,
        unrosteredFngs,
        rosterCaptureRate,
    };



    const postCountByMemberId = new Map();

    filteredSessions.forEach(session => {
        (session.attendeeIds || []).forEach(memberId => {
            postCountByMemberId.set(
                memberId,
                (postCountByMemberId.get(memberId) || 0) + 1
            );
        });
    });

    const postingFrequency = [
        { label: "1 Post", count: 0 },
        { label: "2-4 Posts", count: 0 },
        { label: "5-9 Posts", count: 0 },
        { label: "10-19 Posts", count: 0 },
        { label: "20+ Posts", count: 0 },

    ];

    postCountByMemberId.forEach(count => {
        if (count === 1) {
            postingFrequency[0].count += 1;
        } else if (count <= 4) {
            postingFrequency[1].count += 1;
        } else if (count <= 9) {
            postingFrequency[2].count += 1;
        } else if (count <= 19) {
            postingFrequency[3].count += 1;
        } else {
            postingFrequency[4].count += 1;
        }
    });

    return {
        summary: {
            totalSessions,
            totalAttendance,
            averageAttendance,

            uniquePax,
            totalFngs,
            uniqueHumans,

            uniqueQs,
            totalQs,
        },

        attendanceByDay,
        attendanceByAo,
        attendanceByAoByDay,
        qFrequency,
        fngStats,
        postingFrequency,
    };
}