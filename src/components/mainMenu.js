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
    const canViewRegionInsights = hasPermission(PERMISSIONS.VIEW_REGION_INSIGHTS);
    const canAccessAdminSettings = hasPermission(PERMISSIONS.ACCESS_ADMIN_SETTINGS);
    const canManageAnnouncements = hasPermission(PERMISSIONS.MANAGE_ANNOUNCEMENTS);
    const canManageQSource = hasPermission(PERMISSIONS.MANAGE_Q_SOURCE);

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
        ...(canViewRegionInsights
            ? [
                { label: "Region Insights", view: "regionInsights" },
                { label: "AO Insights", view: "aoInsights" },
                { label: "Backblast Review", view: "backblastReview"},
                { label: "Thang Review", view: "thangReview" },
            ]
            : []),

        ...(canManageAnnouncements
            ? [
                { label: "Announcements", view: "announcementManagement" },
                { label: "Q Readiness", view: "qReadiness"},
            ]
            : []),
            
        ...(canManageQSource
            ?[
                {label: "Q Source", view: "qSourceManagement"},
            ]
            : []),
        
        ...(canAccessAdminSettings
            ? [
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

                if (item.view === "aoInsights" && !state.selectedAoInsights) {
                    state.selectedAoInsights = getDefaultAoInsightsSelection();
                }

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

