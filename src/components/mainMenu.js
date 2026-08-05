import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import {
    PERMISSIONS,
    hasPermission,
    canViewAnyAoInsights,
    canViewAnyQReadiness,
    canViewAoInsights,
    canViewAnySessionAudit,
    canManageCurrentRoster,
} from "../utils/permissions.js";
import { bootApp, renderApp } from "../index.js";
import { signOut } from "../services/auth.js";
import { unsubscribeAllManagedChannels } from "../services/realtime.js";
import { showToast } from "../utils/toast.js";
import { logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { createIcon } from "../utils/icons.js";

const AGGIELAND_REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";

const EMERGENCY_CONTACT_LOOKUP_URL =
    "https://script.google.com/macros/s/AKfycbw9jaovBZnmQoNTlhrhTwKsk0QBIOxBqvk8ju9hGKimbZlj9Kt0esfnWeAbqZwUjFI/exec";

const EMERGENCY_CONTACT_FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSciSk7z6sreim6Qw7fpDfFrSaEeVTsRjG5H3H9VKFK19bINbA/viewform";

const DOUBLE_DOWN_TRACKER_URL =
    "https://f3aggieland.com/dd/";

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
        state.memberStatsByMemberId?.[
            state.currentUserMemberId
        ];

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

    document.body.appendChild(createMainMenu());
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
    });

    header.append(heading, closeButton);

    const menuGroups = [
        {
            label: "First F",
            icon: "firstF",
            items: [
                { label: "Dashboard", view: "dashboard" },
                {
                    label: "Activity",
                    view: "regionFeed",
                    isVisible: () =>
                        state.currentUserRole === "superadmin",
                },
                {
                    label: "Double Down Tracker",
                    externalUrl: DOUBLE_DOWN_TRACKER_URL,
                    isVisible: isAggielandRegion,
                },
                { label: "My Templates", view: "templateHub" },
                { label: "Session History", view: "sessionHistory" },
                { label: "Workout Library", view: "plannedWorkoutList" },
            ],
        },
        {
            label: "Second F",
            icon: "secondF",
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
            label: "Third F",
            icon: "thirdF",
            items: [
                { label: "Third F", view: "thirdF" },
                {
                    label: "Manage Third F",
                    view: "thirdFManagement",
                    permission: PERMISSIONS.MANAGE_Q_SOURCE,
                },
            ],
        },
        {
            label: "Leadership",
            icon: "leadership",
            items: [
                {
                    label: "Leadership Directory",
                    view: "leadership",
                },
                {
                    label: "Announcements",
                    view: "announcementManagement",
                    permission: PERMISSIONS.MANAGE_ANNOUNCEMENTS,
                },
                {
                    label: "AO Insights",
                    view: "aoInsights",
                    isVisible: canViewAnyAoInsights,
                },
                {
                    label: "Q Readiness",
                    view: "qReadiness",
                    isVisible: canViewAnyQReadiness,
                },
                {
                    label: "Region Insights",
                    view: "regionInsights",
                    permission: PERMISSIONS.VIEW_REGION_INSIGHTS,
                },
                {
                    label: "Session Audit",
                    view: "sessionAudit",
                    isVisible: canViewAnySessionAudit,
                },
                {
                    label: "Thang Review",
                    view: "thangReview",
                    permission: PERMISSIONS.MANAGE_LIBRARY_WORKBENCH,
                },
            ],
        },
        {
            label: "Administration",
            icon: "administration",
            items: [
                {
                    label: "Admin Management",
                    view: "adminManagement",
                    permission: PERMISSIONS.MANAGE_ROLES,
                },
                {
                    label: "Admin Settings",
                    view: "adminSettings",
                    permission: PERMISSIONS.ACCESS_ADMIN_SETTINGS,
                },
                {
                    label: "AO Management",
                    view: "aoManagement",
                    permission: PERMISSIONS.MANAGE_AOS,
                },
                {
                    label: "Import Runs",
                    view: "importRuns",
                    permission: PERMISSIONS.VIEW_IMPORTS,
                },
                {
                    label: "Library Workbench",
                    view: "libraryWorkbench",
                    permission: PERMISSIONS.MANAGE_LIBRARY_WORKBENCH,
                },
                {
                    label: "Operations Center",
                    view: "operationsCenter",
                    permission: PERMISSIONS.ACCESS_OPERATIONS_CENTER,
                },
                {
                    label: "Roster Management",
                    view: "rosterManagement",
                    isVisible: canManageCurrentRoster,
                },
            ],
        },
        {
            label: "My Account",
            icon: "account",
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
            state.currentUserProfileId = null;
            state.currentUserRole = null;
            state.currentUserDisplayName = null;
            state.currentUserMemberId = null;
            state.currentUserMember = null;
    
            state.selectedMemberId = null;
            state.selectedSessionId = null;
            state.selectedPlannedWorkoutId = null;
    
            state.editingMemberId = null;
            state.editingSessionId = null;
    
            state.draftSession = null;
    
            state.currentView = "dashboard";
            state.currentRegionId = null;
            state.activeRegionId = null;
            state.homeRegionId = null;
            state.profileRegionId = null;
            state.regionOverrideId = null;
            state.pendingRegionId = null;

            state.availableRegions = [];
            state.accessibleRegions = [];
    
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

    let openMenuGroup = null;

    function closeMenuGroup(groupElement) {
        const headingButton = groupElement.querySelector(
            ".main-menu-group-heading"
        );

        const panel = groupElement.querySelector(
            ".main-menu-group-panel"
        );

        if (!headingButton || !panel) return;

        headingButton.setAttribute("aria-expanded", "false");
        groupElement.classList.remove("open");

        panel.style.maxHeight = `${panel.scrollHeight}px`;

        requestAnimationFrame(() => {
            panel.style.maxHeight = "0px";
            panel.style.opacity = "0";
        });

        if (openMenuGroup === groupElement) {
            openMenuGroup = null;
        }
    }

    function openMenuGroupPanel(groupElement) {
        const headingButton = groupElement.querySelector(
            ".main-menu-group-heading"
        );

        const panel = groupElement.querySelector(
            ".main-menu-group-panel"
        );

        if (!headingButton || !panel) return;

        if (openMenuGroup && openMenuGroup !== groupElement) {
            closeMenuGroup(openMenuGroup);
        }

        headingButton.setAttribute("aria-expanded", "true");
        groupElement.classList.add("open");

        panel.style.maxHeight = `${panel.scrollHeight}px`;
        panel.style.opacity = "1";

        openMenuGroup = groupElement;
    }

    menuGroups.forEach((group, groupIndex) => {
        const visibleItems = group.items
            .filter(item => {
                if (item.isVisible) return item.isVisible();
                if (item.permission) {
                    return hasPermission(item.permission);
                }

                return true;
            })
            .sort((a, b) => a.label.localeCompare(b.label));

        if (visibleItems.length === 0) return;

        const groupElement = document.createElement("section");
        groupElement.classList.add("main-menu-group");

        const panelId = `main-menu-group-panel-${groupIndex}`;

        const headingButton = document.createElement("button");
        headingButton.type = "button";
        headingButton.classList.add("main-menu-group-heading");
        headingButton.setAttribute("aria-controls", panelId);
        headingButton.setAttribute("aria-expanded", "false");

        const headingContent = document.createElement("span");
        headingContent.classList.add(
            "main-menu-group-heading-content"
        );

        const headingIcon = createIcon(
            group.icon,
            "main-menu-group-icon"
        );

        const headingLabel = document.createElement("span");
        headingLabel.textContent = group.label;

        const headingChevron = document.createElement("span");
        headingChevron.classList.add(
            "main-menu-group-chevron"
        );
        headingChevron.textContent = "›";
        headingChevron.setAttribute("aria-hidden", "true");

        headingContent.append(headingIcon, headingLabel);
        headingButton.append(
            headingContent,
            headingChevron
        );

        const panel = document.createElement("div");
        panel.id = panelId;
        panel.classList.add("main-menu-group-panel");
        panel.setAttribute("role", "region");

        const panelInner = document.createElement("div");
        panelInner.classList.add(
            "main-menu-group-panel-inner"
        );

        visibleItems.forEach(item => {
            panelInner.appendChild(createMenuButton(item));
        });

        panel.appendChild(panelInner);
        groupElement.append(headingButton, panel);

        const isActiveGroup = visibleItems.some(
            item => item.view === state.currentView
        );

        if (isActiveGroup) {
            groupElement.classList.add("open");
            headingButton.setAttribute(
                "aria-expanded",
                "true"
            );

            panel.style.opacity = "1";
            openMenuGroup = groupElement;
        }

        headingButton.addEventListener("click", () => {
            const isOpen =
                headingButton.getAttribute("aria-expanded")
                === "true";

            if (isOpen) {
                closeMenuGroup(groupElement);
                return;
            }

            openMenuGroupPanel(groupElement);
        });

        panel.addEventListener("transitionend", event => {
            if (event.propertyName !== "max-height") return;

            const isOpen =
                headingButton.getAttribute("aria-expanded")
                === "true";

            if (isOpen) {
                panel.style.maxHeight = "none";
            }
        });

        list.appendChild(groupElement);

        if (isActiveGroup) {
            panel.style.maxHeight = "none";
        }
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
    });

    drawer.addEventListener("click", event => {
        event.stopPropagation();
    });

    return overlay;
}
