import { renderApp } from "../index.js";
import { state } from "../modules/state.js";

export function createGlobalNav () {
    const nav = document.createElement("div");
    nav.classList.add("global-nav");

    const items = [
        { label: "Home", view: "dashboard" },
        { label: "Plan", view: "plannedWorkoutList"},
        { label: "Log Session", view: "session" },
        { label: "Roster", view: "roster" },
        { label: "History", view: "sessionHistory" },
    ];

    items.forEach(item => {
        const button = document.createElement("button");
        button.textContent = item.label;

        if (state.currentView === item.view) {
            button.classList.add("active-nav");
        }

        button.addEventListener("click", () => {
            state.currentView = item.view;
            renderApp();
        });

        nav.appendChild(button);
    });
    return nav;
}