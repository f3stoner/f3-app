import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";

function getSelectedMember() {
    return state.members.find(member => member.id === state.selectedPaxId) || null;
}

function getMemberStats(memberId) {
    return state.memberStats?.find(stat =>
        stat.memberId === memberId || stat.member_id === memberId
    ) || null;
}

function getStatValue(stat, keys, fallback = "-") {
    for (const key of keys) {
        if (stat?.[key] !== undefined && stat?.[key] !== null) {
            return stat[key];
        }
    }

    return fallback;
}

function getMemberSessions(memberId) {
    return state.sessions
        .filter(session => {
            const attendeeIds = Array.isArray(session.attendeeIds)
                ? session.attendeeIds
                : [];

            const fngMemberIds = Array.isArray(session.fngs)
                ? session.fngs.map(fng => fng?.memberId).filter(Boolean)
                : [];

            return attendeeIds.includes(memberId) || fngMemberIds.includes(memberId);
        })
        .sort((a, b) => b.date.localeCompare(a.date));
}

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

function createActivityRow(session) {
    const row = document.createElement("div");
    row.classList.add("insights-row", "clickable-row");

    const left = document.createElement("div");
    left.classList.add("insights-row-left");

    const title = document.createElement("div");
    title.classList.add("insights-row-title");
    title.textContent = formatDate(session.date);

    const subtitle = document.createElement("div");
    subtitle.classList.add("insights-row-subtitle");
    subtitle.textContent = session.aoName || "Unknown AO";

    left.append(title, subtitle);

    const value = document.createElement("div");
    value.classList.add("insights-row-value");
    const qIds = Array.isArray(session.qIds)
        ? session.qIds
        : session.qId
            ? [session.qId]
            : [];

    value.textContent = qIds.includes(state.selectedPaxId)
        ? "Q"
        : "Post";

    row.append(left, value);

    row.addEventListener("click", () => {
        state.selectedSessionId = session.id;
        navigateTo("sessionDetail");
    });

    return row;
}

export function renderPaxProfileView() {
    const app = document.getElementById("app");

    const member = getSelectedMember();

    const header = createAppHeader({
        title: "PAX Profile",
        showBack: true,
        showMenu: true,
        fallbackView: "aoInsightDetail",
    });

    app.textContent = "";
    app.appendChild(header);

    if (!member) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No PAX selected.";

        app.append(empty, createGlobalNav());
        return;
    }

    const stats = getMemberStats(member.id);
    const sessions = getMemberSessions(member.id);

    const titleSection = document.createElement("div");
    titleSection.classList.add("section", "pax-profile-header");

    const name = document.createElement("h1");
    name.textContent = member.paxName || member.displayName || "Unnamed PAX";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = member.regionName || member.aoName || "";

    titleSection.append(name, subtitle);

    const metricGrid = document.createElement("div");
    metricGrid.classList.add("stats-grid");

    metricGrid.append(
        createMetricCard("Posts", getStatValue(stats, ["totalPosts", "total_posts", "postCount", "post_count"], sessions.length)),
        createMetricCard("Qs", getStatValue(stats, ["totalQs", "total_qs", "qCount", "q_count"], "-")),
        createMetricCard("First Post", formatDate(getStatValue(stats, ["firstPostDate", "first_post_date"], sessions.at(-1)?.date))),
        createMetricCard("Last Post", formatDate(getStatValue(stats, ["lastPostDate", "last_post_date"], sessions[0]?.date)))
    );

    const engagementSection = createSection("Engagement", metricGrid);

    const recentList = document.createElement("div");
    recentList.classList.add("insights-list");

    if (!sessions.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No recent sessions found.";
        recentList.appendChild(empty);
    } else {
        sessions.slice(0, 12).forEach(session => {
            recentList.appendChild(createActivityRow(session));
        });
    }

    const recentSection = createSection("Recent Activity", recentList);

    app.append(
        titleSection,
        engagementSection,
        recentSection,
        createGlobalNav()
    );
}