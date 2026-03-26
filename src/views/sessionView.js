import { renderApp } from "../index.js";
import { createSession } from "../modules/sessions.js";
import { getTodayDate } from "../utils/date.js";
import { state } from "../modules/state.js";

export function renderSession() { 
const app = document.getElementById("app");
app.textContent = "";

const draftSession = createSession(getTodayDate(), state.groupName);

const title = document.createElement("h1");
title.textContent = "The Hub";
const date = document.createElement("p");
date.textContent = draftSession.date;

const backButton = document.createElement("button");
backButton.textContent = "Back to Dashboard";
backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    renderApp();
});

const memberList = document.createElement("ul");
const activeMembers = state.members.filter(m => m.status === "active");

activeMembers.forEach(member => {
    const li = document.createElement("li");
    li.textContent = member.paxName;
    memberList.appendChild(li);
});

app.append(title, date, memberList, backButton);

}