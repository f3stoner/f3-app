import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import {
    createMainMenu,
    cleanupMainMenu,
} from "../components/mainMenu.js";
import { loadSessionAudit } from "../services/cloudData.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { showToast } from "../utils/toast.js";
import {
    canEditAoSession,
    canEditAnySessions,
} from "../utils/permissions.js";
import { startSessionFromQSlot } from "../utils/sessionNavigation.js";
import { navigateTo } from "../utils/navigation.js";
import { canViewSessionAudit, canViewAnySessionAudit } from "../utils/permissions.js";

const DEFAULT_AUDIT_DAYS = 14;

export async function renderSessionAuditView() {
    cleanupMainMenu();

    const app = document.getElementById("app");
    app.textContent = "";

    if (!canViewAnySessionAudit()) {
        app.textContent = "You do not have permission to view session audit.";
        return;
    }

    const today = getTodayDate();
    const endDate = addDays(today, -1);
    const startDate = addDays(
        endDate,
        -(DEFAULT_AUDIT_DAYS - 1)
    );

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Session Audit";

    const description = document.createElement("p");
    description.classList.add("detail-value");
    description.textContent =
        `Scheduled AO sessions from the past ${DEFAULT_AUDIT_DAYS} days.`;

    const summarySection = document.createElement("div");
    summarySection.classList.add("section");
    summarySection.textContent = "Loading summary...";

    const listSection = document.createElement("div");
    listSection.classList.add("section");
    listSection.textContent = "Loading sessions...";

    app.append(
        header,
        title,
        description,
        summarySection,
        listSection
    );

    try {
        const rows = await loadSessionAudit(
            state.currentRegionId,
            startDate,
            endDate
        );

        const visibleRows = rows
            .filter(row => canViewSessionAudit(row.aoId))
            .sort(compareAuditRows);

        renderSummary(summarySection, visibleRows);
        renderAuditRows(listSection, visibleRows);
    } catch (error) {
        console.error("Failed to load session audit", error);
        showToast("Failed to load session audit.", "error");

        summarySection.textContent = "";
        listSection.textContent = "";

        const errorState = document.createElement("div");
        errorState.classList.add("empty-state");

        const errorTitle = document.createElement("p");
        errorTitle.textContent = "Could not load session audit.";

        const errorDetail = document.createElement("p");
        errorDetail.classList.add("detail-value");
        errorDetail.textContent =
            "Check the console for the Supabase error.";

        errorState.append(errorTitle, errorDetail);
        listSection.appendChild(errorState);
    }

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function renderSummary(container, rows) {
    container.textContent = "";

    const summaryTitle = document.createElement("div");
    summaryTitle.classList.add("detail-label");
    summaryTitle.textContent = `Past ${DEFAULT_AUDIT_DAYS} Days`;

    const counts = rows.reduce(
        (summary, row) => {
            if (row.status in summary) {
                summary[row.status] += 1;
            }

            return summary;
        },
        {
            missing: 0,
            unclaimed: 0,
            logged: 0,
        }
    );

    const total = rows.length;
    const completionRate = total
        ? Math.round((counts.logged / total) * 100)
        : 0;

    const summaryValues = document.createElement("div");

    [
        `Missing: ${counts.missing}`,
        `Unclaimed: ${counts.unclaimed}`,
        `Logged: ${counts.logged}`,
        `Completion: ${completionRate}%`,
    ].forEach(text => {
        const value = document.createElement("p");
        value.classList.add("detail-value");
        value.textContent = text;
        summaryValues.appendChild(value);
    });

    container.append(summaryTitle, summaryValues);
}

function renderAuditRows(container, rows) {
    container.textContent = "";

    if (!rows.length) {
        const emptyState = document.createElement("div");
        emptyState.classList.add("empty-state");

        const emptyTitle = document.createElement("p");
        emptyTitle.textContent = "No scheduled sessions found.";

        const emptyDetail = document.createElement("p");
        emptyDetail.classList.add("detail-value");
        emptyDetail.textContent =
            "There were no Q slots for your managed AOs during this period.";

        emptyState.append(emptyTitle, emptyDetail);
        container.appendChild(emptyState);
        return;
    }

    const needsReview = rows.filter(row => row.status !== "logged");
    const logged = rows.filter(row => row.status === "logged");

    const reviewTitle = document.createElement("div");
    reviewTitle.classList.add("detail-label");
    reviewTitle.textContent = `Needs Review (${needsReview.length})`;

    container.appendChild(reviewTitle);

    if (!needsReview.length) {
        const completeState = document.createElement("div");
        completeState.classList.add("empty-state");

        const completeTitle = document.createElement("p");
        completeTitle.textContent = "All scheduled sessions are accounted for.";

        const completeDetail = document.createElement("p");
        completeDetail.classList.add("detail-value");
        completeDetail.textContent =
            "No missing or unclaimed sessions were found.";

        completeState.append(completeTitle, completeDetail);
        container.appendChild(completeState);
    } else {
        needsReview.forEach(row => {
            container.appendChild(createAuditRow(row));
        });
    }

    if (logged.length > 0) {
        const loggedDetails = document.createElement("details");
        loggedDetails.classList.add("session-audit-logged");

        const loggedSummary = document.createElement("summary");
        loggedSummary.textContent =
            `Show ${logged.length} Logged Session${logged.length === 1 ? "" : "s"}`;

        const loggedList = document.createElement("div");

        logged.forEach(row => {
            loggedList.appendChild(createAuditRow(row));
        });

        loggedDetails.append(loggedSummary, loggedList);
        container.appendChild(loggedDetails);
    }
}

function createAuditRow(row) {
    const rowElement = document.createElement("div");

    rowElement.classList.add(
        "session-audit-row",
        `session-audit-${row.status}`
    );

    const date = document.createElement("div");
    date.classList.add("detail-label");
    date.textContent = formatDate(row.date);

    const ao = document.createElement("p");
    ao.classList.add("detail-value");
    ao.textContent = row.aoName || "Unknown AO";

    const q = document.createElement("p");
    q.classList.add("detail-value");
    q.textContent = row.qName
        ? `Q: ${row.qName}`
        : "No Q assigned";

    const status = document.createElement("p");
    status.classList.add("detail-value");
    status.textContent = getStatusLabel(row.status);

    const actions = document.createElement("div");
    actions.classList.add("session-audit-actions");

    if (row.status === "missing" || row.status === "unclaimed") {
        const logButton = document.createElement("button");
        logButton.type = "button";
        logButton.textContent = "Log Session";

        logButton.addEventListener("click", () => {
            startSessionFromQSlot(row);
        });

        actions.appendChild(logButton);
    }

    if (row.status === "logged" && row.sessionId) {
        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.classList.add("secondary-button");
        viewButton.textContent = "View Session";

        viewButton.addEventListener("click", () => {
            state.selectedSessionId = row.sessionId;
            state.editingSessionId = null;
            state.draftSession = null;

            navigateTo("sessionDetail");
        });

        actions.appendChild(viewButton);
    }

    rowElement.append(date, ao, q, status);

    if (actions.childElementCount > 0) {
        rowElement.appendChild(actions);
    }

    return rowElement;
}

function getStatusLabel(status) {
    if (status === "missing") {
        return "❌ No session logged";
    }

    if (status === "unclaimed") {
        return "⚠️ Unclaimed and not logged";
    }

    if (status === "logged") {
        return "✅ Logged";
    }

    return "Unknown status";
}

function compareAuditRows(a, b) {
    const priority = {
        missing: 0,
        unclaimed: 1,
        logged: 2,
    };

    const priorityDifference =
        (priority[a.status] ?? 99) -
        (priority[b.status] ?? 99);

    if (priorityDifference !== 0) {
        return priorityDifference;
    }

    const dateDifference = b.date.localeCompare(a.date);

    if (dateDifference !== 0) {
        return dateDifference;
    }

    return String(a.aoName || "").localeCompare(
        String(b.aoName || "")
    );
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}