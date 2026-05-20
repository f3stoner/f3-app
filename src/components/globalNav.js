import { renderApp } from "../index.js";
import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import { closeMainMenu } from "./mainMenu.js";

export function createGlobalNav () {
    const nav = document.createElement("div");
    nav.classList.add("global-nav");

    const items = [
        { label: "Home", view: "dashboard" },
        { label: "Planner", view: "myPlanner"},
        { label: "History", view: "sessionHistory" },
    ];

    items.forEach(item => {
        const button = document.createElement("button");
        button.textContent = item.label;

        if (state.currentView === item.view) {
            button.classList.add("active-nav");
        }

        button.addEventListener("click", () => {
            closeMainMenu();

            if (item.view === "session") {
                state.editingSessionId = null;
                state.selectedSessionId = null;
            }

            navigateTo(item.view);
        });

        nav.appendChild(button);
    });

    const fabButton = document.createElement("button");
    fabButton.classList.add("global-fab");
    fabButton.textContent = "+ Log";

    if (state.currentView === "session") {
        fabButton.classList.add("active-fab");
    }

    fabButton.addEventListener("click", () => {
        closeMainMenu();
        
        state.editingSessionId = null;
        state.selectedSessionId = null;
        navigateTo("session");
    });

    nav.appendChild(fabButton);

    return nav;
}