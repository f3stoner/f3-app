import { state } from "../modules/state.js";
import { createGlobalNav } from "../components/globalNav.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { loadImportRuns } from "../services/cloudData.js";

export async function renderImportRunsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Import Runs";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Review nightly Aggieland dry-run import results.";

    const loading = document.createElement("div");
    loading.classList.add("detail-value");
    loading.textContent = "Loading import runs...";

    const nav = createGlobalNav();

    app.append(header, title, subtitle, loading, nav);

    try {
        const runs = await loadImportRuns(state.currentRegionId, 10);

        loading.remove();

        if (runs.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No import runs yet.";
            app.insertBefore(empty, nav);
        } else {
            runs.forEach(run => {
                app.insertBefore(createImportRunCard(run), nav);
            });
        }
    } catch (error) {
        console.error("Failed to load import runs:", error);
        loading.textContent = "Failed to load import runs.";
    }

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function createImportRunCard(run) {
    const summary = run.summary || {};

    const card = document.createElement("div");
    card.classList.add("member-card", "import-run-card");

    const header = document.createElement("div");
    header.classList.add("import-run-header");

    const statusLine = document.createElement("div");
    statusLine.classList.add("member-name");
    statusLine.textContent = `${run.status?.toUpperCase() || "UNKNOWN"} • ${run.mode || "unknown"}`;

    if (run.status === "error") {
        statusLine.classList.add("danger-text");
    }

    const meta = document.createElement("div");
    meta.classList.add("stats-line");
    meta.textContent = `${run.type || "import"} • ${formatDateTime(run.createdAt)}`;

    header.append(statusLine, meta);

    const metrics = document.createElement("div");
    metrics.classList.add("import-run-metrics");

    metrics.append(
        createImportMetric("Parsed", summary.totalParsed),
        createImportMetric("Duplicates", summary.totalDuplicates),
        createImportMetric("New", summary.totalNewSessions),
        createImportMetric("Unresolved", summary.unresolvedSessionCount),
        createImportMetric("Members", summary.totalMembersMapped),
        createImportMetric("Duration", formatDuration(summary.durationMs))
    );

    card.append(header, metrics);

    if (run.error) {
        const error = document.createElement("div");
        error.classList.add("stats-line", "danger-text");
        error.textContent = run.error;
        card.appendChild(error);
    }

    const newSessions = summary.newSessions || [];

    if (newSessions.length > 0) {
        card.appendChild(createNewSessionsDetails(newSessions));
    }

    return card;
}

function createImportMetric(labelText, valueText) {
    const metric = document.createElement("div");
    metric.classList.add("import-run-metric");

    const label = document.createElement("div");
    label.classList.add("detail-label");
    label.textContent = labelText;

    const value = document.createElement("div");
    value.classList.add("detail-value");
    value.textContent = valueText ?? "-";

    metric.append(label, value);

    return metric;
}

function formatDuration(ms) {
    if (ms === null || ms === undefined) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function createNewSessionsDetails(newSessions) {
    const details = document.createElement("details");
    details.classList.add("section", "import-run-details");

    const summary = document.createElement("summary");
    summary.textContent = `${newSessions.length} proposed new sessions`;

    details.appendChild(summary);

    newSessions.forEach(session => {
        const row = document.createElement("div");
        row.classList.add("selected-summary-row", "import-run-session-row");

        const main = document.createElement("div");
        main.classList.add("member-name");
        main.textContent = `${session.date} • ${session.aoName}`;

        const sub = document.createElement("div");
        sub.classList.add("stats-line");
        sub.textContent =
            `${session.attendeeCount ?? 0} PAX • ` +
            `${session.qCount ?? 0} Q • ` +
            `${session.unresolvedCount ?? 0} unresolved`;

        row.append(main, sub);

        if (session.unresolvedPax?.length) {
            const unresolvedWrap = document.createElement("div");
            unresolvedWrap.classList.add("import-run-unresolved-list");

            const unresolvedHeading = document.createElement("div");
            unresolvedHeading.classList.add("detail-label", "danger-text");
            unresolvedHeading.textContent = "Unresolved PAX";

            unresolvedWrap.appendChild(unresolvedHeading);

            session.unresolvedPax.forEach(pax => {
                const item = document.createElement("div");
                item.classList.add("stats-line", "danger-text");
                item.textContent =
                    `${pax.rawName || "Unknown"} • ` +
                    `${pax.code || "no code"} • ` +
                    `${pax.reason || "unresolved"}`;
                
                    unresolvedWrap.appendChild(item);
            });

            row.appendChild(unresolvedWrap);
        }
        
        details.appendChild(row);
    });

    return details;
}

function formatDateTime(value) {
    if (!value) return "Unknown time";

    return new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}