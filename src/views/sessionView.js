import { renderApp } from "../index.js";
import { createSession } from "../modules/sessions.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { state } from "../modules/state.js";
import { generateBackblast } from "../modules/backblast.js";
import { createInvitedByField } from "../components/invitedByField.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";
import { addSession, updateSession, updateMember } from "../services/appData.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { createDuplicateFngNameFlags } from "../modules/adminFlags.js";
import { addAdminFlags } from "../services/appData.js";
import { logSaveFailure } from "../services/appEvents.js";
import { getSiteWeather } from "../services/weather.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import {
    getAffectedMemberIdsFromSession,
    loadMemberDashboardStats,
    rebuildMemberStatsForMembers,
    loadQSlotCommitments,
    searchGlobalMembers,
} from "../services/cloudData.js";
import { invalidateMemberStatsCache, invalidateRecentMemberActivityCache } from "../utils/memberStatsCache.js";
import { doesSearchMatch } from "../utils/search.js";
import { getTotalAttendanceCount, memberAttendedSession } from "../utils/sessionAttendance.js";
import { loadSessionVisitors } from "../services/sessionVisitorData.js";
import { hasPermission, PERMISSIONS, canEditAoSession, canManageSession } from "../utils/permissions.js";
import {
    getMemberById,
    getMemberDirectory,
} from "../utils/memberLookup.js";

export function renderSession() {
    const app =
        document.getElementById("app");

    app.replaceChildren();

    app.className =
        "view-session";

    cleanupMainMenu();

if (
    !state.editingSessionId &&
    !state.selectedSessionId
) {
    state.sessionShowAllRecent = false;

    state.sessionShowAllOthers = false;

    state.sessionOtherPage = 1;

    state.sessionSelectedExpanded = false;

    state.sessionQExpanded = false;
}

let cachedLastPostMapByAoKey = new Map();
let cachedDisplayNameByMemberId = null;

function buildDisplayNameByMemberId() {
    const paxNameGroups = new Map();

    getMemberDirectory().forEach(member => {
        const paxName = String(member.paxName || "").trim();
        if (!paxName) return;

        const group = paxNameGroups.get(paxName) || [];
        group.push(member);
        paxNameGroups.set(paxName, group);
    });

    const displayNameByMemberId = new Map();

    getMemberDirectory().forEach(member => {
        const paxName = String(member.paxName || "").trim();
        const realName = String(member.realName || "").trim();
        const homeAo = String(member.homeAo || "").trim();
        const baseName = paxName || realName || "Unknown PAX";

        if (!paxName) {
            displayNameByMemberId.set(member.id, baseName);
            return;
        }

        const samePaxNameMembers = paxNameGroups.get(paxName) || [];

        if (samePaxNameMembers.length <= 1) {
            displayNameByMemberId.set(member.id, baseName);
            return;
        }

        const samePaxAndAoCount = samePaxNameMembers.filter(
            m => String(m.homeAo || "").trim() === homeAo
        ).length;

        if (samePaxAndAoCount <= 1 && homeAo) {
            displayNameByMemberId.set(member.id, `${baseName} - ${homeAo}`);
            return;
        }

        if (realName) {
            displayNameByMemberId.set(member.id, `${baseName} - ${realName}`);
            return;
        }

        if (homeAo) {
            displayNameByMemberId.set(member.id, `${baseName} - ${homeAo}`);
            return;
        }

        displayNameByMemberId.set(member.id, baseName);
    });

    return displayNameByMemberId;
}

function getCachedMemberDisplayName(member) {
    if (!member) return "Unknown PAX";

    if (!cachedDisplayNameByMemberId) {
        cachedDisplayNameByMemberId = buildDisplayNameByMemberId();
    }

    return cachedDisplayNameByMemberId.get(member.id) || getMemberDisplayName(member);
}

function isNonHomeParticipant(member) {
    if (!member?.id) {
        return false;
    }

    if (
        typeof member.isHomeRegionMember ===
        "boolean"
    ) {
        return !member.isHomeRegionMember;
    }

    return (
        member.regionId &&
        member.regionId !==
            state.currentRegionId
    );
}

function getMemberHomeRegionName(member) {
    if (!member?.regionId) {
        return "";
    }

    const regions = [
        ...(state.availableRegions || []),
        ...(state.accessibleRegions || []),
    ];

    const region = regions.find(
        item =>
            item.id ===
            member.regionId
    );

    return (
        region?.name ||
        "Other Region"
    );
}

function getDrContextText(member) {
    if (!isNonHomeParticipant(member)) {
        return "";
    }

    const homeRegionName =
        getMemberHomeRegionName(member);

    return homeRegionName
        ? `${homeRegionName} · DR`
        : "DR";
}

let cachedSelectableMembers = null;

function getCachedSelectableMembers() {
    if (!cachedSelectableMembers) {
        cachedSelectableMembers = getSortedSelectableMembers();
    }

    return cachedSelectableMembers;
}

function getCachedLastPostMapForAo(aoId, aoName) {
    const cacheKey = aoId || aoName || "unknown";

    if (!cachedLastPostMapByAoKey.has(cacheKey)) {
        cachedLastPostMapByAoKey.set(
            cacheKey,
            buildLastPostMapForAo(aoId, aoName)
        );
    }

    return cachedLastPostMapByAoKey.get(cacheKey);
}

const sessionId = state.editingSessionId || state.selectedSessionId;
const isEditing = Boolean(state.editingSessionId);
let draftSession;

if (isEditing) {
    const existingSession = state.sessions.find(s => s.id === sessionId);

    if (!existingSession) {
        console.log("No existing session found for id:", sessionId);
        draftSession = createSession(getTodayDate(), {
            aoId: null,
            aoName: "",
        });
    } else {
        draftSession = {
            ...existingSession,
            attendeeIds: [...existingSession.attendeeIds],
            qIds: [...(existingSession.qIds || (existingSession.qId ? [existingSession.qId] : []))],
            fngs: [...(existingSession.fngs || [])],
            visitors: [...(existingSession.visitors || [])],
        };
    }
    
    } else if (state.draftSession) {
        draftSession = {
            ...state.draftSession,
            attendeeIds: [...state.draftSession.attendeeIds],
            qIds: [...(state.draftSession.qIds || (state.draftSession.qId ? [state.draftSession.qId] : []))],
            fngs: [...(state.draftSession.fngs || [])],
            visitors: [...(state.draftSession.visitors || [])],
        };
    } else {
        draftSession = createSession(getTodayDate(), {
            aoId: null,
            aoName: "",
        });
}

draftSession.qIds = [...(draftSession.qIds || (draftSession.qId ? [draftSession.qId] : []))];

draftSession.fngs = draftSession.fngs || [];
draftSession.visitors = draftSession.visitors || [];

let qSlotCommitments = [];
let qSlotCommitmentsLoading = Boolean(
    !isEditing &&
    draftSession?.sourceQSlotId
);
let qSlotCommitmentsFailed = false;

draftSession.qIds.forEach(qId => {
    if (!draftSession.attendeeIds.includes(qId)) {
        draftSession.attendeeIds.push(qId);
    }
})

const originalSession = isEditing
    ? state.sessions.find(session => session.id === sessionId)
    : null;

const canEditExistingSession =
    !isEditing ||
    canManageSession(originalSession);

if (!canEditExistingSession) {
    app.textContent = "You do not have permission to edit this session.";
    return;
}

const isScopedSessionEditor =
    isEditing &&
    !hasPermission(PERMISSIONS.MANAGE_SESSIONS) &&
    canEditAoSession(originalSession?.aoId) &&
    originalSession?.createdByUserId !== state.currentUserId;

console.log("sessionView draftSession on open:", draftSession);

const title =
    document.createElement("h1");

title.textContent =
    isEditing
        ? "Edit Session"
        : "Start Session";

title.classList.add(
    "session-title"
);

const subtitle =
    document.createElement("div");

subtitle.classList.add(
    "session-subtitle"
);

subtitle.textContent =
    isEditing
        ? "Review attendance and session details."
        : "Build today’s attendance.";

const dateLabel = document.createElement("div");
dateLabel.textContent = isEditing ? "Edit Date" : "Date";
dateLabel.classList.add("detail-label");

const dateInput = document.createElement("input");
dateInput.type = "date";
dateInput.value = draftSession.date;
dateInput.classList.add("native-date-input");


const today = getTodayDate();
const minDate = new Date();
minDate.setDate(minDate.getDate() - 30);

const minYear = minDate.getFullYear();
const minMonth = String(minDate.getMonth() + 1).padStart(2, "0");
const minDay = String(minDate.getDate()).padStart(2, "0");

const min = `${minYear}-${minMonth}-${minDay}`;

dateInput.min = min;
dateInput.max = today;

function updateDraftDate(event) {
    const previousDate = draftSession.date;

    draftSession.date =
        event.target.value;

    if (
        previousDate &&
        previousDate !== draftSession.date
    ) {
        draftSession.sourceQSlotId = null;
        draftSession.sourcePlannedWorkoutId = null;
    }

    dateDisplay.textContent =
        formatDate(
            draftSession.date
        );

    updateSessionContextSummary();
}

dateInput.addEventListener("change", updateDraftDate);
dateInput.addEventListener("input", updateDraftDate);
dateInput.addEventListener("click", () => {
    dateInput.showPicker?.();
});

let loadedWorkoutBanner = null;

if (draftSession.workout) {
    loadedWorkoutBanner = document.createElement("div");
    loadedWorkoutBanner.classList.add("loaded-workout-banner");

    loadedWorkoutBanner.textContent = draftSession.sourcePlannedWorkoutId
        ? "Workout loaded from planned workout"
        :draftSession.sourceSessionId
        ? "Workout copied from session"
        : "Workout attached";
}

function resetSessionUiState() {
    state.sessionSearchTerm = "";

    state.sessionShowAllOthers = false;

    state.sessionOtherPage = 1;

    state.sessionShowAllRecent = false;

    state.sessionSelectedExpanded = false;

    state.sessionQExpanded = false;
}

const header = createAppHeader({
    title: "",
    showBack: true,
    showMenu: true,
    onBack: () => {
        resetSessionUiState();

        if (!isEditing) {
            state.draftSession = null;
            goBack("dashboard");
            return;
        }

        goBack("sessionDetail");
    },
});

function createSelectedPillStrip(qMembers, selectedMembers) {
    const strip = document.createElement("div");
    strip.classList.add("selected-pill-strip");

    const allMembers = [
        ...qMembers.map(member => ({...member, isQ: true})),
        ...selectedMembers.map(member => ({ ...member, isQ: false })),
    ];

    if (allMembers.length === 0) {
        return strip;
    }

    allMembers.forEach(member => {
        const pill = document.createElement("div");
        pill.classList.add("selected-pill");

        if (member.isQ) {
            pill.classList.add("selected-pill-q");
            pill.textContent = `Q: ${getCachedMemberDisplayName(member)}`;
        } else {
            pill.textContent = getCachedMemberDisplayName(member);
        }

        pill.addEventListener("click", () => {
            const confirmed = confirm(
                member.isQ
                    ? `Remove ${getCachedMemberDisplayName(member)} as Q and attendee?`
                    : `Remove ${getCachedMemberDisplayName(member)}?`
            );

            if (!confirmed) return;

            if (member.isQ && preventRemovingOnlyQ(member.id)) {
                return;
            }

            draftSession.attendeeIds = draftSession.attendeeIds.filter(id => id !== member.id);
            draftSession.qIds = (draftSession.qIds || []).filter(id => id !== member.id);

            renderMemberList();
        });

        strip.appendChild(pill);
    });

    return strip;
}

const aoOptions = (state.aos || [])
    .filter(ao => ao.isActive)
    .filter(ao => ao.name && ao.name !== "DR")
    .sort((a, b) => a.name.localeCompare(b.name));

const aoLabel = document.createElement("div");
aoLabel.textContent = "AO";
aoLabel.classList.add("detail-label");

const aoSelect = document.createElement("select");

if (isScopedSessionEditor) {
    aoSelect.disabled = true;
}

aoOptions.forEach(ao => {
    const option = document.createElement("option");
    option.value = ao.id;
    option.textContent = ao.name;
    aoSelect.appendChild(option);
});

if (!draftSession.aoId && !draftSession.aoName && aoOptions.length > 0) {
    draftSession.aoId = aoOptions[0].id;
    draftSession.aoName = aoOptions[0].name;
}

if (!draftSession.aoId && draftSession.aoName) {
    const matchingAo = state.aos.find(
        ao => ao.name === draftSession.aoName
    );

    if (matchingAo) {
        draftSession.aoId = matchingAo.id;
    }
}

aoSelect.value = draftSession.aoId || "";

aoSelect.addEventListener("change", event => {
    const previousAoId = draftSession.aoId;

    const selectedAo = state.aos.find(
        ao => ao.id === event.target.value
    );

    draftSession.aoId = selectedAo?.id || null;
    draftSession.aoName = selectedAo?.name || "";
    draftSession.siteId =
        selectedAo?.defaultSiteId ||
        null;

    if (
        previousAoId &&
        previousAoId !== draftSession.aoId
    ) {
        draftSession.sourceQSlotId = null;
        draftSession.sourcePlannedWorkoutId = null;
    }

    updateSessionContextSummary();

    cachedLastPostMapByAoKey.clear();

    renderMemberList();
    renderSessionSearchResults();
});

const sessionContext =
    document.createElement("section");

sessionContext.classList.add(
    "session-context"
);

const sessionContextSummary =
    document.createElement("button");

sessionContextSummary.type =
    "button";

sessionContextSummary.classList.add(
    "session-context-summary"
);

const sessionContextPrimary =
    document.createElement("span");

sessionContextPrimary.classList.add(
    "session-context-primary"
);

const sessionContextEdit =
    document.createElement("span");

sessionContextEdit.classList.add(
    "session-context-edit"
);

sessionContextEdit.textContent =
    "Edit";

function updateSessionContextSummary() {
    sessionContextPrimary.textContent =
        `${formatDate(
            draftSession.date
        )} • ${
            draftSession.aoName ||
            "Select AO"
        }`;
}

updateSessionContextSummary();

sessionContextSummary.append(
    sessionContextPrimary,
    sessionContextEdit
);

sessionContext.append(
    sessionContextSummary
);

const searchWrap = document.createElement("div");
searchWrap.classList.add(
    "session-search-wrap",
    "session-search-shell"
);

const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.placeholder = "Search PAX to add...";
searchInput.classList.add(
    "session-search",
    "session-search-input"
);
searchInput.value = state.sessionSearchTerm || "";
searchInput.autocomplete = "off";
searchInput.setAttribute("role", "combobox");
searchInput.setAttribute("aria-autocomplete", "list");
searchInput.setAttribute("aria-expanded", "false");
searchInput.setAttribute("aria-controls", "session-search-results");

const searchResults = document.createElement("div");
searchResults.id = "session-search-results";
searchResults.classList.add("session-search-results");
searchResults.setAttribute("role", "listbox");

searchWrap.append(searchInput, searchResults);

let activeSearchResultIndex = -1;
let globalSearchResults = [];
let globalSearchLoading = false;
let globalSearchFailed = false;
let globalSearchRequestId = 0;
let globalSearchTimer = null;

function stripParentheticals(value = "") {
    return String(value).replace(/\([^)]*\)/g, "");
}

function getSessionSearchResults() {
    const searchTerm = String(state.sessionSearchTerm || "").trim();

    if (!searchTerm) {
        return [];
    }

    const lastPostMap = getCachedLastPostMapForAo(
        draftSession.aoId,
        draftSession.aoName
    );

    return getCachedSelectableMembers()
        .filter(member => !draftSession.attendeeIds.includes(member.id))
        .filter(member =>
            doesSearchMatch(member.paxName, searchTerm) ||
            doesSearchMatch(stripParentheticals(member.realName), searchTerm) ||
            doesSearchMatch(getCachedMemberDisplayName(member), searchTerm)
        )
        .sort((a, b) => {
            const aRecent = isRecentDate(lastPostMap.get(a.id), 20);
            const bRecent = isRecentDate(lastPostMap.get(b.id), 20);

            if (aRecent !== bRecent) {
                return aRecent ? -1 : 1;
            }

            const aInactive = a.status === "inactive";
            const bInactive = b.status === "inactive";

            if (aInactive !== bInactive) {
                return aInactive ? 1 : -1;
            }

            return getCachedMemberDisplayName(a)
                .localeCompare(getCachedMemberDisplayName(b));
        })
        .slice(0, 8);
}

async function runGlobalMemberSearch(
    searchTerm
) {
    const trimmed =
        String(searchTerm || "")
            .trim();

    const requestId =
        ++globalSearchRequestId;

    if (trimmed.length < 2) {
        globalSearchResults = [];
        globalSearchLoading = false;
        globalSearchFailed = false;
        renderSessionSearchResults();
        return;
    }

    globalSearchLoading = true;
    globalSearchFailed = false;
    renderSessionSearchResults();

    try {
        const results =
            await searchGlobalMembers(
                trimmed,
                {
                    limit: 20,
                    activeRegionId:
                        state.currentRegionId,
                }
            );

        if (
            requestId !==
            globalSearchRequestId
        ) {
            return;
        }

        const localIds = new Set(
            getCachedSelectableMembers()
                .map(member => member.id)
        );

        globalSearchResults =
            results.filter(member => {
                return (
                    member?.id &&
                    !localIds.has(member.id) &&
                    !draftSession.attendeeIds
                        .includes(member.id)
                );
            });

        globalSearchFailed = false;
    } catch (error) {
        if (
            requestId !==
            globalSearchRequestId
        ) {
            return;
        }

        console.error(
            "Failed to search global members:",
            error
        );

        globalSearchResults = [];
        globalSearchFailed = true;
    } finally {
        if (
            requestId ===
            globalSearchRequestId
        ) {
            globalSearchLoading = false;
            renderSessionSearchResults();
        }
    }
}

function closeSessionSearchResults() {
    activeSearchResultIndex = -1;
    searchResults.textContent = "";
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
}

async function addMemberFromSearch(member) {
    if (!member) return;

    if (
        member.isGlobalSearchResult
    ) {
        const participantsById =
            new Map(
                (state.participants || [])
                    .filter(
                        participant =>
                            participant?.id
                    )
                    .map(
                        participant => [
                            participant.id,
                            participant,
                        ]
                    )
            );
    
        participantsById.set(
            member.id,
            {
                ...member,
    
                participantId: null,
                participantRegionId:
                    state.currentRegionId,
                participantStatus: "active",
                participantSources: [],
                firstParticipatedOn: null,
                lastParticipatedOn: null,
                isHomeRegionMember:
                    member.regionId ===
                    state.currentRegionId,
            }
        );
    
        state.participants =
            [...participantsById.values()];
    
        cachedSelectableMembers = null;
        cachedDisplayNameByMemberId = null;
    }

    if (
        !draftSession.attendeeIds
            .includes(member.id)
    ) {
        draftSession.attendeeIds.push(
            member.id
        );

        await maybePromptForFngName(
            member
        );
    }

    clearSessionSearch();
    renderMemberList();

    requestAnimationFrame(() => {
        searchInput.focus();
    });
}

function renderSessionSearchResults() {
    searchResults.textContent = "";

    const searchTerm = String(state.sessionSearchTerm || "").trim();

    if (!searchTerm) {
        closeSessionSearchResults();
        return;
    }

    const localMatches =
        getSessionSearchResults();

    const matches = [
        ...localMatches,
        ...globalSearchResults,
    ].slice(0, 12);

    searchInput.setAttribute("aria-expanded", "true");

    if (matches.length === 0) {
        activeSearchResultIndex = -1;
    
        const empty =
            document.createElement("div");
    
        empty.classList.add(
            "session-search-empty"
        );
    
        if (globalSearchLoading) {
            empty.textContent =
                "Searching all PAX...";
        } else if (globalSearchFailed) {
            empty.textContent =
                "Global search unavailable";
        } else {
            empty.textContent =
                "No matching PAX";
        }
    
        searchResults.appendChild(empty);
        return;
    }

    if (
        activeSearchResultIndex < 0 ||
        activeSearchResultIndex >= matches.length
    ) {
        activeSearchResultIndex = 0;
    }

    matches.forEach((member, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.id = `session-search-result-${member.id}`;
        item.classList.add("session-search-result");
        item.setAttribute("role", "option");
        item.setAttribute(
            "aria-selected",
            index === activeSearchResultIndex ? "true" : "false"
        );

        if (index === activeSearchResultIndex) {
            item.classList.add("active");
        }

        const content = document.createElement("span");
        content.classList.add("session-search-result-content");

        const name = document.createElement("span");
        name.classList.add("session-search-result-name");
        name.textContent = getCachedMemberDisplayName(member);

        const isGlobalResult =
            member.isGlobalSearchResult ===
            true;

        content.appendChild(name);

        const lastPostMap =
            getCachedLastPostMapForAo(
                draftSession.aoId,
                draftSession.aoName
            );

        const context =
            document.createElement("span");
        
        context.classList.add(
            "session-search-result-context"
        );
        
        if (isGlobalResult) {
            context.classList.add(
                "session-search-result-context-global"
            );
        
            context.textContent =
                `${
                    member.homeRegionName ||
                    "Other Region"
                } · Global`;
        
            content.appendChild(context);
        } else if (
            isNonHomeParticipant(member)
        ) {
            context.textContent =
                getDrContextText(member);

            context.classList.add(
                "session-search-result-context-dr"
            );

            content.appendChild(context);
        } else if (
            isRecentDate(
                lastPostMap.get(member.id),
                20
            )
        ) {
            context.textContent =
                `Recent at ${
                    draftSession.aoName ||
                    "this AO"
                }`;

            content.appendChild(context);
        } else if (
            member.status === "inactive"
        ) {
            context.textContent =
                "Inactive";

            content.appendChild(context);
        }

        const addIndicator = document.createElement("span");
        addIndicator.classList.add("session-search-result-add");
        addIndicator.textContent = "+";
        addIndicator.setAttribute("aria-hidden", "true");

        item.append(content, addIndicator);

        item.addEventListener("pointerdown", event => {
            event.preventDefault();
        });

        item.addEventListener("click", () => {
            addMemberFromSearch(member);
        });

        searchResults.appendChild(item);
    });

    const activeResult = matches[activeSearchResultIndex];

    if (activeResult) {
        searchInput.setAttribute(
            "aria-activedescendant",
            `session-search-result-${activeResult.id}`
        );
    }
}

searchInput.addEventListener(
    "input",
    event => {
        state.sessionSearchTerm =
            event.target.value;

        activeSearchResultIndex = 0;

        globalSearchResults = [];
        globalSearchLoading = false;
        globalSearchFailed = false;

        /*
         * Invalidate an older request immediately when the
         * search term changes.
         */
        globalSearchRequestId += 1;

        if (globalSearchTimer) {
            clearTimeout(
                globalSearchTimer
            );

            globalSearchTimer = null;
        }

        renderSessionSearchResults();

        const trimmedSearchTerm =
            String(
                state.sessionSearchTerm ||
                ""
            ).trim();

        if (
            trimmedSearchTerm.length < 2
        ) {
            return;
        }

        globalSearchTimer =
            setTimeout(() => {
                globalSearchTimer = null;

                runGlobalMemberSearch(
                    trimmedSearchTerm
                );
            }, 300);
    }
);

searchInput.addEventListener("focus", () => {
    renderSessionSearchResults();
});

searchInput.addEventListener("keydown", event => {
    const matches = [
        ...getSessionSearchResults(),
        ...globalSearchResults,
    ].slice(0, 12);

    if (event.key === "Escape") {
        event.preventDefault();
        closeSessionSearchResults();
        searchInput.blur();
        return;
    }

    if (matches.length === 0) return;

    if (event.key === "ArrowDown") {
        event.preventDefault();

        activeSearchResultIndex =
            (
                activeSearchResultIndex +
                1
            ) %
            matches.length;

        renderSessionSearchResults();
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();

        activeSearchResultIndex =
            (
                activeSearchResultIndex -
                1 +
                matches.length
            ) %
            matches.length;

        renderSessionSearchResults();
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();

        const selectedMember =
            matches[
                activeSearchResultIndex
            ] ||
            matches[0];

        addMemberFromSearch(
            selectedMember
        );
    }
});

searchWrap.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
        if (!searchWrap.contains(document.activeElement)) {
            closeSessionSearchResults();
        }
    });
});

const memberList =
    document.createElement("main");

memberList.classList.add(
    "session-member-directory"
);

function isRecentDate(dateString, days = 45) {
    if (!dateString) return false;

    const postDate = new Date(dateString);
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);

    return postDate >= cutoff;
}

function getLastPostAtAo(memberId, aoId, aoName) {
    const matchingSessions = state.sessions.filter(session => {
        const matchesAo = session.aoId
            ? session.aoId === aoId
            : session.aoName === aoName;

        return (
            matchesAo &&
            (
                session.attendeeIds.includes(memberId) ||
                session.fngs?.some(fng => fng.memberId === memberId)
            )
        );
    });

    if (matchingSessions.length === 0) return null;

    return matchingSessions
        .map(session => session.date)
        .sort()
        .at(-1);
}

function normalizeId(id) {
    return String(id || "").trim();
}

function getCommitmentTypeForMember(memberId) {
    const normalizedMemberId = normalizeId(memberId);

    const commitment = qSlotCommitments.find(
        item => normalizeId(item.memberId) === normalizedMemberId
    );

    return commitment?.commitmentType || null;
}

function getCommittedMemberIds() {
    return new Set(
        qSlotCommitments
            .map(commitment => normalizeId(commitment.memberId))
            .filter(Boolean)
    );
}

function getKnownMemberIds() {
    return new Set(
        getMemberDirectory()
            .map(
                member =>
                    normalizeId(
                        member.id
                    )
            )
            .filter(Boolean)
    );
}

function getUniqueQIds() {
    return [...new Set((draftSession.qIds || []).map(normalizeId))].filter(Boolean);
}

function getKnownUniqueQIds() {
    const knownMemberIds = getKnownMemberIds();

    return getUniqueQIds().filter(qId => knownMemberIds.has(qId));
}

function isOnlyQ(memberId) {
    const normalizedMemberId = normalizeId(memberId);
    const knownQIds = getKnownUniqueQIds();

    return knownQIds.length === 1 && knownQIds[0] === normalizedMemberId;
}

function preventRemovingOnlyQ(memberId) {
    if (!isOnlyQ(memberId)) return false;

    showToast("A session must have at least one Q.", "info");
    return true;
}

function clearSessionSearch() {
    state.sessionSearchTerm = "";
    searchInput.value = "";

    globalSearchResults = [];
    globalSearchLoading = false;
    globalSearchFailed = false;

    /*
     * Invalidate any currently running request so its
     * response cannot repopulate the cleared dropdown.
     */
    globalSearchRequestId += 1;

    if (globalSearchTimer) {
        clearTimeout(
            globalSearchTimer
        );

        globalSearchTimer = null;
    }

    closeSessionSearchResults();
}

function getFngNamingPostNumber() {
    return Number(state.fngNamingPostNumber || 1);
}

function isUnnamedFng(member) {
    return !member.paxName;
}

function getPriorPostCount(memberId) {
    return state.sessions.filter(session =>
        memberAttendedSession(session, memberId)
    ).length;
}

async function maybePromptForFngName(member) {
    if (!isUnnamedFng(member)) return;

    const priorPostCount = getPriorPostCount(member.id);
    const projectedPostCount = priorPostCount + 1;

    if (projectedPostCount < getFngNamingPostNumber()) return;

    const displayName = getCachedMemberDisplayName(member);
    const paxName = prompt(`${displayName} is posting for the ${projectedPostCount} time. Enter F3 name?`);

    if (!paxName?.trim()) return;

    const updatedMember = {
        ...member,
        paxName: paxName.trim(),
    };

    await updateMember(member.id, updatedMember);

    cachedDisplayNameByMemberId = null;
    cachedSelectableMembers = null;
}

function createMemberCard(
    member,
    options = {}
) {
    const card =
        document.createElement("div");

    card.classList.add(
        "member-card",
        "session-member-row"
    );
    card.dataset.memberId = member.id;

    const name = document.createElement("span");
    name.classList.add("member-name");
    name.textContent = getCachedMemberDisplayName(member);

    let drBadge = null;

    if (isNonHomeParticipant(member)) {
        drBadge =
            document.createElement("span");

        drBadge.classList.add(
            "session-member-dr-badge"
        );

        drBadge.textContent = "DR";

        drBadge.title =
            getMemberHomeRegionName(member)
                ? `Home Region: ${
                    getMemberHomeRegionName(
                        member
                    )
                }`
                : "Downrange PAX";
    }

    const commitmentType =
        options.commitmentType ||
        getCommitmentTypeForMember(member.id);

    let commitmentBadge = null;

    if (commitmentType === "hc" || commitmentType === "sc") {
        commitmentBadge = document.createElement("span");
        commitmentBadge.classList.add(
            "session-commitment-badge",
            `session-commitment-badge-${commitmentType}`
        );

        commitmentBadge.textContent = commitmentType.toUpperCase();
    }

    const qButton = document.createElement("button");
    qButton.classList.add(
        "q-button",
        "session-member-q-button"
    );
    qButton.textContent = "Q";
    if ((draftSession.qIds || []).includes(member.id)) {
        qButton.classList.add("q-selected");
    }
    qButton.addEventListener("click", async (event) => {
        event.stopPropagation();

        const isSelectedQ = getUniqueQIds().includes(normalizeId(member.id));        if (isSelectedQ && preventRemovingOnlyQ(member.id)) {
            return;
        }
        if (isSelectedQ) {
            draftSession.qIds = (draftSession.qIds || []).filter(id => id !== member.id);
        } else {
            draftSession.qIds = [...(draftSession.qIds || []), member.id];
        }

        if (!draftSession.attendeeIds.includes(member.id)) {
            draftSession.attendeeIds.push(member.id);
            await maybePromptForFngName(member);
        }
        clearSessionSearch();
        renderMemberList();
    });

    const addIndicator = document.createElement("span");
    addIndicator.classList.add(
        "member-card-add-indicator",
        "session-member-add"
    );
    addIndicator.textContent = "+";
    addIndicator.setAttribute("aria-hidden", "true");

    const identity =
        document.createElement("span");

    identity.classList.add(
        "session-member-identity"
    );

    identity.appendChild(name);

    if (isNonHomeParticipant(member)) {
        const regionContext =
            document.createElement("span");

        regionContext.classList.add(
            "session-member-region"
        );

        regionContext.textContent =
            getMemberHomeRegionName(member);

        identity.appendChild(
            regionContext
        );
    }

    card.append(
        qButton,
        identity
    );

    if (drBadge) {
        card.appendChild(drBadge);
    }

    if (commitmentBadge) {
        card.appendChild(commitmentBadge);
    }

    card.appendChild(addIndicator);


    card.addEventListener("click", async () => {
        const isPresent = draftSession.attendeeIds.includes(member.id);
        const isSelectedQ = (draftSession.qIds || []).includes(member.id);

        if (!isPresent) {
            draftSession.attendeeIds.push(member.id);
            await maybePromptForFngName(member);
        } else {
            if (isSelectedQ && preventRemovingOnlyQ(member.id)) {
                return;
            }

            draftSession.attendeeIds = draftSession.attendeeIds.filter(id => id !== member.id);
            draftSession.qIds = (draftSession.qIds || []).filter(id => id !== member.id);
        }
            clearSessionSearch();
            renderMemberList();
        });
        return card;
    }

function createMemberSection(
    titleText,
    members,
    options = {}
) {
    const section =
        document.createElement("section");

    section.classList.add(
        "section",
        "session-member-section"
    );

    const title =
        document.createElement("div");

    title.classList.add(
        "detail-label",
        "session-member-section-title"
    );

    title.textContent = titleText;

    if (options.sectionClass) {
        section.classList.add(
            options.sectionClass
        );
    }

    section.appendChild(title);

    if (members.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = options.emptyText || "None";
        section. appendChild(empty);
        return section;
    }

    members.forEach(member => {
        section.appendChild(
            createMemberCard(member, {
                commitmentType: options.commitmentType || null,
            })
        );
    });

    return section;
}

function getDraftAttendeeCount() {
    return new Set([
        ...(draftSession.attendeeIds || []),
        ...(draftSession.qIds || []),
    ]).size;
}

function createSelectedSection(
    qMembers,
    selectedMembers
) {
    const section =
        document.createElement("section");

    section.classList.add(
        "section",
        "session-selected-section"
    );

    const heading =
        document.createElement("button");

    heading.type = "button";

    heading.classList.add(
        "detail-label",
        "session-selected-heading"
    );
    const selectedCount =
        getDraftAttendeeCount();

        const headingLabel =
        document.createElement("span");
    
    headingLabel.classList.add(
        "session-selected-heading-label"
    );
    
    headingLabel.textContent =
        `Selected PAX (${selectedCount})`;
    
    const headingAction =
        document.createElement("span");
    
    headingAction.classList.add(
        "session-selected-heading-action"
    );
    
    headingAction.textContent =
        state.sessionSelectedExpanded
            ? "Collapse"
            : selectedCount > 0
                ? "Review"
                : "";
    
    const headingChevron =
        document.createElement("span");
    
    headingChevron.classList.add(
        "session-selected-heading-chevron"
    );
    
    headingChevron.setAttribute(
        "aria-hidden",
        "true"
    );
    
    headingChevron.textContent =
        state.sessionSelectedExpanded
            ? "⌃"
            : "⌄";
    
    heading.append(
        headingLabel,
        headingAction,
        headingChevron
    );

    section.appendChild(heading);

    section.appendChild(createSelectedPillStrip(qMembers, selectedMembers));

    if (
        qMembers.length === 0 &&
        selectedMembers.length === 0
    ) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "None selected yet";
        section.appendChild(empty);
        return section;
    }

    heading.addEventListener("click", () => {
        state.sessionSelectedExpanded = !state.sessionSelectedExpanded;
        renderMemberList();
    });

    if (!state.sessionSelectedExpanded) {
        return section;
    }

    const selectedList =
        document.createElement("div");

    selectedList.classList.add(
        "selected-summary-list",
        "session-selected-list"
    );

    const reviewMembers = [
        ...qMembers.map(member => ({...member, isQ: true})),
        ...selectedMembers.map(member => ({ ...member, isQ: false })),
    ];

    reviewMembers.forEach(member => {
    const row =
        document.createElement("div");
    
    row.classList.add(
        "selected-summary-row",
        "session-selected-row"
    );
    
    const name =
        document.createElement("span");
    
    name.classList.add(
        "session-selected-name"
    );
        name.textContent = member.isQ
            ? `Q: ${getCachedMemberDisplayName(member)}`
            : getCachedMemberDisplayName(member);

        const removeButton =
            document.createElement("button");
        
        removeButton.type = "button";
        
        removeButton.classList.add(
            "session-selected-remove"
        );
        
        removeButton.textContent =
            "Remove";
        removeButton.addEventListener("click", () => {
            if (member.isQ && preventRemovingOnlyQ(member.id)) {
                return;
            }

            draftSession.attendeeIds = draftSession.attendeeIds.filter(id => id !== member.id);
            draftSession.qIds = (draftSession.qIds || []).filter(id => id !== member.id);
            renderMemberList();
        });

        row.append(name, removeButton);
        selectedList.appendChild(row);
    });

    section.appendChild(selectedList);
    return section;
}

const stickyHeader =
    document.createElement("section");

stickyHeader.classList.add(
    "sticky-header",
    "session-attendance-console"
);

const attendanceHeader =
    document.createElement("div");

attendanceHeader.classList.add(
    "session-attendance-header"
);

const attendanceIdentity =
    document.createElement("div");

attendanceIdentity.classList.add(
    "session-attendance-identity"
);

const attendanceEyebrow =
    document.createElement("div");

attendanceEyebrow.classList.add(
    "session-attendance-eyebrow"
);

attendanceEyebrow.textContent =
    "Session Roster";

const attendanceTitle =
    document.createElement("div");

attendanceTitle.classList.add(
    "session-attendance-title"
);

attendanceTitle.textContent =
    "Attendance";

attendanceIdentity.append(
    attendanceEyebrow,
    attendanceTitle
);

const attendanceCount =
    document.createElement("div");

attendanceCount.classList.add(
    "session-attendance-count"
);

attendanceHeader.append(
    attendanceIdentity,
    attendanceCount
);

const selectedHeaderSlot =
    document.createElement("div");

selectedHeaderSlot.classList.add(
    "session-summary-strip",
    "session-selected-slot"
);

stickyHeader.append(
    attendanceHeader,
    searchWrap,
    selectedHeaderSlot,
);

const sessionControls =
    document.createElement("div");

sessionControls.classList.add(
    "section",
    "session-ao-control"
);

sessionControls.append(
    aoLabel,
    aoSelect
);

function getSortedSelectableMembers() {
    const selectableById = new Map();

    /*
     * Active regional participants:
     * - active home-region members
     * - known DR/non-home participants
     */
    (state.participants || []).forEach(member => {
        if (!member?.id) return;

        selectableById.set(
            member.id,
            member
        );
    });

    /*
     * Inactive home-region members remain selectable because
     * they may return and post again.
     */
    (state.members || [])
        .filter(
            member =>
                member?.id &&
                member.status === "inactive"
        )
        .forEach(member => {
            if (!selectableById.has(member.id)) {
                selectableById.set(
                    member.id,
                    member
                );
            }
        });

    return [...selectableById.values()]
        .sort((a, b) => {
            const aInactive =
                a.status === "inactive";

            const bInactive =
                b.status === "inactive";

            if (aInactive !== bInactive) {
                return aInactive ? 1 : -1;
            }

            return getCachedMemberDisplayName(a)
                .localeCompare(
                    getCachedMemberDisplayName(b)
                );
        });
}

function buildLastPostMapForAo(aoId, aoName) {
    const lastPostMap = new Map();

    state.sessions.forEach(session => {
        const matchesAo = session.aoId
            ? session.aoId === aoId
            : session.aoName === aoName;

        if (!matchesAo) return;

        session.attendeeIds.forEach(memberId => {
            const existingDate = lastPostMap.get(memberId);
            if (!existingDate || session.date > existingDate) {
                lastPostMap.set(memberId, session.date);
            }
        });

        session.fngs?.forEach(fng => {
            if (!fng.memberId) return;

            const existingDate = lastPostMap.get(fng.memberId);
            if (!existingDate || session.date > existingDate) {
                lastPostMap.set(fng.memberId, session.date);
            }
        });
    });

    return lastPostMap;
}

function renderMemberList() {
    console.time("renderMemberList");
    memberList.textContent = "";

    const attendeeCount =
    getDraftAttendeeCount();

const qCount =
    getUniqueQIds().length;

attendanceCount.textContent =
    `${attendeeCount} selected`;

attendanceCount.classList.toggle(
    "is-ready",
    attendeeCount > 0 &&
    qCount > 0
);

    const lastPostMap = getCachedLastPostMapForAo(
        draftSession.aoId,
        draftSession.aoName
    );

    const selectableMembers = getCachedSelectableMembers();
    const committedMemberIds = getCommittedMemberIds();

    const qMembers =
        getUniqueQIds()
            .map(qId =>
                getMemberById(qId)
            )
            .filter(Boolean);

    const selectedMembers =
        [
            ...new Set(
                draftSession.attendeeIds ||
                []
            ),
        ]
            .filter(
                memberId =>
                    !getUniqueQIds()
                        .includes(
                            normalizeId(
                                memberId
                            )
                        )
            )
            .map(memberId =>
                getMemberById(memberId)
            )
            .filter(Boolean);

    const hcMembers = selectableMembers.filter(member => {
        if (draftSession.attendeeIds.includes(member.id)) {
            return false;
        }

        return getCommitmentTypeForMember(member.id) === "hc";
    });

    const scMembers = selectableMembers.filter(member => {
        if (draftSession.attendeeIds.includes(member.id)) {
            return false;
        }

        return getCommitmentTypeForMember(member.id) === "sc";
    });

    const recentMembers = selectableMembers.filter(member => {
        if (draftSession.attendeeIds.includes(member.id)) {
            return false;
        }

        if (committedMemberIds.has(normalizeId(member.id))) {
            return false;
        }

        const lastAoPost = lastPostMap.get(member.id) || null;

        return isRecentDate(lastAoPost, 20);
    });

    const visibleRecentMembers = state.sessionShowAllRecent
        ? recentMembers
        : recentMembers.slice(0, 6);

    const otherMembers = selectableMembers.filter(member => {
        if (draftSession.attendeeIds.includes(member.id)) {
            return false;
        }

        if (committedMemberIds.has(normalizeId(member.id))) {
            return false;
        }

        const lastAoPost = lastPostMap.get(member.id) || null;

        return !isRecentDate(lastAoPost, 20);
    });

        const PAX_DIRECTORY_PAGE_SIZE = 20;

    const totalOtherPages =
        Math.max(
            1,
            Math.ceil(
                otherMembers.length /
                PAX_DIRECTORY_PAGE_SIZE
            )
        );

    const currentOtherPage =
        Math.min(
            Math.max(
                Number(
                    state.sessionOtherPage ||
                    1
                ),
                1
            ),
            totalOtherPages
        );

    state.sessionOtherPage = currentOtherPage;

    const otherPageStart = (currentOtherPage - 1) * PAX_DIRECTORY_PAGE_SIZE;

    const visibleOtherMembers =
        state.sessionShowAllOthers
            ? otherMembers.slice(
                otherPageStart,
                otherPageStart + PAX_DIRECTORY_PAGE_SIZE
            )
            : [];

    selectedHeaderSlot.textContent = "";
    selectedHeaderSlot.appendChild(
        createSelectedSection(qMembers, selectedMembers)
    );

    if (qSlotCommitmentsLoading) {
        const loadingSection = document.createElement("div");
        loadingSection.classList.add(
            "section",
            "session-commitments-loading"
        );

        const loadingText = document.createElement("div");
        loadingText.classList.add("detail-value");
        loadingText.textContent = "Loading HC/SC commitments...";

        loadingSection.appendChild(loadingText);
        memberList.appendChild(loadingSection);
    }

    if (qSlotCommitmentsFailed) {
        const failedSection = document.createElement("div");
        failedSection.classList.add(
            "section",
            "session-commitments-failed"
        );

        const failedText = document.createElement("div");
        failedText.classList.add("detail-value");
        failedText.textContent =
            "HC/SC commitments could not be loaded.";

        failedSection.appendChild(failedText);
        memberList.appendChild(failedSection);
    }

    if (hcMembers.length > 0) {
        memberList.appendChild(
            createMemberSection(
                `Hard Commits (${hcMembers.length})`,
                hcMembers,
                {
                    commitmentType: "hc",
                    emptyText: "No hard commits",
                    sectionClass:
                        "session-hard-commit-section",
                }
            )
        );
    }

    if (scMembers.length > 0) {
        memberList.appendChild(
            createMemberSection(
                `Soft Commits (${scMembers.length})`,
                scMembers,
                {
                    commitmentType: "sc",
                    emptyText: "No soft commits",
                    sectionClass:
                        "session-soft-commit-section",
                }
            )
        );
    }

    const recentSection = createMemberSection(
        `Recent at ${draftSession.aoName || "AO"}`,
        visibleRecentMembers,
        {
            emptyText:
                "No recent posters at this AO",
        
            sectionClass:
                "session-recent-section",
        }
    );

    if (recentMembers.length > 6) {
        const toggleButton = document.createElement("button");
        toggleButton.textContent = state.sessionShowAllRecent
            ? "Show Less"
            : `Show ${recentMembers.length - 6} More`;

        toggleButton.addEventListener("click", () => {
            state.sessionShowAllRecent =
                !state.sessionShowAllRecent;

            renderMemberList();
        });

        recentSection.appendChild(toggleButton);
    }

    memberList.appendChild(recentSection);

    const directoryTitle = state.sessionShowAllOthers
            ? `PAX Directory • Page ${currentOtherPage} of ${totalOtherPages}`
            : "PAX Directory";

    const othersSection = createMemberSection(
            directoryTitle,
            visibleOtherMembers,
            {
                emptyText:
                    state.sessionShowAllOthers
                        ? "No other active PAX"
                        : "Search above or browse the full directory.",

                sectionClass:
                    "session-more-pax-section",
            }
        );

    if (
        !state.sessionShowAllOthers &&
        otherMembers.length > 0
    ) {
        const browseButton = document.createElement("button");

        browseButton.type = "button";

        browseButton.textContent = `Browse ${otherMembers.length} PAX`;

        browseButton.addEventListener("click", () => {
            state.sessionShowAllOthers = true;

            state.sessionOtherPage = 1;
            renderMemberList();
            }
        );

        othersSection.appendChild(browseButton);
    }

    if (
        state.sessionShowAllOthers &&
        otherMembers.length > 0
    ) {
        const pagination =
            document.createElement("div");

        pagination.classList.add(
            "session-directory-pagination"
        );

        const previousButton =
            document.createElement("button");

        previousButton.type =
            "button";

        previousButton.textContent =
            "Previous";

        previousButton.disabled =
            currentOtherPage <= 1;

        previousButton.addEventListener(
            "click",
            () => {
                if (
                    currentOtherPage <= 1
                ) {
                    return;
                }

                state.sessionOtherPage =
                    currentOtherPage - 1;

                renderMemberList();
            }
        );

        const pageStatus =
            document.createElement("div");

        pageStatus.classList.add(
            "session-directory-page-status"
        );

        const firstVisibleNumber =
            otherMembers.length === 0
                ? 0
                : otherPageStart + 1;

        const lastVisibleNumber =
            Math.min(
                otherPageStart +
                    PAX_DIRECTORY_PAGE_SIZE,
                otherMembers.length
            );

        pageStatus.textContent =
            `${firstVisibleNumber}–${lastVisibleNumber} of ${
                otherMembers.length
            }`;

        const nextButton =
            document.createElement("button");

        nextButton.type =
            "button";

        nextButton.textContent =
            "Next";

        nextButton.disabled =
            currentOtherPage >=
            totalOtherPages;

        nextButton.addEventListener(
            "click",
            () => {
                if (
                    currentOtherPage >=
                    totalOtherPages
                ) {
                    return;
                }

                state.sessionOtherPage =
                    currentOtherPage + 1;

                renderMemberList();
            }
        );

        pagination.append(
            previousButton,
            pageStatus,
            nextButton
        );

        const hideButton =
            document.createElement("button");

        hideButton.type =
            "button";

        hideButton.classList.add(
            "session-directory-hide-button"
        );

        hideButton.textContent =
            "Hide PAX Directory";

        hideButton.addEventListener(
            "click",
            () => {
                state.sessionShowAllOthers =
                    false;

                state.sessionOtherPage =
                    1;

                renderMemberList();
            }
        );

        othersSection.append(
            pagination,
            hideButton
        );
    }

    memberList.appendChild(
        othersSection
    );

    updateSessionSaveStatus();

    console.timeEnd("renderMemberList");
}

const saveStatus =
    document.createElement("div");

saveStatus.classList.add(
    "session-save-status"
);

async function loadDraftQSlotCommitments() {
    const qSlotId = draftSession.sourceQSlotId;

    if (!qSlotId || isEditing) {
        qSlotCommitments = [];
        qSlotCommitmentsLoading = false;
        qSlotCommitmentsFailed = false;
        return;
    }

    qSlotCommitmentsLoading = true;
    qSlotCommitmentsFailed = false;

    renderMemberList();

    try {
        const commitments = await loadQSlotCommitments(qSlotId);

        qSlotCommitments = Array.isArray(commitments)
            ? commitments
            : [];

        qSlotCommitmentsFailed = false;
    } catch (error) {
        console.error(
            "Failed to load Q-slot commitments for session logging:",
            {
                qSlotId,
                error,
            }
        );

        qSlotCommitments = [];
        qSlotCommitmentsFailed = true;
    } finally {
        qSlotCommitmentsLoading = false;
        renderMemberList();
    }
}

renderMemberList();
loadDraftQSlotCommitments();

function createEntryActions({
    row,
    fields,
    summary,
    removeButton,
    getSummaryLines,
}) {
    const actions =
        document.createElement("div");

    actions.classList.add(
        "session-entry-actions"
    );

    const cancelButton =
        document.createElement("button");

    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";

    cancelButton.classList.add(
        "session-entry-cancel"
    );

    const doneButton =
        document.createElement("button");

    doneButton.type = "button";
    doneButton.textContent = "Done";

    doneButton.classList.add(
        "session-entry-done"
    );

    const editButton =
        document.createElement("button");

    editButton.type = "button";
    editButton.textContent = "Edit";

    editButton.classList.add(
        "session-entry-edit"
    );

    function setEditing(isEditing) {
        row.classList.toggle(
            "is-complete",
            !isEditing
        );

        fields.forEach(field => {
            field.hidden = !isEditing;
        });

        summary.hidden = isEditing;
        doneButton.hidden = !isEditing;
        cancelButton.hidden = !isEditing;
        editButton.hidden = isEditing;
        removeButton.hidden = isEditing;
    }

    doneButton.addEventListener("click", () => {
        const lines =
            getSummaryLines()
                .filter(Boolean);

        if (lines.length === 0) {
            return;
        }

        summary.replaceChildren();

        lines.forEach((line, index) => {
            const item =
                document.createElement("div");

            item.classList.add(
                index === 0
                    ? "session-entry-summary-primary"
                    : "session-entry-summary-secondary"
            );

            item.textContent = line;

            summary.appendChild(item);
        });

        setEditing(false);
    });

    editButton.addEventListener("click", () => {
        setEditing(true);
    });

    cancelButton.addEventListener("click", () => {
        row.remove();
    });

    actions.append(
        cancelButton,
        doneButton,
        editButton,
        removeButton
    );

    setEditing(true);

    return actions;
}

const visitorHeading = document.createElement("div");
visitorHeading.classList.add("fng-heading");
visitorHeading.textContent = "Visiting PAX";

const addVisitorButton = document.createElement("button");
addVisitorButton.textContent = "Add DR Visitor";

const visitorContainer = document.createElement("div");

function updateFngButtonText() {
    const count = fngContainer.querySelectorAll(".fng-row").length;
    addFngButton.textContent = count > 0 ? "Add Another FNG" : "Add FNG";
}

function addVisitorRow(visitor = null) {
    const visitorRow = document.createElement("div");
    visitorRow.classList.add("visitor-row");
    visitorRow.dataset.id = visitor?.id || "";

    const visitorSummary =
        document.createElement("div");

    visitorSummary.classList.add(
        "session-entry-summary"
    );

    const f3Name = document.createElement("input");
    f3Name.type = "text";
    f3Name.classList.add("visitor-f3name-input");
    f3Name.placeholder = "DR F3 Name";
    f3Name.value = visitor?.f3Name || "";

    const homeRegion = document.createElement("input");
    homeRegion.type = "text";
    homeRegion.classList.add("visitor-home-region-input");
    homeRegion.placeholder = "Home Region";
    homeRegion.value = visitor?.homeRegion || "";

    const realName = document.createElement("input");
    realName.type = "text";
    realName.classList.add("visitor-realname-input");
    realName.placeholder = "Real Name optional";
    realName.value = visitor?.realName || "";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
        visitorRow.remove();
    });

    const visitorActions =
    createEntryActions({
        row: visitorRow,

        fields: [
            f3Name,
            homeRegion,
            realName,
        ],

        summary:
            visitorSummary,

        removeButton,

        getSummaryLines: () => [
            f3Name.value.trim(),
            homeRegion.value.trim(),
            realName.value.trim(),
        ],
    });

    visitorRow.append(
        f3Name,
        homeRegion,
        realName,
        visitorSummary,
        visitorActions
    );

    visitorContainer.appendChild(visitorRow);
}

addVisitorButton.addEventListener("click", () => {
    addVisitorRow();
});

const fngHeading = document.createElement("div");
fngHeading.classList.add("fng-heading");
fngHeading.textContent = "FNGs";

const addFngButton = document.createElement("button");
addFngButton.textContent = "Add FNG";

const fngContainer = document.createElement("div");

function addFngRow(fng = null) {
    const fngRow = document.createElement("div");
    fngRow.classList.add("fng-row");
    fngRow.dataset.memberId = fng?.memberId || "";

    const realName = document.createElement("input");
    realName.type = "text";
    realName.classList.add("fng-realname-input");
    realName.placeholder = "FNG Real Name";
    realName.value = fng?.realName || "";

    const paxName = document.createElement("input");
    paxName.classList.add("fng-paxname-input");
    paxName.type = "text";
    paxName.placeholder = "FNG F3 Name";
    paxName.value = fng?.paxName || "";

    const initialInviterIds =
    Array.isArray(fng?.inviterIds) && fng.inviterIds.length > 0
        ? fng.inviterIds
        : fng?.invitedById
            ? [fng.invitedById]
            : [];

    const invitedByField = createInvitedByField(initialInviterIds);

    const fngSummary =
        document.createElement("div");

    fngSummary.classList.add(
        "session-entry-summary"
    );

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
        fngRow.remove();
        updateFngButtonText();
    });

    const fngActions =
    createEntryActions({
        row: fngRow,

        fields: [
            realName,
            paxName,
            invitedByField.wrapper,
        ],

        summary:
            fngSummary,

        removeButton,

        getSummaryLines: () => [
            realName.value.trim(),
            paxName.value.trim()
                ? `F3 Name: ${paxName.value.trim()}`
                : "",
                [
                    ...invitedByField.wrapper.querySelectorAll(
                        ".invited-by-chip"
                    ),
                ]
                    .map(chip => {
                        const chipClone =
                            chip.cloneNode(true);
                
                        chipClone
                            .querySelectorAll(
                                "button, .remove-button"
                            )
                            .forEach(element => {
                                element.remove();
                            });
                
                        return chipClone
                            .textContent
                            .trim();
                    })
                    .filter(Boolean)
                    .join(", "),
        ],
    });

    fngRow.append(
        realName,
        paxName,
        invitedByField.wrapper,
        fngSummary,
        fngActions
    );

    fngContainer.appendChild(fngRow);
    updateFngButtonText();
}

addFngButton.addEventListener("click", () => {
    addFngRow();
});

if (draftSession.visitors.length > 0) {
    draftSession.visitors.forEach(visitor => addVisitorRow(visitor));
}

if (draftSession.fngs.length > 0) {
    draftSession.fngs.forEach(fng => addFngRow(fng));
}

updateFngButtonText();

const additionalAttendanceSection =
    document.createElement("section");

additionalAttendanceSection.classList.add(
    "session-additional-attendance"
);

const visitorSection =
    document.createElement("div");

visitorSection.classList.add(
    "session-additional-group",
    "session-visitor-group"
);

visitorSection.append(
    visitorHeading,
    addVisitorButton,
    visitorContainer
);

const fngSection =
    document.createElement("div");

fngSection.classList.add(
    "session-additional-group",
    "session-fng-group"
);

fngSection.append(
    fngHeading,
    addFngButton,
    fngContainer
);

additionalAttendanceSection.append(
    visitorSection,
    fngSection
);


function normalizeSessionForSave(session) {
    const qIds = [...new Set(session.qIds || (session.qId ? [session.qId] : []))]
        .map(normalizeId)
        .filter(Boolean);

    const fngMemberIds = (session.fngs || [])
        .map(fng => normalizeId(fng.memberId))
        .filter(Boolean);

    const attendeeIds = [
        ...new Set([
            ...(session.attendeeIds || []).map(normalizeId),
            ...qIds,
            ...fngMemberIds,
        ]),
    ].filter(Boolean);

    const ao =
        state.aos.find(a => a.id === session.aoId)
        || state.aos.find(a => a.name === session.aoName);

    return {
        ...session,
        date: session.date || getTodayDate(),
        aoId: ao?.id || session.aoId || null,
        aoName: ao?.name || session.aoName || "",
        siteId:
            session.siteId ||
            ao?.defaultSiteId ||
            null,
        attendeeIds,
        qIds,
        fngs: session.fngs || [],
        visitors: session.visitors || [],
        notes: session.notes || "",
        startTime:
            session.startTime ||
            ao?.time ||
            null,
    };
}

function validateSessionForSave(session) {
    if (!session.date) return "Please select a date.";
    if (!session.aoId && !session.aoName) return "Please select an AO.";
    if ((session.qIds || []).length === 0) return "Please select at least one Q.";

    if (getTotalAttendanceCount(session) === 0) {
        return "Please select at least one attendee, FNG, or DR visitor.";
    }

    return null;
}

function findPotentialDuplicateSession(session) {
    if (isEditing) return null;

    return state.sessions.find(existingSession =>
        existingSession.id !== session.id &&
        existingSession.date === session.date &&
        (
            existingSession.aoId === session.aoId ||
            (
                !existingSession.aoId &&
                existingSession.aoName === session.aoName
            )
        ) &&
        (existingSession.startTime || "") === (session.startTime || "")
    ) || null;
}

async function attachWeatherSnapshot(session) {
    if (!session.siteId || !session.startTime || !session.date) {
        return session;
    }

    try {
        const targetDateTime =
            `${session.date}T${session.startTime}:00`;

        const weather = await getSiteWeather(
            session.siteId,
            targetDateTime
        );

        if (!weather || weather.weatherUnavailable) {
            return session;
        }

        return {
            ...session,
            weatherSnapshot: {
                temp: weather.temp ?? null,
                feelsLike: weather.feelsLike ?? null,
                condition: weather.condition ?? null,
                precipChance: weather.precipChance ?? null,
                windMph: weather.windMph ?? null,
                icon: weather.icon ?? null,
                capturedAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        console.error("Failed to capture session weather:", error);
        return session;
    }
}

function collectFngsFromUi() {
    const allFngRows = document.querySelectorAll(".fng-row");
    const fngs = [];

    allFngRows.forEach(row => {
        const realNameInput = row.querySelector(".fng-realname-input");
        const paxNameInput = row.querySelector(".fng-paxname-input");
        const inviterIdsInput = row.querySelector(".fng-inviter-ids");

        const realName = realNameInput?.value.trim() || "";
        const paxName = paxNameInput?.value.trim() || null;
        const memberId = row.dataset.memberId || null;

        let inviterIds = [];

        try {
            const parsedIds = JSON.parse(
                inviterIdsInput?.value || "[]"
            );

            inviterIds = Array.isArray(parsedIds)
                ? [...new Set(parsedIds.filter(Boolean))]
                : [];
        } catch (error) {
            console.warn(
                "Failed to parse FNG inviter IDs:",
                error
            );
            inviterIds = [];
        }

        const invitedById = inviterIds[0] || null;

        if (!realName && !paxName) return;

        fngs.push({
            realName,
            paxName,
            inviterIds,
            invitedById,
            memberId,
        });
    });

    return fngs;
}

function collectVisitorsFromUi() {
    const allVisitorRows = document.querySelectorAll(".visitor-row");
    const visitors = [];

    allVisitorRows.forEach(row => {
        const id = row.dataset.id || null;

        const f3NameInput = row.querySelector(".visitor-f3name-input");
        const homeRegionInput = row.querySelector(".visitor-home-region-input");
        const realNameInput = row.querySelector(".visitor-realname-input");

        const f3Name = f3NameInput.value.trim();
        const homeRegion = homeRegionInput.value.trim();
        const realName = realNameInput.value.trim();

        if (!f3Name) return;

        visitors.push({
            id,
            f3Name,
            homeRegion,
            realName,
            createdByUserId: state.currentUserId,
        });
    });

    return visitors;
}

const saveButton = document.createElement("button");
saveButton.textContent = "Save";

let isSavingSession = false;
let visitorLoadStatus =
    isEditing && sessionId
        ? "loading"
        : "ready";

function updateSessionSaveStatus() {
    const attendeeCount =
        getDraftAttendeeCount();

    const qCount =
        getUniqueQIds().length;

    if (attendeeCount === 0) {
        saveStatus.textContent =
            "No PAX selected";

        saveStatus.className =
            "session-save-status";
        return;
    }

    if (qCount === 0) {
        saveStatus.textContent =
            `${attendeeCount} PAX • Q needed`;

        saveStatus.className =
            "session-save-status needs-attention";
        return;
    }

    saveStatus.textContent =
        `${attendeeCount} PAX • Ready`;

    saveStatus.className =
        "session-save-status is-ready";
}

function updateSaveButtonState() {
    updateSessionSaveStatus();
    const visitorsUnavailable =
        visitorLoadStatus === "loading" ||
        visitorLoadStatus === "failed";

    addVisitorButton.disabled =
        isSavingSession ||
        visitorsUnavailable;

    visitorContainer
        .querySelectorAll("input, button")
        .forEach(control => {
            control.disabled =
                isSavingSession ||
                visitorsUnavailable;
        });

    if (isSavingSession) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        return;
    }

    if (visitorLoadStatus === "loading") {
        saveButton.disabled = true;
        saveButton.textContent = "Loading visitors...";
        return;
    }

    if (visitorLoadStatus === "failed") {
        saveButton.disabled = true;
        saveButton.textContent = "Visitor load failed";
        return;
    }

    saveButton.disabled = false;
    saveButton.textContent = "Save";
}

async function loadExistingSessionVisitors() {
    if (!isEditing || !sessionId) {
        visitorLoadStatus = "ready";
        updateSaveButtonState();
        return;
    }

    visitorLoadStatus = "loading";
    updateSaveButtonState();

    try {
        const visitors = await loadSessionVisitors(sessionId);

        draftSession.visitors = visitors || [];

        visitorContainer.textContent = "";
        draftSession.visitors.forEach(visitor => {
            addVisitorRow(visitor);
        });

        visitorLoadStatus = "ready";
    } catch (error) {
        console.error("Failed to load DR visitors:", error);

        visitorLoadStatus = "failed";

        showToast(
            "Visitors could not be loaded. This session cannot be saved until they are reloaded.",
            "error"
        );
    }

    updateSaveButtonState();
}

saveButton.addEventListener("click", async () => {
    if (visitorLoadStatus !== "ready") {
        showToast(
            visitorLoadStatus === "failed"
                ? "Visitors failed to load. Leave and reopen the session before saving."
                : "Visitors are still loading.",
            "error"
        );

        return;
    }

    /*
     * Lock the save flow before any async work begins.
     *
     * This prevents repeated taps from starting multiple
     * weather requests or session saves.
     */
    if (isSavingSession) return;

    isSavingSession = true;
    updateSaveButtonState();

    try {
        draftSession.fngs = collectFngsFromUi();
        draftSession.visitors = collectVisitorsFromUi();
        draftSession.notes = notes.value.trim();

        draftSession = normalizeSessionForSave(
            draftSession
        );

        /*
         * Validate before attempting optional weather
         * enrichment.
         */
        const validationMessage =
            validateSessionForSave(draftSession);

        if (validationMessage) {
            alert(validationMessage);
            return;
        }

        /*
         * Duplicate detection is also local and should happen
         * before optional network enrichment.
         */
        const duplicateSession =
            findPotentialDuplicateSession(draftSession);

        if (duplicateSession) {
            const shouldViewExisting = confirm(
                `A session already exists for ${draftSession.aoName} on ${formatDate(draftSession.date)}.\n\nView the existing session?`
            );

            if (shouldViewExisting) {
                state.selectedSessionId =
                    duplicateSession.id;

                state.editingSessionId = null;
                state.draftSession = null;

                navigateTo("sessionDetail");
            }

            return;
        }

        /*
         * Weather is optional enrichment and must never prevent
         * offline session persistence.
         *
         * navigator.onLine is only a fast-path signal. The
         * helper still catches request failures if connectivity
         * disappears after this check.
         */
        if (navigator.onLine) {
            draftSession =
                await attachWeatherSnapshot(
                    draftSession
                );
        }

        let saveOutcome = null;
        let savedSession = null;
    
        const oldSession = isEditing
            ? state.sessions.find(
                session => session.id === sessionId
            ) || null
            : null;
    
        /*
         * Phase 1: authoritative save.
         *
         * Only errors in this phase may be reported as
         * "Failed to save session."
         */
        try {
            if (isEditing) {
                const canSaveEdit =
                    canManageSession(oldSession);
    
                if (!canSaveEdit) {
                    throw new Error(
                        "Unauthorized session edit."
                    );
                }
            }
    
            if (isEditing) {
                const sessionToUpdate = {
                    ...draftSession,
    
                    announcementText:
                        originalSession
                            ?.announcementText ??
                        draftSession
                            .announcementText ??
                        "",
    
                    announcementSnapshot:
                        originalSession
                            ?.announcementSnapshot ??
                        draftSession
                            .announcementSnapshot ??
                        null,
                };
    
                saveOutcome = await updateSession(
                    sessionId,
                    sessionToUpdate
                );
            } else {
                const sessionToCreate = {
                    ...draftSession,
                    createdByUserId:
                        state.currentUserId,
                };
    
                saveOutcome = await addSession(
                    sessionToCreate
                );
            }
    
            if (
                saveOutcome.status !== "queued"
            ) {
                savedSession =
                    saveOutcome.savedSession;
    
                if (!savedSession) {
                    throw new Error(
                        "Session save completed without returning a saved session."
                    );
                }
            }
        } catch (error) {
            console.error(
                "Failed to save session:",
                error
            );
    
            showToast(
                "Failed to save session.",
                "error"
            );
    
            logSaveFailure(
                "sessionView.saveSession",
                error,
                {
                    editingSessionId:
                        state.editingSessionId ||
                        null,
    
                    selectedSessionId:
                        state.selectedSessionId ||
                        null,
    
                    draftSessionId:
                        draftSession?.id ||
                        null,
    
                    sessionDate:
                        draftSession?.date ||
                        null,
    
                    sessionAoName:
                        draftSession?.aoName ||
                        null,
    
                    attendeeCount:
                        draftSession
                            ?.attendeeIds
                            ?.length || 0,
    
                    qCount:
                        draftSession
                            ?.qIds
                            ?.length || 0,
    
                    fngCount:
                        draftSession
                            ?.fngs
                            ?.length || 0,
    
                    sourcePlannedWorkoutId:
                        draftSession
                            ?.sourcePlannedWorkoutId ||
                        null,
                }
            );
    
            return;
        }
    
        /*
         * Phase 2: post-save UI completion.
         *
         * At this point the session has either:
         *  - committed to the cloud, or
         *  - been durably queued on the device.
         *
         * Nothing in this phase may be reported as a
         * complete save failure.
         */
        try {
            if (
                saveOutcome.status === "queued"
            ) {
                showToast(
                    saveOutcome.path ===
                        "transport_fallback_queue"
                        ? "Connection was lost. Session saved on this device and will upload automatically."
                        : "Session saved on this device. It will upload automatically when you're back online.",
                    "success"
                );
    
                state.editingSessionId = null;
                state.selectedPlannedWorkoutId =
                    null;
                state.sessionSearchTerm = "";
                state.sessionShowAllOthers = false;
                state.sessionShowAllRecent = false;
                state.sessionSelectedExpanded =
                    false;
                state.sessionQExpanded = false;
                state.draftSession = null;
    
                navigateTo("dashboard");
                return;
            }
    
            /*
             * Cache invalidation is helpful, but it is not
             * part of authoritative persistence.
             */
            try {
                const affectedMemberIds = [
                    ...new Set([
                        ...getAffectedMemberIdsFromSession(
                            oldSession
                        ),
    
                        ...getAffectedMemberIdsFromSession(
                            savedSession
                        ),
    
                        ...(
                            savedSession?.fngs ||
                            []
                        )
                            .map(
                                fng =>
                                    fng.memberId
                            )
                            .filter(Boolean),
                    ]),
                ];
    
                invalidateMemberStatsCache(
                    affectedMemberIds
                );
    
                invalidateRecentMemberActivityCache(
                    affectedMemberIds
                );
            } catch (error) {
                console.warn(
                    "Session saved, but member caches could not be invalidated:",
                    error
                );
            }
    
            const hasPostSaveDegradation =
                saveOutcome.status ===
                "partial";
    
            /*
             * Both flag construction and persistence are
             * ancillary. Neither may turn the committed
             * session into a save failure.
             */
            let flags = [];
            let adminFlagsSaved = true;
    
            try {
                flags =
                    createDuplicateFngNameFlags(
                        savedSession,
                        state.members,
                        state.currentUserId
                    );
    
                if (flags.length > 0) {
                    await addAdminFlags(flags);
                }
            } catch (error) {
                adminFlagsSaved = false;
    
                console.warn(
                    "Session saved, but duplicate-name flags could not be created:",
                    error
                );
            }
    
            if (hasPostSaveDegradation) {
                showToast(
                    "Session saved, but some local data may need to refresh.",
                    "info"
                );
            } else if (!adminFlagsSaved) {
                showToast(
                    "Session saved, but admin review could not be flagged.",
                    "info"
                );
            } else if (flags.length > 0) {
                showToast(
                    "Session saved • Duplicate name flagged for admin review",
                    "info"
                );
            } else {
                showToast(
                    "Session saved",
                    "success"
                );
            }
    
            state.selectedSessionId =
                savedSession.id;
    
            state.editingSessionId = null;
            state.selectedPlannedWorkoutId =
                null;
            state.sessionSearchTerm = "";
            state.sessionShowAllOthers = false;
            state.sessionShowAllRecent = false;
            state.sessionSelectedExpanded =
                false;
            state.sessionQExpanded = false;
            state.draftSession = null;
    
            if (isEditing) {
                state.viewHistory = (
                    state.viewHistory ||
                    []
                ).filter(
                    view => view !== "session"
                );
    
                state.currentView =
                    "sessionDetail";
    
                renderApp();
            } else {
                const shouldPreserveBackblast =
                    savedSession
                        .backblastStatus ===
                        "shared" ||
                    savedSession
                        .backblastStatus ===
                        "posted" ||
                    savedSession
                        .backblastStatus ===
                        "posted_elsewhere";
    
                state.draftBackblastText =
                    shouldPreserveBackblast
                        ? savedSession
                            .backblastText ||
                          ""
                        : generateBackblast(
                            savedSession,
                            state.members
                        );
    
                state.draftBackblastMediaFiles =
                    [];
    
                state.hasAddedBackblastWeather =
                    false;
    
                navigateTo(
                    "backblast",
                    {},
                    { replaceCurrent: true }
                );
            }
        } catch (error) {
            console.error(
                "Session saved, but post-save UI completion failed:",
                {
                    saveStatus:
                        saveOutcome?.status ||
                        null,
    
                    savePath:
                        saveOutcome?.path ||
                        null,
    
                    sessionId:
                        savedSession?.id ||
                        draftSession?.id ||
                        null,
    
                    error,
                }
            );
    
            showToast(
                saveOutcome?.status === "queued"
                    ? "Session saved on this device, but the dashboard could not be opened."
                    : "Session saved, but the next screen could not be opened.",
                "error"
            );
        }
    } finally {
        isSavingSession = false;
        updateSaveButtonState();
    }
});

updateSaveButtonState();
loadExistingSessionVisitors();

const notes =
    document.createElement("textarea");

notes.classList.add(
    "notes",
    "session-notes"
);
notes.placeholder = "Notes...";
notes.value = draftSession.notes || "";

const actionBar =
    document.createElement("div");

actionBar.classList.add(
    "sticky-action-bar",
    "session-save-bar"
);

saveButton.classList.add(
    "session-save-button"
);

actionBar.append(
    saveStatus,
    saveButton
);

const dateInputWrap = document.createElement("label");
dateInputWrap.classList.add("fake-date-field");

const dateDisplay = document.createElement("div");
dateDisplay.classList.add("fake-date-display");
dateDisplay.textContent = formatDate(draftSession.date);

dateInputWrap.append(dateDisplay, dateInput);

const topSection =
    document.createElement("section");

topSection.classList.add(
    "session-top-section",
    "session-setup"
);

topSection.append(
    dateLabel,
    dateInputWrap,

    ...(
        loadedWorkoutBanner
            ? [loadedWorkoutBanner]
            : []
    ),

    sessionControls
);

let sessionSetupExpanded =
    isEditing;

function updateSessionSetupVisibility() {
    topSection.hidden =
        !sessionSetupExpanded;

    sessionContext.classList.toggle(
        "is-expanded",
        sessionSetupExpanded
    );

    sessionContextEdit.textContent =
        sessionSetupExpanded
            ? "Done"
            : "Edit";
}

sessionContextSummary.addEventListener(
    "click",
    () => {
        sessionSetupExpanded =
            !sessionSetupExpanded;

        updateSessionSetupVisibility();
    }
);

updateSessionSetupVisibility();

app.append(
    header,
    title,
    subtitle,
    sessionContext,
    topSection,
    stickyHeader,
    memberList,
    additionalAttendanceSection,
    notes,
    actionBar
);
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}