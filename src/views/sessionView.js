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
import { getAoWeather } from "../services/weather.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { getAffectedMemberIdsFromSession, loadMemberDashboardStats, rebuildMemberStatsForMembers } from "../services/cloudData.js";
import { invalidateMemberStatsCache, invalidateRecentMemberActivityCache } from "../utils/memberStatsCache.js";
import { doesSearchMatch } from "../utils/search.js";
import { getTotalAttendanceCount, memberAttendedSession } from "../utils/sessionAttendance.js";
import { loadSessionVisitors } from "../services/sessionVisitorData.js";
import { hasPermission, PERMISSIONS, canEditAoSession } from "../utils/permissions.js";

export function renderSession() { 
const app = document.getElementById("app");
app.textContent = "";

cleanupMainMenu();

if (!state.editingSessionId && !state.selectedSessionId) {
    state.sessionShowAllRecent = false;
    state.sessionShowAllOthers = false;
    state.sessionSelectedExpanded = false;
    state.sessionQExpanded = false;
}

let cachedLastPostMapByAoKey = new Map();
let cachedDisplayNameByMemberId = null;

function buildDisplayNameByMemberId() {
    const paxNameGroups = new Map();

    (state.members || []).forEach(member => {
        const paxName = String(member.paxName || "").trim();
        if (!paxName) return;

        const group = paxNameGroups.get(paxName) || [];
        group.push(member);
        paxNameGroups.set(paxName, group);
    });

    const displayNameByMemberId = new Map();

    (state.members || []).forEach(member => {
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
    hasPermission(PERMISSIONS.MANAGE_SESSIONS) ||
    canEditAoSession(originalSession?.aoId) ||
    originalSession?.createdByUserId === state.currentUserId;

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

const title = document.createElement("h1");
title.textContent = isEditing ? "Edit Session" : "Start Session";

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
    draftSession.date = event.target.value;
    dateDisplay.textContent = formatDate(draftSession.date);
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

aoSelect.addEventListener("change", (event) => {
    const selectedAo = state.aos.find(ao => ao.id === event.target.value);

    draftSession.aoId = selectedAo?.id || null;
    draftSession.aoName = selectedAo?.name || "";

    cachedLastPostMapByAoKey.clear();

    renderMemberList();
    renderSessionSearchResults();
});

const searchWrap = document.createElement("div");
searchWrap.classList.add("session-search-wrap");

const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.placeholder = "Search PAX to add...";
searchInput.classList.add("session-search");
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

function closeSessionSearchResults() {
    activeSearchResultIndex = -1;
    searchResults.textContent = "";
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
}

async function addMemberFromSearch(member) {
    if (!member) return;

    if (!draftSession.attendeeIds.includes(member.id)) {
        draftSession.attendeeIds.push(member.id);
        await maybePromptForFngName(member);
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

    const matches = getSessionSearchResults();

    searchInput.setAttribute("aria-expanded", "true");

    if (matches.length === 0) {
        activeSearchResultIndex = -1;

        const empty = document.createElement("div");
        empty.classList.add("session-search-empty");
        empty.textContent = "No matching PAX";
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

        content.appendChild(name);

        const lastPostMap = getCachedLastPostMapForAo(
            draftSession.aoId,
            draftSession.aoName
        );

        if (isRecentDate(lastPostMap.get(member.id), 20)) {
            const context = document.createElement("span");
            context.classList.add("session-search-result-context");
            context.textContent = `Recent at ${draftSession.aoName || "this AO"}`;
            content.appendChild(context);
        } else if (member.status === "inactive") {
            const context = document.createElement("span");
            context.classList.add("session-search-result-context");
            context.textContent = "Inactive";
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

searchInput.addEventListener("input", event => {
    state.sessionSearchTerm = event.target.value;
    activeSearchResultIndex = 0;
    renderSessionSearchResults();
});

searchInput.addEventListener("focus", () => {
    renderSessionSearchResults();
});

searchInput.addEventListener("keydown", event => {
    const matches = getSessionSearchResults();

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
            (activeSearchResultIndex + 1) % matches.length;
        renderSessionSearchResults();
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        activeSearchResultIndex =
            (activeSearchResultIndex - 1 + matches.length) % matches.length;
        renderSessionSearchResults();
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();

        const selectedMember =
            matches[activeSearchResultIndex] || matches[0];

        addMemberFromSearch(selectedMember);
    }
});

searchWrap.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
        if (!searchWrap.contains(document.activeElement)) {
            closeSessionSearchResults();
        }
    });
});

const memberList = document.createElement("div");

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

function getKnownMemberIds() {
    return new Set(state.members.map(member => normalizeId(member.id)));
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
}

function createMemberCard(member) {
    const card = document.createElement("div");
    card.classList.add("member-card");
    card.dataset.memberId = member.id;
    const name = document.createElement("span");
    name.classList.add("member-name");
    name.textContent = getCachedMemberDisplayName(member);
    const qButton = document.createElement("button");
    qButton.classList.add("q-button");
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
    addIndicator.classList.add("member-card-add-indicator");
    addIndicator.textContent = "+";
    addIndicator.setAttribute("aria-hidden", "true");

    card.append(qButton, name, addIndicator);


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

function createMemberSection(titleText, members, options = {}) {
    const section = document.createElement("div");
    section.classList.add("section");

    const title = document.createElement("div");
    title.classList.add("detail-label");
    title.textContent = titleText;

    section.appendChild(title);

    if (members.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = options.emptyText || "None";
        section. appendChild(empty);
        return section;
    }

    members.forEach(member => {
        section.appendChild(createMemberCard(member));
    });

    return section;
}

function getDraftAttendeeCount() {
    return new Set([
        ...(draftSession.attendeeIds || []),
        ...(draftSession.qIds || []),
    ]).size;
}

function createSelectedSection(qMembers, selectedMembers) {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = state.sessionSelectedExpanded
        ? `Selected PAX (${getDraftAttendeeCount()}) • Tap to collapse`
        : `Selected PAX (${getDraftAttendeeCount()}) • Tap to review/edit`;
    
    heading.style.cursor = "pointer";

    section.appendChild(heading);

    section.appendChild(createSelectedPillStrip(qMembers, selectedMembers));

    if (selectedMembers.length === 0) {
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

    const selectedList = document.createElement("div");
    selectedList.classList.add("selected-summary-list");

    const reviewMembers = [
        ...qMembers.map(member => ({...member, isQ: true})),
        ...selectedMembers.map(member => ({ ...member, isQ: false })),
    ];

    reviewMembers.forEach(member => {
        const row = document.createElement("div");
        row.classList.add("selected-summary-row");

        const name = document.createElement("span");
        name.textContent = member.isQ
            ? `Q: ${getCachedMemberDisplayName(member)}`
            : getCachedMemberDisplayName(member);

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
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

const stickyHeader = document.createElement("div");
stickyHeader.classList.add("sticky-header");

const sessionHelperText = document.createElement("div");
sessionHelperText.classList.add("session-helper-text");

const helperLineOne = document.createElement("div");
helperLineOne.textContent = "Search or tap card to add PAX";

const helperLineTwo = document.createElement("div");
helperLineTwo.textContent = "Tap Q to assign Q";

sessionHelperText.append(helperLineOne, helperLineTwo);

const selectedHeaderSlot = document.createElement("div");
selectedHeaderSlot.classList.add("session-summary-strip");

stickyHeader.append(searchWrap, sessionHelperText, selectedHeaderSlot);

const sessionControls = document.createElement("div");
sessionControls.classList.add("section");
sessionControls.append(aoLabel, aoSelect);

function getSortedSelectableMembers() {
    return state.members
        .filter(member => member.status === "active" || member.status === "inactive")
        .sort((a, b) => {
            const aInactive = a.status === "inactive";
            const bInactive = b.status === "inactive";

            if (aInactive !== bInactive) {
                return aInactive ? 1 : -1;
            }

            return getCachedMemberDisplayName(a)
                .localeCompare(getCachedMemberDisplayName(b));
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

    const lastPostMap = getCachedLastPostMapForAo(
        draftSession.aoId,
        draftSession.aoName
    );
    const selectableMembers = getCachedSelectableMembers();

    const qMembers = selectableMembers.filter(member =>
        getUniqueQIds().includes(normalizeId(member.id))
    );
    
    const selectedMembers = selectableMembers.filter(member =>
        draftSession.attendeeIds.includes(member.id) &&
        !(draftSession.qIds || []).includes(member.id)
    );
    
    const recentMembers = selectableMembers.filter(member => {
        if (draftSession.attendeeIds.includes(member.id)) return false;
    
        const lastAoPost = lastPostMap.get(member.id) || null;
        return isRecentDate(lastAoPost, 20);
    });
    
    const visibleRecentMembers = state.sessionShowAllRecent
        ? recentMembers
        : recentMembers.slice(0, 12);
    
    const otherMembers = selectableMembers.filter(member => {
        if (draftSession.attendeeIds.includes(member.id)) return false;
    
        const lastAoPost = lastPostMap.get(member.id) || null;
        return !isRecentDate(lastAoPost, 20);
    });

   const visibleOtherMembers = state.sessionShowAllOthers
        ? otherMembers
        : otherMembers.slice(0, 10);
     
    selectedHeaderSlot.textContent = "";
    selectedHeaderSlot.appendChild(createSelectedSection(qMembers, selectedMembers));

        const recentSection = createMemberSection(`Recent at ${draftSession.aoName || "AO"}`, visibleRecentMembers, {
            emptyText: "No recent posters at this AO",
        })

        if (recentMembers.length > 12) {
            const toggleButton = document.createElement("button");
            toggleButton.textContent = state.sessionShowAllRecent ? "Show Less" : "Show More";

            toggleButton.addEventListener("click", () => {
                state.sessionShowAllRecent = !state.sessionShowAllRecent;
                renderMemberList();
            });


            recentSection.appendChild(toggleButton);
        }

        memberList.appendChild(recentSection);

        const othersSection = createMemberSection("More PAX", visibleOtherMembers, {
            emptyText: "No other active PAX",
        });

        if (otherMembers.length > 10) {
            const toggleButton = document.createElement("button");
            toggleButton.textContent = state.sessionShowAllOthers ? "Show Less" : "Show More";

            toggleButton.addEventListener("click", () => {
                state.sessionShowAllOthers = !state.sessionShowAllOthers;
                renderMemberList();
            });

            othersSection.appendChild(toggleButton);
        }

        memberList.appendChild(othersSection);

        console.timeEnd("renderMemberList");
}

renderMemberList();

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

    visitorRow.append(f3Name, homeRegion, realName, removeButton);
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

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
        fngRow.remove();
        updateFngButtonText();
    });

    fngRow.append(realName, paxName, invitedByField.wrapper, removeButton);
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

if (isEditing && sessionId && draftSession.visitors.length === 0) {
    loadSessionVisitors(sessionId)
        .then(visitors => {
            draftSession.visitors = visitors || [];
            visitorContainer.textContent = "";
            draftSession.visitors.forEach(visitor => addVisitorRow(visitor));
        })
        .catch(error => {
            console.error("Failed to load DR visitors:", error);
            showToast("Failed to load DR visitors.", "error");
        });
}

let isSavingSession = false;

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
        attendeeIds,
        qIds,
        fngs: session.fngs || [],
        visitors: session.visitors || [],
        notes: session.notes || "",
        startTime: session.startTime || ao?.time || null,
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
    const ao =
        state.aos.find(a => a.id === session.aoId)
        || state.aos.find(a => a.name === session.aoName);

    if (!ao?.id || !ao?.time || !session.date) {
        return session;
    }

    try {
        const targetDateTime = `${session.date}T${ao.time}:00`;
        const weather = await getAoWeather(ao.id, targetDateTime);

        if (!weather || weather.weatherUnavailable) {
            return session;
        }

        return {
            ...session,
            weatherSnapshot: {
                temp: weather.temp ?? null,
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

        if (!realName) return;

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
saveButton.addEventListener("click", async () => {
    draftSession.fngs = collectFngsFromUi();
    draftSession.visitors = collectVisitorsFromUi();
    draftSession.notes = notes.value.trim();

    draftSession = normalizeSessionForSave(draftSession);

    const validationMessage = validateSessionForSave(draftSession);
    if (validationMessage) {
        alert(validationMessage);
        return;
    }

    const duplicateSession = findPotentialDuplicateSession(draftSession);
    if (duplicateSession) {
        const shouldViewExisting = confirm(
            `A session already exists for ${draftSession.aoName} on ${formatDate(draftSession.date)}.\n\nView the existing session?`
        );

        if (shouldViewExisting) {
            state.selectedSessionId = duplicateSession.id;
            state.editingSessionId = null;
            state.draftSession = null;
            navigateTo("sessionDetail");
        }

        return;
    }

    if (isSavingSession) return;
    isSavingSession = true;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

try {
    let savedSession;
    const oldSession = isEditing
        ? state.sessions.find(session => session.id === sessionId) || null
        : null;

    if (isEditing) {
        const canSaveEdit =
            hasPermission(PERMISSIONS.MANAGE_SESSIONS) ||
            canEditAoSession(oldSession?.aoId) ||
            oldSession?.createdByUserId === state.currentUserId;
    
            if (!canSaveEdit) {
                throw new Error("Unauthorized session edit.");
            }
    }

    if (isEditing) {
        const sessionToUpdate = {
            ...draftSession,
            announcementText:
                originalSession?.announcementText ??
                draftSession.announcementText ??
                "",
            announcementSnapshot:
                originalSession?.announcementSnapshot ??
                draftSession.announcementSnapshot ??
                null,
        };
    
        await updateSession(sessionId, sessionToUpdate);
    
        savedSession = state.sessions.find(
            session => session.id === sessionId
        );
    } else {
        const sessionToCreate = {
            ...draftSession,
            createdByUserId: state.currentUserId,
        };
        savedSession = await addSession(sessionToCreate);
        }

        const affectedMemberIds = [
            ...new Set([
                ...getAffectedMemberIdsFromSession(oldSession),
                ...getAffectedMemberIdsFromSession(savedSession),
                ...(savedSession?.fngs || []).map(fng => fng.memberId).filter(Boolean),
            ]),
        ];
        
        invalidateMemberStatsCache(affectedMemberIds);
        invalidateRecentMemberActivityCache(affectedMemberIds);

    const flags = createDuplicateFngNameFlags(
        savedSession,
        state.members,
        state.currentUserId
    );

    if (flags.length > 0) {
        await addAdminFlags(flags);
        showToast("Session saved • Duplicate name flagged for admin review", "info");
    } else {
        showToast("Session saved", "success");
    }

    state.selectedSessionId = savedSession?.id || draftSession.id;
    state.editingSessionId = null;
    state.selectedPlannedWorkoutId = null;
    state.sessionSearchTerm = "";
    state.sessionShowAllOthers = false;
    state.sessionShowAllRecent = false;
    state.sessionSelectedExpanded = false;
    state.sessionQExpanded = false;
    state.draftSession = null;

    if (isEditing) {
        state.viewHistory = (state.viewHistory || []).filter(
            view => view !== "session"
        );
    
        state.currentView = "sessionDetail";
        renderApp();
    } else {
        const sessionForBackblast = savedSession || draftSession;

        const shouldPreserveBackblast =
            sessionForBackblast.backblastStatus === "shared" ||
            sessionForBackblast.backblastStatus === "posted" ||
            sessionForBackblast.backblastStatus === "posted_elsewhere";

        state.draftBackblastText = shouldPreserveBackblast
            ? sessionForBackblast.backblastText || ""
            : generateBackblast(sessionForBackblast, state.members);

        state.draftBackblastMediaFiles = [];
        state.hasAddedBackblastWeather = false;
        navigateTo("backblast");
    }
} catch (error) {
    console.error("Failed to save session:", error);
    showToast("Failed to save session.", "error");

    logSaveFailure("sessionView.saveSession", error, {
        editingSessionId: state.editingSessionId || null,
        selectedSessionId: state.selectedSessionId || null,
        draftSessionId: draftSession?.id || null,
        sessionDate: draftSession?.date || null,
        sessionAoName: draftSession?.aoName || null,
        attendeeCount: draftSession?.attendeeIds?.length || 0,
        qCount: draftSession?.qIds?.length || 0,
        fngCount: draftSession?.fngs?.length || 0,
        sourcePlannedWorkoutId: draftSession?.sourcePlannedWorkoutId || null,
    });
} finally {
    isSavingSession = false;
    saveButton.disabled = false;
    saveButton.textContent = "Save";
}
});

const notes = document.createElement("textarea");
notes.classList.add("notes");
notes.placeholder = "Notes...";
notes.value = draftSession.notes || "";

const actionBar = document.createElement("div");
actionBar.classList.add("sticky-action-bar");

actionBar.append(saveButton);

const dateInputWrap = document.createElement("label");
dateInputWrap.classList.add("fake-date-field");

const dateDisplay = document.createElement("div");
dateDisplay.classList.add("fake-date-display");
dateDisplay.textContent = formatDate(draftSession.date);

dateInputWrap.append(dateDisplay, dateInput);

const topSection = document.createElement("div");
topSection.classList.add("session-top-section");
topSection.append(dateLabel, dateInputWrap, ...(loadedWorkoutBanner ? [loadedWorkoutBanner] : []), sessionControls);



app.append(
    header,
    title, 
    topSection, 
    stickyHeader,
    memberList,
    visitorHeading,
    addVisitorButton,
    visitorContainer,
    fngHeading,
    addFngButton,
    fngContainer,
    notes, 
    actionBar,
);
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}