import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { navigateTo } from "../utils/navigation.js";

export function openMainMenu() {
    state.isMainMenuOpen = true;
    document.body.classList.add("menu-open");
    renderApp();
}

export function closeMainMenu() {
    state.isMainMenuOpen = false;
    document.body.classList.remove("menu-open");

    document.querySelectorAll(".main-menu-overlay").forEach(menu => menu.remove());
}

export function cleanupMainMenu() {
    if (!state.isMainMenuOpen) {
        document.body.classList.remove("menu-open");
    }

    document.querySelectorAll(".main-menu-overlay").forEach(menu => menu.remove());
}

export function createMainMenu() {
    const isAdmin = state.currentUserRole === "admin";

    const overlay = document.createElement("div");
    overlay.classList.add("main-menu-overlay");

    const drawer = document.createElement("div");
    drawer.classList.add("main-menu-drawer");

    const header = document.createElement("div");
    header.classList.add("main-menu-header");

    const heading = document.createElement("h2");
    heading.textContent = "Menu";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.classList.add("secondary-button");
    closeButton.textContent = "Close";

    closeButton.addEventListener("click", () => {
        closeMainMenu();
        renderApp();
    });

    header.append(heading, closeButton);

    const menuItems = [
        { label: "Dashboard", view: "dashboard" },
        { label: "Workout Library", view: "plannedWorkoutList" },
        { label: "My Templates", view: "templateHub" },
        { label: "Session History", view: "sessionHistory" },
        { label: "Roster", view: "roster" },
        ...(isAdmin
            ? [
                { label: "Region Insights", view: "regionInsights" },
                { label: "Admin Settings", view: "adminSettings" },
            ]
            : []),
    ];

    const list = document.createElement("div");
    list.classList.add("main-menu-list");

    menuItems.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("main-menu-item");
        button.textContent = item.label;

        const isActive = state.currentView === item.view;

        if (isActive) {
            button.classList.add("active");
            button.disabled = true;
        } else {
            button.addEventListener("click", () => {
                closeMainMenu();
                navigateTo(item.view);
            });
        }

        list.appendChild(button);
    });

    drawer.append(header, list);
    overlay.append(drawer);

    overlay.addEventListener("click", () => {
        closeMainMenu();
        renderApp();
    });

    drawer.addEventListener("click", event => {
        event.stopPropagation();
    });

    return overlay;
}