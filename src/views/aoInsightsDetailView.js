import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";
import { loadAoInsightSessions } from "../services/cloudData.js";
import { buildAttendanceInsight } from "../utils/aoInsights/attendanceInsights.js";
import { buildNewPaxPipelineInsight } from "../utils/aoInsights/newPaxPipelineInsights.js";

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

function createPaxRow({ name, postCount, firstPostDate, lastPostDate, value }) {
    const row = document.createElement("div");
    row.classList.add("insights-row", "pax-pipeline-row");

    const header = document.createElement("div");
    header.classList.add("pax-pipeline-header");

    const titleEl = document.createElement("div");
    titleEl.classList.add("insights-row-title");
    titleEl.textContent = name || "Unnamed PAX";

    const badge = document.createElement("div");
    badge.classList.add("pax-pipeline-badge");
    badge.textContent = value;

    header.append(titleEl, badge);

    const meta = document.createElement("div");
    meta.classList.add("pax-pipeline-meta");

    meta.append(
        createMetaItem("Posts", postCount),
        createMetaItem("First", formatDate(firstPostDate)),
        createMetaItem("Last", formatDate(lastPostDate))
    );

    row.append(header, meta);

    return row;
}

function createMetaItem(label, value) {
    const item = document.createElement("div");
    item.classList.add("pax-pipeline-meta-item");

    const labelEl = document.createElement("span");
    labelEl.classList.add("pax-pipeline-meta-label");
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.classList.add("pax-pipeline-meta-value");
    valueEl.textContent = value ?? "-";

    item.append(labelEl, valueEl);

    return item;
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

function renderNewPaxPipelineDetail({ app, selected, sessions }) {
    const insight = state.selectedAoInsight
        || buildNewPaxPipelineInsight(sessions, {
            anchorDate: selected.endDate,
            memberStats: state.memberStats,
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
        createMetricCard("FNGs", metrics.fngCount),
        createMetricCard("Returned", metrics.returnedCount),
        createMetricCard("Building Habit", metrics.buildingHabitCount),
        createMetricCard("Regulars", metrics.newRegularCount)
    );

    const metricSection = createSection("Pipeline Overview", metricGrid);

    const helper = document.createElement("div");
    helper.classList.add("stats-line");
    helper.textContent =
        "Tracks recent FNGs through the 2, 5, and 10 beatdown milestones.";

    metricSection.appendChild(helper);

    const followUpList = document.createElement("div");
    followUpList.classList.add("insights-list");

    if (!metrics.needsFollowUp.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No recent rostered FNGs currently need follow-up.";
        followUpList.appendChild(empty);
    } else {
        metrics.needsFollowUp.forEach((pax) => {
            followUpList.appendChild(createPaxRow({
                name: pax.name,
                postCount: pax.postCount,
                firstPostDate: pax.firstPostDate,
                lastPostDate: pax.lastPostDate,
                value: "Needs follow-up",
            }));
        });
    }

    const allFngList = document.createElement("div");
    allFngList.classList.add("insights-list");

    if (!metrics.fngs.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No recent FNGs found.";
        allFngList.appendChild(empty);
    } else {
        metrics.fngs.forEach((pax) => {
            allFngList.appendChild(createPaxRow({
                name: pax.name,
                postCount: pax.postCount,
                firstPostDate: pax.firstPostDate,
                lastPostDate: pax.lastPostDate,
                value: pax.pipelineStatus,
            }));
        });
    }

    const allFngSection = createSection("Recent FNGs", allFngList);

    const followUpSection = createSection("Needs Follow-Up", followUpList);

    const habitList = document.createElement("div");
    habitList.classList.add("insights-list");

    if (!metrics.buildingHabit.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No new PAX have reached 5 beatdowns in this window.";
        habitList.appendChild(empty);
    } else {
        metrics.buildingHabit.forEach((pax) => {
            habitList.appendChild(createPaxRow({
                name: pax.name,
                postCount: pax.postCount,
                firstPostDate: pax.firstPostDate,
                lastPostDate: pax.lastPostDate,
                value: "Building habit",
            }));
        });
    }

    const habitSection = createSection("Building Habit", habitList);

    const regularList = document.createElement("div");
    regularList.classList.add("insights-list");

    if (!metrics.newRegulars.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No new PAX reached 10 beatdowns in this window.";
        regularList.appendChild(empty);
    } else {
        metrics.newRegulars.forEach((pax) => {
            regularList.appendChild(createPaxRow({
                name: pax.name,
                postCount: pax.postCount,
                firstPostDate: pax.firstPostDate,
                lastPostDate: pax.lastPostDate,
                value: "Regular",
            }));
        });
    }

    const regularSection = createSection("New Regulars", regularList);

    const rosterGapList = document.createElement("div");
    rosterGapList.classList.add("insights-list");

    if (!metrics.unrosteredFngs.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "All recent FNGs appear to be linked to roster records.";
        rosterGapList.appendChild(empty);
    } else {
        metrics.unrosteredFngs.forEach((pax) => {
            rosterGapList.appendChild(createPaxRow({
                name: pax.name,
                subtitle: `Logged ${formatDate(pax.firstPostDate)}`,
                value: "Unrostered",
            }));
        });
    }

    const rosterGapSection = createSection("Roster Gaps", rosterGapList);

    const sections = [
        summaryCard,
        metricSection,
        allFngSection,
    ];
    
    if (metrics.unrosteredFngs.length) {
        sections.push(rosterGapSection);
    }
    
    app.append(...sections);
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

    historyStartDate.setDate(historyStartDate.getDate() - 180);

    const sessions = await loadAoInsightSessions({
        regionId: state.currentRegionId,
        aoName: selected.aoName,
        startDate: historyStartDate.toISOString().slice(0, 10),
        endDate: selected.endDate,
    });

    if (detailType === "attendance") {
        renderAttendanceDetail({ app, selected, sessions });
    } else if (detailType === "newPaxPipeline") {
        renderNewPaxPipelineDetail({ app, selected, sessions });
    } else {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "This insight detail is not available yet.";
        app.appendChild(empty);
    }

    app.appendChild(createGlobalNav());
}