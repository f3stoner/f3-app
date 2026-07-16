import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import { PERMISSIONS, hasPermission, canViewAnyAoInsights, canViewAnyQReadiness, canViewAoInsights, canViewAnySessionAudit } from "../utils/permissions.js";
import { bootApp, renderApp } from "../index.js";
import { signOut } from "../services/auth.js";
import { unsubscribeAllManagedChannels } from "../services/realtime.js";
import { showToast } from "../utils/toast.js";
import { logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";

const AGGIELAND_REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";

const EMERGENCY_CONTACT_LOOKUP_URL =
    "https://script.google.com/macros/s/AKfycbw9jaovBZnmQoNTlhrhTwKsk0QBIOxBqvk8ju9hGKimbZlj9Kt0esfnWeAbqZwUjFI/exec";

const EMERGENCY_CONTACT_FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSciSk7z6sreim6Qw7fpDfFrSaEeVTsRjG5H3H9VKFK19bINbA/viewform";

function confirmEmergencyContactLookup() {
    return window.confirm(
        [
            "Emergency Contact Lookup",
            "",
            "You are opening Aggieland's Emergency Contact system.",
            "",
            "Use this information only for legitimate emergency or safety-related situations.",
            "",
            "Every lookup is logged and may be reviewed.",
            "",
            "Continue?",
        ].join("\n")
    );
}

function isAggielandRegion() {
    return state.currentRegionId === AGGIELAND_REGION_ID;
}

function canOpenAggielandEmergencyLookup() {
    return isAggielandRegion()
        && Boolean(state.currentUserDisplayName)
        && Boolean(state.currentUserMemberId);
}

function getEmergencyContactLookupUrl() {
    const url = new URL(EMERGENCY_CONTACT_LOOKUP_URL);

    url.searchParams.set("appUser", state.currentUserDisplayName);
    url.searchParams.set("appUserId", state.currentUserMemberId);

    return url.toString();
}

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

    const favoriteAoRecord = state.aos.find(ao => ao.name === favoriteAo);

    const safeFavoriteAoRecord =
        favoriteAoRecord && canViewAoInsights(favoriteAoRecord.id)
            ? favoriteAoRecord
            : null;

    const fallbackAoRecord = state.aos
        .filter(ao => ao.isActive !== false)
        .filter(ao => canViewAoInsights(ao.id))
        .filter(ao => ao.id && ao.name)
        .sort((a, b) => a.name.localeCompare(b.name))[0];

    const selectedAo = safeFavoriteAoRecord || fallbackAoRecord;

    return {
        aoId: selectedAo?.id || null,
        aoName: selectedAo?.name || "",
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
                {
                    label: "Add / Update Emergency Contact",
                    externalUrl: EMERGENCY_CONTACT_FORM_URL,
                    isVisible: isAggielandRegion,
                },
                {
                    label: "Emergency Contact Lookup",
                    getExternalUrl: getEmergencyContactLookupUrl,
                    isVisible: canOpenAggielandEmergencyLookup,
                },
                { label: "Roster", view: "roster" },
            ],
        },
        {
            label: "Leadership",
            items: [
                { label: "Announcements", view: "announcementManagement", permission: PERMISSIONS.MANAGE_ANNOUNCEMENTS },
                { label: "AO Insights", view: "aoInsights", isVisible: canViewAnyAoInsights },
                { label: "Q Readiness", view: "qReadiness", isVisible: canViewAnyQReadiness },
                { label: "Session Audit", view: "sessionAudit", isVisible: canViewAnySessionAudit },
                { label: "Backblast Review", view: "backblastReview", permission: PERMISSIONS.VIEW_REGION_INSIGHTS },
                { label: "Manage Third F", view: "thirdFManagement", permission: PERMISSIONS.MANAGE_Q_SOURCE },
                { label: "Region Insights", view: "regionInsights", permission: PERMISSIONS.VIEW_REGION_INSIGHTS },
                { label: "Thang Review", view: "thangReview", permission: PERMISSIONS.MANAGE_LIBRARY_WORKBENCH },
                { label: "Third F", view: "thirdF" },
            ],
        },
        {
            label: "Admin",
            items: [
                { label: "Admin Management", view: "adminManagement", permission: PERMISSIONS.MANAGE_ROLES },
                { label: "Admin Settings", view: "adminSettings", permission: PERMISSIONS.ACCESS_ADMIN_SETTINGS },
                { label: "Library Workbench", view: "libraryWorkbench", permission: PERMISSIONS.MANAGE_LIBRARY_WORKBENCH },
                { label: "AO Management", view: "aoManagement", permission: PERMISSIONS.MANAGE_AOS },
                { label: "Import Runs", view: "importRuns", permission: PERMISSIONS.VIEW_IMPORTS },
                { label: "Operations Center", view: "operationsCenter", permission: PERMISSIONS.ACCESS_OPERATIONS_CENTER},
            ],
        },
        {
            label: "Account",
            items: [
                { label: "Settings", view: "settings" },
            ],
        },
    ];

    async function handleSignOut() {
        closeMainMenu();
        renderApp();

        try {
            unsubscribeAllManagedChannels();
    
            await signOut();
    
            localStorage.removeItem("f3AppState");
            localStorage.removeItem("theQNavState");
    
            state.regionName = "";
            state.members = [];
            state.sessions = [];
            state.plannedWorkouts = [];
    
            state.currentUserId = null;
            state.currentUserRole = null;
            state.currentUserDisplayName = null;
            state.currentUserMemberId = null;
    
            state.selectedMemberId = null;
            state.selectedSessionId = null;
            state.selectedPlannedWorkoutId = null;
    
            state.editingMemberId = null;
            state.editingSessionId = null;
            state.editingPlannedWorkoutId = null;
    
            state.draftSession = null;
    
            state.currentView = "dashboard";
            state.currentRegionId = null;
            state.profileRegionId = null;
            state.regionOverrideId = null;
            state.availableRegions = [];
    
            state.qSignupAoFilter = "all";
            state.qSignupOpenOnly = false;
            state.claimingMemberId = null;
            state.notificationSettings = null;
    
            await bootApp();
        } catch (error) {
            console.error("Failed to sign out:", error);
            showToast("Failed to sign out.", "error");
        }
    }

    function createMenuButton(item) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("main-menu-item");
        button.textContent = item.label;
    
        const isExternal =
            Boolean(item.externalUrl) ||
            typeof item.getExternalUrl === "function";
    
        const isActive =
            !isExternal &&
            state.currentView === item.view;
    
        if (isActive) {
            button.classList.add("active");
            button.disabled = true;
            return button;
        }
    
        button.addEventListener("click", () => {
            closeMainMenu();
    
            if (isExternal) {
                if (
                    item.label === "Emergency Contact Lookup"
                    && !confirmEmergencyContactLookup()
                ) {
                    renderApp();
                    return;
                }
            
                const url =
                    typeof item.getExternalUrl === "function"
                        ? item.getExternalUrl()
                        : item.externalUrl;
            
                if (!url) {
                    showToast("This external tool is unavailable.", "error");
                    renderApp();
                    return;
                }
            
                if (item.label === "Emergency Contact Lookup") {
                    void logAppEvent({
                        type: APP_EVENTS.EMERGENCY_CONTACT_LOOKUP_OPENED,
                        message: "Emergency contact lookup opened",
                        metadata: {
                            source: "main_menu",
                        },
                    });
                }
            
                window.open(url, "_blank", "noopener,noreferrer");
            
                renderApp();
                return;
            }
    
            if (item.view === "aoInsights" && !state.selectedAoInsights) {
                state.selectedAoInsights = getDefaultAoInsightsSelection();
            }
    
            navigateTo(item.view);
        });
    
        return button;
    }

    const list = document.createElement("div");
    list.classList.add("main-menu-list");

    menuGroups.forEach(group => {
        const visibleItems = group.items
            .filter(item => {
                if (item.isVisible) return item.isVisible();
                if (item.permission) return hasPermission(item.permission);
                return true;
            })
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

    const accountSection = document.createElement("div");
    accountSection.classList.add("main-menu-account");

    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.classList.add("main-menu-item", "main-menu-sign-out");
    signOutButton.textContent = "Sign Out";

    signOutButton.addEventListener("click", async () => {
        signOutButton.disabled = true;
        signOutButton.textContent = "Signing Out…";
    
        await handleSignOut();
    });

    accountSection.appendChild(signOutButton);

    drawer.append(header, list, accountSection);
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
