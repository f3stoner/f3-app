import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { loadOlderSessionsPage, loadSessionsByIds, loadMatchingSessions, searchHistoricalBackblasts } from "../services/cloudData.js";
import { getSessionDisplayCounts, getRegularPaxIds, memberAttendedSession } from "../utils/sessionAttendance.js";
import { getMemberById } from "../utils/memberLookup.js";

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

    const subtitle = document.createElement("p");
    subtitle.classList.add("session-history-subtitle");
    subtitle.textContent =
        "Find past beatdowns, workouts, and attendance.";

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

    function createSessionRow(session) {
        const row = document.createElement("button");
        row.type = "button";
        row.classList.add("session-history-row");
    
        const dateValue = new Date(
            `${session.date}T12:00:00`
        );
    
        const dateColumn = document.createElement("div");
        dateColumn.classList.add(
            "session-history-row-date"
        );
    
        const dayNumber = document.createElement("div");
        dayNumber.classList.add(
            "session-history-row-day"
        );
        dayNumber.textContent =
            String(dateValue.getDate()).padStart(2, "0");
    
        const weekday = document.createElement("div");
        weekday.classList.add(
            "session-history-row-weekday"
        );
        weekday.textContent =
            dateValue
                .toLocaleDateString(
                    undefined,
                    {
                        weekday: "short",
                    }
                )
                .toUpperCase();
    
        dateColumn.append(
            dayNumber,
            weekday
        );
    
        const content = document.createElement("div");
        content.classList.add(
            "session-history-row-content"
        );
    
        const titleLine = document.createElement("div");
        titleLine.classList.add(
            "session-history-row-title"
        );
        titleLine.textContent =
            session.aoName || "Unknown AO";
    
        const effectiveQIds =
            session.qIds ||
            (session.qId
                ? [session.qId]
                : []);
    
        const qNames = effectiveQIds
            .map(qId => getMemberById(qId))
            .filter(Boolean)
            .map(member => member.paxName);
    
        const qLabel =
            qNames.length > 0
                ? qNames.join(", ")
                : "No Q recorded";
    
        const {
            totalAttendance,
            fngCount,
        } = getSessionDisplayCounts(session);
    
        const workoutTitle =
            session.workout?.title ||
            session.workout?.thangs
                ?.split("\n")[0] ||
            session.notes
                ?.split("\n")[0] ||
            "No workout title";
    
        const workoutLine =
            document.createElement("div");
    
        workoutLine.classList.add(
            "session-history-row-workout"
        );
    
        workoutLine.textContent =
            workoutTitle;
    
        const metaLine =
            document.createElement("div");
    
        metaLine.classList.add(
            "session-history-row-meta"
        );
    
        metaLine.textContent =
            `${qLabel} · ` +
            `${totalAttendance} PAX · ` +
            `${fngCount} FNG${fngCount === 1 ? "" : "s"}`;
    
        content.append(
            titleLine,
            workoutLine,
            metaLine
        );
    
        const trailing =
            document.createElement("div");
    
        trailing.classList.add(
            "session-history-row-trailing"
        );
    
        const currentMemberId =
            state.currentUserMemberId;
    
        const isQ =
            effectiveQIds.includes(
                currentMemberId
            );
    
        const isAttended =
            memberAttendedSession(
                session,
                currentMemberId
            );
    
        if (isQ || isAttended) {
            const relevanceBadge =
                document.createElement("span");
    
            relevanceBadge.classList.add(
                "session-history-relevance-badge"
            );
    
            relevanceBadge.textContent =
                isQ
                    ? "You Q’d"
                    : "You posted";
    
            trailing.appendChild(
                relevanceBadge
            );
        }
    
        const chevron =
            document.createElement("span");
    
        chevron.classList.add(
            "session-history-row-chevron"
        );
    
        chevron.textContent = "›";
    
        trailing.appendChild(chevron);
    
        row.append(
            dateColumn,
            content,
            trailing
        );
    
        row.addEventListener("click", () => {
            state.selectedSessionId = session.id;
            navigateTo("sessionDetail");
        });
    
        return row;
    }

    function getSessionMonthKey(session) {
        return session.date?.slice(0, 7) || "";
    }
    
    function formatSessionMonth(monthKey) {
        const [year, month] =
            monthKey.split("-");
    
        const value = new Date(
            Number(year),
            Number(month) - 1,
            1
        );
    
        return value
            .toLocaleDateString(
                undefined,
                {
                    month: "long",
                    year: "numeric",
                }
            )
            .toUpperCase();
    }
    
    function groupSessionsByMonth(sessions) {
        const groups = new Map();
    
        sessions.forEach(session => {
            const monthKey =
                getSessionMonthKey(session);
    
            if (!groups.has(monthKey)) {
                groups.set(monthKey, []);
            }
    
            groups
                .get(monthKey)
                .push(session);
        });
    
        return [...groups.entries()];
    }

    function findMatchingMemberIds(searchTerm) {
        const normalizedSearch = searchTerm
            .trim()
            .toLowerCase();
    
        if (!normalizedSearch) return [];
    
        return state.members
            .filter(member => {
                const searchableName = [
                    member.paxName,
                    member.realName,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
    
                return searchableName.includes(normalizedSearch);
            })
            .map(member => member.id)
            .filter(Boolean);
    }

    function getMemberNamesByIds(ids = []) {
        return ids
            .map(id => getMemberById(id))
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

let searchTimeoutId = null;


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
        
        const localMatch = sessionSearchText.includes(searchTerm);

        const searchMode = state.sessionHistorySearchMode || "all";
        const usesHistoricalBackblastSearch =
            searchMode === "all" || searchMode === "workout";

        const historicalMatch =
            usesHistoricalBackblastSearch &&
            historicalSearchSessionIds.has(session.id);

        return localMatch || historicalMatch;
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

    const monthGroups =
        groupSessionsByMonth(
            sortedSessions
        );

    monthGroups.forEach(
        (
            [
                monthKey,
                monthSessions,
            ],
            index
        ) => {
            const monthSection =
                document.createElement(
                    "section"
                );

            monthSection.classList.add(
                "session-history-month"
            );

            const monthHeader =
                document.createElement(
                    "button"
                );

            monthHeader.type = "button";

            monthHeader.classList.add(
                "session-history-month-header"
            );

            const monthTitle =
                document.createElement("span");

            monthTitle.classList.add(
                "session-history-month-title"
            );

            monthTitle.textContent =
                formatSessionMonth(
                    monthKey
                );

            const monthMeta =
                document.createElement("span");

            monthMeta.classList.add(
                "session-history-month-meta"
            );

            monthMeta.textContent =
                `${monthSessions.length} ` +
                `session${monthSessions.length === 1 ? "" : "s"}`;

            const monthChevron =
                document.createElement("span");

            monthChevron.classList.add(
                "session-history-month-chevron"
            );

            monthChevron.textContent = "›";

            monthHeader.append(
                monthTitle,
                monthMeta,
                monthChevron
            );

            const monthBody =
                document.createElement("div");

            monthBody.classList.add(
                "session-history-month-body"
            );

            const isCurrentMonth =
                index === 0;

            monthSection.classList.toggle(
                "expanded",
                isCurrentMonth
            );

            monthBody.hidden =
                !isCurrentMonth;

            const initialVisibleCount = 10;

            function renderMonthRows(
                showAll = false
            ) {
                monthBody.textContent = "";

                const visibleSessions =
                    showAll
                        ? monthSessions
                        : monthSessions.slice(
                            0,
                            initialVisibleCount
                        );

                visibleSessions.forEach(
                    session => {
                        monthBody.appendChild(
                            createSessionRow(
                                session
                            )
                        );
                    }
                );

                if (
                    !showAll &&
                    monthSessions.length >
                        initialVisibleCount
                ) {
                    const showAllButton =
                        document.createElement(
                            "button"
                        );

                    showAllButton.type =
                        "button";

                    showAllButton.classList.add(
                        "session-history-show-all"
                    );

                    showAllButton.textContent =
                        `Show all ${monthSessions.length} sessions`;

                    showAllButton.addEventListener(
                        "click",
                        event => {
                            event.stopPropagation();

                            renderMonthRows(true);
                        }
                    );

                    monthBody.appendChild(
                        showAllButton
                    );
                }
            }

            renderMonthRows(false);

            monthHeader.addEventListener(
                "click",
                () => {
                    const nextExpanded =
                        !monthSection.classList
                            .contains(
                                "expanded"
                            );

                    monthSection.classList.toggle(
                        "expanded",
                        nextExpanded
                    );

                    monthBody.hidden =
                        !nextExpanded;
                }
            );

            monthSection.append(
                monthHeader,
                monthBody
            );

            sessionList.appendChild(
                monthSection
            );
        }
    );
}

    async function runServerSearch(rawQuery) {
        const trimmed = rawQuery.trim();
        const searchMode =
            state.sessionHistorySearchMode || "all";
    
        const requestId = ++historicalSearchRequestId;
    
        historicalSearchSessionIds = new Set();
    
        if (trimmed.length < 2) {
            state.isSearchingHistoricalBackblasts = false;
            renderSessionList();
            return;
        }
    
        const usesMemberSearch =
            searchMode === "q" ||
            searchMode === "attendee";

        if (usesMemberSearch) {
            state.isSearchingHistoricalBackblasts = true;
            renderSessionList();

            try {
                const matchingMemberIds =
                    findMatchingMemberIds(trimmed);

                if (
                    requestId !==
                    historicalSearchRequestId
                ) {
                    return;
                }

                if (
                    matchingMemberIds.length === 0
                ) {
                    state.isSearchingHistoricalBackblasts =
                        false;

                    renderSessionList();
                    updateLoadOlderButton();
                    return;
                }

                const matchingSessions =
                    await loadMatchingSessions({
                        regionId:
                            state.currentRegionId,
                        mode: searchMode,
                        memberIds:
                            matchingMemberIds,
                    });

                if (
                    requestId !==
                    historicalSearchRequestId
                ) {
                    return;
                }

                const existingIds = new Set(
                    state.sessions.map(
                        session => session.id
                    )
                );

                const newSessions =
                    matchingSessions.filter(
                        session =>
                            !existingIds.has(
                                session.id
                            )
                    );

                state.sessions = [
                    ...state.sessions,
                    ...newSessions,
                ];

                state.isSearchingHistoricalBackblasts =
                    false;

                renderSessionList();
                updateLoadOlderButton();
            } catch (error) {
                if (
                    requestId !==
                    historicalSearchRequestId
                ) {
                    return;
                }

                state.isSearchingHistoricalBackblasts =
                    false;

                console.error(
                    `Failed to search ${searchMode} sessions:`,
                    error
                );

                renderSessionList();
                updateLoadOlderButton();
            }

            return;
        }
    
        /*
         * All and Workout retain historical backblast search.
         */
        const usesHistoricalBackblastSearch =
            searchMode === "all" ||
            searchMode === "workout";
    
        if (!usesHistoricalBackblastSearch) {
            state.isSearchingHistoricalBackblasts = false;
            renderSessionList();
            return;
        }
    
        state.isSearchingHistoricalBackblasts = true;
        renderSessionList();
    
        try {
            const matchingIds =
                await searchHistoricalBackblasts(trimmed);
    
            if (requestId !== historicalSearchRequestId) {
                return;
            }
    
            const loadedIds = new Set(
                state.sessions.map(session => session.id)
            );
    
            const missingIds = matchingIds.filter(
                id => !loadedIds.has(id)
            );
    
            let missingSessions = [];
    
            if (missingIds.length > 0) {
                missingSessions =
                    await loadSessionsByIds(missingIds);
            }
    
            if (requestId !== historicalSearchRequestId) {
                return;
            }
    
            if (missingSessions.length > 0) {
                const existingIds = new Set(
                    state.sessions.map(session => session.id)
                );
    
                const newSessions = missingSessions.filter(
                    session => !existingIds.has(session.id)
                );
    
                state.sessions = [
                    ...state.sessions,
                    ...newSessions,
                ];
            }
    
            historicalSearchSessionIds =
                new Set(matchingIds);
    
            state.isSearchingHistoricalBackblasts = false;
            renderSessionList();
        } catch (error) {
            if (requestId !== historicalSearchRequestId) {
                return;
            }
    
            state.isSearchingHistoricalBackblasts = false;
    
            console.error(
                "Failed to search historical backblasts:",
                error
            );
    
            renderSessionList();
        }
    }

    searchInput.addEventListener("input", (event) => {
        const nextValue = event.target.value;
    
        clearTimeout(searchTimeoutId);
    
        searchTimeoutId = setTimeout(() => {
            state.sessionHistorySearchTerm = nextValue;
            updateLoadOlderButton();
            runServerSearch(nextValue);
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
            updateLoadOlderButton();

            searchModeRow.querySelectorAll("button").forEach(button => {
                button.classList.toggle("active", button.dataset.mode === value);
            });

            clearTimeout(searchTimeoutId);

            runServerSearch(
                state.sessionHistorySearchTerm || ""
            );
        });

        searchModeRow.appendChild(button);
    });

    const loadOlderButton = document.createElement("button");
    loadOlderButton.classList.add("secondary-button");

    function updateLoadOlderButton() {
        const searchTerm =
            (state.sessionHistorySearchTerm || "").trim();
    
        const searchMode =
            state.sessionHistorySearchMode || "all";
    
        const hasCompleteMemberSearch =
            searchTerm.length >= 2 &&
            (
                searchMode === "q" ||
                searchMode === "attendee"
            );
        
        if (hasCompleteMemberSearch) {
            loadOlderButton.textContent =
                searchMode === "q"
                    ? "All Matching Q Sessions Loaded"
                    : "All Matching PAX Sessions Loaded";
    
            loadOlderButton.disabled = true;
            return;
        }
    
        loadOlderButton.textContent =
            state.hasLoadedAllOlderSessions
                ? "All Older Sessions Loaded"
                : "Load Older Sessions";
    
        loadOlderButton.disabled = Boolean(
            state.hasLoadedAllOlderSessions
        );
    }

    updateLoadOlderButton();

    loadOlderButton.addEventListener("click", async () => {
        if (state.isloadingOlderSessions) return;

        const searchTerm =
            (state.sessionHistorySearchTerm || "").trim();

        const searchMode =
            state.sessionHistorySearchMode || "all";

        const usesCompleteMemberSearch =
            searchTerm.length >= 2 &&
            (
                searchMode === "q" ||
                searchMode === "attendee"
            );
        
        if (usesCompleteMemberSearch) {
            await runServerSearch(searchTerm);
            return;
        }

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
            loadOlderButton.disabled = Boolean(
                state.hasLoadedAllOlderSessions
            );
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

    const initialSearchTerm = state.sessionHistorySearchTerm || "";
    const initialSearchMode = state.sessionHistorySearchMode || "all";

    const shouldRunInitialServerSearch =
        initialSearchTerm.trim().length >= 2;

    if (shouldRunInitialServerSearch) {
        runServerSearch(initialSearchTerm);
    } else {
        renderSessionList();
    }

    app.append(
        header,
        title,
        subtitle,
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