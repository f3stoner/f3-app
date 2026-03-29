import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";

export function renderDashboard() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = state.groupName || "F3 App";

    const subtitle = document.createElement("p");
    subtitle.textContent = "Dashboard";

    const recentSessionsSection = document.createElement("div");
    const recentHeading = document.createElement("div");
    const recentSessionList = document.createElement("div");
    recentHeading.textContent = "Recent Sessions";
    recentSessionsSection.append(recentHeading);
    const sortedSessions = [...state.sessions].sort((a,b) => new Date(b.date) - new Date(a.date));
    if (state.sessions.length === 0) {
        recentSessionList.textContent = "No sessions saved yet";
    } else {
        sortedSessions.forEach((session) => {
            const sessionDetail = document.createElement("div");
            sessionDetail.textContent = `${formatDate(session.date)} - ${session.aoName} - ${session.attendeeIds.length} PAX`;
            sessionDetail.classList.add("section");
            sessionDetail.classList.add("member-card");
            recentSessionList.appendChild(sessionDetail);
        })
    }
    recentSessionsSection.append(recentSessionList);

    const rosterButton = document.createElement("button");
    rosterButton.textContent = "View Roster";
    rosterButton.addEventListener("click", () => {
        state.currentView = "roster";
        renderApp();
    });

    const sessionButton = document.createElement("button");
    sessionButton.textContent = "Start Session";
    sessionButton.addEventListener("click", () => {
        state.currentView = "session";
        renderApp();
    });

    app.append(title, subtitle, rosterButton, sessionButton, recentSessionsSection);
}