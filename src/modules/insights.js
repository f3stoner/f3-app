import { getTotalAttendanceCount, getRosteredAttendanceIdSet } from "../utils/sessionAttendance.js";

/*
Insights Metric Definitions

totalAttendance:
    unique attendeeIds ∪ fng.memberId, plus unrostered FNGs

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
    memberStats = [],
    aos = [],
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

    function getCanonicalAoName(session) {
        const ao = aos.find(ao => ao.id === session.aoId);
    
        return (
            ao?.name ||
            normalizeAoName(session.aoName)
        );
    }

    const totalSessions = filteredSessions.length;

    function getSessionAttendanceCount(session) {
        return getTotalAttendanceCount(session);
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
        if (!session.aoId) return;

        const aoId = session.aoId;
        const aoName = getCanonicalAoName(session);

        if (!attendanceByAoMap.has(aoId)) {
            attendanceByAoMap.set(aoId, {
                aoId,
                aoName,
                attendance: 0,
                sessions: 0,
                averageAttendance: 0,
                fngs: 0,
            });
        }

        const entry = attendanceByAoMap.get(aoId);

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
        if (!session.aoId) return;
    
        const aoId = session.aoId;
        const aoName = getCanonicalAoName(session);
        const sessionDate = new Date(`${session.date}T00:00:00`);
        const dayName = DAYS_OF_WEEK[sessionDate.getDay()];
    
        if (!attendanceByAoByDayMap.has(aoId)) {
            const days = {};
    
            DAYS_OF_WEEK.forEach(day => {
                days[day] = {
                    day,
                    attendance: 0,
                    sessions: 0,
                    averageAttendance: 0,
                };
            });
    
            attendanceByAoByDayMap.set(aoId, {
                aoId,
                aoName,
                days,
            });
        }
    
        const entry = attendanceByAoByDayMap.get(aoId);
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

            entry.fngsBrought += (session.fngs || []).filter(fng => {
                const inviterIds = [
                    ...(
                        Array.isArray(fng.inviterIds)
                            ? fng.inviterIds
                            : []
                    ),
                    fng.invitedById,
                    fng.invited_by_id,
                ].filter(Boolean);
            
                return new Set(inviterIds).has(qId);
            }).length;
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

    function getEffectivePostCount(memberId) {
        if (!memberId) return null;
    
        const stat = memberStats.find(item => {
            return (
                item.memberId === memberId ||
                item.member_id === memberId
            );
        });
    
        if (!stat) return null;
    
        return (
            stat.totalPosts ??
            stat.total_posts ??
            stat.posts ??
            stat.postCount ??
            stat.post_count ??
            stat.attendanceCount ??
            stat.attendance_count ??
            stat.totalAttendance ??
            stat.total_attendance ??
            null
        );
    }
    
    function getMemberDisplayName(memberId) {
        const member = members.find(item => {
            return item.id === memberId;
        });
    
        return (
            member?.paxName ||
            member?.pax_name ||
            member?.realName ||
            member?.real_name ||
            "Unnamed FNG"
        );
    }
    
    const rosteredFngCohortMap = new Map();
    const unrosteredFngCohort = [];
    
    filteredSessions.forEach(session => {
        (session.fngs || []).forEach((fng, index) => {
            const memberId =
                fng.memberId ||
                fng.member_id ||
                null;
    
            if (!memberId) {
                unrosteredFngCohort.push({
                    key: `${session.id || session.date}-${index}`,
                    memberId: null,
                    name:
                        fng.paxName ||
                        fng.pax_name ||
                        fng.name ||
                        fng.f3Name ||
                        fng.f3_name ||
                        "Unnamed FNG",
                    firstPostDate: session.date,
                    aoId: session.aoId || null,
                    aoName: getCanonicalAoName(session),
                    postCount: 1,
                    status: "Unrostered",
                });
    
                return;
            }
    
            const existing =
                rosteredFngCohortMap.get(memberId);
    
            if (
                existing &&
                existing.firstPostDate <= session.date
            ) {
                return;
            }
    
            const postCount =
                getEffectivePostCount(memberId) ?? 1;
    
            let status = "Needs Follow-Up";
    
            if (postCount >= 10) {
                status = "Regular";
            } else if (postCount >= 5) {
                status = "Building Habit";
            } else if (postCount >= 2) {
                status = "Returned";
            }
    
            rosteredFngCohortMap.set(memberId, {
                memberId,
                name: getMemberDisplayName(memberId),
                firstPostDate: session.date,
                aoId: session.aoId || null,
                aoName: getCanonicalAoName(session),
                postCount,
                status,
            });
        });
    });
    
    const rosteredFngCohort = [
        ...rosteredFngCohortMap.values(),
    ];
    
    const returnedFngCohort =
        rosteredFngCohort.filter(pax => {
            return pax.postCount >= 2;
        });
    
    const buildingHabitFngCohort =
        rosteredFngCohort.filter(pax => {
            return pax.postCount >= 5;
        });
    
    const regularFngCohort =
        rosteredFngCohort.filter(pax => {
            return pax.postCount >= 10;
        });
    
    const regionFngPipeline = {
        totalFngs:
            rosteredFngCohort.length +
            unrosteredFngCohort.length,
    
        rosteredFngs:
            rosteredFngCohort.length,
    
        unrosteredFngs:
            unrosteredFngCohort.length,
    
        returnedCount:
            returnedFngCohort.length,
    
        buildingHabitCount:
            buildingHabitFngCohort.length,
    
        regularCount:
            regularFngCohort.length,
    
        stages: [
            {
                key: "fngs",
                label: "FNGs",
                count:
                    rosteredFngCohort.length +
                    unrosteredFngCohort.length,
                subtitle:
                    `${rosteredFngCohort.length} rostered` +
                    (
                        unrosteredFngCohort.length
                            ? ` • ${unrosteredFngCohort.length} unrostered`
                            : ""
                    ),
                members: [
                    ...rosteredFngCohort,
                    ...unrosteredFngCohort,
                ],
            },
            {
                key: "returned",
                label: "Returned",
                count: returnedFngCohort.length,
                subtitle: "Reached 2 beatdowns",
                members: returnedFngCohort,
            },
            {
                key: "buildingHabit",
                label: "Building Habit",
                count: buildingHabitFngCohort.length,
                subtitle: "Reached 5 beatdowns",
                members: buildingHabitFngCohort,
            },
            {
                key: "regulars",
                label: "Regulars",
                count: regularFngCohort.length,
                subtitle: "Reached 10 beatdowns",
                members: regularFngCohort,
            },
        ],
    };

    const postCountByMemberId = new Map();

    filteredSessions.forEach(session => {
        getRosteredAttendanceIdSet(session).forEach(memberId => {
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

    const monthlyRegionTrendMap = new Map();

    sessions.forEach(session => {
        if (!session.date) return;
    
        const monthKey = session.date.slice(0, 7);
    
        if (!monthlyRegionTrendMap.has(monthKey)) {
            monthlyRegionTrendMap.set(monthKey, {
                monthKey,
                sessions: 0,
                totalAttendance: 0,
                averageAttendance: 0,
                fngs: 0,
                activeQIds: new Set(),
            });
        }
    
        const entry = monthlyRegionTrendMap.get(monthKey);
    
        entry.sessions += 1;
        entry.totalAttendance += getSessionAttendanceCount(session);
        entry.fngs += session.fngs?.length || 0;
    
        (session.qIds || []).forEach(qId => {
            if (qId) entry.activeQIds.add(qId);
        });
    });
    
    monthlyRegionTrendMap.forEach(entry => {
        entry.averageAttendance =
            entry.sessions > 0
                ? Number(
                    (
                        entry.totalAttendance /
                        entry.sessions
                    ).toFixed(1)
                )
                : 0;
    });
    
    const selectedEndMonth = endDate.slice(0, 7);
    
    const [selectedYear, selectedMonthNumber] =
        selectedEndMonth.split("-").map(Number);
    
    const monthlyRegionTrendKeys = [];
    
    for (let offset = 11; offset >= 0; offset -= 1) {
        const date = new Date(
            selectedYear,
            selectedMonthNumber - 1 - offset,
            1
        );
    
        monthlyRegionTrendKeys.push(
            `${date.getFullYear()}-${String(
                date.getMonth() + 1
            ).padStart(2, "0")}`
        );
    }

    function getMonthEndDate(monthKey) {
        const [year, month] = monthKey.split("-").map(Number);
    
        return new Date(
            year,
            month,
            0,
            23,
            59,
            59
        );
    }
    
    function getDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
    
        return `${year}-${month}-${day}`;
    }
    
    function calculateActivePaxForMonth(monthKey) {
        const windowEnd = getMonthEndDate(monthKey);
    
        const windowStart = new Date(windowEnd);
        windowStart.setDate(windowStart.getDate() - 59);
        windowStart.setHours(0, 0, 0, 0);
    
        const windowStartKey = getDateKey(windowStart);
        const windowEndKey = getDateKey(windowEnd);
    
        const postsByMemberId = new Map();
    
        sessions.forEach(session => {
            if (
                !session.date ||
                session.date < windowStartKey ||
                session.date > windowEndKey
            ) {
                return;
            }
    
            getRosteredAttendanceIdSet(session).forEach(memberId => {
                postsByMemberId.set(
                    memberId,
                    (postsByMemberId.get(memberId) || 0) + 1
                );
            });
        });
    
        return [...postsByMemberId.values()]
            .filter(postCount => postCount >= 8)
            .length;
    }

    const monthlyRegionTrend =
    monthlyRegionTrendKeys.map(monthKey => {
        const entry = monthlyRegionTrendMap.get(monthKey);

        const [year, month] =
            monthKey.split("-").map(Number);

        const date = new Date(year, month - 1, 1);

        return {
            monthKey,

            label: date.toLocaleDateString(undefined, {
                month: "short",
            }),

            sessions: entry?.sessions || 0,

            totalAttendance:
                entry?.totalAttendance || 0,

            averageAttendance:
                entry?.averageAttendance || 0,

            activePax:
                calculateActivePaxForMonth(monthKey),

            fngs:
                entry?.fngs || 0,

            activeQs:
                entry?.activeQIds?.size || 0,
        };
    });

    const monthlyAoTrendMap = new Map();

    sessions.forEach(session => {
        if (!session.date || !session.aoId) return;

        const monthKey = session.date.slice(0, 7);
        const aoId = session.aoId;
        const aoName = getCanonicalAoName(session);

        if (!monthlyAoTrendMap.has(aoId)) {
            monthlyAoTrendMap.set(aoId, {
                aoId,
                aoName,
                totalSessions: 0,
                months: new Map(),
            });
        }

        const aoEntry = monthlyAoTrendMap.get(aoId);

        if (!aoEntry.months.has(monthKey)) {
            aoEntry.months.set(monthKey, {
                monthKey,
                sessions: 0,
                totalAttendance: 0,
                averageAttendance: 0,
            });
        }

        const monthEntry = aoEntry.months.get(monthKey);

        monthEntry.sessions += 1;
        monthEntry.totalAttendance +=
            getSessionAttendanceCount(session);

        aoEntry.totalSessions += 1;
    });

    monthlyAoTrendMap.forEach(aoEntry => {
        aoEntry.months.forEach(monthEntry => {
            monthEntry.averageAttendance =
                monthEntry.sessions > 0
                    ? Number(
                        (
                            monthEntry.totalAttendance /
                            monthEntry.sessions
                        ).toFixed(1)
                    )
                    : 0;
        });
    });

    const monthlyAoAttendanceTrend = [
        ...monthlyAoTrendMap.values(),
    ]
        .map(aoEntry => ({
            aoId: aoEntry.aoId,
            aoName: aoEntry.aoName,
            totalSessions: aoEntry.totalSessions,

            months: monthlyRegionTrendKeys.map(monthKey => {
                const monthEntry =
                    aoEntry.months.get(monthKey);

                const [year, month] =
                    monthKey.split("-").map(Number);

                const date = new Date(
                    year,
                    month - 1,
                    1
                );

                return {
                    monthKey,

                    label: date.toLocaleDateString(
                        undefined,
                        {
                            month: "short",
                        }
                    ),

                    sessions:
                        monthEntry?.sessions || 0,

                    totalAttendance:
                        monthEntry?.totalAttendance || 0,

                    averageAttendance:
                        monthEntry?.averageAttendance || 0,
                };
            }),
        }))
        .filter(ao => {
            return ao.months.some(month => {
                return month.sessions > 0;
            });
        })
        .sort((a, b) => {
            return b.totalSessions - a.totalSessions;
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
        monthlyRegionTrend,
        monthlyAoAttendanceTrend,
        qFrequency,
        fngStats,
        regionFngPipeline,
        postingFrequency,
    };
}