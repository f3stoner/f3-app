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
    accelerationEndDate = endDate,
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

    function getEffectiveLastPostDate(memberId) {
        if (!memberId) return null;
    
        const stat = memberStats.find(item => {
            return (
                item.memberId === memberId ||
                item.member_id === memberId
            );
        });
    
        return (
            stat?.lastPostDate ??
            stat?.last_post_date ??
            stat?.lastPostedAt ??
            stat?.last_posted_at ??
            null
        );
    }

    function getEffectiveLastQDate(memberId) {
        if (!memberId) return null;
    
        const stat = memberStats.find(item => {
            return (
                item.memberId === memberId ||
                item.member_id === memberId
            );
        });
    
        return (
            stat?.lastQDate ??
            stat?.last_q_date ??
            stat?.lastQedAt ??
            stat?.last_qed_at ??
            null
        );
    }

    function getEffectiveQCount(memberId) {
        if (!memberId) return 0;
    
        const stat = memberStats.find(item => {
            return (
                item.memberId === memberId ||
                item.member_id === memberId
            );
        });
    
        return (
            stat?.totalQs ??
            stat?.total_qs ??
            stat?.qs ??
            stat?.qCount ??
            stat?.q_count ??
            0
        );
    }

    function countPostsBetween(startKey, endKey) {
        const posts = new Map();
    
        sessions.forEach(session => {
            if (
                !session.date ||
                session.date < startKey ||
                session.date > endKey
            ) {
                return;
            }
    
            getRosteredAttendanceIdSet(session).forEach(memberId => {
                posts.set(
                    memberId,
                    (posts.get(memberId) || 0) + 1
                );
            });
        });
    
        return posts;
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

    const currentWindowEnd = accelerationEndDate;

    const currentWindowStart = (() => {
        const d = new Date(`${currentWindowEnd}T00:00:00`);
        d.setDate(d.getDate() - 59);
        return getDateKey(d);
    })();

    const previousWindowEnd = (() => {
        const d = new Date(`${currentWindowStart}T00:00:00`);
        d.setDate(d.getDate() - 1);
        return getDateKey(d);
    })();

    const previousWindowStart = (() => {
        const d = new Date(`${previousWindowEnd}T00:00:00`);
        d.setDate(d.getDate() - 59);
        return getDateKey(d);
    })();

    const currentPosts =
        countPostsBetween(
            currentWindowStart,
            currentWindowEnd
        );

    const previousPosts =
        countPostsBetween(
            previousWindowStart,
            previousWindowEnd
        );

    const memberIds = new Set([
        ...currentPosts.keys(),
        ...previousPosts.keys(),
    ]);
    
    const paxAcceleration = [];
    
    memberIds.forEach(memberId => {
        const member =
            members.find(m => m.id === memberId);
    
        if (!member) return;
    
        const current =
            currentPosts.get(memberId) || 0;
    
        const previous =
            previousPosts.get(memberId) || 0;
    
        if (current === 0 && previous === 0) {
            return;
        }
    
        const change =
            current - previous;
    
        let percentChange = null;
    
        if (previous > 0) {
            percentChange =
                ((current - previous) / previous) * 100;
        }
    
        let status;
    
        if (previous === 0 && current >= 8) {
            status = "New Regular";
        } else if (previous === 0 && current > 0) {
            status = "Moderate Increase";
        } else if (
            percentChange !== null &&
            percentChange >= 50
        ) {
            status = "Strong Increase";
        } else if (
            percentChange !== null &&
            percentChange >= 20
        ) {
            status = "Moderate Increase";
        } else if (
            percentChange === null ||
            percentChange > -20
        ) {
            status = "Consistent";
        } else if (percentChange > -50) {
            status = "Moderate Drop";
        } else {
            status = "Sharp Drop";
        }
    
        paxAcceleration.push({
            memberId,
            paxName:
                member.paxName ||
                member.pax_name ||
                member.realName ||
                member.real_name ||
                "Unnamed PAX",
        
            currentPosts: current,
            previousPosts: previous,
            change,
            percentChange,
            lastPostDate:
                getEffectiveLastPostDate(memberId),
            status,
        });
    });

    paxAcceleration.sort((a, b) => {

        if (a.status !== b.status) {
    
            const order = {
                "New Regular": 0,
                "Strong Increase": 1,
                "Moderate Increase": 2,
                "Consistent": 3,
                "Moderate Drop": 4,
                "Sharp Drop": 5,
            };
    
            return order[a.status] - order[b.status];
        }
    
        return (
            (b.percentChange ?? -Infinity) -
            (a.percentChange ?? -Infinity)
        );
    });

    const accelerationGroupDefinitions = [
        {
            status: "New Regular",
            key: "newly-active",
            label: "Newly Active",
            description:
                "Reached 8+ posts after having no posts in the previous window",
            tone: "positive",
            symbol: "★",
        },
        {
            status: "Strong Increase",
            key: "rising-fast",
            label: "Rising Fast",
            description:
                "Posting increased by 50% or more",
            tone: "positive",
            symbol: "↗",
        },
        {
            status: "Moderate Increase",
            key: "gaining-momentum",
            label: "Gaining Momentum",
            description:
                "Posting increased, including newly returning PAX",
            tone: "positive",
            symbol: "↗",
        },
        {
            status: "Consistent",
            key: "holding-steady",
            label: "Holding Steady",
            description:
                "Posting changed by less than 20%",
            tone: "neutral",
            symbol: "→",
        },
        {
            status: "Moderate Drop",
            key: "cooling-off",
            label: "Cooling Off",
            description:
                "Posting decreased by 20–49%",
            tone: "warning",
            symbol: "↘",
        },
        {
            status: "Sharp Drop",
            key: "needs-attention",
            label: "Needs Attention",
            description:
                "Posting decreased by 50% or more",
            tone: "danger",
            symbol: "↓",
        },
    ];
    
    const accelerationBuckets =
        accelerationGroupDefinitions.map(definition => {
            const members =
                paxAcceleration.filter(pax => {
                    return pax.status === definition.status;
                });
    
            return {
                ...definition,
                count: members.length,
                members,
            };
        });

        const checkTheSixAnchorDate =
        new Date(`${accelerationEndDate}T00:00:00`);
    
    function getDaysSinceDate(dateKey) {
        if (!dateKey) return null;
    
        const date = new Date(`${dateKey.slice(0, 10)}T00:00:00`);
    
        if (Number.isNaN(date.getTime())) {
            return null;
        }
    
        const millisecondsPerDay =
            1000 * 60 * 60 * 24;
    
        return Math.floor(
            (
                checkTheSixAnchorDate.getTime() -
                date.getTime()
            ) / millisecondsPerDay
        );
    }
    
    const checkTheSixMembers = members
        .filter(member => {
            return member.status !== "inactive";
        })
        .map(member => {
            const lastPostDate =
                getEffectiveLastPostDate(member.id);
    
            const daysSinceLastPost =
                getDaysSinceDate(lastPostDate);
    
            return {
                memberId: member.id,
    
                paxName:
                    member.paxName ||
                    member.pax_name ||
                    member.realName ||
                    member.real_name ||
                    "Unnamed PAX",
    
                lastPostDate,
                daysSinceLastPost,
            };
        })
        .filter(member => {
            return (
                member.daysSinceLastPost !== null &&
                member.daysSinceLastPost >= 30
            );
        })
        .sort((a, b) => {
            return (
                b.daysSinceLastPost -
                a.daysSinceLastPost
            );
        });
    
    const checkTheSixDefinitions = [
        {
            key: "watch-list",
            label: "Watch List",
            description:
                "Last posted 30–59 days ago",
            tone: "warning",
            symbol: "!",
            minDays: 30,
            maxDays: 59,
        },
        {
            key: "reach-out",
            label: "Reach Out",
            description:
                "Last posted 60–89 days ago",
            tone: "danger",
            symbol: "↗",
            minDays: 60,
            maxDays: 89,
        },
        {
            key: "kotter-watch",
            label: "Kotter Watch",
            description:
                "Last posted 90 or more days ago",
            tone: "danger",
            symbol: "↓",
            minDays: 90,
            maxDays: null,
        },
    ];
    
    const checkTheSix =
        checkTheSixDefinitions.map(definition => {
            const matchingMembers =
                checkTheSixMembers.filter(member => {
                    const meetsMinimum =
                        member.daysSinceLastPost >=
                        definition.minDays;
    
                    const meetsMaximum =
                        definition.maxDays === null ||
                        member.daysSinceLastPost <=
                        definition.maxDays;
    
                    return meetsMinimum && meetsMaximum;
                });
    
            return {
                key: definition.key,
                label: definition.label,
                description: definition.description,
                tone: definition.tone,
                symbol: definition.symbol,
                count: matchingMembers.length,
                members: matchingMembers,
            };
        });

    const readyToVqDefinitions = [
        {
            key: "ready-now",
            label: "Ready Now",
            description:
                "15+ posts, no Qs, active within 60 days",
            tone: "positive",
            symbol: "★",
            minimumPosts: 15,
            maximumPosts: null,
        },
        {
            key: "strong-candidate",
            label: "Strong Candidate",
            description:
                "8–14 posts, no Qs, active within 60 days",
            tone: "positive",
            symbol: "↗",
            minimumPosts: 8,
            maximumPosts: 14,
        },
        {
            key: "on-the-radar",
            label: "On the Radar",
            description:
                "4–7 posts, no Qs, active within 60 days",
            tone: "neutral",
            symbol: "→",
            minimumPosts: 4,
            maximumPosts: 7,
        },
    ];

    const readyToVqCandidates = members
        .filter(member => member.status !== "inactive")
        .map(member => {

            const posts =
                getEffectivePostCount(member.id);

            const stats =
                memberStats.find(item =>
                    item.memberId === member.id ||
                    item.member_id === member.id
                );

            const qs =
                stats?.qs ??
                stats?.qs_count ??
                0;

            const lastPostDate =
                getEffectiveLastPostDate(member.id);

            const firstPostDate =
                stats?.firstPostDate ??
                stats?.first_post_date ??
                null;

            return {
                memberId: member.id,

                paxName:
                    member.paxName ||
                    member.pax_name ||
                    member.realName ||
                    member.real_name,

                posts,
                qs,

                firstPostDate,
                lastPostDate,

                daysSinceLastPost:
                    getDaysSinceDate(lastPostDate),

                daysSinceFirstPost:
                    getDaysSinceDate(firstPostDate),
            };
        })
        .filter(member => {

            if (member.qs > 0) {
                return false;
            }

            if (member.posts < 4) {
                return false;
            }

            if (
                member.daysSinceLastPost === null ||
                member.daysSinceLastPost > 60
            ) {
                return false;
            }

            if (
                member.daysSinceFirstPost === null ||
                member.daysSinceFirstPost < 21
            ) {
                return false;
            }

            return true;
        });

        const readyToVq =
            readyToVqDefinitions.map(definition => {
        
                const members =
                    readyToVqCandidates.filter(member => {
        
                        if (
                            member.posts <
                            definition.minimumPosts
                        ) {
                            return false;
                        }
        
                        if (
                            definition.maximumPosts !== null &&
                            member.posts >
                            definition.maximumPosts
                        ) {
                            return false;
                        }
        
                        return true;
                    });
        
                return {
                    ...definition,
                    count: members.length,
                    members,
                };
            });

            const readyToQAgainCandidates = members
    .filter(member => {
        return member.status !== "inactive";
    })
    .map(member => {
        const qCount =
            getEffectiveQCount(member.id);

        const lastQDate =
            getEffectiveLastQDate(member.id);

        const lastPostDate =
            getEffectiveLastPostDate(member.id);

        return {
            memberId: member.id,

            paxName:
                member.paxName ||
                member.pax_name ||
                member.realName ||
                member.real_name ||
                "Unnamed PAX",

            qCount,
            lastQDate,
            lastPostDate,

            daysSinceLastQ:
                getDaysSinceDate(lastQDate),

            daysSinceLastPost:
                getDaysSinceDate(lastPostDate),
        };
    })
    .filter(member => {
        if (member.qCount < 1) {
            return false;
        }

        if (
            member.daysSinceLastQ === null ||
            member.daysSinceLastQ < 45
        ) {
            return false;
        }

        if (
            member.daysSinceLastPost === null ||
            member.daysSinceLastPost > 60
        ) {
            return false;
        }

        return true;
    })
    .sort((a, b) => {
        return (
            b.daysSinceLastQ -
            a.daysSinceLastQ
        );
    });

const readyToQAgainDefinitions = [
    {
        key: "due-soon",
        label: "Due Soon",
        description:
            "Last Q was 45–74 days ago",
        tone: "neutral",
        symbol: "→",
        minimumDays: 45,
        maximumDays: 74,
    },
    {
        key: "ready-again",
        label: "Ready Again",
        description:
            "Last Q was 75–119 days ago",
        tone: "warning",
        symbol: "↗",
        minimumDays: 75,
        maximumDays: 119,
    },
    {
        key: "long-overdue",
        label: "Long Overdue",
        description:
            "Last Q was 120 or more days ago",
        tone: "danger",
        symbol: "!",
        minimumDays: 120,
        maximumDays: null,
    },
];

const readyToQAgain =
    readyToQAgainDefinitions.map(definition => {
        const matchingMembers =
            readyToQAgainCandidates.filter(member => {
                const meetsMinimum =
                    member.daysSinceLastQ >=
                    definition.minimumDays;

                const meetsMaximum =
                    definition.maximumDays === null ||
                    member.daysSinceLastQ <=
                    definition.maximumDays;

                return meetsMinimum && meetsMaximum;
            });

        return {
            ...definition,
            count: matchingMembers.length,
            members: matchingMembers,
        };
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
        paxAcceleration: accelerationBuckets,
        checkTheSix,
        readyToVq,
        readyToQAgain,
        postingFrequency,
    };
}