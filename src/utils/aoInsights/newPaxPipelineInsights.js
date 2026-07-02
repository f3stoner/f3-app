function getSessionDate(session) {
    if (!session?.date) return null;
    return new Date(`${session.date}T00:00:00`);
}

function countAttendance(session) {
    const attendeeIds = Array.isArray(session?.attendeeIds)
        ? session.attendeeIds
        : [];

    const fngs = Array.isArray(session?.fngs) ? session.fngs : [];

    const rosteredFngIds = fngs
        .map((fng) => fng?.memberId)
        .filter(Boolean);

    const unrosteredFngCount = fngs.filter((fng) => !fng?.memberId).length;

    const uniqueKnownIds = new Set([...attendeeIds, ...rosteredFngIds]);

    return uniqueKnownIds.size + unrosteredFngCount;
}

function getMemberIdFromFng(fng) {
    return fng?.memberId || null;
}

function getFngDisplayName(fng) {
    return fng?.paxName || fng?.name || fng?.f3Name || "Unnamed FNG";
}

function summarizeFngsInWindow(sessions, startDate, endDate) {
    const fngs = [];

    sessions.forEach((session) => {
        const sessionDate = getSessionDate(session);
        if (!sessionDate || sessionDate < startDate || sessionDate > endDate) return;

        (session.fngs || []).forEach((fng) => {
            fngs.push({
                memberId: getMemberIdFromFng(fng),
                name: getFngDisplayName(fng),
                firstPostDate: session.date,
                session,
                fng,
            });
        });
    });

    return fngs;
}

function getMemberStats(memberId, memberStats = []) {
    if (!memberId) return null;

    return memberStats.find((stat) => {
        return stat.memberId === memberId || stat.member_id === memberId;
    }) || null;
}

function getStatPostCount(stat) {
    return (
        stat?.totalPosts ??
        stat?.total_posts ??
        stat?.posts ??
        stat?.postCount ??
        stat?.post_count ??
        stat?.attendanceCount ??
        stat?.attendance_count ??
        stat?.totalAttendance ??
        stat?.total_attendance ??
        null
    );
}

function getStatLastPostDate(stat) {
    return (
        stat?.lastPostDate ??
        stat?.last_post_date ??
        stat?.lastPostedAt ??
        stat?.last_posted_at ??
        null
    );
}

function getPostDatesByMemberId(sessions) {
    const posts = new Map();

    sessions.forEach((session) => {
        const sessionDate = getSessionDate(session);
        if (!sessionDate) return;

        const attendeeIds = Array.isArray(session.attendeeIds)
            ? session.attendeeIds
            : [];

        const fngMemberIds = Array.isArray(session.fngs)
            ? session.fngs.map(getMemberIdFromFng).filter(Boolean)
            : [];

        const memberIds = new Set([...attendeeIds, ...fngMemberIds]);

        memberIds.forEach((memberId) => {
            if (!posts.has(memberId)) posts.set(memberId, []);
            posts.get(memberId).push(session.date);
        });
    });

    posts.forEach((dates, memberId) => {
        posts.set(memberId, [...new Set(dates)].sort());
    });

    return posts;
}

function calculateNewPaxPipelineMetrics(sessions = [], options = {}) {
    const {
        anchorDate,
        windowDays = 28,
        memberStats = [],
    } = options;

    const endDate = anchorDate
        ? new Date(`${anchorDate}T23:59:59`)
        : new Date();

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - windowDays);

    const fngs = summarizeFngsInWindow(sessions, startDate, endDate);
    const postsByMemberId = getPostDatesByMemberId(sessions);

    const enrichedFngs = fngs.map((fng) =>
        enrichFng(fng, postsByMemberId, memberStats)
    );
    const rosteredFngs = enrichedFngs.filter((fng) => fng.memberId);
    const unrosteredFngs = enrichedFngs.filter((fng) => !fng.memberId);

    const returnedFngs = rosteredFngs.filter((fng) => fng.postCount >= 2);
    const buildingHabit = rosteredFngs.filter((fng) => fng.postCount >= 5);
    const newRegulars = rosteredFngs.filter((fng) => fng.postCount >= 10);
    const needsFollowUp = rosteredFngs.filter((fng) => fng.postCount < 2);


    return {
        fngCount: fngs.length,
        rosteredFngCount: rosteredFngs.length,
        unrosteredFngCount: unrosteredFngs.length,
        returnedCount: returnedFngs.length,
        buildingHabitCount: buildingHabit.length,
        newRegularCount: newRegulars.length,
        needsFollowUpCount: needsFollowUp.length,
        fngs: enrichedFngs,
        rosteredFngs,
        unrosteredFngs,
        returnedFngs,
        buildingHabit,
        newRegulars,
        needsFollowUp,
    };
}

function findNewPaxPipelinePatterns(metrics) {
    return {
        hasNewRegulars: metrics.newRegularCount > 0,
        hasFngs: metrics.fngCount > 0,
        hasReturnedFngs: metrics.returnedCount > 0,
        hasFollowUpNeed: metrics.needsFollowUpCount > 0,
        hasRosterGaps: metrics.unrosteredFngCount > 0,
    };
}

function buildNewPaxPipelineNarrative(metrics, patterns) {
    if (patterns.hasNewRegulars) {
        return {
            title: "New PAX Pipeline",
            status: "up",
            headline: "New Regulars",
            story: `${metrics.newRegularCount} new PAX reached 10 beatdowns. That is a major retention milestone.`,
            action: "Recognize the new regulars and keep pulling them into the AO.",
        };
    }

    if (!patterns.hasFngs) {
        return {
            title: "New PAX Pipeline",
            status: "stable",
            headline: "Quiet Month",
            story: "No FNGs were logged in the last month.",
            action: "Consider making EH a focus this month.",
        };
    }

    if (patterns.hasReturnedFngs) {
        return {
            title: "New PAX Pipeline",
            status: "up",
            headline: "Converting",
            story: `${metrics.fngCount} FNGs posted, and ${metrics.returnedCount} have already returned for another beatdown.`,
            action: "Keep following up while momentum is fresh.",
        };
    }

    return {
        title: "New PAX Pipeline",
        status: "down",
        headline: "Needs Follow-Up",
        story: `${metrics.fngCount} FNGs posted, but none have returned yet.`,
        action: "Follow up with recent FNGs and their inviters.",
    };
}

export function buildNewPaxPipelineInsight(sessions = [], options = {}) {
    const metrics = calculateNewPaxPipelineMetrics(sessions, options);
    const patterns = findNewPaxPipelinePatterns(metrics);
    const narrative = buildNewPaxPipelineNarrative(metrics, patterns);

    return {
        ...narrative,
        metrics,
        patterns,
    };
}

function enrichFng(fng, postsByMemberId, memberStats = []) {
    const stat = getMemberStats(fng.memberId, memberStats);

    const postDates = fng.memberId
        ? postsByMemberId.get(fng.memberId) || []
        : [fng.firstPostDate];

    const statsPostCount = getStatPostCount(stat);
    const statsLastPostDate = getStatLastPostDate(stat);

    const postCount = statsPostCount ?? postDates.length;
    const lastPostDate =
        statsLastPostDate ||
        postDates[postDates.length - 1] ||
        fng.firstPostDate;

    let pipelineStatus = "Needs follow-up";

    if (postCount >= 10) {
        pipelineStatus = "Regular";
    } else if (postCount >= 5) {
        pipelineStatus = "Building habit";
    } else if (postCount >= 2) {
        pipelineStatus = "Returned";
    }

    return {
        ...fng,
        postDates,
        postCount,
        lastPostDate,
        pipelineStatus,
        memberStat: stat,
    };
}