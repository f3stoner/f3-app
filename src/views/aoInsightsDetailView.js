import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";
import { loadAoInsightSessions } from "../services/cloudData.js";
import { buildAttendanceInsight } from "../utils/aoInsights/attendanceInsights.js";

function createMetricCard(label, value) {
    const card = document.createElement("div");
    card.classList.add("stat-tile");

    const valueEl = document.createElement("div");
    valueEl.classList.add("stat-value");
    valueEl.textContent = value ?? "-";

    const labelEl = document.createElement("div");
    labelEl.classList.add("stat-label");
    labelEl.textContent = label;

    card.append(valueEl, labelEl);

    return card;
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

function createDetailRow({ title, subtitle, value }) {
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
    valueEl.textContent = value ?? "-";

    row.append(left, valueEl);

    return row;
}

function formatAverage(value) {
    if (value === null || value === undefined) return "-";
    return value.toFixed ? value.toFixed(1).replace(".0", "") : value;
}

function formatPercent(value) {
    if (value === null || value === undefined) return "-";

    const rounded = Math.round(value);
    const direction = rounded > 0 ? "+" : "";

    return `${direction}${rounded}%`;
}

function renderAttendanceDetail({ app, selected, sessions }) {
    const insight = buildAttendanceInsight(sessions, {
        anchorDate: selected.endDate,
    });
    const metrics = insight.metrics;

    const summaryCard = document.createElement("div");
    summaryCard.classList.add(
        "section",
        "insight-briefing-card",
        `insight-briefing-${insight.status}`
    );

    const label = document.createElement("div");
    label.classList.add("insight-briefing-label");
    label.textContent = insight.title;

    const headline = document.createElement("h3");
    headline.classList.add("insight-briefing-headline");
    headline.textContent = insight.headline;

    const story = document.createElement("p");
    story.classList.add("insight-briefing-story");
    story.textContent = insight.story;

    summaryCard.append(label, headline, story);

    const metricGrid = document.createElement("div");
    metricGrid.classList.add("stats-grid");

    metricGrid.append(
        createMetricCard("Last Month Avg", formatAverage(metrics.currentAverage)),
        createMetricCard("Prior Month Avg", formatAverage(metrics.previousAverage)),
        createMetricCard("Month Change", formatPercent(metrics.percentChange)),
        createMetricCard("Logged Sessions", metrics.completedSessionCount)
    );

    const metricSection = createSection("Overview", metricGrid);

    const overviewHelper = document.createElement("div");
    overviewHelper.classList.add("stats-line");
    overviewHelper.textContent =
        "Compares logged attendance from the last 28 days against the 28 days before that.";

    metricSection.appendChild(overviewHelper);

    const weekdayList = document.createElement("div");
    weekdayList.classList.add("insights-list");

    if (!metrics.weekdayBreakdown.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No weekday breakdown available yet.";
        weekdayList.appendChild(empty);
    } else {
        metrics.weekdayBreakdown.forEach(day => {
            const hasPrevious = day.previousAverage !== null && day.previousAverage !== undefined;
            const hasCurrent = day.currentAverage !== null && day.currentAverage !== undefined;
        
            const subtitle = hasPrevious && hasCurrent
                ? `${formatAverage(day.previousAverage)} → ${formatAverage(day.currentAverage)} avg attendance`
                : hasCurrent
                    ? `${formatAverage(day.currentAverage)} avg attendance in the last month`
                    : `${formatAverage(day.previousAverage)} avg attendance in the prior month`;
        
            const value = day.percentChange === null
                ? hasCurrent ? "New" : "No recent"
                : formatPercent(day.percentChange);
        
            weekdayList.appendChild(createDetailRow({
                title: day.weekday,
                subtitle,
                value,
            }));
        });
    }

    const weekdaySection = createSection("Weekday Breakdown", weekdayList);

    const sessionList = document.createElement("div");
    sessionList.classList.add("insights-list");

    metrics.allSessions
        .slice()
        .reverse()
        .slice(0, 12)
        .forEach(session => {
            sessionList.appendChild(createDetailRow({
                title: formatDate(session.date),
                subtitle: session.weekday,
                value: session.attendance,
            }));
        });

    if (!metrics.allSessions.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No sessions found.";
        sessionList.appendChild(empty);
    }

    const sessionSection = createSection("Recent Sessions", sessionList);

    app.append(
        summaryCard,
        metricSection,
        weekdaySection,
        sessionSection
    );
}

export async function renderAoInsightDetailView() {
    const app = document.getElementById("app");

    const selected = state.selectedAoInsights;
    const detailType = state.selectedAoInsightDetail;

    const header = createAppHeader({
        title: "Insight Detail",
        showBack: true,
        showMenu: true,
        fallbackView: "aoInsights",
    });

    app.textContent = "";
    app.appendChild(header);

    if (!selected || !detailType) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No insight selected.";

        const backButton = document.createElement("button");
        backButton.textContent = "Back to AO Insights";
        backButton.addEventListener("click", () => {
            navigateTo("aoInsights");
        });

        app.append(empty, backButton, createGlobalNav());
        return;
    }

    const anchorDate = new Date(`${selected.endDate}T00:00:00`);
    const historyStartDate = new Date(anchorDate);

    historyStartDate.setDate(historyStartDate.getDate() - 56);

    const sessions = await loadAoInsightSessions({
        regionId: state.currentRegionId,
        aoName: selected.aoName,
        startDate: historyStartDate.toISOString().slice(0, 10),
        endDate: selected.endDate,
    });

    if (detailType === "attendance") {
        renderAttendanceDetail({ app, selected, sessions });
    } else {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "This insight detail is not available yet.";
        app.appendChild(empty);
    }

    app.appendChild(createGlobalNav());
}