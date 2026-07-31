import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";
import { createPaxProfileNav } from "../components/paxProfileNav.js";
import { canViewPaxOverview } from "../utils/permissions.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { getMemberById } from "../utils/memberLookup.js";

function getSelectedMember() {
    return getMemberById(
        state.selectedPaxId
    );
}

function getMemberStats(memberId) {
    return state.memberStats?.find(stat =>
        stat.memberId === memberId || stat.member_id === memberId
    ) || null;
}

function calculateQScore(stats) {
    const posts = Number(stats?.posts) || 0;
    const qs = Number(stats?.qs) || 0;

    if (posts <= 0) return 0;

    return (qs / posts) * 100;
}

function formatPercentage(value) {
    if (!Number.isFinite(value)) return "0%";

    const rounded = Math.round(value * 10) / 10;

    return Number.isInteger(rounded)
        ? `${rounded}%`
        : `${rounded.toFixed(1)}%`;
}

function getLeadershipInsight(stats) {
    const posts = Number(stats?.posts) || 0;
    const qs = Number(stats?.qs) || 0;
    const qScore = calculateQScore({ posts, qs });

    if (posts < 10) {
        return {
            title: "Getting Established",
            message:
                "Keep posting, building relationships, and learning the rhythm of the region. When you are ready, begin looking for an opportunity to lead.",
            tone: "neutral",
        };
    }

    if (qs === 0) {
        return {
            title: "Your First Q Is Ahead",
            message:
                "You have built a foundation through consistent posting. Leading one workout is the next step.",
            tone: "encourage",
        };
    }

    if (qScore < 10) {
        return {
            title: "Room to Step Forward",
            message:
                "You are contributing consistently. Leading a little more often would help share the work of the region.",
            tone: "encourage",
        };
    }

    if (qScore < 20) {
        return {
            title: "Healthy Contributor",
            message:
                "You have developed a healthy balance between posting and leading. Keep building consistency.",
            tone: "positive",
        };
    }

    if (qScore < 30) {
        return {
            title: "Leadership Anchor",
            message:
                "You are a dependable part of the Q rotation. Keep leading, and use your influence to encourage other men to step forward.",
            tone: "positive",
        };
    }

    if (qScore < 40) {
        return {
            title: "Multiplying Leadership",
            message:
                "You are carrying a significant share of the Q rotation. Your next leadership opportunity is helping other men gain the confidence to lead.",
            tone: "watch",
        };
    }

    return {
        title: "Develop the Next Qs",
        message:
            "You have demonstrated a strong willingness to lead. The greatest impact now may come from recruiting, encouraging, and preparing other men to take the Q.",
        tone: "watch",
    };
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

function createMetricCard(label, value, modifier = "") {
    const card = document.createElement("div");
    card.classList.add("pax-metric-card");

    if (modifier) {
        card.classList.add(`pax-metric-card-${modifier}`);
    }

    const valueEl = document.createElement("div");
    valueEl.classList.add("pax-metric-value");
    valueEl.textContent = value ?? "-";

    const labelEl = document.createElement("div");
    labelEl.classList.add("pax-metric-label");
    labelEl.textContent = label;

    card.append(valueEl, labelEl);

    return card;
}

function createLeadershipCard(insight, stats) {
    const card = document.createElement("div");
    card.classList.add(
        "pax-leadership-card",
        `pax-leadership-card-${insight.tone || "neutral"}`
    );

    const eyebrow = document.createElement("div");
    eyebrow.classList.add("detail-label");
    eyebrow.textContent = "Leadership Rhythm";

    const title = document.createElement("div");
    title.classList.add("pax-leadership-title");
    title.textContent = insight.title;

    const body = document.createElement("div");
    body.classList.add("pax-leadership-message");
    body.textContent = insight.message;

    const grid = document.createElement("div");
    grid.classList.add("pax-recent-grid");

    grid.append(
        createMetricCard(
            "Posts · 30 Days",
            stats?.posts30Days ?? "-",
            "compact"
        ),
        createMetricCard(
            "Qs · 30 Days",
            stats?.qs30Days ?? "-",
            "compact"
        ),
        createMetricCard(
            "Posts · 90 Days",
            stats?.posts90Days ?? "-",
            "compact"
        ),
        createMetricCard(
            "Qs · 90 Days",
            stats?.qs90Days ?? "-",
            "compact"
        )
    );

    card.append(eyebrow, title, body, grid);

    return card;
}

function createProfileFact(label, value) {
    const row = document.createElement("div");
    row.classList.add("pax-profile-fact");

    const labelEl = document.createElement("div");
    labelEl.classList.add("pax-profile-fact-label");
    labelEl.textContent = label;

    const valueEl = document.createElement("div");
    valueEl.classList.add("pax-profile-fact-value");
    valueEl.textContent = value || "-";

    row.append(labelEl, valueEl);

    return row;
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

function createActivityRow(session, memberId) {
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

    value.textContent = qIds.includes(memberId)
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
    app.textContent = "";
    
    cleanupMainMenu();

    const member = getSelectedMember();

    const isCurrentUser =
        member?.id === state.currentUserMemberId;

    const header = createAppHeader({
        title: isCurrentUser
            ? "My Profile"
            : "PAX Profile",
        showBack: true,
        showMenu: true,
        fallbackView: "dashboard",
    });

    app.appendChild(header);

    if (!member) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No PAX selected.";

        app.append(empty, createGlobalNav());
        return;
    }

    if (!canViewPaxOverview(member.id)) {
        navigateTo("paxCommunity");
        return;
    }

    const stats = getMemberStats(member.id);
    const sessions = getMemberSessions(member.id);

    const titleSection = document.createElement("div");
    titleSection.classList.add("pax-profile-identity");
    
    const name = document.createElement("h1");
    name.textContent = member.paxName || member.displayName || "Unnamed PAX";
    
    const subtitleParts = [
        member.regionName,
        member.aoName,
    ].filter(Boolean);
    
    const subtitle = document.createElement("div");
    subtitle.classList.add("pax-profile-subtitle");
    subtitle.textContent = subtitleParts.join(" · ");
    
    titleSection.append(name);
    
    if (subtitle.textContent) {
        titleSection.appendChild(subtitle);
    }
    
    const totalPosts = stats?.posts ?? sessions.length;
    const totalQs = stats?.qs ?? 0;
    
    const qScore = calculateQScore({
        posts: totalPosts,
        qs: totalQs,
    });
    
    const overallGrid = document.createElement("div");
    overallGrid.classList.add("pax-overall-grid");
    
    overallGrid.append(
        createMetricCard("Posts", totalPosts),
        createMetricCard("Qs Led", totalQs),
        createMetricCard("Q Score", formatPercentage(qScore)),
        createMetricCard("FNGs EH’d", stats?.fngsEh ?? 0)
    );
    
    const overallSection = createSection("Overall", overallGrid);
    
    const leadershipInsight = getLeadershipInsight({
        posts: totalPosts,
        qs: totalQs,
    });
    
    const leadershipCard = createLeadershipCard(
        leadershipInsight,
        stats
    );
    
    const leadershipSection = document.createElement("div");
    leadershipSection.classList.add("section");
    leadershipSection.appendChild(leadershipCard);
    
    const profileFacts = document.createElement("div");
    profileFacts.classList.add("pax-profile-facts");

    function formatOptionalDate(date) {
        return date ? formatDate(date) : "-";
    }
    
    profileFacts.append(
        createProfileFact(
            "First Post",
            formatOptionalDate(
                stats?.firstPostDate || sessions.at(-1)?.date
            )
        ),
        createProfileFact(
            "Last Post",
            formatOptionalDate(
                stats?.lastPostDate || sessions[0]?.date
            )
        ),
        createProfileFact(
            "Last Q",
            formatOptionalDate(stats?.lastQDate)
        ),
        createProfileFact(
            "Favorite AO",
            stats?.favoriteAo || "-"
        )
    );
    
    const profileSection = createSection("Profile", profileFacts);

    const recentList = document.createElement("div");
    recentList.classList.add("insights-list");

    if (!sessions.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No recent sessions found.";
        recentList.appendChild(empty);
    } else {
        sessions.slice(0, 12).forEach(session => {
            recentList.appendChild(createActivityRow(session, member.id));
        });
    }

    const recentSection = createSection("Recent Activity", recentList);

    const profileNav = createPaxProfileNav("paxProfile");

    app.append(
        titleSection,
        profileNav,
        overallSection,
        leadershipSection,
        profileSection,
        recentSection,
        createGlobalNav()
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}