import { renderApp } from "../index.js";
import { createSession } from "../modules/sessions.js";
import { getTodayDate } from "../utils/date.js";
import { state } from "../modules/state.js";
import { saveState } from "../utils/storage.js";
import { generateBackblast } from "../modules/backblast.js";
import { renderBackblastView } from "./backblastView.js";

export function renderSession() { 
const app = document.getElementById("app");
app.textContent = "";

const isEditing = Boolean(state.editingSessionId);
let draftSession;

if (isEditing) {
    const existingSession = state.sessions.find(s => s.id === state.editingSessionId);
    draftSession = {...existingSession, attendeeIds: [...existingSession.attendeeIds], fngs: [...existingSession.fngs,]};
} else {
    draftSession = createSession(getTodayDate(), "");
}

const title = document.createElement("h1");
title.textContent = isEditing ? "Edit Session" : "Start Session";
const date = document.createElement("p");
date.textContent = draftSession.date;

const backButton = document.createElement("button");
if (isEditing) {
    backButton.textContent = "Back to Session Details";
   
    backButton.addEventListener("click", () => {
        state.currentView = "sessionDetail";
        state.sessionSearchTerm = "";
        state.sessionShowAllOthers = false;
        state.sessionShowAllRecent = false;
        renderApp();
    })
} else {
backButton.textContent = "Back to Dashboard";
backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    state.sessionSearchTerm = "";
    state.sessionShowAllOthers = false;
    state.sessionShowAllRecent = false;
    renderApp();
})};

const aoOptions = [...new Set([
    ...state.members.map(m => m.homeAo).filter(Boolean),
    ...state.sessions.map(s => s.aoName).filter(Boolean),
])].sort();

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

searchInput.addEventListener("input", (event) => {
    state.sessionSearchTerm = event.target.value;
    renderMemberList();
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
    name.textContent = member.paxName;
    const toggle = document.createElement("div");
    toggle.classList.add("attendance-toggle");
    toggle.textContent = "Out";
    if (draftSession.attendeeIds.includes(member.id)) {
        card.classList.add("selected");
        toggle.textContent = "Present";
    }

    const qButton = document.createElement("button");
    qButton.classList.add("q-button");
    qButton.textContent = "Q";
    if (draftSession.qId === member.id) {
        qButton.classList.add("q-selected");
    }
    qButton.addEventListener("click", (event) => {
        event.stopPropagation();

        draftSession.qId = member.id;

        if (!draftSession.attendeeIds.includes(member.id)) {
            draftSession.attendeeIds.push(member.id);
        }

        renderMemberList();
    });

card.append(name, toggle, qButton);
card.addEventListener("click", () => {
    const isPresent = draftSession.attendeeIds.includes(member.id);

    if (!isPresent) {
        draftSession.attendeeIds.push(member.id);
    } else {
        draftSession.attendeeIds = draftSession.attendeeIds.filter(id => id !== member.id);
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

function renderMemberList() {
    memberList.textContent = "";

    const activeMembers = state.members
    .filter(m => m.status === "active")
    .sort((a, b) => {
        const aLastAoPost = getLastPostAtAo(a.id, draftSession.aoName);
        const bLastAoPost = getLastPostAtAo(b.id, draftSession.aoName);

        if (aLastAoPost && !bLastAoPost) return -1;
        if (!aLastAoPost && bLastAoPost) return 1;

        if (aLastAoPost && bLastAoPost && aLastAoPost !== bLastAoPost) {
            return bLastAoPost.localeCompare(aLastAoPost);
        }

        return a.paxName.localeCompare(b.paxName);
    });

    const searchTerm = (state.sessionSearchTerm || "").trim().toLowerCase();

    const filteredMembers = activeMembers.filter(member => {
    const paxName = (member.paxName || "").toLowerCase();
    const realName = (member.realName || "").toLowerCase();

    return paxName.includes(searchTerm) || realName.includes(searchTerm);
    });

   const selectedMembers = filteredMembers.filter(member =>
    draftSession.attendeeIds.includes(member.id)
   );

   const recentMembers = filteredMembers.filter(member => {
    if (draftSession.attendeeIds.includes(member.id)) return false;
    const lastAoPost = getLastPostAtAo(member.id, draftSession.aoName);
    return isRecentDate(lastAoPost, 45);
   });

   const visibleRecentMembers = state.sessionShowAllRecent
        ? recentMembers
        : recentMembers.slice(0, 12);

   const otherMembers = filteredMembers.filter(member => {
    if (draftSession.attendeeIds.includes(member.id)) return false;
    
    const lastAoPost = getLastPostAtAo(member.id, draftSession.aoName);
    return !isRecentDate(lastAoPost, 45);
   });

   const visibleOtherMembers = state.sessionShowAllOthers
        ? otherMembers
        : otherMembers.slice(0, 10);
    
    memberList.appendChild(
        createMemberSection("Selected PAX", selectedMembers, {
            emptyText: "None selected yet",
        })
    );

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

    const invitedBy = document.createElement("select");
    invitedBy.classList.add("fng-invited-by-select");

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Invited by (optional)";
    invitedBy.appendChild(defaultOption);

    const activeMembers = state.members.filter(m => m.status === "active");

    activeMembers.forEach(member => {
        const option = document.createElement("option");
        option.value = member.id;
        option.textContent = member.paxName;
        invitedBy.appendChild(option);
    });

    invitedBy.value = fng?.invitedById || "";

    fngRow.append(realName, paxName, invitedBy);
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
saveButton.addEventListener("click", () => {
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

    if (isEditing) {
        const sessionIndex = state.sessions.findIndex(s => s.id === state.editingSessionId);
        state.sessions[sessionIndex] = draftSession;
        state.editingSessionId = null;
    } else {
    state.sessions.push(draftSession);
    }
    state.selectedSessionId = draftSession.id;
    state.sessionSearchTerm = "";
    state.sessionShowAllOthers = false;
    state.sessionShowAllRecent = false;
    saveState(state);


    if (isEditing) {
        state.currentView = "sessionDetail";
        renderApp();
    } else {
    const backblast = generateBackblast(draftSession, state.members);
    renderBackblastView(backblast);
    }
})

const notes = document.createElement("textarea");
notes.classList.add("notes");
notes.placeholder = "Notes...";
notes.value = draftSession.notes || "";

app.append(
    title, 
    date, 
    aoLabel,
    aoSelect,
    searchInput, 
    memberList, 
    fngHeading, 
    addFngButton, 
    fngContainer, 
    notes, 
    backButton, 
    saveButton
);

}