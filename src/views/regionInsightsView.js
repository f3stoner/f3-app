import { state } from "../modules/state.js";
import { buildRegionInsights } from "../modules/insights.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { createIcon } from "../utils/icons.js";
import { ArrowUpRight } from "lucide";

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
    card.classList.add("stat-tile");

    const valueEl = document.createElement("div");
    valueEl.classList.add("stat-value");
    valueEl.textContent = value;

    const labelEl = document.createElement("div");
    labelEl.classList.add("stat-label");
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
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("insights-section-header");

    const headingText = document.createElement("div");
    headingText.classList.add("insights-section-title");
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
    row.classList.add("insights-row");

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

        const icon = createIcon("arrowUpRight", "insights-row-icon");

        row.append(left, valueEl, icon);
    } else {
    row.append(left, valueEl);
    }
    return row;
}

function buildLeadershipSnapshot(insights) {
    const topAos = insights.attendanceByAo.slice(0, 5);
    const topQs = insights.qFrequency.slice(0, 5);

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
        topAos,
        topQs,
        postingFrequency: insights.postingFrequency,
    };
}

function createSimpleListSection(title, items, emptyMessage = "Nothing to show yet.") {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("insights-section-title");
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

export function renderRegionInsightsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Region Insights";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Monthly region report.";

    if (!state.regionInsightsMonth) {
        const { startDate } = getCurrentMonthRange();
        state.regionInsightsMonth = startDate.slice(0,7);
    }

    const selectedMonth = state.regionInsightsMonth;
    const { startDate, endDate } = getMonthRange(selectedMonth);

    const monthNavRow = document.createElement("div");
    monthNavRow.classList.add("q-signup-month-row");

    const previousMonthButton = document.createElement("button");
    previousMonthButton.classList.add("month-nav-button");
    previousMonthButton.textContent = "←";

    previousMonthButton.addEventListener("click", () => {
        state.regionInsightsMonth = shiftMonthKey(selectedMonth, -1);
        renderRegionInsightsView();
    });

    const monthLabel = document.createElement("div");
    monthLabel.classList.add("q-signup-month-label");
    monthLabel.textContent = getMonthLabel(selectedMonth);

    const nextMonthButton = document.createElement("button");
    nextMonthButton.classList.add("month-nav-button");
    nextMonthButton.textContent = "→";

    nextMonthButton.addEventListener("click", () => {
        state.regionInsightsMonth = shiftMonthKey(selectedMonth, 1);
        renderRegionInsightsView();
    });

    monthNavRow.append(previousMonthButton, monthLabel, nextMonthButton);

    const insights = buildRegionInsights({
        sessions: state.sessions,
        members: state.members,
        startDate,
        endDate,
    });

    const snapshot = buildLeadershipSnapshot(insights);

    const overviewSection = document.createElement("div");
    overviewSection.classList.add("section");

    const overviewHeading = document.createElement("div");
    overviewHeading.classList.add("insights-section-title");
    overviewHeading.textContent = "Leadership Snapshot";

    const overviewGrid = document.createElement("div");
    overviewGrid.classList.add("stats-grid");

    overviewGrid.append(
        createMetricCard("Total Posts", snapshot.summary.totalAttendance),
        createMetricCard("Avg Attendance", snapshot.summary.averageAttendance),
        createMetricCard(
            "Active PAX",
            snapshot.summary.uniquePax,
            () => {
                state.rosterFilter = {
                    type: "active-pax",
                    label: "Active PAX",
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
        "Region Pulse",
        snapshot.momentum,
        "No Region Pulse highlights yet."
    );

    const topAoSection = createExpandableListSection({
        title: "AO Activity",
        items: snapshot.topAos,
        initialCount: 5,
        renderRow: ao => createInsightsRow({
            title: ao.aoName,
            subtitle: `${ao.sessions} sessions • ${ao.averageAttendance} avg • ${ao.fngs} FNGs`,
            value: ao.attendance,
            onClick: () => {
                state.selectedAoInsights = {
                    aoName: ao.aoName,
                    startDate,
                    endDate,
                };
                navigateTo("aoInsights");
            },
        }),
    });

    const topQSection = createExpandableListSection({
        title: "Q Leadership",
        items: snapshot.topQs,
        initialCount: 5,
        renderRow: q => createInsightsRow({
            title: q.paxName,
            subtitle: `${q.averageAttendance} avg attendance • ${q.fngsBrought} FNGs EH'd`,
            value: q.qCount,
            onClick: () => {
                state.selectedMemberId = q.memberId;
                navigateTo("memberDetail");
            },
        }), 
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
                };
                navigateTo("roster");
            },
        }),
    });

    const fngSection = document.createElement("div");
    fngSection.classList.add("section");

    const fngHeading = document.createElement("div");
    fngHeading.classList.add("insights-section-title");
    fngHeading.textContent = "FNG Pipeline";

    const fngGrid = document.createElement("div");
    fngGrid.classList.add("stats-grid");

    fngGrid.append(
        createMetricCard("Total FNGs", snapshot.fngStats.totalFngs),
        createMetricCard("Rostered", snapshot.fngStats.rosteredFngs),
        createMetricCard("Unrostered", snapshot.fngStats.unrosteredFngs),
        createMetricCard("Capture Rate", `${snapshot.fngStats.rosterCaptureRate}%`),
    );

    fngSection.append(fngHeading, fngGrid);

    const nav = createGlobalNav();

    app.append(
        title,
        subtitle,
        monthNavRow,
        overviewSection,
        needsAttentionSection,
        momentumSection,
        topAoSection,
        topQSection,
        postingFrequencySection,
        fngSection,
        nav,
    );
}