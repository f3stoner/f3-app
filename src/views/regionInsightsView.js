import { state } from "../modules/state.js";
import { buildRegionInsights } from "../modules/insights.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";

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

function createInsightsRow({ title, subtitle, value }) {
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

    row.append(left, valueEl);

    return row;
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

    console.log("REGION INSIGHTS:", insights);
    console.table(insights.summary);

    const overviewSection = document.createElement("div");
    overviewSection.classList.add("section");

    const attendanceByDaySection = document.createElement("div");
    attendanceByDaySection.classList.add("section");

    const attendanceByDayHeading = document.createElement("div");
    attendanceByDayHeading.classList.add("insights-section-title");
    attendanceByDayHeading.textContent = "Attendance by Day";

    attendanceByDaySection.appendChild(attendanceByDayHeading);

    const attendanceList = document.createElement("div");
    attendanceList.classList.add("insights-list");

    insights.attendanceByDay.forEach(day => {
        const row = document.createElement("div");
        row.classList.add("insights-row");

        const left = document.createElement("div");
        left.classList.add("insights-row-left");
        
        const title = document.createElement("div");
        title.classList.add("insights-row-title");
        title.textContent = day.day;

        const subtitle = document.createElement("div");
        subtitle.classList.add("insights-row-subtitle");
        subtitle.textContent = 
            `${day.sessions} sessions • ${day.averageAttendance} avg attendance`;

        left.append(title, subtitle);

        const value = document.createElement("div");
        value.classList.add("insights-row-value");
        value.textContent = day.attendance;

        row.append(left, value);

        attendanceList.appendChild(row);
    });

    attendanceByDaySection.appendChild(attendanceList);

    const attendanceByAoSection = document.createElement("div");
    attendanceByAoSection.classList.add("section");

    const attendanceByAoHeading = document.createElement("div");
    attendanceByAoHeading.classList.add("insights-section-title");
    attendanceByAoHeading.textContent = "Attendance by AO";

    const attendanceByAoList = document.createElement("div");
    attendanceByAoList.classList.add("insights-list");

    insights.attendanceByAo.forEach(ao => {
        const row = document.createElement("div");
        row.classList.add("insights-row");

        const left = document.createElement("div");
        left.classList.add("insights-row-left");

        const title = document.createElement("div");
        title.classList.add("insights-row-title");
        title.textContent = ao.aoName;

        const subtitle = document.createElement("div");
        subtitle.classList.add("insights-row-subtitle");
        subtitle.textContent =
            `${ao.sessions} sessions • ${ao.averageAttendance} avg • ${ao.fngs} FNGs`;

        left.append(title, subtitle);

        const value = document.createElement("div");
        value.classList.add("insights-row-value");
        value.textContent = ao.attendance;

        row.append(left, value);

        attendanceByAoList.appendChild(row);
    });

    attendanceByAoSection.append(attendanceByAoHeading, attendanceByAoList);

    const qFrequencySection = createExpandableListSection({
        title: "Q Frequency",
        items: insights.qFrequency,
        initialCount: 8,
        renderRow: q => createInsightsRow({
            title: q.paxName,
            subtitle: `${q.averageAttendance} avg attendance • ${q.fngsBrought} FNGS EH'd`,
            value: q.qCount,
        }),
    });

    const postingFrequencySection = document.createElement("div");
    postingFrequencySection.classList.add("section");

    const postingFrequencyHeading = document.createElement("div");
    postingFrequencyHeading.classList.add("insights-section-title");
    postingFrequencyHeading.textContent = "Posting Frequency";

    const postingFrequencyList = document.createElement("div");
    postingFrequencyList.classList.add("insights-list");

    insights.postingFrequency.forEach(bucket => {
        const row = document.createElement("div");
        row.classList.add("insights-row");

        const left = document.createElement("div");
        left.classList.add("insights-row-left");

        const title = document.createElement("div");
        title.classList.add("insights-row-title");
        title.textContent = bucket.label;

        const subtitle = document.createElement("div");
        subtitle.classList.add("insights-row-subtitle");
        subtitle.textContent = "PAX in this range";

        left.append(title, subtitle);

        const value = document.createElement("div");
        value.classList.add("insights-row-value");
        value.textContent = bucket.count;

        row.append(left, value);

        postingFrequencyList.appendChild(row);
    });

    postingFrequencySection.append(postingFrequencyHeading, postingFrequencyList);

    const fngSection = document.createElement("div");
    fngSection.classList.add("section");

    const fngHeading = document.createElement("div");
    fngHeading.classList.add("insights-section-title");
    fngHeading.textContent = "FNG Pipeline";

    const fngGrid = document.createElement("div");
    fngGrid.classList.add("stats-grid");

    fngGrid.append(
        createMetricCard("Total FNGs", insights.fngStats.totalFngs),
        createMetricCard("Rostered", insights.fngStats.rosteredFngs),
        createMetricCard("Unrostered", insights.fngStats.unrosteredFngs),
        createMetricCard("Capture Rate", `${insights.fngStats.rosterCaptureRate}%`),
    );

    fngSection.append(fngHeading, fngGrid);

    const overviewHeading = document.createElement("div");
    overviewHeading.classList.add("insights-section-title");
    overviewHeading.textContent = "Overview";

    const overviewGrid = document.createElement("div");
    overviewGrid.classList.add("stats-grid");

    overviewGrid.append(
        createMetricCard("Total Attendance", insights.summary.totalAttendance),
        createMetricCard("Avg Attendance", insights.summary.averageAttendance),
        createMetricCard("Unique PAX", insights.summary.uniquePax),
        createMetricCard("FNGs", insights.summary.totalFngs),
        createMetricCard("Sessions", insights.summary.totalSessions),
        createMetricCard("Unique Qs", insights.summary.uniqueQs),
    );

    overviewSection.append(overviewHeading, overviewGrid);

    const nav = createGlobalNav();

    app.append(
        title,
        subtitle,
        monthNavRow,
        overviewSection,
        attendanceByDaySection,
        attendanceByAoSection,
        qFrequencySection,
        postingFrequencySection,
        fngSection,
        nav,
    );
}