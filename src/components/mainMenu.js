import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { navigateTo } from "../utils/navigation.js";
import { PERMISSIONS, hasPermission } from "../utils/permissions.js";

function getMonthStart(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthEnd(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
}

function getDefaultAoInsightsSelection() {
    const today = new Date().toISOString().slice(0, 10);

    const memberStats =
        state.memberStatsByMemberId?.[state.currentMemberId];

    const favoriteAo = memberStats?.favoriteAo;

    const fallbackAo = state.aos
        .filter(ao => ao.isActive !== false)
        .map(ao => ao.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))[0];

    return {
        aoName: favoriteAo || fallbackAo,
        startDate: getMonthStart(today),
        endDate: getMonthEnd(today),
    };
}

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

    const menuGroups = [
        {
            label: "Plan",
            items: [
                { label: "Dashboard", view: "dashboard" },
                { label: "My Templates", view: "templateHub" },
                { label: "Session History", view: "sessionHistory" },
                { label: "Workout Library", view: "plannedWorkoutList" },
            ],
        },
        {
            label: "People",
            items: [
                { label: "Roster", view: "roster" },
            ],
        },
        {
            label: "Leadership",
            items: [
                { label: "Announcements", view: "announcementManagement", permission: PERMISSIONS.MANAGE_ANNOUNCEMENTS },
                { label: "AO Insights", view: "aoInsights", permission: PERMISSIONS.VIEW_REGION_INSIGHTS },
                { label: "Backblast Review", view: "backblastReview", permission: PERMISSIONS.VIEW_REGION_INSIGHTS },
                { label: "Q Readiness", view: "qReadiness", permission: PERMISSIONS.MANAGE_ANNOUNCEMENTS },
                { label: "Manage Third F", view: "thirdFManagement", permission: PERMISSIONS.MANAGE_Q_SOURCE },
                { label: "Region Insights", view: "regionInsights", permission: PERMISSIONS.VIEW_REGION_INSIGHTS },
                { label: "Thang Review", view: "thangReview", permission: PERMISSIONS.VIEW_REGION_INSIGHTS },
                { label: "Third F", view: "thirdF" },
            ],
        },
        {
            label: "Admin",
            items: [
                { label: "Admin Management", view: "adminManagement", permission: PERMISSIONS.MANAGE_ROLES },
                { label: "Admin Settings", view: "adminSettings", permission: PERMISSIONS.ACCESS_ADMIN_SETTINGS },
                { label: "Library Workbench", view: "libraryWorkbench", permission: PERMISSIONS.MANAGE_LIBRARY_WORKBENCH },
            ],
        },
    ];

    function createMenuButton(item) {
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

                if (item.view === "aoInsights" && !state.selectedAoInsights) {
                    state.selectedAoInsights = getDefaultAoInsightsSelection();
                }

                navigateTo(item.view);
            });
        }

        return button;
    }

    const list = document.createElement("div");
    list.classList.add("main-menu-list");

    menuGroups.forEach(group => {
        const visibleItems = group.items
            .filter(item => !item.permission || hasPermission(item.permission))
            .sort((a, b) => a.label.localeCompare(b.label));

        if (visibleItems.length === 0) return;

        const details = document.createElement("details");
        details.classList.add("main-menu-group");

        const isActiveGroup = visibleItems.some(item => item.view === state.currentView);
        details.open = isActiveGroup;

        const summary = document.createElement("summary");
        summary.classList.add("main-menu-group-heading");
        summary.textContent = group.label;

        details.appendChild(summary);

        visibleItems.forEach(item => {
            details.appendChild(createMenuButton(item));
        });

        list.appendChild(details);
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
