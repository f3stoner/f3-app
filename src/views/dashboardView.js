import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

export function renderDashboard() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = state.groupName || "F3 App";

    const subtitle = document.createElement("p");
    subtitle.textContent = "Dashboard";

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

    app.append(title, subtitle, rosterButton, sessionButton);
}