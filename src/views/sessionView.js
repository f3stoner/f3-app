import { renderApp } from "../index.js";
import { createSession } from "../modules/sessions.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { state } from "../modules/state.js";
import { generateBackblast } from "../modules/backblast.js";
import { renderBackblastView } from "./backblastView.js";
import { createInvitedByField } from "../components/invitedByField.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";
import { addSession, updateSession } from "../services/appData.js";
import { REGION_AOS } from "../config.js";
import { goBack } from "../utils/navigation.js";

export function renderSession() { 
const app = document.getElementById("app");
app.textContent = "";

const sessionId = state.editingSessionId || state.selectedSessionId;
const isEditing = Boolean(state.editingSessionId);
let draftSession;

if (isEditing) {
    const existingSession = state.sessions.find(s => s.id === sessionId);

    if (!existingSession) {
        console.log("No existing session found for id:", sessionId);
        draftSession = createSession(getTodayDate(), "");
    } else {
        draftSession = {
            ...existingSession,
            attendeeIds: [...existingSession.attendeeIds],
            qIds: [...(existingSession.qIds || (existingSession.qId ? [existingSession.qId] : []))],
            fngs: [...existingSession.fngs]
        };
    }
    
    } else if (state.draftSession) {
        draftSession = {
            ...state.draftSession,
            attendeeIds: [...state.draftSession.attendeeIds],
            qIds: [...(state.draftSession.qIds || (state.draftSession.qId ? [state.draftSession.qId] : []))],
            fngs: [...state.draftSession.fngs]
        };
    } else {
    draftSession = createSession(getTodayDate(), "");
}

draftSession.qIds = [...(draftSession.qIds || (draftSession.qId ? [draftSession.qId] : []))];

draftSession.qIds.forEach(qId => {
    if (!draftSession.attendeeIds.includes(qId)) {
        draftSession.attendeeIds.push(qId);
    }
})

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

const backButton = document.createElement("button");
    backButton.textContent = "← Back";
    backButton.classList.add("secondary-button");

    backButton.addEventListener("click", () => {
        resetSessionUiState();
        
        if (!isEditing) {
            state.draftSession = null;
            goBack("dashboard");
            return;
        }

        goBack("sessionDetail");
    });

const configuredAoOptions = REGION_AOS[state.currentRegionId] || [];

const inferredAoOptions = [...new Set([
    ...state.members.map(m => m.homeAo).filter(Boolean),
    ...state.sessions.map(s => s.aoName).filter(Boolean),
])].sort();

const aoOptions = (configuredAoOptions.length > 0
    ? configuredAoOptions
    : inferredAoOptions
).filter(ao => ao && ao !== "DR");

const aoLabel = document.createElement("div");
aoLabel.textContent = "AO";
aoLabel.classList.add("detail-label");

const aoSelect = document.createElement("select");

aoOptions.forEach(ao => {
    const option = document.createElement("option");
    option.value = ao;
    option.textContent = ao;
    aoSelect.appendChild(option);
});

if (!draftSession.aoName && aoOptions.length > 0) {
    draftSession.aoName = aoOptions[0];
}

aoSelect.value = draftSession.aoName || "";

aoSelect.addEventListener("change", (event) => {
    draftSession.aoName = event.target.value;
    renderMemberList();
});

const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.placeholder = "Search PAX...";
searchInput.classList.add("session-search");
searchInput.value = state.sessionSearchTerm || "";

let searchTimeoutId = null;

searchInput.addEventListener("input", (event) => {
    const nextValue = event.target.value;

    clearTimeout(searchTimeoutId);
    searchTimeoutId = setTimeout(() => {
        state.sessionSearchTerm = nextValue;
        renderMemberList();
    }, 220);
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

function getLastPostAtAo(memberId, aoName) {
    const matchingSessions = state.sessions.filter(s => 
        s.aoName === aoName &&
        (
            s.attendeeIds.includes(memberId) ||
            s.fngs?.some(fng => fng.memberId === memberId)
        )
    );

    if (matchingSessions.length === 0) return null;

    const dates = matchingSessions.map(s => s.date).sort();
    return dates[dates.length - 1];
}

function createMemberCard(member) {
    const card = document.createElement("div");
    card.classList.add("member-card");
    card.dataset.memberId = member.id;
    const name = document.createElement("span");
    name.classList.add("member-name");
    name.textContent = getMemberDisplayName(member);
    const qButton = document.createElement("button");
    qButton.classList.add("q-button");
    qButton.textContent = "Q";
    if ((draftSession.qIds || []).includes(member.id)) {
        qButton.classList.add("q-selected");
    }
    qButton.addEventListener("click", (event) => {
        event.stopPropagation();

        const isSelectedQ = (draftSession.qIds || []).includes(member.id);
        if (isSelectedQ) {
            draftSession.qIds = (draftSession.qIds || []).filter(id => id !== member.id);
        } else {
            draftSession.qIds = [...(draftSession.qIds || []), member.id];
        }

        if (!draftSession.attendeeIds.includes(member.id)) {
            draftSession.attendeeIds.push(member.id);
        }

        renderMemberList();
    });

card.append(qButton, name);
card.addEventListener("click", () => {
    const isPresent = draftSession.attendeeIds.includes(member.id);

    if (!isPresent) {
        draftSession.attendeeIds.push(member.id);
    } else {
        draftSession.attendeeIds = draftSession.attendeeIds.filter(id => id !== member.id);
        draftSession.qIds = (draftSession.qIds || []).filter(id => id !== member.id);
    }
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

function createQSection(qMembers) {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = `Q (${qMembers.length})`;

    section.appendChild(heading);
    heading.style.cursor = "pointer"

    if (qMembers.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No Q selected";
        section.appendChild(empty);
        return section;
    }

    const summary = document.createElement("div");
    summary.classList.add("detail-value");

    const summaryNames = qMembers.map(member => member.paxName);
    summary.textContent = summaryNames.join(", ");

    section.appendChild(summary);

    heading.addEventListener("click", () => {
        state.sessionQExpanded = !state.sessionQExpanded;
        renderMemberList();
    });

    summary.addEventListener("click", () => {
        state.sessionQExpanded = !state.sessionQExpanded;
        renderMemberList();
    });

    if (!state.sessionQExpanded) {
        return section;
    }

    qMembers.forEach(member => {
        const row = document.createElement("div");
        row.classList.add("selected-summary-row");

        const name = document.createElement("span");
        name.textContent = member.paxName;

        const clearButton = document.createElement("button");
        clearButton.textContent = "Clear";
        clearButton.addEventListener("click", () => {
            draftSession.qIds = (draftSession.qIds || []).filter(id => id !== member.id);
            renderMemberList();
        });

        row.append(name, clearButton);
        section.appendChild(row);
    });

    return section;
}

function createSelectedSection(selectedMembers) {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = `Selected PAX (${selectedMembers.length})`;
    heading.style.cursor = "pointer";

    section.appendChild(heading);

    if (selectedMembers.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "None selected yet";
        section.appendChild(empty);
        return section;
    }

    const summary = document.createElement("div");
    summary.classList.add("detail-value");

    const summaryNames = selectedMembers.map(member => member.paxName);
    if (summaryNames.length <= 3) {
        summary.textContent = summaryNames.join(", ");
    } else {
        summary.textContent = `${summaryNames.slice(0, 3).join(", ")} +${summaryNames.length - 3}`;
    }

    section.appendChild(summary);

    heading.addEventListener("click", () => {
        state.sessionSelectedExpanded = !state.sessionSelectedExpanded;
        renderMemberList();
    });

    summary.addEventListener("click", () => {
        state.sessionSelectedExpanded = !state.sessionSelectedExpanded;
        renderMemberList();
    });

    if (!state.sessionSelectedExpanded) {
        return section;
    }

    const selectedList = document.createElement("div");
    selectedList.classList.add("selected-summary-list");

    selectedMembers.forEach(member => {
        const row = document.createElement("div");
        row.classList.add("selected-summary-row");

        const name = document.createElement("span");
        name.textContent = member.paxName;

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
            draftSession.attendeeIds = draftSession.attendeeIds.filter(id => id !== member.id);
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
helperLineOne.textContent = "Tap name → attendance";

const helperLineTwo = document.createElement("div");
helperLineTwo.textContent = "Tap Q → assign Q";

sessionHelperText.append(helperLineOne, helperLineTwo);

const selectedHeaderSlot = document.createElement("div");
stickyHeader.append(searchInput, sessionHelperText, selectedHeaderSlot)
selectedHeaderSlot.classList.add("session-summary-strip");

const sessionControls = document.createElement("div");
sessionControls.classList.add("section");
sessionControls.append(aoLabel, aoSelect);

function getSortedActiveMembers(lastPostMap) {
    return state.members
        .filter(m => m.status === "active")
        .sort((a, b) => a.paxName.localeCompare(b.paxName));
}

function buildLastPostMapForAo(aoName) {
    const lastPostMap = new Map();

    state.sessions.forEach(session => {
        if (session.aoName !== aoName) return;

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
    memberList.textContent = "";

    const lastPostMap = buildLastPostMapForAo(draftSession.aoName);
    const activeMembers = getSortedActiveMembers(lastPostMap);

    const searchTerm = (state.sessionSearchTerm || "").trim().toLowerCase();

    const filteredMembers = activeMembers.filter(member => {
    const paxName = (member.paxName || "").toLowerCase();
    const realName = (member.realName || "").toLowerCase();

    return paxName.includes(searchTerm) || realName.includes(searchTerm);
    });
    const qMembers = activeMembers.filter(member => 
        (draftSession.qIds || []).includes(member.id)
    );

    const selectedMembers = filteredMembers.filter(member =>
    draftSession.attendeeIds.includes(member.id) &&
    !(draftSession.qIds || []).includes(member.id)
   );

   const recentMembers = filteredMembers.filter(member => {
    if (draftSession.attendeeIds.includes(member.id)) return false;
    const lastAoPost = lastPostMap.get(member.id) || null;
    return isRecentDate(lastAoPost, 20);
   });

   const visibleRecentMembers = state.sessionShowAllRecent
        ? recentMembers
        : recentMembers.slice(0, 12);

   const otherMembers = filteredMembers.filter(member => {
    if (draftSession.attendeeIds.includes(member.id)) return false;
    
    const lastAoPost = lastPostMap.get(member.id) || null;
    return !isRecentDate(lastAoPost, 20);
   });

   const visibleOtherMembers = state.sessionShowAllOthers
        ? otherMembers
        : otherMembers.slice(0, 10);
    
    selectedHeaderSlot.textContent = "";
    selectedHeaderSlot.appendChild(createQSection(qMembers));
    selectedHeaderSlot.appendChild(createSelectedSection(selectedMembers));

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
}

renderMemberList();

const fngHeading = document.createElement("div");
fngHeading.classList.add("fng-heading");
fngHeading.textContent = "FNGs";
const addFngButton = document.createElement("button");
addFngButton.textContent = "Add FNG";
const fngContainer = document.createElement("div");

function addFngRow(fng = null) {
    const fngRow = document.createElement("div");
    fngRow.classList.add("fng-row");
    fngRow.dataset.memberId = fng?.memberId ||"";

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

    const invitedByField = createInvitedByField(fng?.invitedById || "");

    fngRow.append(realName, paxName, invitedByField.wrapper);
    fngContainer.appendChild(fngRow);
}

addFngButton.addEventListener("click", () => {
    addFngRow();  
});

if (isEditing && draftSession.fngs.length > 0) {
    draftSession.fngs.forEach(fng => addFngRow(fng));
}

const saveButton = document.createElement("button");
saveButton.textContent = "Save";
saveButton.addEventListener("click", async () => {
    const allFngRows = document.querySelectorAll(".fng-row");
    const fngs = [];
    allFngRows.forEach(row => {
        const realNameInput = row.querySelector(".fng-realname-input");
        const paxNameInput = row.querySelector(".fng-paxname-input");
        const invitedBySelect = row.querySelector(".fng-invited-by-select");
        const realName = realNameInput.value.trim();
        const paxName = paxNameInput.value.trim() || null;
        const invitedById = invitedBySelect.value || null;
        const memberId = row.dataset.memberId || null;

        if (!realName) return;

        fngs.push({
            realName,
            paxName,
            invitedById,
            memberId,
        });
    });

    draftSession.fngs = fngs;
    draftSession.notes = notes.value.trim();
    draftSession.qIds = [...(draftSession.qIds || [])];
    if (!draftSession.date) {
        alert("Please select a date.");
        return;
    }
try {

    let savedSession;

    if (isEditing) {
        await updateSession(sessionId, draftSession);
        savedSession = state.sessions.find(session => session.id === sessionId);
    } else {
        const sessionToCreate = {
            ...draftSession,
            createdByUserId: state.currentUserId,
        };
        savedSession = await addSession(sessionToCreate);
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
        state.currentView = "sessionDetail";
        renderApp();
    } else {
        const sessionForBackblast = savedSession || draftSession;

        state.draftBackblastText = 
            sessionForBackblast.backblastText ||
            generateBackblast(sessionForBackblast, state.members);

        state.draftBackblastMediaFiles = [];
        state.currentView = "backblast";
        renderApp();
    }
} catch (error) {
    console.error("Failed to save session:", error);
    alert("Failed to save session.");
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
    backButton,
    title, 
    topSection, 
    stickyHeader,
    memberList, 
    fngHeading, 
    addFngButton, 
    fngContainer, 
    notes, 
    actionBar,
);

}