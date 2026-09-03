import { state } from "../modules/state.js";
import { buildRegionInsights } from "../modules/insights.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { createIcon } from "../utils/icons.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import { createHorizontalBarChartSection, createLineChartSection, createMultiLineChartSection, createHeatMapSection, createPipelineSection, } from "../components/regionInsights/charts.js";
import {
    loadRegionInsightSessions,
    loadRegionMilestoneCrossings,
    loadRegionLeadershipDepth,
} from "../services/cloudData.js";

const REGION_TREND_METRICS = [
    {
        key: "averageAttendance",
        label: "Avg Attendance",
        title: "12-Month Average Attendance",
        formatValue: value => Number(value).toFixed(1),
        getSubtitle: item =>
            `${item.sessions} session${item.sessions === 1 ? "" : "s"} • ${item.totalAttendance} total posts`,
    },
    {
        key: "totalAttendance",
        label: "Total Posts",
        title: "12-Month Total Posts",
        formatValue: value => Math.round(value),
        getSubtitle: item =>
            `${item.sessions} session${item.sessions === 1 ? "" : "s"}`,
    },
    {
        key: "activePax",
        label: "Active PAX",
        title: "12-Month Active PAX",
        formatValue: value => Math.round(value),
        getSubtitle: () =>
            "8+ posts during the trailing 60 days",
    },
    {
        key: "fngs",
        label: "FNGs",
        title: "12-Month FNG Trend",
        formatValue: value => Math.round(value),
        getSubtitle: item =>
            `${item.sessions} session${item.sessions === 1 ? "" : "s"}`,
    },
    {
        key: "activeQs",
        label: "Active Qs",
        title: "12-Month Active Qs",
        formatValue: value => Math.round(value),
        getSubtitle: () =>
            "Unique PAX who Q'd during the month",
    },
];

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

function createAoTrendSelector({
    aos,
    selectedAoIds,
    maxSelected = 8,
    onChange,
}) {
    const selector = document.createElement("div");
    selector.classList.add("region-trend-selector");

    aos.forEach(ao => {
        const button = document.createElement("button");

        button.type = "button";
        button.classList.add("region-trend-button");
        button.dataset.aoId = ao.aoId;
        button.textContent = ao.aoName;

        const isSelected =
            selectedAoIds.includes(ao.aoId);

        button.classList.toggle(
            "active",
            isSelected
        );

        button.setAttribute(
            "aria-pressed",
            String(isSelected)
        );

        button.addEventListener("click", () => {
            const currentSelectedIds = [
                ...selector.querySelectorAll(
                    ".region-trend-button.active"
                ),
            ].map(activeButton => {
                return activeButton.dataset.aoId;
            });

            const currentlySelected =
                currentSelectedIds.includes(ao.aoId);

            if (currentlySelected) {
                onChange(
                    currentSelectedIds.filter(
                        aoId => aoId !== ao.aoId
                    )
                );

                return;
            }

            if (
                currentSelectedIds.length >=
                maxSelected
            ) {
                return;
            }

            onChange([
                ...currentSelectedIds,
                ao.aoId,
            ]);
        });

        selector.appendChild(button);
    });

    return selector;
}

function createTrendMetricSelector({
    metrics,
    selectedKey,
    onSelect,
}) {
    const selector = document.createElement("div");
    selector.classList.add("region-trend-selector");

    metrics.forEach(metric => {
        const button = document.createElement("button");

        button.type = "button";
        button.classList.add("region-trend-button");
        button.textContent = metric.label;
        button.dataset.metricKey = metric.key;

        if (metric.key === selectedKey) {
            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");
        } else {
            button.setAttribute("aria-pressed", "false");
        }

        button.addEventListener("click", () => {
            onSelect(metric.key);
        });

        selector.appendChild(button);
    });

    return selector;
}

function createRegionInsightsSectionSelector({
    selectedSection,
    onSelect,
}) {
    const selector = document.createElement("div");
    selector.classList.add(
        "region-trend-selector",
        "region-insights-section-selector",
        "region-insights-primary-tabs"
    );

    const sections = [
        {
            key: "overview",
            label: "Overview",
        },
        {
            key: "leadership",
            label: "Leadership",
        },
    ];

    sections.forEach(section => {
        const button = document.createElement("button");

        button.type = "button";
        button.classList.add(
            "region-trend-button",
            "region-insights-primary-tab"
        );
        button.dataset.sectionKey = section.key;
        button.textContent = section.label;

        const isSelected =
            section.key === selectedSection;

        button.classList.toggle(
            "active",
            isSelected
        );

        button.setAttribute(
            "aria-pressed",
            String(isSelected)
        );

        button.addEventListener("click", () => {
            onSelect(section.key);
        });

        selector.appendChild(button);
    });

    return selector;
}

function getCurrentMonthRange() {
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);

    return {
        startDate: formatDateKey(start),
        endDate: formatDateKey(end),
    };
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getLastCompletedAggielandWeekRange(
    referenceDate = new Date()
) {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);

    /*
     * Aggieland reporting week is Monday-Saturday.
     *
     * On Sunday, use the Monday-Saturday that just ended.
     * On Monday-Saturday, use the previous completed week.
     */
    const daysBackToSaturday =
        date.getDay() === 0
            ? 1
            : date.getDay() + 1;

    const end = new Date(date);
    end.setDate(
        end.getDate() - daysBackToSaturday
    );

    const start = new Date(end);
    start.setDate(start.getDate() - 5);

    return {
        startDate: formatDateKey(start),
        endDate: formatDateKey(end),
    };
}

function getMonthRange(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);

    return {
        startDate: formatDateKey(start),
        endDate: formatDateKey(end),
    };
}

function shiftMonthKey(monthKey, offset) {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);

    return `${date.getFullYear()}-${String(date.getMonth() +1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1, 1);

    return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
}

function createMetricCard(label, value, onClick) {
    const card = document.createElement("div");
    card.classList.add(
        "stat-tile",
        "region-insights-metric-card"
    );

    const valueEl = document.createElement("div");
    valueEl.classList.add(
        "stat-value",
        "region-insights-metric-value"
    );
    valueEl.textContent = value;

    const labelEl = document.createElement("div");
    labelEl.classList.add(
        "stat-label",
        "region-insights-metric-label"
    );
    labelEl.textContent = label;

    if (onClick) {
        card.classList.add("clickable-stat-tile");
        card.addEventListener("click", onClick);
    }

    card.append(valueEl, labelEl);

    return card;
}

function createExpandableListSection({
    title,
    items,
    initialCount = 8,
    renderRow,
}) {
    const section = document.createElement("section");
    section.classList.add(
        "section",
        "region-insights-list-section",
        "region-insights-expandable-section"
    );

    const heading = document.createElement("div");
    heading.classList.add("insights-section-header");

    const headingText = document.createElement("div");
    headingText.classList.add(
        "insights-section-title",
        "region-insights-section-title"
    );
    headingText.textContent = title;

    const toggleButton = document.createElement("button");
    toggleButton.classList.add("secondary-button", "insights-toggle-button");

    let expanded = false;

    const list = document.createElement("div");
    list.classList.add("insights-list");

    function renderList() {
        list.textContent = "";

        const visibleItems = expanded
            ? items
            : items.slice(0, initialCount);

        visibleItems.forEach(item => {
            list.appendChild(renderRow(item));
        });

        toggleButton.textContent = expanded
            ? "Show Less"
            : `Show All (${items.length})`;

        toggleButton.style.display =
            items.length > initialCount ? "inline-flex" : "none";
    }

    toggleButton.addEventListener("click", () => {
        expanded = !expanded;
        renderList();
    });

    heading.append(headingText, toggleButton);
    section.append(heading, list);

    renderList();

    return section;
}

function createInsightsRow({ title, subtitle, value, onClick }) {
    const row = document.createElement("div");
    row.classList.add(
        "insights-row",
        "region-insights-row"
    );

    const left = document.createElement("div");
    left.classList.add(
        "insights-row-left",
        "region-insights-row-content"
    );

    const titleEl = document.createElement("div");
    titleEl.classList.add(
        "insights-row-title",
        "region-insights-row-title"
    );
    titleEl.textContent = title;

    const subtitleEl = document.createElement("div");
    subtitleEl.classList.add(
        "insights-row-subtitle",
        "region-insights-row-subtitle"
    );
    
    subtitleEl.textContent = subtitle;

    left.append(titleEl, subtitleEl);

    const valueEl = document.createElement("div");
    valueEl.classList.add(
        "insights-row-value",
        "region-insights-row-value"
    );
    valueEl.textContent = value;

    if (onClick) {
        row.classList.add("clickable-row");
        row.addEventListener("click", onClick);

        const icon = createIcon("arrowUpRight", "insights-row-icon");

        row.append(left, valueEl, icon);
    } else {
    row.append(left, valueEl);
    }
    return row;
}

function buildLeadershipSnapshot(insights) {
    const needsAttention = [];

    const lowCaptureRate =
        Number(insights.fngStats.rosterCaptureRate) < 80 &&
        insights.fngStats.totalFngs > 0;

    if (lowCaptureRate) {
        needsAttention.push({
            title: "FNG roster capture needs attention",
            subtitle: `${insights.fngStats.rosteredFngs} of ${insights.fngStats.totalFngs} FNGs rostered`,
            value: `${insights.fngStats.rosterCaptureRate}%`,
        });
    }

    const lowAttendanceAos = insights.attendanceByAo
        .filter(ao => Number(ao.averageAttendance) < 5 && ao.sessions >= 2)
        .slice(0, 3);

    lowAttendanceAos.forEach(ao => {
        needsAttention.push({
            title: `${ao.aoName} attendance is light`,
            subtitle: `${ao.sessions} sessions this month`,
            value: `${ao.averageAttendance} avg`,
        });
    });

    const momentum = [];

    if (insights.summary.uniqueQs > 0) {
        momentum.push({
            title: "Q leadership active",
            subtitle: `${insights.summary.uniqueQs} different PAX led workouts this month`,
            value: insights.summary.uniqueQs,
        });
    }

    if (insights.summary.totalSessions > 0) {
        momentum.push({
            title: "Region activity logged",
            subtitle: `${insights.summary.totalSessions} sessions captured this month`,
            value: insights.summary.totalSessions,
        });
    }

    if (insights.summary.totalFngs > 0) {
        momentum.push({
            title: "FNG pipeline active",
            subtitle: `${insights.fngStats.rosteredFngs} rostered • ${insights.fngStats.unrosteredFngs} unrostered`,
            value: insights.summary.totalFngs,
        });
    }

    return {
        summary: insights.summary,
        fngStats: insights.fngStats,
        needsAttention,
        momentum,
        postingFrequency: insights.postingFrequency,
    };
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
        "leadership-action-section",
        "region-insights-leadership-section"
    );

    const heading = document.createElement("div");
    heading.classList.add(
        "insights-section-title",
        "region-insights-section-title"
    );
    heading.textContent = title;

    const descriptionEl = document.createElement("div");
    descriptionEl.classList.add(
        "leadership-action-description"
    );
    descriptionEl.textContent = description;

    const groupList = document.createElement("div");
    groupList.classList.add(
        "leadership-action-groups"
    );

    if (!groups.length) {
        const empty = document.createElement("div");
        empty.classList.add("empty-state");
        empty.textContent = emptyMessage;

        section.append(
            heading,
            descriptionEl,
            empty
        );

        return section;
    }

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
        main.classList.add(
            "leadership-action-main"
        );

        const symbol = document.createElement("div");
        symbol.classList.add(
            "leadership-action-symbol"
        );
        symbol.textContent = group.symbol || "→";

        const text = document.createElement("div");
        text.classList.add(
            "leadership-action-text"
        );

        const label = document.createElement("div");
        label.classList.add(
            "leadership-action-label"
        );
        label.textContent = group.label;

        const groupDescription =
            document.createElement("div");

        groupDescription.classList.add(
            "leadership-action-group-description"
        );

        groupDescription.textContent =
            group.description || "";

        text.append(
            label,
            groupDescription
        );

        const count = document.createElement("div");
        count.classList.add(
            "leadership-action-count"
        );
        count.textContent = group.count;

        main.append(
            symbol,
            text,
            count
        );

        card.appendChild(main);
        groupList.appendChild(card);
    });

    section.append(
        heading,
        descriptionEl,
        groupList
    );

    return section;
}

function createSimpleListSection(title, items, emptyMessage = "Nothing to show yet.") {
    const section = document.createElement("section");
    section.classList.add(
        "section",
        "region-insights-list-section"
    );

    const heading = document.createElement("div");
    heading.classList.add(
        "insights-section-title",
        "region-insights-section-title"
    );
    heading.textContent = title;

    const list = document.createElement("div");
    list.classList.add("insights-list");

    if (!items.length) {
        const empty = document.createElement("div");
        empty.classList.add("empty-state");
        empty.textContent = emptyMessage;
        list.appendChild(empty);
    } else {
        items.forEach(item => {
            list.appendChild(createInsightsRow(item));
        });
    }

    section.append(heading, list);
    return section;
}

function createMilestoneSection({
    crossings,
    startDate,
    endDate,
    onMemberClick,
}) {
    const items = [...crossings].sort((a, b) => {
        if (b.milestone !== a.milestone) {
            return b.milestone - a.milestone;
        }

        return a.paxName.localeCompare(b.paxName);
    });

    const startLabel = new Date(
        `${startDate}T00:00:00`
    ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });

    const endLabel = new Date(
        `${endDate}T00:00:00`
    ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });

    const title =
        `Weekly Post Milestones • ` +
        `${startLabel}–${endLabel}`;

    if (!items.length) {
        return createSimpleListSection(
            title,
            [],
            "No post milestones were crossed during this week."
        );
    }

    return createExpandableListSection({
        title,
        items,
        initialCount: 8,

        renderRow: crossing => {
            const postLabel =
                crossing.postsInPeriod === 1
                    ? "post"
                    : "posts";

            return createInsightsRow({
                title:
                    `${crossing.paxName} reached ` +
                    `${crossing.milestone} posts`,

                subtitle:
                    `${crossing.postsInPeriod} ${postLabel} ` +
                    `during the week • ` +
                    `${crossing.startingTotal} → ` +
                    `${crossing.endingTotal}`,

                value: crossing.milestone,

                onClick: onMemberClick
                    ? () => {
                        onMemberClick(crossing);
                    }
                    : null,
            });
        },
    });
}

export async function renderRegionInsightsView() {
    const app = document.getElementById("app");

    app.replaceChildren();
    app.className = "view-regionInsights";

    cleanupMainMenu();

    if (!hasPermission(PERMISSIONS.VIEW_REGION_INSIGHTS)) {
        app.textContent = "You do not have permission to view region insights.";
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.classList.add("region-insights-title");
    title.textContent = "Region Insights";
    
    const subtitle = document.createElement("div");
    subtitle.classList.add(
        "view-subtitle",
        "region-insights-subtitle"
    );
    subtitle.textContent =
        "Regional performance and leadership intelligence.";

    if (!state.regionInsightsSection) {
        state.regionInsightsSection = "overview";
    }

    if (!state.regionInsightsMonth) {
        const { startDate } = getCurrentMonthRange();
        state.regionInsightsMonth = startDate.slice(0, 7);
    }
    
    const selectedMonth = state.regionInsightsMonth;
    
    const {
        startDate,
        endDate,
    } = getMonthRange(selectedMonth);
    
    const todayKey = formatDateKey(new Date());
    
    const accelerationEndDate =
        selectedMonth === todayKey.slice(0, 7)
            ? todayKey
            : endDate;
    
    const milestoneWeek =
        getLastCompletedAggielandWeekRange();

    const [selectedYear, selectedMonthNumber] =
        selectedMonth.split("-").map(Number);

    const historyStart = new Date(
        selectedYear,
        selectedMonthNumber - 12,
        1
    );

    const historyStartDate = formatDateKey(historyStart);

    const loading = document.createElement("div");
    loading.classList.add(
        "section",
        "region-insights-loading"
    );

    const loadingMessage = document.createElement("div");
    loadingMessage.classList.add("detail-value");
    loadingMessage.textContent = "Loading Region Insights...";

    loading.appendChild(loadingMessage);

    app.append(
        header,
        title,
        subtitle,
        loading
    );

    let insightSessions;
    let milestoneCrossings;
    let leadershipDepth;
    
    try {
        [
            insightSessions,
            milestoneCrossings,
            leadershipDepth,
        ] = await Promise.all([
            loadRegionInsightSessions({
                regionId: state.currentRegionId,
                startDate: historyStartDate,
                endDate,
            }),
    
            loadRegionMilestoneCrossings({
                regionId: state.currentRegionId,
                startDate: milestoneWeek.startDate,
                endDate: milestoneWeek.endDate,
                milestones: REGION_POST_MILESTONES,
            }),
    
            loadRegionLeadershipDepth({
                regionId: state.currentRegionId,
                minPosts: 25,
                minQs: 5,
            }),
        ]);
    } catch (error) {
        console.error("Failed to load Region Insights", error);

        loadingMessage.textContent =
            "Could not load Region Insights.";

        return;
    }

    const monthNavRow = document.createElement("div");
    monthNavRow.classList.add(
        "q-signup-month-row",
        "region-insights-month-nav"
    );

    const previousMonthButton = document.createElement("button");
    previousMonthButton.classList.add(
        "month-nav-button",
        "region-insights-month-button"
    );
    previousMonthButton.textContent = "←";

    previousMonthButton.addEventListener("click", () => {
        state.regionInsightsMonth = shiftMonthKey(selectedMonth, -1);
        renderRegionInsightsView();
    });

    const monthLabel = document.createElement("div");
    monthLabel.classList.add(
        "q-signup-month-label",
        "region-insights-month-label"
    );
    monthLabel.textContent = getMonthLabel(selectedMonth);

    const nextMonthButton = document.createElement("button");
    nextMonthButton.classList.add(
        "month-nav-button",
        "region-insights-month-button"
    );
    nextMonthButton.textContent = "→";

    nextMonthButton.addEventListener("click", () => {
        state.regionInsightsMonth = shiftMonthKey(selectedMonth, 1);
        renderRegionInsightsView();
    });

    monthNavRow.append(previousMonthButton, monthLabel, nextMonthButton);

    const insights = buildRegionInsights({
        sessions: insightSessions,
        members: state.members,
        memberStats: state.memberStats,
        aos: state.aos,
        startDate,
        endDate,
        accelerationEndDate,
    });

    const snapshot = buildLeadershipSnapshot(insights);

    const sectionSelector =
    createRegionInsightsSectionSelector({
        selectedSection:
            state.regionInsightsSection,

        onSelect: sectionKey => {
            if (
                sectionKey ===
                state.regionInsightsSection
            ) {
                return;
            }

            state.regionInsightsSection =
                sectionKey;

            updateVisibleRegionSection();
        },
    });

    const overviewSection = document.createElement("section");
    overviewSection.classList.add(
        "section",
        "region-insights-overview"
    );

    const overviewHeading = document.createElement("div");
    overviewHeading.classList.add(
        "insights-section-title",
        "region-insights-section-title"
    );
    overviewHeading.textContent = "Region Activity";

    const overviewGrid = document.createElement("div");
    overviewGrid.classList.add(
        "stats-grid",
        "region-insights-metric-grid"
    );

    overviewGrid.append(
        createMetricCard("Total Posts", snapshot.summary.totalAttendance),
        createMetricCard("Avg Attendance", snapshot.summary.averageAttendance),
        createMetricCard(
            "Unique PAX",
            snapshot.summary.uniquePax,
            () => {
                state.rosterFilter = {
                    type: "active-pax",
                    label: "Unique PAX",
                    startDate,
                    endDate,
                };
                navigateTo("roster");
            }
        ),

        createMetricCard(
            "Active Qs",
            snapshot.summary.uniqueQs,
            () => {
                state.rosterFilter = {
                    type: "active-qs",
                    label: "Active Qs",
                    startDate,
                    endDate,
                };
                navigateTo("roster");
            }
        ),
    );

    overviewSection.append(overviewHeading, overviewGrid);

    const needsAttentionSection = createSimpleListSection(
        "Needs Attention",
        snapshot.needsAttention,
        "No major issues detected for this month."
    );

    const momentumSection = createSimpleListSection(
        "Key Insights",
        snapshot.momentum,
        "No Key Insights yet."
    );

    const milestoneSection = createMilestoneSection({
        crossings: milestoneCrossings,
        startDate: milestoneWeek.startDate,
        endDate: milestoneWeek.endDate,
    
        onMemberClick: crossing => {
            state.selectedMemberId = crossing.memberId;
            navigateTo("memberDetail");
        },
    });

    if (!state.regionTrendMetric) {
        state.regionTrendMetric = "averageAttendance";
    }
    
    const trendSectionHost = document.createElement("div");
    trendSectionHost.classList.add(
        "section",
        "insights-chart-section",
        "insights-line-chart-section",
        "region-insights-chart-section"
    );
    
    const trendHeading = document.createElement("div");
    trendHeading.classList.add("insights-section-title");
    
    const trendMetricSelector =
        createTrendMetricSelector({
            metrics: REGION_TREND_METRICS,
            selectedKey: state.regionTrendMetric,
            onSelect: metricKey => {
                if (metricKey === state.regionTrendMetric) return;
    
                state.regionTrendMetric = metricKey;
                updateTrendSection();
            },
        });
    
    const trendChartBody = document.createElement("div");
    
    trendSectionHost.append(
        trendHeading,
        trendMetricSelector,
        trendChartBody
    );

    const fngPipelineSection =
        createPipelineSection({
            title: "New PAX Retention Pipeline",
            stages: insights.regionFngPipeline.stages,

            onStageClick: stage => {
                state.rosterFilter = {
                    type: "region-fng-pipeline",
                    stageKey: stage.key,
                    label: stage.label,
                    memberIds: stage.members
                        .map(member => member.memberId)
                        .filter(Boolean),
                    startDate,
                    endDate,
                    sourceView: "regionInsights",
                };
            
                navigateTo("roster");
            },

            emptyMessage:
                "No FNGs were logged during this month.",
    });

    const accelerationAnchorLabel =
    new Date(
        `${accelerationEndDate}T00:00:00`
    ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    const accelerationSection =
        createLeadershipActionSection({
            title: "PAX Acceleration",

            description:
                `Last 60 days compared with the previous 60 days, ending ${accelerationAnchorLabel}.`,

            groups: insights.paxAcceleration,

            onGroupClick: group => {
                state.rosterFilter = {
                    type: "pax-acceleration",
                    label: group.label,
                    memberIds: group.members
                        .map(member => member.memberId)
                        .filter(Boolean),
                    startDate,
                    endDate: accelerationEndDate,
                    sourceView: "regionInsights",
                };

                navigateTo("roster");
            },

            emptyMessage:
                "No PAX posted during either comparison window.",
        });
    
    function updateTrendSection() {
        const selectedTrendMetric =
            REGION_TREND_METRICS.find(metric => {
                return metric.key === state.regionTrendMetric;
            }) || REGION_TREND_METRICS[0];
    
        trendHeading.textContent = selectedTrendMetric.title;
    
        trendMetricSelector
            .querySelectorAll(".region-trend-button")
            .forEach(button => {
                const isActive =
                    button.dataset.metricKey === selectedTrendMetric.key;
    
                button.classList.toggle("active", isActive);
                button.setAttribute(
                    "aria-pressed",
                    String(isActive)
                );
            });
    
        const chartSection =
            createLineChartSection({
                title: selectedTrendMetric.title,
                items: insights.monthlyRegionTrend,
                getLabel: item => item.label,
                getValue: item => {
                    return selectedTrendMetric.formatValue(
                        item[selectedTrendMetric.key]
                    );
                },
                getSubtitle: item => {
                    return selectedTrendMetric.getSubtitle(item);
                },
                emptyMessage:
                    "No regional trend history available yet.",
            });
    
        trendChartBody.textContent = "";
    
        const chartChildren = [...chartSection.children].slice(1);
    
        trendChartBody.append(...chartChildren);
    }

    const checkTheSixSection =
        createLeadershipActionSection({
            title: "Check the Six",

            description:
                `PAX who have not posted recently, measured through ${accelerationAnchorLabel}.`,

            groups: insights.checkTheSix,

            onGroupClick: group => {
                state.rosterFilter = {
                    type: "check-the-six",
                    label: group.label,
                    memberIds: group.members
                        .map(member => member.memberId)
                        .filter(Boolean),
                    sourceView: "regionInsights",
                };

                navigateTo("roster");
            },

            emptyMessage:
                "No active PAX have gone 30 or more days without posting.",
        });
    
        const readyToVqSection =
        createLeadershipActionSection({
            title: "Ready to VQ",
    
            description:
                `Active PAX with no recorded Qs, evaluated through ${accelerationAnchorLabel}.`,
    
            groups: insights.readyToVq,
    
            onGroupClick: group => {
                state.rosterFilter = {
                    type: "ready-to-vq",
                    label: group.label,
                    memberIds: group.members
                        .map(member => member.memberId)
                        .filter(Boolean),
                    sourceView: "regionInsights",
                };
    
                navigateTo("roster");
            },
    
            emptyMessage:
                "No active PAX currently meet the VQ candidate criteria.",
        });

        const readyToQAgainSection =
            createLeadershipActionSection({
                title: "Ready to Q Again",

                description:
                    `Active former Qs who may be ready to lead again, evaluated through ${accelerationAnchorLabel}.`,

                groups: insights.readyToQAgain,

                onGroupClick: group => {
                    state.rosterFilter = {
                        type: "ready-to-q-again",
                        label: group.label,
                        memberIds: group.members
                            .map(member => member.memberId)
                            .filter(Boolean),
                        sourceView: "regionInsights",
                    };

                    navigateTo("roster");
                },

                emptyMessage:
                    "No active former Qs currently meet these criteria.",
            });
    
    updateTrendSection();

    const availableAoTrends =
        insights.monthlyAoAttendanceTrend;

    const maxSelectedAos = 8;

    if (!Array.isArray(state.regionTrendAoIds)) {
        state.regionTrendAoIds =
            availableAoTrends
                .slice(0, 3)
                .map(ao => ao.aoId);
    }

    const validAoIds = new Set(
        availableAoTrends.map(ao => ao.aoId)
    );

    state.regionTrendAoIds =
        state.regionTrendAoIds
            .filter(aoId => validAoIds.has(aoId))
            .slice(0, maxSelectedAos);

    if (
        state.regionTrendAoIds.length === 0 &&
        availableAoTrends.length > 0
    ) {
        state.regionTrendAoIds =
            availableAoTrends
                .slice(0, 3)
                .map(ao => ao.aoId);
    }

    const aoTrendSectionHost =
        document.createElement("div");

    aoTrendSectionHost.classList.add(
        "section",
        "insights-chart-section",
        "insights-line-chart-section",
        "region-insights-chart-section"
    );

    const aoTrendHeading =
        document.createElement("div");

    aoTrendHeading.classList.add(
        "insights-section-title"
    );

    aoTrendHeading.textContent =
        "AO Attendance Comparison";

    const aoTrendSelector =
        createAoTrendSelector({
            aos: availableAoTrends,
            selectedAoIds: state.regionTrendAoIds,
            maxSelected: maxSelectedAos,
            onChange: nextAoIds => {
                if (nextAoIds.length === 0) return;

                state.regionTrendAoIds = nextAoIds;

                updateAoTrendSelector();
                updateAoTrendChart();
            },
        });

    const aoTrendChartBody =
        document.createElement("div");

    aoTrendSectionHost.append(
        aoTrendHeading,
        aoTrendSelector,
        aoTrendChartBody
    );

function updateAoTrendSelector() {
    aoTrendSelector
        .querySelectorAll(".region-trend-button")
        .forEach(button => {
            const isSelected =
                state.regionTrendAoIds.includes(
                    button.dataset.aoId
                );

            button.classList.toggle(
                "active",
                isSelected
            );

            button.setAttribute(
                "aria-pressed",
                String(isSelected)
            );

            const selectionLimitReached =
                state.regionTrendAoIds.length >=
                maxSelectedAos;

            button.disabled =
                !isSelected &&
                selectionLimitReached;
        });
}

function updateAoTrendChart() {
    aoTrendChartBody.textContent = "";

    const selectedAos =
        availableAoTrends.filter(ao => {
            return state.regionTrendAoIds
                .includes(ao.aoId);
        });

    const labels =
        insights.monthlyRegionTrend.map(
            month => month.label
        );

    const chartSection =
        createMultiLineChartSection({
            title: "AO Attendance Comparison",

            labels,

            series: selectedAos.map(ao => ({
                key: ao.aoId,
                label: ao.aoName,

                values: ao.months.map(
                    month =>
                        month.averageAttendance
                ),

                months: ao.months,
            })),

            getPointSubtitle: ({
                series,
                pointIndex,
            }) => {
                const month =
                    series.months?.[pointIndex];

                if (!month) return "";

                return (
                    `${month.sessions} session` +
                    `${month.sessions === 1 ? "" : "s"}` +
                    ` • ${month.totalAttendance} total posts`
                );
            },

            emptyMessage:
                "No AO attendance trend data available.",
        });

    const chartChildren =
        [...chartSection.children].slice(1);

    aoTrendChartBody.append(
        ...chartChildren
    );
}

updateAoTrendSelector();
updateAoTrendChart();


const heatMapDays = [
    { key: "Monday", label: "Mon" },
    { key: "Tuesday", label: "Tue" },
    { key: "Wednesday", label: "Wed" },
    { key: "Thursday", label: "Thu" },
    { key: "Friday", label: "Fri" },
    { key: "Saturday", label: "Sat" },
    { key: "Sunday", label: "Sun" },
];

const activeHeatMapDays = heatMapDays.filter(day => {
    return insights.attendanceByAoByDay.some(ao => {
        return ao.days?.[day.key]?.sessions > 0;
    });
});

const aoAttendanceHeatMap =
    createHeatMapSection({
        title: "AO Attendance Heat Map",

        rows: insights.attendanceByAoByDay,

        columns: activeHeatMapDays,

        getRowLabel: ao => ao.aoName,

        getCellValue: (ao, day) => {
            return ao.days?.[day.key]?.averageAttendance || 0;
        },

        getCellSubtitle: (ao, day) => {
            const dayData = ao.days?.[day.key];

            if (!dayData?.sessions) return "";

            return `${dayData.sessions} session${
                dayData.sessions === 1 ? "" : "s"
            }`;
        },

        onCellClick: ({ row }) => {
            state.selectedAoInsights = {
                aoId: row.aoId,
                aoName: row.aoName,
                startDate,
                endDate,
            };

            navigateTo("aoInsights");
        },

        emptyMessage:
            "No AO attendance data available for this month.",
    });

    const attendanceByAoChartSection =
    createHorizontalBarChartSection({
        title: "Average Attendance by AO",
        items: [...insights.attendanceByAo]
            .sort((a, b) => {
                return b.averageAttendance - a.averageAttendance;
            }),
        getLabel: ao => ao.aoName,
        getValue: ao => ao.averageAttendance,
        getSubtitle: ao =>
            `${ao.sessions} session${ao.sessions === 1 ? "" : "s"} • ${ao.fngs} FNG${ao.fngs === 1 ? "" : "s"}`,
        initialCount: 8,
        onItemClick: ao => {
            state.selectedAoInsights = {
                aoId: ao.aoId,
                aoName: ao.aoName,
                startDate,
                endDate,
            };

            navigateTo("aoInsights");
        },
    });

    const qLeadershipChartSection =
        createHorizontalBarChartSection({
            title: "Q Leadership Distribution",
            items: insights.qFrequency,
            getLabel: q => q.paxName,
            getValue: q => q.qCount,
            getSubtitle: q =>
                `${q.averageAttendance} avg attendance • ${q.fngsBrought} FNG${q.fngsBrought === 1 ? "" : "s"} EH'd`,
            initialCount: 10,
            onItemClick: q => {
                state.selectedMemberId = q.memberId;
                navigateTo("memberDetail");
            },
        });

    const postingFrequencySection = createExpandableListSection({
        title: "Posting Frequency",
        items: snapshot.postingFrequency,
        initialCount: 5,
        renderRow: bucket => createInsightsRow({
            title: bucket.label,
            subtitle: "PAX in this range",
            value: bucket.count,
            onClick: () => {
                state.rosterFilter = {
                    type: "posting-frequency",
                    bucket: bucket.label,
                    label: bucket.label,
                    startDate,
                    endDate,
                    sourceView: "regionInsights",
                };
                navigateTo("roster");
            },
        }),
    });

    const overviewPanel =
    document.createElement("div");

    overviewPanel.classList.add(
        "region-insights-panel",
        "region-insights-overview-panel"
    );

    overviewPanel.append(
        monthNavRow,
        overviewSection,
        needsAttentionSection,
        momentumSection,
        trendSectionHost,
        fngPipelineSection,
        aoTrendSectionHost,
        aoAttendanceHeatMap,
        attendanceByAoChartSection,
        qLeadershipChartSection,
        postingFrequencySection,
    );

    const leadershipDepthSection =
        createExpandableListSection({
            title:
                `Leadership Depth • ${leadershipDepth.length} PAX`,

            items: leadershipDepth,

            initialCount: 8,

            renderRow: member =>
                createInsightsRow({
                    title: member.pax_name,

                    subtitle:
                        `${member.post_count} posts • ` +
                        `${member.q_count} Qs`,

                    value: "25 / 5",

                    onClick: () => {
                        state.selectedMemberId =
                            member.member_id;

                        navigateTo("memberDetail");
                    },
                }),
    });

    const leadershipPanel = document.createElement("div");

    leadershipPanel.classList.add(
        "region-insights-panel",
        "region-insights-leadership-panel"
    );

    const leadershipDate = document.createElement("div");

    leadershipDate.classList.add(
        "section",
        "leadership-action-description",
        "region-insights-leadership-date"
    );

    leadershipDate.textContent =
        `Leadership signals updated through ${accelerationAnchorLabel}.`;

    leadershipPanel.append(
        leadershipDate,
        leadershipDepthSection,
        milestoneSection,
        accelerationSection,
        checkTheSixSection,
        readyToVqSection,
        readyToQAgainSection,
    );

    function updateVisibleRegionSection() {
        const showOverview =
            state.regionInsightsSection ===
            "overview";
    
        overviewPanel.hidden =
            !showOverview;
    
        leadershipPanel.hidden =
            showOverview;
    
        sectionSelector
            .querySelectorAll(
                ".region-trend-button"
            )
            .forEach(button => {
                const isActive =
                    button.dataset.sectionKey ===
                    state.regionInsightsSection;
    
                button.classList.toggle(
                    "active",
                    isActive
                );
    
                button.setAttribute(
                    "aria-pressed",
                    String(isActive)
                );
            });
    }
    
    updateVisibleRegionSection();

    const nav = createGlobalNav();

    app.textContent = "";

    app.append(
        header,
        title,
        subtitle,
        sectionSelector,
        overviewPanel,
        leadershipPanel,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}