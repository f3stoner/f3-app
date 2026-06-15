import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createMainMenu, cleanupMainMenu } from "../components/mainMenu.js";
import { loadQReadiness } from "../services/cloudData.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { showToast } from "../utils/toast.js";

export async function renderQReadinessView() {
    cleanupMainMenu();

    const app = document.getElementById("app");
    app.textContent = "";

    const startDate = getNextNonSundayDate(addDays(getTodayDate(), 1));
    const endDate = addNonSundayDays(startDate, 5);

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Q Readiness";

    const summarySection = document.createElement("div");
    summarySection.classList.add("section");

    const summaryTitle = document.createElement("div");
    summaryTitle.classList.add("detail-label");
    summaryTitle.textContent = "Upcoming Q Readiness";

    summarySection.append(summaryTitle);

    const list = document.createElement("div");
    list.classList.add("section");
    list.textContent = "Loading readiness...";

    app.append(header, title, summarySection, list);

    try {
        const rows = await loadQReadiness(state.currentRegionId, startDate, endDate);
        const visibleRows = rows.filter(row => !isSunday(row.date));

        list.textContent = "";

        if (!visibleRows.length) {
            const emptyState = document.createElement("div");
            emptyState.classList.add("empty-state");

            const emptyTitle = document.createElement("p");
            emptyTitle.textContent = "No assigned Qs found.";

            const emptyDetail = document.createElement("p");
            emptyDetail.classList.add("detail-value");
            emptyDetail.textContent = "No Qs are assigned in the selected readiness window.";

            emptyState.append(emptyTitle, emptyDetail);
            list.appendChild(emptyState);
            return;
        }

        const grouped = groupByDate(visibleRows);

        Object.entries(grouped).forEach(([date, dateRows]) => {
            dateRows.sort((a, b) => getSeverity(a) - getSeverity(b));
        
            const dateHeader = document.createElement("div");
            dateHeader.classList.add("detail-label", "session-date-divider");
            dateHeader.textContent = formatDate(date);
        
            list.appendChild(dateHeader);
            list.appendChild(createTableHeader());
        
            dateRows.forEach((row) => {
                list.appendChild(createReadinessRow(row));
            });
        });
    } catch (error) {
        console.error("Failed to load Q readiness", error);
        showToast("Failed to load Q readiness.", "error");

        list.textContent = "";

        const errorState = document.createElement("div");
        errorState.classList.add("empty-state");

        const errorTitle = document.createElement("p");
        errorTitle.textContent = "Could not load readiness data.";

        const errorDetail = document.createElement("p");
        errorDetail.classList.add("detail-value");
        errorDetail.textContent = "Check the console for the Supabase error.";

        errorState.append(errorTitle, errorDetail);
        list.appendChild(errorState);
    }

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function createReadinessRow(row) {
    const rowElement = document.createElement("div");
    rowElement.classList.add("readiness-table-row");

    const statusLabel =
        row.status === "Needs workout"
            ? "🔴 Missing"
            : row.status === "Workout draft"
                ? "🟡 Draft"
                : "🟢 Ready";

    const preblastLabel = row.hasPreblast ? "✅" : "❌";

    const qCell = document.createElement("div");
    qCell.classList.add("readiness-cell", "readiness-q");
    qCell.textContent = row.qName;

    const aoCell = document.createElement("div");
    aoCell.classList.add("readiness-cell", "readiness-ao");
    aoCell.textContent = row.aoName;

    const statusCell = document.createElement("div");
    statusCell.classList.add("readiness-cell", "readiness-status");
    statusCell.textContent = statusLabel;

    const pbCell = document.createElement("div");
    pbCell.classList.add("readiness-cell", "readiness-pb");
    pbCell.textContent = preblastLabel;

    rowElement.append(qCell, aoCell, statusCell, pbCell);

    return rowElement;
}

function createTableHeader() {
    const header = document.createElement("div");
    header.classList.add("readiness-table-header");

    [
        ["readiness-q", "Q Name"],
        ["readiness-ao", "AO"],
        ["readiness-status", "Status"],
        ["readiness-pb", "PB"],
    ].forEach(([className, text]) => {
        const cell = document.createElement("div");
        cell.classList.add("readiness-cell", className);
        cell.textContent = text;
        header.appendChild(cell);
    });

    return header;
}

function getSeverity(row) {
    if (row.status === "Needs workout") return 0;
    if (row.status === "Workout draft") return 1;
    return 2;
}

function groupByDate(rows) {
    return rows.reduce((groups, row) => {
        if (!groups[row.date]) groups[row.date] = [];
        groups[row.date].push(row);
        return groups;
    }, {});
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

function getNextNonSundayDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);

    if (date.getDay() === 0) {
        date.setDate(date.getDate() + 1);
    }

    return date.toISOString().slice(0, 10);
}

function addNonSundayDays(startDateString, daysToInclude) {
    const date = new Date(`${startDateString}T12:00:00`);
    let includedDays = 1;

    while (includedDays < daysToInclude) {
        date.setDate(date.getDate() + 1);

        if (date.getDay() !== 0) {
            includedDays += 1;
        }
    }

    return date.toISOString().slice(0, 10);
}

function isSunday(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    return date.getDay() === 0;
}