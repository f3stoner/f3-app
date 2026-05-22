import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import { closeMainMenu } from "./mainMenu.js";

const EDIT_ACTION_VIEWS = new Set([
    "workoutPlanner",
    "session",
    "memberEdit",
    "aoEdit",
]);

export function createGlobalNav () {
    if (EDIT_ACTION_VIEWS.has(state.currentView)) {
        return createEditActionBar();
    }

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

   /* const fabButton = document.createElement("button");
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

    nav.appendChild(fabButton);*/

    function createEditActionBar() {
        const nav = document.createElement("nav");
        nav.classList.add("global-nav", "edit-action-bar");

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.classList.add("primary-button");
        saveButton.textContent = "Save";

        saveButton.addEventListener("click", () => {
            window.dispatchEvent(new CustomEvent("theq:save-current-edit"));
        });

        nav.append(saveButton);

        return nav;
    }

    return nav;
}