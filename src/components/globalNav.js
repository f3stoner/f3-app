import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import { closeMainMenu } from "./mainMenu.js";
import { canUseFloatingLogButton, canViewAnySessionAudit, shouldShowAuditLogFab } from "../utils/permissions.js";

const EDIT_ACTION_VIEWS = new Set([
    "workoutPlanner",
    "session",
]);

const HIDE_FLOATING_LOG_VIEWS = new Set([
    "campaigns",
    "campaignDetail",
    "campaignCreate",
]);

export function createGlobalNav () {
    if (EDIT_ACTION_VIEWS.has(state.currentView)) {
        return createEditActionBar();
    }

    const nav = document.createElement("div");
    nav.classList.add("global-nav");

    const items = [
        { label: "Home", view: "dashboard" },
        { label: "Planner", view: "myPlanner" },
        { label: "Pulse", view: "regionFeed" },
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

    if (
        canUseFloatingLogButton() &&
        !HIDE_FLOATING_LOG_VIEWS.has(state.currentView)
    ) {
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
    }

    if (shouldShowAuditLogFab()) {
        const auditFabButton = document.createElement("button");
        auditFabButton.classList.add("global-fab", "global-audit-fab");
        auditFabButton.textContent = "Audit";
    
        if (state.currentView === "sessionAudit") {
            auditFabButton.classList.add("active-fab");
        }
    
        auditFabButton.addEventListener("click", () => {
            closeMainMenu();
            navigateTo("sessionAudit");
        });
    
        nav.appendChild(auditFabButton);
    }
    
    return nav;
}

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
