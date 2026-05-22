import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

state.sessionHistorySearchMode = state.sessionHistorySearchMode || "all";

export function renderSessionHistory() {
    const app = document.getElementById("app");
    app.textContent = "";
    app.classList.add("view-session-history");

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
            option.value = ao.name;
            option.textContent = ao.name;
            aoSelect.appendChild(option);
        });

    aoSelect.value = state.sessionHistoryAoFilter?.aoName || "";

    aoSelect.addEventListener("change", (event) => {
        state.sessionHistoryAoFilter = event.target.value
            ? { aoName: event.target.value }
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
    const attendeeCount = session.attendeeIds?.length || 0;
    const fngCount = session.fngs?.length || 0;
    
    statsLine.textContent = `${attendeeCount} PAX • ${fngCount} FNGs`;
   
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

    const attendeeOnlyIds = (session.attendeeIds || [])
    .filter(id => !effectiveQIds.includes(id));

    const attendeeText = [
        getMemberNamesByIds(attendeeOnlyIds),
        ...(session.fngs || []).flatMap(fng => [fng.realName, fng.paxName]),
    ].filter(Boolean).join(" ");

    const qText = getMemberNamesByIds(effectiveQIds);

    const backblastText = [
        session.backblastText,
        session.historicalBackblastText,
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

function renderSessionList() {

    sessionList.textContent = "";

    const searchTerm = (state.sessionHistorySearchTerm || "").trim().toLowerCase();

    const filteredSessions = state.sessions.filter((session) => {
        const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

        const isQ = effectiveQIds.includes(state.currentUserMemberId);
        const attendeeIds = session.attendeeIds || [];
        const isAttended =
            attendeeIds.includes(state.currentUserMemberId) &&
            !isQ;

        if (state.sessionHistoryFilterType === "q" && !isQ) return false;
        if (state.sessionHistoryFilterType === "attended" && !isAttended) return false;

        if (state.sessionHistoryAoFilter) {
            const matchesAo =
                !state.sessionHistoryAoFilter.aoName ||
                session.aoName === state.sessionHistoryAoFilter.aoName;
        
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
        
        if (
            searchTerm === "mario" &&
            state.sessionHistorySearchMode === "workout" &&
            sessionSearchText.includes(searchTerm)
        ) {
            console.log("Mario workout match:", {
                sessionId: session.id,
                aoName: session.aoName,
                workout: session.workout,
                searchText: sessionSearchText,
            });
        }
        
        return sessionSearchText.includes(searchTerm);
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
    
        searchTimeoutId = setTimeout(() => {
            state.sessionHistorySearchTerm = nextValue;
            renderSessionList();
        }, 250);
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
        backButton,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}