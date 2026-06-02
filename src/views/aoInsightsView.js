import { state } from "../modules/state.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";
import { createAppHeader } from "../components/appHeader.js";
import { loadAoInsightMonths, loadAoInsightSessions } from "../services/cloudData.js";
import { goBack } from "../utils/navigation.js";

function normalizeAoName(name = "") {
    return name
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "");
}

function createMetricCard(label, value) {
    const card = document.createElement("div");
    card.classList.add("stat-tile");

    const valueEl = document.createElement("div");
    valueEl.classList.add("stat-value");
    valueEl.textContent = value;

    const labelEl = document.createElement("div");
    labelEl.classList.add("stat-label");
    labelEl.textContent = label;

    card.append(valueEl, labelEl);

    return card;
}

function createInsightsRow({ title, subtitle, value, onClick, tone }) {
    const row = document.createElement("div");
    row.classList.add("insights-row");

    if (tone) {
        row.classList.add(`insights-row-${tone}`);
    }

    const left = document.createElement("div");
    left.classList.add("insights-row-left");

    const titleEl = document.createElement("div");
    titleEl.classList.add("insights-row-title");
    titleEl.textContent = title;

    const subtitleEl = document.createElement("div");
    subtitleEl.classList.add("insights-row-subtitle");
    subtitleEl.textContent = subtitle;

    left.append(titleEl, subtitleEl);

    const valueEl = document.createElement("div");
    valueEl.classList.add("insights-row-value");
    valueEl.textContent = value;

    if (onClick) {
        row.classList.add("clickable-row");
        row.addEventListener("click", onClick);
    }

    row.append(left, valueEl);

    return row;
}

function createHealthSummary(insights) {
    const card = document.createElement("div");
    card.classList.add(
        "section",
        "insights-summary-card",
        `insights-summary-${insights.healthStatus.toLowerCase().replace(/\s+/g, "-")}`
    );

    const eyebrow = document.createElement("div");
    eyebrow.classList.add("stat-label");
    eyebrow.textContent = "AO Health";

    const title = document.createElement("div");
    title.classList.add("stat-value");
    title.textContent = insights.healthStatus;

    const subtitle = document.createElement("div");
    subtitle.classList.add("detail-value");
    subtitle.textContent = insights.healthSubtitle;

    card.append(
        eyebrow,
        title,
        subtitle
    );

    return card;
}

function getMemberName(memberId) {
    const member = state.members.find(m => m.id === memberId);
    return member?.paxName || "Unknown";
}

function getSessionQIds(session) {
    return Array.isArray(session.qIds)
        ? session.qIds
        : session.qId
            ? [session.qId]
            : [];
}

function getUniqueAttendeeIds(sessions) {
    const ids = new Set();

    sessions.forEach(session => {
        (session.attendeeIds || []).forEach(id => ids.add(id));
    });

    return ids;
}

function getAverageAttendance(sessions) {
    if (!sessions.length) return 0;

    const total = sessions.reduce((sum, session) => {
        return sum + (session.attendeeIds?.length || 0);
    }, 0);

    return Math.round((total / sessions.length) * 10) / 10;
}

function getAttendanceStability(sessions) {
    if (sessions.length < 3) {
        return {
            label: "Not enough data",
            subtitle: "Need at least 3 sessions to evaluate stability.",
        };
    }

    const counts = sessions.map(session => session.attendeeIds?.length || 0);
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;

    const variance = counts.reduce((sum, count) => {
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
        (session.attendeeIds || []).forEach(memberId => {
            attendanceCounts.set(memberId, (attendanceCounts.get(memberId) || 0) + 1);
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

function formatMonthLabel(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
}

function getAoNames() {
    return state.aos
        .filter(ao => ao.isActive !== false)
        .map(ao => ao.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function getAdjacentAoName(currentAoName, offset) {
    const aoNames = getAoNames();

    if (aoNames.length === 0) return currentAoName;

    const currentIndex = aoNames.findIndex(name =>
        normalizeAoName(name) === normalizeAoName(currentAoName)
    );

    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + offset + aoNames.length) % aoNames.length;

    return aoNames[nextIndex];
}

function getAvailableMonthsForAo(aoName) {
    const monthKeys = new Set();

    state.sessions.forEach(session => {
        if (!session.date || !session.aoName) return;

        const matchesAo =
            normalizeAoName(session.aoName) === normalizeAoName(aoName);

        if (!matchesAo) return;

        monthKeys.add(session.date.slice(0, 7)); // YYYY-MM
    });

    return [...monthKeys]
        .sort((a, b) => b.localeCompare(a)); // newest first
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
            aoName: insights.aoName,
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

function openAoPicker(currentAoName) {
    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay", "bottom-sheet-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal", "bottom-sheet-modal");

    const title = document.createElement("h2");
    title.textContent = "Select AO";

    const list = document.createElement("div");
    list.classList.add("insights-picker-list");

    getAoNames().forEach(aoName => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("insights-picker-option");
        button.textContent = aoName;

        if (normalizeAoName(aoName) === normalizeAoName(currentAoName)) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            state.selectedAoInsights = {
                ...state.selectedAoInsights,
                aoName,
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
    nav.classList.add("insights-nav");

    const aoRow = document.createElement("div");
    aoRow.classList.add("insights-nav-row");

    const previousAoButton = document.createElement("button");
    previousAoButton.type = "button";
    previousAoButton.classList.add("insights-nav-arrow");
    previousAoButton.textContent = "‹";
    previousAoButton.addEventListener("click", () => {
        state.selectedAoInsights = {
            ...state.selectedAoInsights,
            aoName: getAdjacentAoName(insights.aoName, -1),
        };

        renderAoInsightsView();
    });

    const aoTitle = document.createElement("button");
    aoTitle.type = "button";
    aoTitle.classList.add("insights-nav-title");
    aoTitle.textContent = insights.aoName.toUpperCase();
    aoTitle.addEventListener("click", () => {
        openAoPicker(insights.aoName);
    });

    const nextAoButton = document.createElement("button");
    nextAoButton.type = "button";
    nextAoButton.classList.add("insights-nav-arrow");
    nextAoButton.textContent = "›";
    nextAoButton.addEventListener("click", () => {
        state.selectedAoInsights = {
            ...state.selectedAoInsights,
            aoName: getAdjacentAoName(insights.aoName, 1),
        };

        renderAoInsightsView();
    });

    aoRow.append(previousAoButton, aoTitle, nextAoButton);

    const monthRow = document.createElement("div");
    monthRow.classList.add("insights-nav-row", "insights-nav-row-secondary");

    const previousMonthButton = document.createElement("button");
    previousMonthButton.type = "button";
    previousMonthButton.classList.add("insights-nav-arrow");
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
    monthTitle.classList.add("insights-nav-title", "insights-nav-title-secondary");
    monthTitle.textContent = formatMonthLabel(insights.startDate);
    monthTitle.addEventListener("click", () => {
        openMonthPicker(insights);
    });

    const nextMonthButton = document.createElement("button");
    nextMonthButton.type = "button";
    nextMonthButton.classList.add("insights-nav-arrow");
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

    nav.append(aoRow, monthRow);

    return nav;
}

function buildAoInsights({ aoName, startDate, endDate, sessions: loadedSessions = null }) {
    const sessions = loadedSessions || [];

    const allAoSessions = state.sessions.filter(session => {
        return normalizeAoName(session.aoName) === normalizeAoName(aoName);
    });

    console.log("AO INSIGHTS DEBUG", {
        selected: { aoName, startDate, endDate },
        allSessionsForAo: state.sessions
            .filter(session =>
                normalizeAoName(session.aoName) === normalizeAoName(aoName)
            )
            .map(session => ({
                date: session.date,
                aoName: session.aoName,
            })),
    
        filteredSessions: sessions.map(session => ({
            date: session.date,
            aoName: session.aoName,
        })),
    });

    const totalSessions = sessions.length;

    const totalAttendance = sessions.reduce((sum, session) => {
        return sum + (session.attendeeIds?.length || 0);
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

    let healthStatus = "Healthy";
    let healthSubtitle = "This AO looks healthy for the selected month.";

    if (totalSessions === 0) {
        healthStatus = "No Data";
        healthSubtitle = "No sessions were found for this AO in the selected month.";
    } else if (leadershipRisk === "Critical") {
        healthStatus = "Critical";
        healthSubtitle = "Leadership rotation needs immediate attention.";
    } else if (leadershipRisk === "High") {
        healthStatus = "At Risk";
        healthSubtitle = "Leadership is concentrated and may create burnout risk.";
    } else if (strongEmergingQs.length >= 2) {
        healthStatus = "Opportunity";
        healthSubtitle = "Multiple regular PAX may be ready to step into Qing.";
    }

    return {
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
        healthStatus,
        healthSubtitle,
        recentSessions,
        strongEmergingQs,
    };
}

function createCollapsibleSection({
    title,
    content,
    defaultExpanded = false,
    badge = null,
}) {
    const section = document.createElement("div");
    section.classList.add("section");

    const header = document.createElement("button");
    header.type = "button";
    header.classList.add("collapsible-header");

    const left = document.createElement("div");
    left.classList.add("collapsible-header-left");

    const titleEl = document.createElement("div");
    titleEl.classList.add("insights-section-title");
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
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("insights-section-title");
    heading.textContent = title;

    section.append(heading, content);

    return section;
}

export async function renderAoInsightsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const selected = state.selectedAoInsights;

    if (!selected) {
        const title = document.createElement("h1");
        title.textContent = "AO Insights";

        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No AO selected.";

        const backButton = document.createElement("button");
        backButton.textContent = "Back to Region Insights";
        backButton.addEventListener("click", () => {
            navigateTo("regionInsights");
        });

        const nav = createGlobalNav();
        app.append(title, empty, backButton, nav);
        return;
    }

    const selectedSessions = await loadAoInsightSessions({
        regionId: state.currentRegionId,
        aoName: selected.aoName,
        startDate: selected.startDate,
        endDate: selected.endDate,
    });
    
    const insights = buildAoInsights({
        ...selected,
        sessions: selectedSessions,
    });

    const header = createAppHeader({
        title: "AO Insights",
        showBack: true,
        fallbackView: "regionInsights",
    });

    const stickyInsightsNav = document.createElement("div");
    stickyInsightsNav.classList.add("sticky-insights-nav");
    stickyInsightsNav.appendChild(createInsightsNav(insights));

    const healthSummary = createHealthSummary(insights);

    const overviewGrid = document.createElement("div");
    overviewGrid.classList.add("stats-grid");

    overviewGrid.append(
        createMetricCard("Sessions", insights.totalSessions),
        createMetricCard("Avg Attendance", insights.averageAttendance),
        createMetricCard("Unique Qs", insights.uniqueQs),
        createMetricCard("FNGs", insights.totalFngs),
    );

    const overviewSection = createSection("AO Snapshot", overviewGrid);

    const leadershipList = document.createElement("div");
    leadershipList.classList.add("insights-list");

    leadershipList.appendChild(createInsightsRow({
        title: "Leadership Risk",
        subtitle: insights.leadershipRiskSubtitle,
        value: insights.leadershipRisk,
        tone: insights.leadershipRisk.toLowerCase(),
    }));

    if (insights.topQ) {
        leadershipList.appendChild(createInsightsRow({
            title: "Top Q Share",
            subtitle: `${insights.topQ.paxName} led ${insights.topQ.qCount} of ${insights.totalSessions} sessions`,
            value: `${insights.topQ.share}%`,
            onClick: () => {
                state.selectedMemberId = insights.topQ.memberId;
                navigateTo("memberDetail");
            },
        }));
    }

    leadershipList.appendChild(createInsightsRow({
        title: "Top 3 Q Share",
        subtitle: "Share of sessions led by the three most frequent Qs",
        value: `${insights.topThreeQShare}%`,
    }));
    
    leadershipList.appendChild(createInsightsRow({
        title: "Attendance Stability",
        subtitle: insights.attendanceStability.subtitle,
        value: insights.attendanceStability.label,
    }));

    leadershipList.appendChild(createInsightsRow({
        title: "Emerging Qs",
        subtitle: insights.strongEmergingQs.length
            ? "Regular PAX who may be ready to step into Qing"
            : "No strong emerging Q candidates identified this month.",
        value: insights.strongEmergingQs.length,
    }));

    const leadershipSection = createCollapsibleSection({
        title: "Leadership Health",
        content: leadershipList,
        defaultExpanded: true,
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

    const pipelineList = document.createElement("div");
    pipelineList.classList.add("insights-list");

    if (insights.potentialNewQs.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No obvious new Q candidates found for this month.";
        pipelineList.appendChild(empty);
    } else {
        insights.potentialNewQs.slice(0, 5).forEach(member => {
            pipelineList.appendChild(createInsightsRow({
                title: member.paxName,
                subtitle: `${member.postCount} posts this month and no recorded Qs at this AO`,
                value: "Potential Q",
                onClick: () => {
                    state.selectedMemberId = member.memberId;
                    navigateTo("memberDetail");
                },
            }));
        });
    }

    const pipelineSection = createCollapsibleSection({
        title: "Emerging Q Candidates",
        content: pipelineList,
        badge: insights.potentialNewQs.length,
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
            value: `${session.attendeeIds?.length || 0}`,
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

    const nav = createGlobalNav();

    app.append(
        header,
        stickyInsightsNav,
        healthSummary,
        overviewSection,
        leadershipSection,
        qRotationSection,
        pipelineSection,
        recentSection,
        nav,
    );
}