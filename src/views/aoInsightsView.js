import { state } from "../modules/state.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";
import { createAppHeader } from "../components/appHeader.js";
import {
    loadAoInsightMonths,
    loadAoInsightSessions,
    loadRegionMilestoneCrossings,
} from "../services/cloudData.js";
import { goBack } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { canViewAoInsights, canViewAnyAoInsights } from "../utils/permissions.js";
import { showToast } from "../utils/toast.js";
import { buildAttendanceInsight } from "../utils/aoInsights/attendanceInsights.js";
import { buildNewPaxPipelineInsight } from "../utils/aoInsights/newPaxPipelineInsights.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import {
    getRosteredAttendanceIdSet,
    getTotalAttendanceCount,
} from "../utils/sessionAttendance.js";
import { createHorizontalBarChartSection } from "../components/regionInsights/charts.js";
import { buildRegionInsights } from "../modules/insights.js";

const AO_INSIGHT_LOOKBACK_DAYS = 180;

const REGION_POST_MILESTONES = [
    10,
    25,
    50,
    75,
    100,
    150,
    200,
    250,
    300,
    400,
    500,
    750,
    1000,
];

function createMetricCard(label, value) {
    const card = document.createElement("div");
    card.classList.add(
        "stat-tile",
        "ao-insights-metric-card"
    );

    const valueEl = document.createElement("div");
    valueEl.classList.add(
        "stat-value",
        "ao-insights-metric-value"
    );
    valueEl.textContent = value;

    const labelEl = document.createElement("div");
    labelEl.classList.add(
        "stat-label",
        "ao-insights-metric-label"
    );
    labelEl.textContent = label;

    card.append(valueEl, labelEl);

    return card;
}

function createInsightCard({ title, headline, story, tone, onClick }) {
    const card = document.createElement("div");
    card.classList.add(
        "section",
        "insight-briefing-card",
        "ao-insights-briefing-card"
    );

    if (tone) {
        card.classList.add(`insight-briefing-${tone}`);
    }

    if (onClick) {
        card.classList.add("clickable-stat-tile");
        card.addEventListener("click", onClick);
    }

    const eyebrow = document.createElement("div");
    eyebrow.classList.add("insight-briefing-label");
    eyebrow.textContent = title;

    const headlineEl = document.createElement("h3");
    headlineEl.classList.add("insight-briefing-headline");
    headlineEl.textContent = headline;

    const storyEl = document.createElement("p");
    storyEl.classList.add("insight-briefing-story");
    storyEl.textContent = story;

    card.append(eyebrow, headlineEl, storyEl);

    return card;
}

function createInsightsRow({ title, subtitle, value, onClick, tone }) {
    const row = document.createElement("div");
    row.classList.add(
        "insights-row",
        "ao-insights-row"
    );

    if (tone) {
        row.classList.add(`insights-row-${tone}`);
    }

    const left = document.createElement("div");
    left.classList.add(
        "insights-row-left",
        "ao-insights-row-content"
    );

    const titleEl = document.createElement("div");
    titleEl.classList.add(
        "insights-row-title",
        "ao-insights-row-title"
    );
    titleEl.textContent = title;

    const subtitleEl = document.createElement("div");
    subtitleEl.classList.add(
        "insights-row-subtitle",
        "ao-insights-row-subtitle"
    );
    subtitleEl.textContent = subtitle;

    left.append(titleEl, subtitleEl);

    const valueEl = document.createElement("div");
    valueEl.classList.add(
        "insights-row-value",
        "ao-insights-row-value"
    );
    valueEl.textContent = value;

    if (onClick) {
        row.classList.add("clickable-row");
        row.addEventListener("click", onClick);
    }

    row.append(left, valueEl);

    return row;
}


function getMemberName(memberId) {
    const member = state.members.find(m => m.id === memberId);
    return member?.paxName || "Unknown";
}

function normalizeAoName(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function memberBelongsToAo(memberId, aoName) {
    const member = state.members.find(item => item.id === memberId);

    const memberStats =
        state.memberStatsByMemberId?.[memberId] ||
        state.memberStats.find(stats => stats.memberId === memberId);

    const targetAo = normalizeAoName(aoName);
    const favoriteAo = normalizeAoName(memberStats?.favoriteAo);
    const homeAo = normalizeAoName(member?.homeAo);

    return favoriteAo === targetAo || homeAo === targetAo;
}

function getSessionQIds(session) {
    return Array.isArray(session.qIds)
        ? session.qIds
        : session.qId
            ? [session.qId]
            : [];
}

function getAttendanceStability(sessions) {
    if (sessions.length < 3) {
        return {
            label: "Not enough data",
            subtitle: "Need at least 3 sessions to evaluate stability.",
        };
    }

    const counts = sessions.map(getTotalAttendanceCount);

    const average =
        counts.reduce((sum, count) => sum + count, 0) / counts.length;

    const variance =
        counts.reduce((sum, count) => {
            return sum + Math.pow(count - average, 2);
        }, 0) / counts.length;

    const standardDeviation = Math.sqrt(variance);
    const roundedDeviation = Math.round(standardDeviation * 10) / 10;

    if (standardDeviation <= 3) {
        return {
            label: "Consistent",
            subtitle: `Attendance usually stays within about ${roundedDeviation} PAX.`,
        };
    }

    if (standardDeviation <= 6) {
        return {
            label: "Normal Variation",
            subtitle: `Attendance varies by about ${roundedDeviation} PAX, which is normal for most AOs.`,
        };
    }

    return {
        label: "Wide Swings",
        subtitle: `Attendance is swinging by about ${roundedDeviation} PAX from session to session.`,
    };
}

function getPotentialNewQs({ aoSessions, allAoSessions }) {
    const qIds = new Set();

    allAoSessions.forEach(session => {
        getSessionQIds(session).forEach(qId => qIds.add(qId));
    });

    const attendanceCounts = new Map();

    aoSessions.forEach(session => {
        getRosteredAttendanceIdSet(session).forEach(memberId => {
            attendanceCounts.set(
                memberId,
                (attendanceCounts.get(memberId) || 0) + 1
            );
        });
    });

    return [...attendanceCounts.entries()]
        .filter(([memberId, postCount]) => {
            return postCount >= 3 && !qIds.has(memberId);
        })
        .map(([memberId, postCount]) => ({
            memberId,
            paxName: getMemberName(memberId),
            postCount,
        }))
        .sort((a, b) => b.postCount - a.postCount);
}

function getMonthStart(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthEnd(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
}

function shiftMonth(dateString, offset) {
    const date = new Date(`${dateString}T00:00:00`);
    date.setMonth(date.getMonth() + offset);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}-01`;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getLastCompletedWeekRange(referenceDate = new Date()) {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);

    // F3 reporting week: Monday through Saturday.
    const daysBackToSaturday = date.getDay() === 0
        ? 1
        : date.getDay() + 1;

    const end = new Date(date);
    end.setDate(end.getDate() - daysBackToSaturday);

    const start = new Date(end);
    start.setDate(start.getDate() - 5);

    return {
        startDate: formatDateKey(start),
        endDate: formatDateKey(end),
    };
}

function formatMonthLabel(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
}

function getAvailableAos() {
    return state.aos
        .filter(ao => ao.isActive !== false)
        .filter(ao => canViewAoInsights(ao.id))
        .filter(ao => ao.id && ao.name)
        .map(ao => ({
            aoId: ao.id,
            aoName: ao.name,
        }))
        .sort((a, b) => a.aoName.localeCompare(b.aoName));
}

function getAdjacentAo(currentAoId, offset) {
    const availableAos = getAvailableAos();

    if (availableAos.length === 0) return null;

    const currentIndex = availableAos.findIndex(
        ao => ao.aoId === currentAoId
    );

    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
        (safeIndex + offset + availableAos.length) %
        availableAos.length;

    return availableAos[nextIndex];
}

function formatMonthKey(monthKey) {
    return formatMonthLabel(`${monthKey}-01`);
}

async function openMonthPicker(insights) {
    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay", "bottom-sheet-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal", "bottom-sheet-modal");

    const title = document.createElement("h2");
    title.textContent = "Select Month";

    const helper = document.createElement("div");
    helper.classList.add("stats-line");
    helper.textContent = "Loading months...";

    const list = document.createElement("div");
    list.classList.add("insights-picker-list");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.classList.add("secondary-button");
    closeButton.textContent = "Cancel";
    closeButton.addEventListener("click", () => overlay.remove());

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });

    modal.append(title, helper, list, closeButton);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    try {
        const currentMonthKey = insights.startDate.slice(0, 7);

        const monthKeys = await loadAoInsightMonths({
            regionId: state.currentRegionId,
            aoId: insights.aoId,
        });

        helper.textContent = monthKeys.length
            ? "Showing months with logged sessions."
            : "No logged months found for this AO.";

        list.textContent = "";

        monthKeys.forEach(monthKey => {
            const button = document.createElement("button");
            button.type = "button";
            button.classList.add("insights-picker-option");
            button.textContent = formatMonthKey(monthKey);

            if (monthKey === currentMonthKey) {
                button.classList.add("active");
            }

            button.addEventListener("click", () => {
                const newStartDate = `${monthKey}-01`;

                state.selectedAoInsights = {
                    ...state.selectedAoInsights,
                    startDate: getMonthStart(newStartDate),
                    endDate: getMonthEnd(newStartDate),
                };

                overlay.remove();
                renderAoInsightsView();
            });

            list.appendChild(button);
        });
    } catch (error) {
        console.error("Failed to load AO insight months", error);
        helper.textContent = "Could not load months.";
    }
}

function openAoPicker(currentAoId) {
    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay", "bottom-sheet-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal", "bottom-sheet-modal");

    const title = document.createElement("h2");
    title.textContent = "Select AO";

    const list = document.createElement("div");
    list.classList.add("insights-picker-list");

    getAvailableAos().forEach(ao => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("insights-picker-option");
        button.textContent = ao.aoName;

        if (ao.aoId === currentAoId) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            state.selectedAoInsights = {
                ...state.selectedAoInsights,
                aoId: ao.aoId,
                aoName: ao.aoName,
            };

            overlay.remove();
            renderAoInsightsView();
        });

        list.appendChild(button);
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.classList.add("secondary-button");
    closeButton.textContent = "Cancel";
    closeButton.addEventListener("click", () => overlay.remove());

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });

    modal.append(title, list, closeButton);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function createInsightsNav(insights) {
    const nav = document.createElement("div");
    nav.classList.add(
        "insights-nav",
        "ao-insights-nav"
    );

    const availableAos = getAvailableAos();
    const showAoNavigation = availableAos.length > 1;

    const aoRow = document.createElement("div");
    aoRow.classList.add(
        "insights-nav-row",
        "ao-insights-nav-row",
        "ao-insights-ao-row"
    );

    const previousAoButton = document.createElement("button");
    previousAoButton.type = "button";
    previousAoButton.classList.add("insights-nav-arrow", "ao-insights-nav-arrow");
    previousAoButton.textContent = "‹";
    previousAoButton.addEventListener("click", () => {
        const previousAo = getAdjacentAo(insights.aoId, -1);
    
        if (!previousAo) return;
    
        state.selectedAoInsights = {
            ...state.selectedAoInsights,
            aoId: previousAo.aoId,
            aoName: previousAo.aoName,
        };
    
        renderAoInsightsView();
    });

    const aoTitle = document.createElement("button");
    aoTitle.type = "button";
    aoTitle.classList.add(
        "insights-nav-title",
        "ao-insights-nav-title",
        "ao-insights-ao-title"
    );
    aoTitle.textContent = insights.aoName.toUpperCase();
    aoTitle.addEventListener("click", () => {
        openAoPicker(insights.aoId);
    });

    const nextAoButton = document.createElement("button");
    nextAoButton.type = "button";
    nextAoButton.classList.add("insights-nav-arrow", "ao-insights-nav-arrow");
    nextAoButton.textContent = "›";
    nextAoButton.addEventListener("click", () => {
        const nextAo = getAdjacentAo(insights.aoId, 1);
    
        if (!nextAo) return;
    
        state.selectedAoInsights = {
            ...state.selectedAoInsights,
            aoId: nextAo.aoId,
            aoName: nextAo.aoName,
        };
    
        renderAoInsightsView();
    });

    aoRow.append(previousAoButton, aoTitle, nextAoButton);

    const monthRow = document.createElement("div");
    monthRow.classList.add(
        "insights-nav-row",
        "insights-nav-row-secondary",
        "ao-insights-nav-row",
        "ao-insights-month-row"
    );

    const previousMonthButton = document.createElement("button");
    previousMonthButton.type = "button";
    previousMonthButton.classList.add("insights-nav-arrow", "ao-insights-nav-arrow");
    previousMonthButton.textContent = "‹";
    previousMonthButton.addEventListener("click", () => {
        const newStartDate = shiftMonth(insights.startDate, -1);

        state.selectedAoInsights = {
            ...state.selectedAoInsights,
            startDate: getMonthStart(newStartDate),
            endDate: getMonthEnd(newStartDate),
        };

        renderAoInsightsView();
    });

    const monthTitle = document.createElement("button");
    monthTitle.type = "button";
    monthTitle.classList.add(
        "insights-nav-title",
        "insights-nav-title-secondary",
        "ao-insights-nav-title",
        "ao-insights-month-title"
    );
    monthTitle.textContent = formatMonthLabel(insights.startDate);
    monthTitle.addEventListener("click", () => {
        openMonthPicker(insights);
    });

    const nextMonthButton = document.createElement("button");
    nextMonthButton.type = "button";
    nextMonthButton.classList.add("insights-nav-arrow", "ao-insights-nav-arrow");
    nextMonthButton.textContent = "›";
    nextMonthButton.addEventListener("click", () => {
        const newStartDate = shiftMonth(insights.startDate, 1);

        state.selectedAoInsights = {
            ...state.selectedAoInsights,
            startDate: getMonthStart(newStartDate),
            endDate: getMonthEnd(newStartDate),
        };

        renderAoInsightsView();
    });

    monthRow.append(previousMonthButton, monthTitle, nextMonthButton);

    if (showAoNavigation) {
        nav.appendChild(aoRow);
    }
    
    nav.appendChild(monthRow);

    return nav;
}

const WEEKDAY_DEFINITIONS = [
    { dayIndex: 1, label: "Monday" },
    { dayIndex: 2, label: "Tuesday" },
    { dayIndex: 3, label: "Wednesday" },
    { dayIndex: 4, label: "Thursday" },
    { dayIndex: 5, label: "Friday" },
    { dayIndex: 6, label: "Saturday" },
    { dayIndex: 0, label: "Sunday" },
];

function getSessionsInDateRange(sessions, startDate, endDate) {
    return sessions.filter(session => {
        if (!session.date) return false;

        return (
            session.date >= startDate &&
            session.date <= endDate
        );
    });
}

function getWeekdayAttendanceAverages(sessions) {
    const attendanceByDay = new Map();

    sessions.forEach(session => {
        if (!session.date) return;

        const date = new Date(`${session.date}T00:00:00`);
        const dayIndex = date.getDay();

        const current = attendanceByDay.get(dayIndex) || {
            totalAttendance: 0,
            sessionCount: 0,
        };

        current.totalAttendance += getTotalAttendanceCount(session);
        current.sessionCount += 1;

        attendanceByDay.set(dayIndex, current);
    });

    return WEEKDAY_DEFINITIONS.map(({ dayIndex, label }) => {
        const totals = attendanceByDay.get(dayIndex);

        return {
            dayIndex,
            label,
            sessionCount: totals?.sessionCount || 0,
            averageAttendance: totals?.sessionCount
                ? Math.round(
                    (
                        totals.totalAttendance /
                        totals.sessionCount
                    ) * 10
                ) / 10
                : null,
        };
    });
}

function buildWeekdayAttendanceComparison({
    currentSessions,
    historySessions,
    startDate,
}) {
    const previousMonthStart = shiftMonth(startDate, -1);
    const previousMonthEnd = getMonthEnd(previousMonthStart);

    const previousSessions = getSessionsInDateRange(
        historySessions,
        previousMonthStart,
        previousMonthEnd
    );

    const currentAverages =
        getWeekdayAttendanceAverages(currentSessions);

    const previousAverages =
        getWeekdayAttendanceAverages(previousSessions);

    const previousByDay = new Map(
        previousAverages.map(item => [
            item.dayIndex,
            item,
        ])
    );

    return currentAverages
        .filter(item => item.sessionCount > 0)
        .map(item => {
            const previous = previousByDay.get(item.dayIndex);

            const previousAverage =
                previous?.averageAttendance ?? null;

            const delta =
                previousAverage === null
                    ? null
                    : Math.round(
                        (
                            item.averageAttendance -
                            previousAverage
                        ) * 10
                    ) / 10;

            let tone = "neutral";

            if (delta !== null && delta >= 1) {
                tone = "positive";
            } else if (delta !== null && delta <= -1) {
                tone = "negative";
            }

            return {
                ...item,
                previousAverage,
                previousSessionCount:
                    previous?.sessionCount || 0,
                delta,
                tone,
            };
        });
}

function buildAoInsights({
    aoId,
    aoName,
    startDate,
    endDate,
    sessions: loadedSessions = null,
    insightHistorySessions = null,
}) {
    const sessions = loadedSessions || [];
    const historySessions = insightHistorySessions || sessions;

    const allAoSessions = state.sessions.filter(
        session => session.aoId === aoId
    );

    const totalSessions = sessions.length;

    const attendanceInsight = buildAttendanceInsight(historySessions, {
        anchorDate: endDate,
    });
    
    const newPaxPipelineInsight = buildNewPaxPipelineInsight(historySessions, {
        anchorDate: endDate,
        memberStats: state.memberStats,
        members: state.members,
    });

    //TODO: Replace with attendanceInsight.metrics once the old snapshot cards are retired

    const totalAttendance = sessions.reduce((sum, session) => {
        return sum + getTotalAttendanceCount(session);
    }, 0);

    const averageAttendance = totalSessions
        ? Math.round((totalAttendance / totalSessions) * 10) / 10
        : 0;

    const totalFngs = sessions.reduce((sum, session) => {
        return sum + (session.fngs?.length || 0);
    }, 0);

    const qCounts = new Map();

    sessions.forEach(session => {
        getSessionQIds(session).forEach(qId => {
            qCounts.set(qId, (qCounts.get(qId) || 0) + 1);
        });
    });

    const qRotation = [...qCounts.entries()]
        .map(([memberId, qCount]) => ({
            memberId,
            paxName: getMemberName(memberId),
            qCount,
            share: totalSessions
                ? Math.round((qCount / totalSessions) * 100)
                : 0,
        }))
        .sort((a, b) => b.qCount - a.qCount);

        const topThreeQCount = qRotation
        .slice(0, 3)
        .reduce((sum, q) => sum + q.qCount, 0);
    
    const topThreeQShare = totalSessions
        ? Math.round((topThreeQCount / totalSessions) * 100)
        : 0;
    
    const attendanceStability = getAttendanceStability(sessions);
    
    const potentialNewQs = getPotentialNewQs({
        aoSessions: sessions,
        allAoSessions,
    });

    const strongEmergingQs = potentialNewQs.filter(member => member.postCount >= 5);

    const topQ = qRotation[0] || null;
    const uniqueQs = qRotation.length;

    let leadershipRisk = "Healthy";
    let leadershipRiskSubtitle = "Q rotation looks balanced.";
    
    if (totalSessions >= 3 && uniqueQs <= 1) {
        leadershipRisk = "Critical";
        leadershipRiskSubtitle = "One Q carried all sessions this month.";
    } else if (topQ && totalSessions >= 3 && topQ.share >= 40) {
        leadershipRisk = "High";
        leadershipRiskSubtitle = `${topQ.paxName} led ${topQ.share}% of sessions.`;
    } else if (topQ && totalSessions >= 3 && topQ.share >= 30) {
        leadershipRisk = "Watch";
        leadershipRiskSubtitle = `${topQ.paxName} led ${topQ.share}% of sessions.`;
    } else if (totalSessions >= 4 && uniqueQs <= 2) {
        leadershipRisk = "Watch";
        leadershipRiskSubtitle = "Q rotation is fairly narrow this month.";
    }
    const recentSessions = [...sessions].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);

        const aCreatedAt = a.createdAt || 0;
        const bCreatedAt = b.createdAt || 0;

        return bCreatedAt - aCreatedAt;
    });

    const weekdayAttendanceComparison =
        buildWeekdayAttendanceComparison({
            currentSessions: sessions,
            historySessions,
            startDate,
    });

    return {
        aoId,
        aoName,
        startDate,
        endDate,
        totalSessions,
        totalAttendance,
        averageAttendance,
        totalFngs,
        uniqueQs,
        qRotation,
        topQ,
        topThreeQShare,
        potentialNewQs,
        attendanceStability,
        leadershipRisk,
        leadershipRiskSubtitle,
        recentSessions,
        strongEmergingQs,
        attendanceInsight,
        newPaxPipelineInsight,
        weekdayAttendanceComparison,
    };
}

function createCollapsibleSection({
    title,
    content,
    defaultExpanded = false,
    badge = null,
}) {
    const section = document.createElement("div");
    section.classList.add(
        "section",
        "ao-insights-section",
        "ao-insights-collapsible-section"
    );

    const header = document.createElement("button");
    header.type = "button";
    header.classList.add("collapsible-header");

    const left = document.createElement("div");
    left.classList.add("collapsible-header-left");

    const titleEl = document.createElement("div");
    titleEl.classList.add(
        "insights-section-title",
        "ao-insights-section-title"
    );
    titleEl.textContent = title;

    left.appendChild(titleEl);

    if (badge !== null) {
        const badgeEl = document.createElement("span");
        badgeEl.classList.add("section-badge");
        badgeEl.textContent = badge;
        left.appendChild(badgeEl);
    }

    const arrow = document.createElement("span");
    arrow.classList.add("collapsible-arrow");
    arrow.textContent = defaultExpanded ? "▼" : "▶";

    header.append(left, arrow);

    const body = document.createElement("div");
    body.classList.add("collapsible-body");

    if (!defaultExpanded) {
        body.style.display = "none";
    }

    body.appendChild(content);

    header.addEventListener("click", () => {
        const expanded = body.style.display !== "none";

        body.style.display = expanded ? "none" : "";
        arrow.textContent = expanded ? "▶" : "▼";
    });

    section.append(header, body);

    return section;
}

function createSection(title, content) {
    const section = document.createElement("div");
    section.classList.add(
        "section",
        "ao-insights-section"
    );

    const heading = document.createElement("div");
    heading.classList.add(
        "insights-section-title",
        "ao-insights-section-title"
    );
    heading.textContent = title;

    section.append(heading, content);

    return section;
}

function createLeadershipActionSection({
    title,
    description,
    groups,
    onGroupClick,
    emptyMessage = "No leadership action data available.",
}) {
    const section = document.createElement("section");
    section.classList.add(
        "section",
        "ao-insights-section",
        "ao-insights-leadership-action-section",
        "leadership-action-section"
    );

    const heading = document.createElement("div");
    heading.classList.add(
        "insights-section-title",
        "ao-insights-section-title"
    );
    heading.textContent = title;

    const descriptionEl = document.createElement("div");
    descriptionEl.classList.add("leadership-action-description");
    descriptionEl.textContent = description;

    if (!groups.length) {
        const empty = document.createElement("div");
        empty.classList.add("empty-state");
        empty.textContent = emptyMessage;

        section.append(heading, descriptionEl, empty);
        return section;
    }

    const groupList = document.createElement("div");
    groupList.classList.add("leadership-action-groups");

    groups.forEach(group => {
        const hasMembers = group.count > 0;

        const card = document.createElement("button");
        card.type = "button";
        card.disabled = !hasMembers || !onGroupClick;
        card.classList.add(
            "leadership-action-card",
            `leadership-action-${group.tone || "neutral"}`
        );

        if (!hasMembers) {
            card.classList.add("empty");
        }

        if (hasMembers && onGroupClick) {
            card.addEventListener("click", () => {
                onGroupClick(group);
            });
        }

        const main = document.createElement("div");
        main.classList.add("leadership-action-main");

        const symbol = document.createElement("div");
        symbol.classList.add("leadership-action-symbol");
        symbol.textContent = group.symbol || "→";

        const text = document.createElement("div");
        text.classList.add("leadership-action-text");

        const label = document.createElement("div");
        label.classList.add("leadership-action-label");
        label.textContent = group.label;

        const groupDescription = document.createElement("div");
        groupDescription.classList.add("leadership-action-group-description");
        groupDescription.textContent = group.description || "";

        const count = document.createElement("div");
        count.classList.add("leadership-action-count");
        count.textContent = group.count;

        text.append(label, groupDescription);
        main.append(symbol, text, count);
        card.appendChild(main);
        groupList.appendChild(card);
    });

    section.append(heading, descriptionEl, groupList);

    return section;
}

function createAoMilestoneSection({
    crossings,
    startDate,
    endDate,
    onMemberClick,
}) {
    const section = document.createElement("section");
    section.classList.add(
        "section",
        "ao-insights-section",
        "ao-insights-leadership-action-section"
    );

    const startLabel = new Date(`${startDate}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });

    const endLabel = new Date(`${endDate}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });

    const heading = document.createElement("div");
    heading.classList.add(
        "insights-section-title",
        "ao-insights-section-title"
    );
    heading.textContent = `Weekly Post Milestones • ${startLabel}–${endLabel}`;

    const list = document.createElement("div");
    list.classList.add("insights-list");

    if (!crossings.length) {
        const empty = document.createElement("div");
        empty.classList.add("empty-state");
        empty.textContent =
            "No PAX who posted at this AO crossed a regional milestone during the week.";

        list.appendChild(empty);
    } else {
        crossings
            .sort((a, b) => {
                if (b.milestone !== a.milestone) {
                    return b.milestone - a.milestone;
                }

                return a.paxName.localeCompare(b.paxName);
            })
            .forEach(crossing => {
                const postLabel = crossing.postsInPeriod === 1
                    ? "post"
                    : "posts";

                list.appendChild(createInsightsRow({
                    title: `${crossing.paxName} reached ${crossing.milestone} posts`,
                    subtitle:
                        `${crossing.postsInPeriod} ${postLabel} during the week • ` +
                        `${crossing.startingTotal} → ${crossing.endingTotal}`,
                    value: crossing.milestone,
                    onClick: () => onMemberClick(crossing),
                }));
            });
    }

    section.append(heading, list);

    return section;
}

function createAoInsightsSectionSelector({ selectedSection, onSelect }) {
    const selector = document.createElement("div");
    selector.classList.add(
        "region-trend-selector",
        "ao-insights-section-selector",
        "ao-insights-primary-tabs"
    );

    [
        { id: "overview", label: "Overview" },
        { id: "leadership", label: "Leadership" },
    ].forEach(section => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add(
            "region-trend-button",
            "ao-insights-primary-tab"
        );
        button.textContent = section.label;

        if (selectedSection === section.id) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            if (selectedSection === section.id) return;
            onSelect(section.id);
        });

        selector.appendChild(button);
    });

    return selector;
}

export async function renderAoInsightsView() {
    const app = document.getElementById("app");

    app.replaceChildren();
    app.className = "view-aoInsights";

    cleanupMainMenu();

    if (!canViewAnyAoInsights()) {
        app.textContent = "You do not have permission to view AO insights.";
        return;
    }

    const header = createAppHeader({
        title: "AO Insights",
        showBack: true,
        showMenu: true,
        fallbackView: hasPermission(PERMISSIONS.VIEW_REGION_INSIGHTS)
            ? "regionInsights"
            : "dashboard",
    });

    const pageTitle = document.createElement("h1");
    pageTitle.classList.add("ao-insights-title");
    pageTitle.textContent = "AO Insights";

    const pageSubtitle = document.createElement("div");
    pageSubtitle.classList.add(
        "view-subtitle",
        "ao-insights-subtitle"
    );
    pageSubtitle.textContent =
        "AO-scoped performance and leadership intelligence.";

    const selected = state.selectedAoInsights;

    const selectedSection = state.aoInsightsSection || "overview";

    if (!selected) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No AO selected.";

        const backButton = document.createElement("button");

        if (hasPermission(PERMISSIONS.VIEW_REGION_INSIGHTS)) {
            backButton.textContent = "Back to Region Insights";
            backButton.addEventListener("click", () => navigateTo("regionInsights"));
        } else {
            backButton.textContent = "Back to Dashboard";
            backButton.addEventListener("click", () => navigateTo("dashboard"));
        }

        const nav = createGlobalNav();

        app.replaceChildren(
            header,
            pageTitle,
            pageSubtitle,
            empty,
            backButton,
            nav
        );

        return;
    }

    const selectedAo = state.aos.find(
        ao => ao.id === selected.aoId
    );

    const fallbackAo = getAvailableAos()[0];

    if (!selectedAo && fallbackAo) {
        state.selectedAoInsights = {
            aoId: fallbackAo.aoId,
            aoName: fallbackAo.aoName,
            startDate: selected.startDate,
            endDate: selected.endDate,
        };

        return renderAoInsightsView();
    }

    if (!selectedAo) {
        showToast("No available AO was found.", "error");
        navigateTo("dashboard");
        return;
    }

    if (!canViewAoInsights(selectedAo.id)) {
        showToast("You do not have permission to view this AO.", "error");
        navigateTo("dashboard");
        return;
    }
    
    app.replaceChildren(
        header,
        pageTitle,
        pageSubtitle
    );

    const loading = document.createElement("div");
    loading.classList.add(
        "section",
        "ao-insights-loading"
    );
    
    const loadingLabel = document.createElement("div");
    loadingLabel.classList.add(
        "insights-section-title",
        "ao-insights-section-title"
    );
    loadingLabel.textContent = "AO Insights";
    
    const loadingMessage = document.createElement("div");
    loadingMessage.classList.add("detail-value");
    loadingMessage.textContent =
        `Loading ${selectedAo.name} insights...`;
    
    loading.append(
        loadingLabel,
        loadingMessage
    );
    
    app.appendChild(loading);

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
    
    let selectedSessions;
    let insightHistorySessions;
    let milestoneWeekSessions;
    let regionalMilestoneCrossings;

    const milestoneWeek = getLastCompletedWeekRange();

    const historyEndDate = new Date(`${selected.endDate}T00:00:00`);
    const historyStartDate = new Date(historyEndDate);

    historyStartDate.setDate(
        historyStartDate.getDate() - AO_INSIGHT_LOOKBACK_DAYS
    );
    
    try {
        [
            selectedSessions,
            insightHistorySessions,
            milestoneWeekSessions,
            regionalMilestoneCrossings,
        ] = await Promise.all([
            loadAoInsightSessions({
                regionId: state.currentRegionId,
                aoId: selected.aoId,
                startDate: selected.startDate,
                endDate: selected.endDate,
            }),
    
            loadAoInsightSessions({
                regionId: state.currentRegionId,
                aoId: selected.aoId,
                startDate: historyStartDate.toISOString().slice(0, 10),
                endDate: selected.endDate,
            }),
    
            loadAoInsightSessions({
                regionId: state.currentRegionId,
                aoId: selected.aoId,
                startDate: milestoneWeek.startDate,
                endDate: milestoneWeek.endDate,
            }),
    
            loadRegionMilestoneCrossings({
                regionId: state.currentRegionId,
                startDate: milestoneWeek.startDate,
                endDate: milestoneWeek.endDate,
                milestones: REGION_POST_MILESTONES,
            }),
        ]);
    } catch (error) {
        console.error("Failed to load AO insights", error);
        showToast("Failed to load AO insights.", "error");
        goBack();
        return;
    }
    
    const insights = buildAoInsights({
        ...selected,
        aoId: selectedAo.id,
        aoName: selectedAo.name,
        sessions: selectedSessions,
        insightHistorySessions,
    });

    const selectedMonthIsCurrent =
        selected.startDate.slice(0, 7) ===
        formatDateKey(new Date()).slice(0, 7);

    const accelerationEndDate = selectedMonthIsCurrent
        ? formatDateKey(new Date())
        : selected.endDate;

    const aoLeadershipInsights = buildRegionInsights({
        sessions: insightHistorySessions,
        members: state.members,
        memberStats: state.memberStats,
        aos: [selectedAo],
        startDate: selected.startDate,
        endDate: selected.endDate,
        accelerationEndDate,
    });

    const aoVqGroups = aoLeadershipInsights.readyToVq.map(group => {
        const members = group.members.filter(member => {
            return memberBelongsToAo(member.memberId, selectedAo.name);
        });
    
        return {
            ...group,
            members,
            count: members.length,
        };
    });

    const milestoneWeekAoMemberIds = new Set();

    milestoneWeekSessions.forEach(session => {
        getRosteredAttendanceIdSet(session).forEach(memberId => {
            milestoneWeekAoMemberIds.add(memberId);
        });

        getSessionQIds(session).forEach(memberId => {
            milestoneWeekAoMemberIds.add(memberId);
        });
    });

    const aoMilestoneCrossings = regionalMilestoneCrossings.filter(crossing => {
        return milestoneWeekAoMemberIds.has(crossing.memberId);
    });
    
    const stickyInsightsNav = document.createElement("div");
    stickyInsightsNav.classList.add("sticky-insights-nav");
    stickyInsightsNav.appendChild(createInsightsNav(insights));

    stickyInsightsNav.classList.add(
        "ao-insights-sticky-nav"
    );
    
    const sectionSelector = createAoInsightsSectionSelector({
        selectedSection,
        onSelect: sectionId => {
            state.aoInsightsSection = sectionId;
            renderAoInsightsView();
        },
    });
    
    const overviewPanel = document.createElement("div");
    overviewPanel.classList.add(
        "ao-insights-panel",
        "ao-insights-overview-panel"
    );
    overviewPanel.hidden = selectedSection !== "overview";
    
    const leadershipPanel = document.createElement("div");
    leadershipPanel.classList.add(
        "ao-insights-panel",
        "ao-insights-leadership-panel"
    );
    leadershipPanel.hidden = selectedSection !== "leadership";

    const leadershipAnchorLabel = new Date(
        `${accelerationEndDate}T00:00:00`
    ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    
    const leadershipDate = document.createElement("div");
    leadershipDate.classList.add(
        "section",
        "ao-insights-leadership-date",
        "leadership-action-description"
    );
    leadershipDate.textContent =
        `${selectedAo.name} leadership signals updated through ${leadershipAnchorLabel}.`;

    const milestoneSection = createAoMilestoneSection({
        crossings: aoMilestoneCrossings,
        startDate: milestoneWeek.startDate,
        endDate: milestoneWeek.endDate,
        onMemberClick: crossing => {
            state.selectedMemberId = crossing.memberId;
            navigateTo("memberDetail");
        },
    });
    
    const accelerationSection = createLeadershipActionSection({
        title: "PAX Acceleration",
        description:
            `Posting at ${selectedAo.name} during the last 60 days compared with ` +
            `the previous 60 days, ending ${leadershipAnchorLabel}.`,
        groups: aoLeadershipInsights.paxAcceleration,
        onGroupClick: group => {
            state.rosterFilter = {
                type: "pax-acceleration",
                label: group.label,
                memberIds: group.members
                    .map(member => member.memberId)
                    .filter(Boolean),
                startDate: selected.startDate,
                endDate: accelerationEndDate,
                sourceView: "aoInsights",
                aoId: selectedAo.id,
            };
    
            navigateTo("roster");
        },
        emptyMessage:
            "No PAX posted at this AO during either comparison window.",
    });
    
    const checkTheSixSection = createLeadershipActionSection({
        title: "Check the Six",
        description:
            `PAX with meaningful ${selectedAo.name} history who have not posted here recently.`,
        groups: aoLeadershipInsights.checkTheSix,
        onGroupClick: group => {
            state.rosterFilter = {
                type: "check-the-six",
                label: group.label,
                memberIds: group.members
                    .map(member => member.memberId)
                    .filter(Boolean),
                sourceView: "aoInsights",
                aoId: selectedAo.id,
            };
    
            navigateTo("roster");
        },
        emptyMessage:
            "No established AO participants have gone 30 or more days without posting here.",
    });
    
    const readyToVqSection = createLeadershipActionSection({
        title: "Ready to VQ",
        description:
            `VQs whose favorite or home AO is ${selectedAo.name}.`,
        groups: aoVqGroups,
        onGroupClick: group => {
            state.rosterFilter = {
                type: "ready-to-vq",
                label: group.label,
                memberIds: group.members
                    .map(member => member.memberId)
                    .filter(Boolean),
                sourceView: "aoInsights",
                aoId: selectedAo.id,
            };
    
            navigateTo("roster");
        },
        emptyMessage:
            `No VQs currently associated with ${selectedAo.name} meet the readiness criteria.`,
    });
    
    const readyToQAgainSection = createLeadershipActionSection({
        title: "Ready to Q Again",
        description:
            `Active former ${selectedAo.name} Qs who may be ready to lead here again.`,
        groups: aoLeadershipInsights.readyToQAgain,
        onGroupClick: group => {
            state.rosterFilter = {
                type: "ready-to-q-again",
                label: group.label,
                memberIds: group.members
                    .map(member => member.memberId)
                    .filter(Boolean),
                sourceView: "aoInsights",
                aoId: selectedAo.id,
            };
    
            navigateTo("roster");
        },
        emptyMessage:
            "No active former AO Qs currently meet these criteria.",
    });

    const attendanceBriefing = createInsightCard({
        title: insights.attendanceInsight.title,
        headline: insights.attendanceInsight.headline,
        story: insights.attendanceInsight.story,
        tone: insights.attendanceInsight.status,
        onClick: () => {
            state.selectedAoInsightDetail = "attendance";
            state.selectedAoInsight = insights.attendanceInsight;
            navigateTo("aoInsightDetail");
        },
    });

    const newPaxPipelineBriefing = createInsightCard({
        title: insights.newPaxPipelineInsight.title,
        headline: insights.newPaxPipelineInsight.headline,
        story: insights.newPaxPipelineInsight.story,
        tone: insights.newPaxPipelineInsight.status,
        onClick: () => {
            state.selectedAoInsightDetail = "newPaxPipeline";
            state.selectedAoInsight = insights.newPaxPipelineInsight;
            navigateTo("aoInsightDetail");
        },
    });

    const overviewGrid = document.createElement("div");
    overviewGrid.classList.add("stats-grid");

    overviewGrid.append(
        createMetricCard("Sessions", insights.totalSessions),
        createMetricCard("Avg Attendance", insights.averageAttendance),
        createMetricCard("Unique Qs", insights.uniqueQs),
        createMetricCard("FNGs", insights.totalFngs),
    );

    const overviewSection = createSection("AO Snapshot", overviewGrid);

    const weekdayAttendanceSection =
        createHorizontalBarChartSection({
            title: "Average Attendance by Weekday",
            items: insights.weekdayAttendanceComparison,
            getLabel: item => item.label,
            getValue: item => item.averageAttendance,
            getTone: item => item.tone,
            getSubtitle: item => {
                const sessionLabel =
                    `${item.sessionCount} ${
                        item.sessionCount === 1
                            ? "session"
                            : "sessions"
                    }`;

                if (item.delta === null) {
                    return `${sessionLabel} · No previous-month data`;
                }

                if (item.delta > 0) {
                    return (
                        `${sessionLabel} · ▲ +${item.delta} ` +
                        `vs previous month`
                    );
                }

                if (item.delta < 0) {
                    return (
                        `${sessionLabel} · ▼ ${item.delta} ` +
                        `vs previous month`
                    );
                }

                return `${sessionLabel} · No change vs previous month`;
            },
    });

    const qRotationList = document.createElement("div");
    qRotationList.classList.add("insights-list");

    if (insights.qRotation.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No Qs logged for this AO in this month.";
        qRotationList.appendChild(empty);
    } else {
        insights.qRotation.forEach(q => {
            qRotationList.appendChild(createInsightsRow({
                title: q.paxName,
                subtitle: `${q.share}% of AO sessions`,
                value: q.qCount,
                onClick: () => {
                    state.selectedMemberId = q.memberId;
                    navigateTo("memberDetail");
                },
            }));
        });
    }

    const qRotationSection = createCollapsibleSection({
        title: "Q Rotation",
        content: qRotationList,
        badge: insights.qRotation.length,
    });

    const recentList = document.createElement("div");
    recentList.classList.add("insights-list");

    insights.recentSessions.slice(0, 8).forEach(session => {
        const qNames = getSessionQIds(session)
            .map(getMemberName)
            .join(", ") || "-";

        recentList.appendChild(createInsightsRow({
            title: formatDate(session.date),
            subtitle: `Q: ${qNames}`,
            value: `${getTotalAttendanceCount(session)}`,
            onClick: () => {
                state.selectedSessionId = session.id;
                navigateTo("sessionDetail");
            },
        }));
    });

    if (insights.recentSessions.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No sessions found for this AO in this month.";
        recentList.appendChild(empty);
    }

    const recentSection = createCollapsibleSection({
        title: "Recent Sessions",
        content: recentList,
        badge: insights.recentSessions.length,
    });

    overviewPanel.append(
        attendanceBriefing,
        newPaxPipelineBriefing,
        overviewSection,
        weekdayAttendanceSection,
        recentSection
    );
    
    leadershipPanel.append(
        leadershipDate,
        milestoneSection,
        accelerationSection,
        checkTheSixSection,
        readyToVqSection,
        readyToQAgainSection,
        qRotationSection
    );

    const nav = createGlobalNav();

    app.replaceChildren(
        header,
        pageTitle,
        pageSubtitle,
        sectionSelector,
        stickyInsightsNav,
        overviewPanel,
        leadershipPanel,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}