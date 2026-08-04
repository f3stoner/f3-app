import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import {
    createMainMenu,
    cleanupMainMenu,
} from "../components/mainMenu.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { showToast } from "../utils/toast.js";
import {
    canEditAoSession,
    canEditAnySessions,
} from "../utils/permissions.js";
import { startSessionFromQSlot } from "../utils/sessionNavigation.js";
import { navigateTo } from "../utils/navigation.js";
import { canViewSessionAudit, canViewAnySessionAudit } from "../utils/permissions.js";
import {
    ignoreSessionAuditSlot,
    loadSessionAudit,
    restoreSessionAuditSlot,
} from "../services/cloudData.js";

const DEFAULT_AUDIT_DAYS = 14;
let showIgnoredSessions = false;

let expandedDuplicateKey = null;
let sessionAuditScrollY = 0;

export async function renderSessionAuditView() {
    cleanupMainMenu();

    const app = document.getElementById("app");
    app.textContent = "";

    if (!canViewAnySessionAudit()) {
        app.textContent = "You do not have permission to view session audit.";
        return;
    }

    const today = getTodayDate();
    const endDate = today;
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
        `Scheduled AO sessions from today and the previous ${DEFAULT_AUDIT_DAYS - 1} days.`;

    const summarySection = document.createElement("div");
    summarySection.classList.add("section");
    summarySection.textContent = "Loading summary...";

    const duplicateSection =
        document.createElement("div");

    duplicateSection.classList.add("section");
    duplicateSection.textContent =
        "Loading potential duplicates...";

    const listSection = document.createElement("div");
    listSection.classList.add("section");
    listSection.textContent = "Loading sessions...";

    app.append(
        header,
        title,
        description,
        summarySection,
        duplicateSection,
        listSection
    );

    try {
        const {
            rows,
            duplicateGroups,
        } = await loadSessionAudit(
            state.currentRegionId,
            startDate,
            endDate
        );

        const permittedRows = rows
            .filter(row => canViewSessionAudit(row.aoId))
            .sort(compareAuditRows);

        const permittedDuplicateGroups =
            (duplicateGroups || [])
                .filter(group =>
                    canViewSessionAudit(group.aoId)
                );

        const summaryRows = permittedRows.filter(
            row =>
                row.status !== "ignored" &&
                row.status !== "pending"
        );
        
        renderSummary(summarySection, summaryRows);

        renderPotentialSessionDuplicates(
            duplicateSection,
            permittedDuplicateGroups
        );

        renderAuditRows(listSection, permittedRows);
        restoreSessionAuditPosition();
    } catch (error) {
        console.error("Failed to load session audit", error);
        showToast("Failed to load session audit.", "error");

        summarySection.textContent = "";
        duplicateSection.textContent = "";
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

    const summaryTitle =
        document.createElement("div");

    summaryTitle.classList.add(
        "detail-label",
        "session-audit-section-title"
    );

    summaryTitle.textContent = "Audit Summary";

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
        ? Math.round(
            (counts.logged / total) * 100
        )
        : 0;

    const summaryGrid =
        document.createElement("div");

    summaryGrid.classList.add(
        "session-audit-summary-grid"
    );

    [
        {
            label: "Logged",
            value: counts.logged,
        },
        {
            label: "Missing",
            value: counts.missing,
        },
        {
            label: "Unclaimed",
            value: counts.unclaimed,
        },
        {
            label: "Completion",
            value: `${completionRate}%`,
        },
    ].forEach(item => {
        const metric =
            document.createElement("div");

        metric.classList.add(
            "session-audit-summary-metric"
        );

        const label =
            document.createElement("span");

        label.classList.add(
            "session-audit-summary-label"
        );

        label.textContent = item.label;

        const value =
            document.createElement("strong");

        value.classList.add(
            "session-audit-summary-value"
        );

        value.textContent = item.value;

        metric.append(label, value);
        summaryGrid.appendChild(metric);
    });

    container.append(
        summaryTitle,
        summaryGrid
    );
}

function renderPotentialSessionDuplicates(
    container,
    groups
) {
    container.textContent = "";

    const title = document.createElement("div");
    title.classList.add(
        "detail-label",
        "session-audit-section-title"
    );
    title.textContent =
        `Potential Duplicates (${groups.length})`;

    container.appendChild(title);

    if (!groups.length) {
        const emptyState =
            document.createElement("div");

        emptyState.classList.add("empty-state");

        const emptyTitle =
            document.createElement("p");

        emptyTitle.textContent =
            "No potential duplicate sessions found.";

        const emptyDetail =
            document.createElement("p");

        emptyDetail.classList.add("detail-value");
        emptyDetail.textContent =
            "Sessions are flagged when the same user logs multiple sessions for the same AO, date, and time.";

        emptyState.append(
            emptyTitle,
            emptyDetail
        );

        container.appendChild(emptyState);
        return;
    }

    groups.forEach(group => {
        container.appendChild(
            createPotentialDuplicateGroup(group)
        );
    });
}

function createPotentialDuplicateGroup(group) {
    const duplicateKey =
        createDuplicateGroupKey(group);

    const groupElement =
        document.createElement("div");

    groupElement.classList.add(
        "session-audit-duplicate-card"
    );

    groupElement.dataset.duplicateKey =
        duplicateKey;

    const headingRow =
        document.createElement("div");

    headingRow.classList.add(
        "session-audit-duplicate-heading"
    );

    const headingText =
        document.createElement("div");

    const heading =
        document.createElement("div");

    heading.classList.add(
        "session-audit-duplicate-ao"
    );

    heading.textContent =
        group.aoName || "Unknown AO";

    const meta =
        document.createElement("p");

    meta.classList.add(
        "session-audit-duplicate-meta"
    );

    meta.textContent = [
        formatDate(group.date),
        formatAuditTime(group.startTime),
    ].join(" · ");

    headingText.append(
        heading,
        meta
    );

    const warningBadge =
        document.createElement("span");

    warningBadge.classList.add(
        "session-audit-warning-badge"
    );

    warningBadge.textContent =
        `${group.sessions.length} sessions`;

    headingRow.append(
        headingText,
        warningBadge
    );

    const status =
        document.createElement("p");

    status.classList.add(
        "session-audit-duplicate-status"
    );

    status.textContent =
        "These sessions were logged by the same user for the same AO, date, and time.";

    const details =
        document.createElement("details");

    details.classList.add(
        "session-audit-duplicate-details"
    );

    details.dataset.duplicateKey =
        duplicateKey;

    details.addEventListener("toggle", () => {
        if (details.open) {
            expandedDuplicateKey =
                duplicateKey;
        } else if (
            expandedDuplicateKey ===
            duplicateKey
        ) {
            expandedDuplicateKey = null;
        }
    });

    const summary =
        document.createElement("summary");

    summary.textContent = "Review Sessions";

    const sessionList =
        document.createElement("div");

    sessionList.classList.add(
        "session-audit-duplicate-list"
    );

    group.sessions.forEach(
        (session, index) => {
            sessionList.appendChild(
                createPotentialDuplicateSessionRow(
                    session,
                    index,
                    duplicateKey
                )
            );
        }
    );

    details.append(
        summary,
        sessionList
    );

    groupElement.append(
        headingRow,
        status,
        details
    );

    return groupElement;
}

function createPotentialDuplicateSessionRow(
    session,
    index,
    duplicateKey
) {
    const row =
        document.createElement("div");

    row.classList.add(
        "session-audit-duplicate-session"
    );

    const content =
        document.createElement("div");

    content.classList.add(
        "session-audit-duplicate-session-content"
    );

    const label =
        document.createElement("div");

    label.classList.add(
        "session-audit-duplicate-session-label"
    );

    label.textContent =
        `Session ${index + 1}`;

    const created =
        document.createElement("p");

    created.classList.add(
        "session-audit-duplicate-session-created"
    );

    created.textContent =
        formatAuditCreatedAt(
            session.createdAt
        );

    const metrics =
        document.createElement("p");

    metrics.classList.add(
        "session-audit-duplicate-session-metrics"
    );

    metrics.textContent =
        `${session.attendanceCount} attending · ${session.fngCount} FNG${session.fngCount === 1 ? "" : "s"}`;

    content.append(
        label,
        created,
        metrics
    );

    const viewButton =
        document.createElement("button");

    viewButton.type = "button";
    viewButton.classList.add(
        "secondary-button",
        "session-audit-duplicate-open"
    );

    viewButton.textContent =
        "Open";

    viewButton.addEventListener(
        "click",
        () => {
            expandedDuplicateKey =
                duplicateKey;

            sessionAuditScrollY =
                window.scrollY;

            state.selectedSessionId =
                session.sessionId;

            state.editingSessionId = null;
            state.draftSession = null;

            navigateTo("sessionDetail");
        }
    );

    row.append(
        content,
        viewButton
    );

    return row;
}

function renderAuditRows(container, rows) {
    container.textContent = "";

    const ignored = rows.filter(row => row.status === "ignored");

    const displayRows = showIgnoredSessions
        ? rows
        : rows.filter(row => row.status !== "ignored");

    if (!displayRows.length && !ignored.length) {
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

    if (ignored.length > 0) {
        const ignoredToggle = document.createElement("label");
        ignoredToggle.classList.add("session-audit-ignore-toggle");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = showIgnoredSessions;

        checkbox.addEventListener("change", () => {
            showIgnoredSessions = checkbox.checked;
            renderAuditRows(container, rows);
        });

        const toggleText = document.createElement("span");
        toggleText.textContent =
            `Show ignored (${ignored.length})`;

        ignoredToggle.append(checkbox, toggleText);
        container.appendChild(ignoredToggle);
    }

    const pendingToday = displayRows.filter(
        row => row.status === "pending"
    );
    
    const needsReview = displayRows.filter(
        row =>
            row.status === "missing" ||
            row.status === "unclaimed"
    );
    
    const logged = displayRows.filter(
        row => row.status === "logged"
    );

    const visibleIgnored = displayRows.filter(
        row => row.status === "ignored"
    );

    if (pendingToday.length > 0) {
        const pendingTitle = document.createElement("div");
        pendingTitle.classList.add("detail-label");
        pendingTitle.textContent =
            `Today — Pending Log (${pendingToday.length})`;
    
        container.appendChild(pendingTitle);
    
        pendingToday.forEach(row => {
            container.appendChild(createAuditRow(row));
        });
    }

    const reviewTitle = document.createElement("div");
    reviewTitle.classList.add("detail-label");
    reviewTitle.textContent =
        `Needs Review (${needsReview.length})`;

    container.appendChild(reviewTitle);

    if (!needsReview.length) {
        const completeState = document.createElement("div");
        completeState.classList.add("empty-state");

        const completeTitle = document.createElement("p");
        completeTitle.textContent =
            "All scheduled sessions are accounted for.";

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

    if (visibleIgnored.length > 0) {
        const ignoredTitle = document.createElement("div");
        ignoredTitle.classList.add("detail-label");
        ignoredTitle.textContent =
            `Ignored (${visibleIgnored.length})`;

        container.appendChild(ignoredTitle);

        visibleIgnored.forEach(row => {
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

    const loggedBy =
        document.createElement("p");
    
    loggedBy.classList.add(
        "detail-value",
        "session-audit-logged-by"
    );
    
    loggedBy.textContent =
        `Logged by: ${row.loggedByName}`;
    
    const status = document.createElement("p");
    status.classList.add("detail-value");
    status.textContent = getStatusLabel(row);

    const actions = document.createElement("div");
    actions.classList.add("session-audit-actions");

    if (row.status === "pending" && !row.qId) {
        const logButton = document.createElement("button");
        logButton.type = "button";
        logButton.textContent = "Log Session";
    
        logButton.addEventListener("click", () => {
            startSessionFromQSlot(row);
        });
    
        actions.appendChild(logButton);
    }

    if (row.status === "missing" || row.status === "unclaimed") {
        const logButton = document.createElement("button");
        logButton.type = "button";
        logButton.textContent = "Log Session";
    
        logButton.addEventListener("click", () => {
            startSessionFromQSlot(row);
        });
    
        const ignoreButton = document.createElement("button");
        ignoreButton.type = "button";
        ignoreButton.classList.add("secondary-button");
        ignoreButton.textContent = "Ignore";

        ignoreButton.addEventListener("click", async () => {
            const confirmed = window.confirm(
                `Ignore the ${row.aoName || "AO"} session scheduled for ${formatDate(row.date)}?`
            );

            if (!confirmed) {
                return;
            }

            ignoreButton.disabled = true;

            try {
                await ignoreSessionAuditSlot(state.currentRegionId, row.slotId);
                showToast("Session audit item ignored.", "success");
                await renderSessionAuditView();
            } catch (error) {
                console.error("Failed to ignore session audit item", error);
                showToast("Failed to ignore session audit item.", "error");
                ignoreButton.disabled = false;
            }
        });

        actions.append(logButton, ignoreButton);
    }

    if (row.status === "ignored") {
        const restoreButton = document.createElement("button");
        restoreButton.type = "button";
        restoreButton.classList.add("secondary-button");
        restoreButton.textContent = "Restore";
    
        restoreButton.addEventListener("click", async () => {
            restoreButton.disabled = true;
    
            try {
                await restoreSessionAuditSlot(
                    state.currentRegionId,
                    row.slotId
                );
    
                showToast(
                    "Session audit item restored.",
                    "success"
                );
    
                await renderSessionAuditView();
            } catch (error) {
                console.error(
                    "Failed to restore session audit item",
                    error
                );
    
                showToast(
                    "Failed to restore session audit item.",
                    "error"
                );
    
                restoreButton.disabled = false;
            }
        });
    
        actions.appendChild(restoreButton);
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

    rowElement.append(
        date,
        ao,
        q
    );
    
    if (
        row.status === "logged" &&
        row.loggedBySomeoneElse &&
        row.loggedByName
    ) {
        rowElement.appendChild(
            loggedBy
        );
    }
    
    rowElement.appendChild(status);

    if (actions.childElementCount > 0) {
        rowElement.appendChild(actions);
    }

    return rowElement;
}

function getStatusLabel(row) {
    if (row.status === "missing") {
        return "❌ No session logged";
    }

    if (row.status === "unclaimed") {
        return "⚠️ Unclaimed and not logged";
    }

    if (row.status === "pending") {
        return row.qId
            ? "🕒 Pending Q log"
            : "🕒 Pending log — unclaimed";
    }

    if (row.status === "ignored") {
        return "🙈 Ignored";
    }

    if (row.status === "logged") {
        return "✅ Logged";
    }

    return "Unknown status";
}

function compareAuditRows(a, b) {
    const priority = {
        pending: 0,
        missing: 1,
        unclaimed: 2,
        ignored: 3,
        logged: 4,
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

function formatAuditTime(value) {
    if (!value) {
        return "Unknown";
    }

    const match = String(value).match(
        /^(\d{1,2}):(\d{2})/
    );

    if (!match) {
        return String(value);
    }

    const hour = Number(match[1]);
    const minute = match[2];

    if (!Number.isFinite(hour)) {
        return String(value);
    }

    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minute} ${suffix}`;
}

function formatAuditCreatedAt(value) {
    if (!value) {
        return "Unknown";
    }

    const numericValue = Number(value);

    const date = Number.isFinite(numericValue)
        ? new Date(numericValue)
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function restoreSessionAuditPosition() {
    if (
        !expandedDuplicateKey &&
        !sessionAuditScrollY
    ) {
        return;
    }

    requestAnimationFrame(() => {
        if (expandedDuplicateKey) {
            const details =
                document.querySelector(
                    `details[data-duplicate-key="${CSS.escape(expandedDuplicateKey)}"]`
                );

            if (details) {
                details.open = true;
            }
        }

        window.scrollTo({
            top: sessionAuditScrollY,
            left: 0,
            behavior: "instant",
        });
    });
}

function createDuplicateGroupKey(group) {
    return [
        group.aoId || "",
        group.date || "",
        group.startTime || "",
        group.createdByUserId || "",
    ]
        .map(value =>
            encodeURIComponent(String(value))
        )
        .join("|");
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