import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";

export function renderSessionHistory() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Session History";
    const sessionList = document.createElement("div");
    const sortedSessions = [...state.sessions].sort((a,b) => new Date(b.date) - new Date(a.date));
    if (state.sessions.length === 0) {
        sessionList.textContent = "No sessions saved yet";
    } else {
        sortedSessions.forEach((session) => {
            const sessionDetail = document.createElement("div");
            const qMember = state.members.find(m => m.id === session.qId);
            const qName = qMember ? qMember.paxName : "-";
            sessionDetail.textContent = `${formatDate(session.date)} - ${session.aoName} | Q: ${qName} | ${session.attendeeIds.length} PAX | ${session.fngs.length} FNGs`;
            sessionDetail.classList.add("section");
            sessionDetail.classList.add("member-card");
            sessionDetail.addEventListener("click", () => {
                state.selectedSessionId = session.id;
                state.currentView = "sessionDetail";
                renderApp();
            })
            sessionList.appendChild(sessionDetail);
        })
    const backButton = document.createElement("button");
    backButton.textContent = "Back to Dashboard";
    backButton.addEventListener("click", () => {
        state.currentView = "dashboard";
        renderApp();
    })

    const nav = createGlobalNav();

    app.append(title, sessionList, backButton, nav);
}}