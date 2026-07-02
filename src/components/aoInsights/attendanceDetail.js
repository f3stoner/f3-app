import { createMetricCard, createSection, createDetailRow, formatAverage, formatPercent } from "./aoInsightDetailComponents.js";
import { buildAttendanceInsight } from "../../utils/aoInsights/attendanceInsights.js";
import { state } from "../../modules/state.js";
import { formatDate } from "../../utils/date.js";


export function renderAttendanceDetail({ app, selected, sessions }) {
    const insight = state.selectedAoInsight
        || buildAttendanceInsight(sessions, {
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
