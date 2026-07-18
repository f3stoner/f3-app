import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { loadOlderSessionsPage, loadSessionsByIds, searchHistoricalBackblasts } from "../services/cloudData.js";
import { getSessionDisplayCounts, getRegularPaxIds, memberAttendedSession } from "../utils/sessionAttendance.js";

state.sessionHistorySearchMode = state.sessionHistorySearchMode || "all";

export function renderSessionHistory() {
    const app = document.getElementById("app");
    app.textContent = "";
    app.classList.add("view-session-history");

    let historicalSearchSessionIds = new Set();
    let historicalSearchRequestId = 0;

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    })

    const title = document.createElement("h1");
    title.textContent = "Session History";

    const filterSection = document.createElement("div");
    filterSection.classList.add("section");

    const filterLabel = document.createElement("div");
    filterLabel.classList.add("detail-label");
    filterLabel.textContent = "Filters";

    const typeFilterRow = document.createElement("div");
    typeFilterRow.classList.add("button-row");

    [
        ["all", "All"],
        ["q", "My Qs"],
        ["attended", "My Posts"],
    ].forEach(([value, label]) => {
        const button = document.createElement("button");
        button.textContent = label;

        if ((state.sessionHistoryFilterType || "all") === value) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            state.sessionHistoryFilterType = value;
            renderSessionList();
        });

        typeFilterRow.appendChild(button);
    });

    const aoSelect = document.createElement("select");

    const allAoOption = document.createElement("option");
    allAoOption.value = "";
    allAoOption.textContent = "All AOs";
    aoSelect.appendChild(allAoOption);

    state.aos
        .filter(ao => ao.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(ao => {
            const option = document.createElement("option");
            option.value = ao.id;
            option.textContent = ao.name;
            aoSelect.appendChild(option);
        });

    aoSelect.value = state.sessionHistoryAoFilter?.aoId || "";

    aoSelect.addEventListener("change", (event) => {
        const aoId = event.target.value;
        const selectedAo = state.aos.find(ao => ao.id === aoId);

        state.sessionHistoryAoFilter = aoId
            ? {
                aoId,
                aoName: selectedAo?.name || "",
            }
            : null;

        renderSessionList();
    });

    filterSection.append(filterLabel);

    const controlsRow = document.createElement("div");
    controlsRow.classList.add("controls-row");

    controlsRow.append(typeFilterRow, aoSelect);

    filterSection.append(controlsRow);

    if (state.sessionHistoryAoFilter?.startDate || state.sessionHistoryAoFilter?.endDate) {
        const activeFilterNotice = document.createElement("div");
        activeFilterNotice.classList.add("detail-value");
        activeFilterNotice.textContent = `Showing ${state.sessionHistoryAoFilter.label || state.sessionHistoryAoFilter.aoName} for selected month`;
    
        const clearButton = document.createElement("button");
        clearButton.classList.add("secondary-button");
        clearButton.textContent = "Clear Insight Filter";
    
        clearButton.addEventListener("click", () => {
            state.sessionHistoryAoFilter = null;
            renderSessionHistory();
        });

        filterSection.append(activeFilterNotice, clearButton);
    }

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search sessions...";
    searchInput.classList.add("session-search");
    searchInput.value = state.sessionHistorySearchTerm || "";

    const sessionList = document.createElement("div");
    function renderEmptyState(titleText, detailText) {
        sessionList.textContent = "";
    
        const emptyState = document.createElement("div");
        emptyState.classList.add("empty-state");
    
        const title = document.createElement("p");
        title.textContent = titleText;
    
        const detail = document.createElement("p");
        detail.classList.add("detail-value");
        detail.textContent = detailText;
    
        emptyState.append(title, detail);
        sessionList.appendChild(emptyState);
    }

    function createSessionCard(session) {
        const card = document.createElement("div");
        card.classList.add("member-card", "session-history-card");

        const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

        const qNames = effectiveQIds
            .map(qId => state.members.find(m => m.id === qId))
            .filter(Boolean)
            .map(member => member.paxName);

        const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";

        const titleLine = document.createElement("div");
        titleLine.classList.add("member-name");
        titleLine.textContent = session.aoName;

        const dateLine = document.createElement("div");
        dateLine.classList.add("stats-line");
        dateLine.textContent = formatDate(session.date);

        const qLine = document.createElement("div");
        qLine.classList.add("stats-line", "q-line");
        qLine.textContent = `Q: ${qLabel}`;

        const statsLine = document.createElement("div");
        statsLine.classList.add("stats-line");
        const {
            totalAttendance,
            fngCount,
        } = getSessionDisplayCounts(session);
        
        statsLine.textContent =
            `${totalAttendance} Attended • ${fngCount} FNG${fngCount === 1 ? "" : "s"}`;
    
        const previewLine = document.createElement("div");
        previewLine.classList.add("stats-line", "session-preview-line");
        previewLine.textContent =
            session.workout?.title ||
            session.workout?.thangs?.split("\n")[0] ||
            session.notes?.split("\n")[0] ||
            "No workout logged";

        card.append(titleLine, dateLine, qLine, statsLine, previewLine);

        card.addEventListener("click", () => {
            state.selectedSessionId = session.id;
            navigateTo("sessionDetail");
        });

        return card;
    }

    function getMemberNamesByIds(ids = []) {
        return ids
            .map(id => state.members.find(m => m.id === id))
            .filter(Boolean)
            .flatMap(member => [member.paxName, member.realName])
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
    }

function getSessionSearchText(session, mode = "all") {
    const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);
    const workout = session.workout || {};

    const workoutText = [
        workout.title,
        workout.warmorama,
        workout.thangs,
        ...(workout.thangSections || []).map(section => section.content),
        workout.finisher,
        workout.notes,
    ].filter(Boolean).join(" ");

    const attendeeOnlyIds = getRegularPaxIds(session);

    const attendeeText = [
        getMemberNamesByIds(attendeeOnlyIds),
        ...(session.fngs || []).flatMap(fng => [fng.realName, fng.paxName]),
    ].filter(Boolean).join(" ");

    const qText = getMemberNamesByIds(effectiveQIds);

    const backblastText = [
        session.backblastText,
        session.hasHistoricalBackblast,
        session.linkedBackblastText,
        session.importedBackblastText,
        session.bandBackblastText,
        session.bandPostText,
    ].filter(Boolean).join(" ");

    const baseText = [
        session.aoName,
        formatDate(session.date),
        session.date,
    ].filter(Boolean).join(" ");

    const notesText = session.notes || "";

    const buckets = {
        all: [baseText, qText, attendeeText, workoutText, backblastText, notesText],
        q: [qText],
        attendee: [attendeeText],
        workout: [workoutText],
    };

    return (buckets[mode] || buckets.all).join(" ").toLowerCase();
}

const resultsMeta = document.createElement("div");
resultsMeta.classList.add("detail-value", "session-results-meta");

if (state.hasLoadedAllOlderSessions) {
    loadOlderButton.textContent = "All Older Sessions Loaded";
    loadOlderButton.disabled = true;
}

function renderSessionList() {

    sessionList.textContent = "";

    const searchTerm = (state.sessionHistorySearchTerm || "").trim().toLowerCase();

    const filteredSessions = state.sessions.filter((session) => {
        const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

        const isQ = effectiveQIds.includes(state.currentUserMemberId);
        const isAttended =
            memberAttendedSession(session, state.currentUserMemberId) &&
            !isQ;

        if (state.sessionHistoryFilterType === "q" && !isQ) return false;
        if (state.sessionHistoryFilterType === "attended" && !isAttended) return false;

        if (state.sessionHistoryAoFilter) {
            const matchesAo =
                !state.sessionHistoryAoFilter.aoId ||
                session.aoId === state.sessionHistoryAoFilter.aoId;
        
            const matchesDate =
                (!state.sessionHistoryAoFilter.startDate ||
                    session.date >= state.sessionHistoryAoFilter.startDate) &&
        
                (!state.sessionHistoryAoFilter.endDate ||
                    session.date <= state.sessionHistoryAoFilter.endDate);
        
            if (!matchesAo || !matchesDate) {
                return false;
            }
        }

        if (!searchTerm) return true;

        const sessionSearchText = getSessionSearchText(
            session,
            state.sessionHistorySearchMode || "all"
        );
        
        return (
            sessionSearchText.includes(searchTerm) ||
            historicalSearchSessionIds.has(session.id)
        );
    });

    const sortedSessions = [...filteredSessions].sort((a, b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
        }

        const aCreatedAt = a.createdAt || 0;
        const bCreatedAt = b.createdAt || 0;

        return bCreatedAt - aCreatedAt;
    })
    if (sortedSessions.length === 0) {
        if (searchTerm && state.isSearchingHistoricalBackblasts) {
            resultsMeta.textContent = "";
            renderEmptyState(
                "Searching historical backblasts...",
                "Results may appear in a moment."
            );
            return;
        }

        if (searchTerm && state.isHydratingHistoricalBackblasts) {
            resultsMeta.textContent = "";
            renderEmptyState(
                "Historical backblasts are still loading...",
                "Results may appear in a moment."
            );
            return;
        }

        resultsMeta.textContent = "0 sessions found";
        sessionList.textContent =
            searchTerm || state.sessionHistoryFilterType !== "all" || state.sessionHistoryAoFilter
                ? "No matching sessions found"
                : "No sessions saved yet";
        return;
    }

    resultsMeta.textContent = `${sortedSessions.length} session${sortedSessions.length === 1 ? "" : "s"} found`;

    let lastDate = null;

    sortedSessions.forEach((session) => {
        if (session.date !== lastDate) {
            const dateHeader = document.createElement("div");
            dateHeader.classList.add("detail-label", "session-date-divider");
            dateHeader.textContent = formatDate(session.date);

            sessionList.appendChild(dateHeader);
            lastDate = session.date;
        }
        sessionList.appendChild(createSessionCard(session));
        });
    }
    let searchTimeoutId = null;

    searchInput.addEventListener("input", (event) => {
        const nextValue = event.target.value;
    
        clearTimeout(searchTimeoutId);
    
        searchTimeoutId = setTimeout(async () => {
            state.sessionHistorySearchTerm = nextValue;
    
            const trimmed = nextValue.trim();
    
            if (trimmed.length < 2) {
                historicalSearchSessionIds = new Set();
                state.isSearchingHistoricalBackblasts = false;
                renderSessionList();
                return;
            }
    
            const requestId = ++historicalSearchRequestId;

            state.isSearchingHistoricalBackblasts = true;
            renderSessionList();
    
            try {
                const matchingIds = await searchHistoricalBackblasts(trimmed);
                const laodedIds = new Set(state.sessions.map(session => session.id));
                const missingIds = matchingIds.filter(id => !laodedIds.has(id));

                if (missingIds.length > 0) {
                    const missingSessions = await loadSessionsByIds(missingIds);

                    const existingIds = new Set(state.sessions.map(session => session.id));
                    const newSessions = missingSessions.filter(session => !existingIds.has(session.id));

                    state.sessions = [...state.sessions, ...newSessions];
                }
    
                if (requestId !== historicalSearchRequestId) { 
                    state.isSearchingHistoricalBackblasts = false;   
                    return;
                }
    
                historicalSearchSessionIds = new Set(matchingIds);
                state.isSearchingHistoricalBackblasts = false;
                renderSessionList();

            } catch (error) {
                state.isSearchingHistoricalBackblasts = false;
                console.error("Failed to search historical backblasts:", error);
            }
        }, 300);
    });

    const searchModeRow = document.createElement("div");
    searchModeRow.classList.add("button-row", "search-mode-row");

    [
        ["all", "All"],
        ["q", "Q"],
        ["attendee", "PAX"],
        ["workout", "Workout"],
        
    ].forEach(([value, label]) => {
        const button = document.createElement("button");
        button.textContent = label;
        button.dataset.mode = value;

        if ((state.sessionHistorySearchMode || "all") === value) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            state.sessionHistorySearchMode = value;

            searchModeRow.querySelectorAll("button").forEach(button => {
                button.classList.toggle("active", button.dataset.mode === value);
        });

        renderSessionList();
        });

        searchModeRow.appendChild(button);
    });

    const loadOlderButton = document.createElement("button");
    loadOlderButton.classList.add("secondary-button");
    loadOlderButton.textContent = "Load Older Sessions";

    loadOlderButton.addEventListener("click", async () => {
        if (state.isloadingOlderSessions) return;

        const oldestLoadedDate = state.sessions 
            .map(session => session.date)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))[0];

        if (!oldestLoadedDate) return;

        state.isloadingOlderSessions = true;
        loadOlderButton.textContent = "Loading older sessions...";
        loadOlderButton.disabled = true;

        try {
            const rows = await loadOlderSessionsPage(
                state.currentRegionId,
                oldestLoadedDate,
                100
            );

            const existingIds = new Set(state.sessions.map(session => session.id));
            const newSessions = rows.filter(session => !existingIds.has(session.id));

            state.sessions = [...state.sessions, ...newSessions];

            if (rows.length < 100) {
                state.hasLoadedAllOlderSessions = true;
            }

            renderSessionList();
        } catch (error) {
            console.error("Failed to load older sessions:", error);
        } finally {
            state.isloadingOlderSessions = false;
            loadOlderButton.disabled = false;
            loadOlderButton.textContent = state.hasLoadedAllOlderSessions
                ? "All Older Sessions Loaded"
                : "Load Older Sessions";
        }
    });

    const backButton = document.createElement("button");
    backButton.textContent = "Back to Dashboard";
    backButton.addEventListener("click", () => {
        navigateTo("dashboard");
    });

    const nav = createGlobalNav();

    renderSessionList();

    app.append(
        header,
        title,
        filterSection,
        searchInput,
        searchModeRow,
        resultsMeta,
        sessionList,
        loadOlderButton,
        backButton,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}