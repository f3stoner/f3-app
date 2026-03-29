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
    draftSession = createSession(getTodayDate(), state.groupName);
}

const title = document.createElement("h1");
title.textContent = state.groupName;
const date = document.createElement("p");
date.textContent = draftSession.date;

const backButton = document.createElement("button");
if (isEditing) {
    backButton.textContent = "Back to Session Details";
    backButton.addEventListener("click", () => {
        state.currentView = "sessionDetail";
        renderApp();
    })
} else {
backButton.textContent = "Back to Dashboard";
backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    renderApp();
})};

const memberList = document.createElement("div");
const activeMembers = state.members.filter(m => m.status === "active");

activeMembers.forEach(member => {
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

        if (!draftSession.attendeeIds.includes(member.id)){
            draftSession.attendeeIds.push(member.id);
            card.classList.add("selected");
            toggle.textContent = "Present";
        }

        const allQButtons = document.querySelectorAll(".q-button");
        allQButtons.forEach(button => button.classList.remove("q-selected"));
        qButton.classList.add("q-selected");
        console.log("Q selected:", member.paxName, member.id);
        console.log("draftSession.qId:", draftSession.qId);
    })
    card.append(name, toggle, qButton);
    card.addEventListener("click", () => {
        console.log("clicked", member.paxName);
        console.log(draftSession.attendeeIds);
        const isPresent = draftSession.attendeeIds.includes(member.id);
        if (!isPresent) {
            draftSession.attendeeIds.push(member.id);
            card.classList.add("selected");
            toggle.textContent = "Present";
        } else {
            draftSession.attendeeIds = draftSession.attendeeIds.filter(id => id !== member.id);
            card.classList.remove("selected");
            toggle.textContent = "Out";
        }
        })
    memberList.appendChild(card);
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

        if (!realName) return;

        fngs.push({
            realName,
            paxName,
            invitedById,
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

app.append(title, date, memberList, fngHeading, addFngButton, fngContainer, notes, backButton, saveButton);

}