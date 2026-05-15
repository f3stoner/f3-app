import { state } from "../modules/state.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";

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

function buildAoInsights({ aoName, startDate, endDate }) {
    const sessions = state.sessions.filter(session => {
        const matchesAo = 
        normalizeAoName(session.aoName) ===
        normalizeAoName(aoName);
        const matchesDate =
            session.date >= startDate &&
            session.date <= endDate;

        return matchesAo && matchesDate;
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
        leadershipRisk,
        leadershipRiskSubtitle,
        recentSessions,
    };
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

export function renderAoInsightsView() {
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

    const insights = buildAoInsights(selected);

    const title = document.createElement("h1");
    title.textContent = insights.aoName;

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "AO health and leadership snapshot.";

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

    const leadershipSection = createSection("Leadership Health", leadershipList);

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

    const qRotationSection = createSection("Q Rotation", qRotationList);

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

    const recentSection = createSection("Recent Sessions", recentList);

    const backButton = document.createElement("button");
    backButton.textContent = "Back to Region Insights";
    backButton.addEventListener("click", () => {
        navigateTo("regionInsights");
    });

    const nav = createGlobalNav();

    app.append(
        title,
        subtitle,
        overviewSection,
        leadershipSection,
        qRotationSection,
        recentSection,
        backButton,
        nav,
    );
}