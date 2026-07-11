import { createMetricCard, createSection } from "./aoInsightDetailComponents.js";
import { formatDate } from "../../utils/date.js";
import { navigateTo, navigateToPaxProfile } from "../../utils/navigation.js";
import { state } from "../../modules/state.js";
import { buildNewPaxPipelineInsight } from "../../utils/aoInsights/newPaxPipelineInsights.js";

function createPaxRow({ memberId, name, postCount, firstPostDate, lastPostDate, value }) {
    const row = document.createElement("div");
    row.classList.add("insights-row", "pax-pipeline-row");

    if (memberId) {
        row.classList.add("clickable-row");
        row.addEventListener("click", () => {
            navigateToPaxProfile(member.id);
        });
    }

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

export function renderNewPaxPipelineDetail({ app, selected, sessions }) {
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
                memberId: pax.memberId,
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
                memberId: pax.memberId,
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
                memberId: pax.memberId,
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
                memberId: pax.memberId,
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
                memberId: pax.memberId,
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
