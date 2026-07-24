import { state } from "./modules/state.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderRoster } from "./views/rosterView.js";
import { renderSession } from "./views/sessionView.js";
import { renderSessionHistory } from "./views/sessionHistoryView.js";
import "./styles/main.css";
import { renderSessionDetail } from "./views/sessionDetailView.js";
import { renderMemberDetail } from "./views/memberDetailView.js";
import { renderMemberEdit } from "./views/memberEditView.js";
import { renderWorkoutPlanner } from "./views/workoutPlannerView.js";
import { renderPlannedWorkoutsList } from "./views/plannedWorkoutsListView.js";
import { renderPlannedWorkoutDetail } from "./views/plannedWorkoutDetailView.js";
import { replacePersistedData } from "./services/appData.js";
import {
    loadAllRegions,
    loadRegionData,
    getNotificationSettings,
    loadExercises,
    loadProfileAoPermissions,
    loadProfileRegionPositions,
} from "./services/cloudData.js";
import { getCurrentSession, ensureMyProfile } from "./services/auth.js";
import { renderAuthView } from "./views/authView.js";
import { renderMyPlanner } from "./views/myPlannerView.js";
import { renderStalePaxView } from "./views/stalePaxView.js";
import { renderQSignupView } from "./views/qSignupView.js";
import { renderAoManagementView } from "./views/aoManagementView.js";
import { renderAoEditView } from "./views/aoEditView.js";
import { renderPreblastView } from "./views/preblastView.js";
import { renderRegionGateView } from "./views/regionGateView.js";
import { checkRegionAccess } from "./services/cloudData.js";
import { renderClaimMemberView } from "./views/claimMemberView.js";
import { renderBackblastView } from "./views/backblastView.js";
import { renderResetPasswordView } from "./views/resetPasswordView.js";
import { saveNavState, getRestoredNavState, saveOfflineBootSnapshot, loadOfflineBootSnapshot } from "./utils/storage.js";
import { renderAdminFlagsView } from "./views/adminFlagsView.js"
import { renderAdminSettingsView } from "./views/adminSettingsView.js";
import { logActionFailure, logAppEvent } from "./services/appEvents.js";
import { renderTemplateHubView } from "./views/templateHubView.js";
import { APP_EVENTS } from "./constants/appEvents.js";
import { renderRegionInsightsView } from "./views/regionInsightsView.js";
import { renderAoInsightsView } from "./views/aoInsightsView.js";
import { loadBackblastLinks } from "./services/cloudData.js";
import { hasPermission, PERMISSIONS, isRegionalAdmin, getManagedAoIds, managesAo } from "./utils/permissions.js";
import { renderAnnouncementManagementView } from "./views/announcementManagementView.js";
import { renderQReadinessView } from "./views/qReadinessView.js";
import { renderQSourceManagementView } from "./views/qSourceManagementView.js";
import { loadLibraryAutocompleteItems, loadLibraryFilterOptions } from "./services/libraryData.js";
import { renderThirdFManagementView } from "./views/thirdFManagementView.js";
import { renderThirdFView } from "./views/thirdFView.js";
import { renderAoInsightDetailView } from "./views/aoInsightsDetailView.js";
import { renderPaxProfileView } from "./views/paxProfileView.js";
import { renderSessionAuditView } from "./views/sessionAuditView.js";
import { renderPaxCommunityView } from "./views/paxCommunity.js";
import { renderSettingsView } from "./views/settingsView.js";
import { initializeGlobalErrorTelemetry } from "./services/globalErrorTelemetry.js";
import { loadWorkspace } from "./services/workspaceService.js";

initializeGlobalErrorTelemetry();

import(
    "./services/pendingSessionSyncService.js"
);


if (process.env.NODE_ENV === "development") {
    window.state = state;
    window.renderApp = renderApp;
    window.logAppEvent = logAppEvent;

    window.synchronizePendingSessions = async () => {
        const module = await import(
            "./services/pendingSessionSyncService.js"
        );
    
        return module.synchronizePendingSessions({
            ownerUserId: state.currentUserId,
            regionId: state.currentRegionId,
        });
    };

    const loadPendingSessionSyncTools = () =>
    
    window.retryNextPendingSession = async () => {
        const module =
            await loadPendingSessionSyncTools();
    
        return module.retryNextPendingSessionCommand({
            ownerUserId: state.currentUserId,
            regionId: state.currentRegionId,
        });
    };

    const loadAggielandTools = () =>
        import(
            /* webpackChunkName: "dev-import-aggieland" */
            "./services/importAggieland.js"
        );

    const loadOld300Tools = () =>
        import(
            /* webpackChunkName: "dev-import-old300" */
            "./services/importOld300.js"
        );

    window.importPaxMasterCsv = async (...args) => {
        const module = await loadAggielandTools();
        return module.importPaxMasterCsv(...args);
    };

    window.runAggielandDeltaAoImports = async (...args) => {
        const module = await loadAggielandTools();
        return module.runAggielandDeltaAoImports(...args);
    };

    window.repairAggielandDeltaSessions = async (...args) => {
        const module = await loadAggielandTools();
        return module.repairAggielandDeltaSessions(...args);
    };

    window.auditPotentialMergedMembers = async (...args) => {
        const module = await loadAggielandTools();
        return module.auditPotentialMergedMembers(...args);
    };

    window.auditMergedMemberDetail = async (...args) => {
        const module = await loadAggielandTools();
        return module.auditMergedMemberDetail(...args);
    };

    window.splitMergedMemberByRawName = async (...args) => {
        const module = await loadAggielandTools();
        return module.splitMergedMemberByRawName(...args);
    };

    window.runAggielandSync = async (...args) => {
        const module = await loadAggielandTools();
        return module.runAggielandSync(...args);
    };

    window.importOld300AttendanceCsv = async (...args) => {
        const module = await loadOld300Tools();
        return module.importOld300AttendanceCsv(...args);
    };

    window.permissions = {
        isRegionalAdmin,
        getManagedAoIds,
        managesAo,
    };
}

let serviceWorkerUpdateRegistration = null;
let serviceWorkerUpdateRequested = false;
let serviceWorkerReloadStarted = false;
let lastServiceWorkerUpdateCheckAt = 0;

const SERVICE_WORKER_UPDATE_CHECK_INTERVAL_MS =
    5 * 60 * 1000;

function removeServiceWorkerUpdatePrompt() {
    document
        .getElementById("app-update-prompt")
        ?.remove();
}

function showServiceWorkerUpdatePrompt(registration) {
    if (
        !registration?.waiting ||
        document.getElementById("app-update-prompt")
    ) {
        return;
    }

    serviceWorkerUpdateRegistration = registration;

    const prompt = document.createElement("aside");
    prompt.id = "app-update-prompt";
    prompt.className = "app-update-prompt";
    prompt.setAttribute("role", "status");
    prompt.setAttribute("aria-live", "polite");

    const content = document.createElement("div");
    content.className = "app-update-prompt-content";

    const textContainer = document.createElement("div");
    textContainer.className = "app-update-prompt-text";

    const heading = document.createElement("strong");
    heading.textContent = "Update available";

    const message = document.createElement("span");
    message.textContent =
        "A new version of The Q is ready.";

    textContainer.append(heading, message);

    const actions = document.createElement("div");
    actions.className = "app-update-prompt-actions";

    const laterButton = document.createElement("button");
    laterButton.type = "button";
    laterButton.className =
        "app-update-prompt-button app-update-prompt-button-secondary";
    laterButton.textContent = "Later";

    laterButton.addEventListener("click", () => {
        removeServiceWorkerUpdatePrompt();
    });

    const updateButton = document.createElement("button");
    updateButton.type = "button";
    updateButton.className = "app-update-prompt-button";
    updateButton.textContent = "Update now";

    updateButton.addEventListener("click", () => {
        const waitingWorker =
            serviceWorkerUpdateRegistration?.waiting;

        if (!waitingWorker) {
            removeServiceWorkerUpdatePrompt();
            return;
        }

        serviceWorkerUpdateRequested = true;
        updateButton.disabled = true;
        laterButton.disabled = true;
        updateButton.textContent = "Updating…";

        waitingWorker.postMessage({
            type: "SKIP_WAITING",
        });
    });

    actions.append(laterButton, updateButton);
    content.append(textContainer, actions);
    prompt.append(content);
    document.body.append(prompt);
}

function watchInstallingServiceWorker(
    registration,
    installingWorker
) {
    if (!installingWorker) {
        return;
    }

    installingWorker.addEventListener("statechange", () => {
        if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
        ) {
            showServiceWorkerUpdatePrompt(registration);
        }
    });
}

async function checkForServiceWorkerUpdate(
    registration,
    { force = false } = {}
) {
    const now = Date.now();

    if (
        !force &&
        now - lastServiceWorkerUpdateCheckAt <
            SERVICE_WORKER_UPDATE_CHECK_INTERVAL_MS
    ) {
        return;
    }

    lastServiceWorkerUpdateCheckAt = now;

    try {
        await registration.update();

        if (registration.waiting) {
            showServiceWorkerUpdatePrompt(registration);
        }
    } catch (error) {
        /*
         * An update check can fail while offline or during a
         * temporary network interruption. The currently installed
         * app should continue operating normally.
         */
        console.warn(
            "Service worker update check failed:",
            error
        );
    }
}

async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    const swPath =
        process.env.NODE_ENV === "production"
            ? "/f3-app/sw.js"
            : "/sw.js";

    try {
        const registration =
            await navigator.serviceWorker.register(
                swPath,
                {
                    updateViaCache: "none",
                }
            );

        console.log("SW registered - Build B");

        serviceWorkerUpdateRegistration =
            registration;

        /*
         * A worker may already be waiting when this page opens.
         */
        if (registration.waiting) {
            showServiceWorkerUpdatePrompt(registration);
        }

        registration.addEventListener(
            "updatefound",
            () => {
                watchInstallingServiceWorker(
                    registration,
                    registration.installing
                );
            }
        );

        /*
         * Explicitly check on launch instead of relying only on
         * the browser's normal update-check timing.
         */
        void checkForServiceWorkerUpdate(
            registration,
            { force: true }
        );

        /*
         * Installed PWAs can remain suspended for long periods.
         * Check again when the app returns to the foreground.
         */
        document.addEventListener(
            "visibilitychange",
            () => {
                if (
                    document.visibilityState === "visible" &&
                    navigator.onLine
                ) {
                    void checkForServiceWorkerUpdate(
                        registration,
                        { force: true }
                    );
                }
            }
        );

        window.addEventListener("online", () => {
            void checkForServiceWorkerUpdate(
                registration,
                { force: true }
            );
        });
    } catch (error) {
        console.error(
            "SW registration failed:",
            error
        );
    }
}

navigator.serviceWorker?.addEventListener(
    "controllerchange",
    () => {
        /*
         * Only reload when this page intentionally requested
         * activation. This prevents unexpected reloads caused by
         * service-worker activity in another tab.
         */
        if (
            !serviceWorkerUpdateRequested ||
            serviceWorkerReloadStarted
        ) {
            return;
        }

        serviceWorkerReloadStarted = true;
        window.location.reload();
    }
);

void registerServiceWorker();

const RESTORABLE_VIEWS = new Set([
    "dashboard",
    "myPlanner",
    "plannedWorkoutDetail",
    "plannedWorkoutList",
    "workoutPlanner",
    "sessionHistory",
    "sessionDetail",
    "roster",
    "preblast",
    "qSignup",
    "session",
    "adminSettings",
    "regionInsights",
    "importRuns",
    "announcementManagement",
    "settings",
    "operationsCenter",
]);

function restoreNavState(nav) {
    if (!nav || !RESTORABLE_VIEWS.has(nav.currentView)) {
        state.currentView = "dashboard";
        return;
    }

    state.currentView = nav.currentView;
    state.selectedPlannedWorkoutId = nav.selectedPlannedWorkoutId || null;
    state.plannedWorkoutLaunchMode = nav.plannedWorkoutLaunchMode || null;
    state.selectedSessionId = nav.selectedSessionId || null;
    state.selectedPreblastWorkoutId = nav.selectedPreblastWorkoutId || null;
    
    state.editingSessionId = null;
}

let lastRenderedView = null;
let routeRenderSequence = 0;

const lazyRouteLoaders = {
    importRuns: () =>
        import(
            /* webpackChunkName: "route-import-runs" */
            "./views/importRunsView.js"
        ).then(module => module.renderImportRunsView),

    thangReview: () =>
        import(
            /* webpackChunkName: "route-thang-review" */
            "./views/thangReviewView.js"
        ).then(module => module.renderThangReviewView),

    adminManagement: () =>
        import(
            /* webpackChunkName: "route-admin-management" */
            "./views/adminManagementView.js"
        ).then(module => module.renderAdminManagementView),

    operationsCenter: () =>
        import(
            /* webpackChunkName: "route-operations-center" */
            "./views/operationsCenterView.js"
        ).then(module => module.renderOperationsCenterView),
    
    libraryWorkbench: () =>
        import(
            /* webpackChunkName: "route-library-workbench" */
            "./views/libraryWorkbenchView.js"
        ).then(module => module.renderLibraryWorkbenchView),

    weeklyQCalendar: () =>
        import(
            /* webpackChunkName: "route-weekly-q-calendar" */
            "./views/weeklyQCalendarView.js"
        ).then(module => module.renderWeeklyQCalendarView),
};

const lazyRoutePromises = new Map();

function getLazyRouteLabel(viewName) {
    const labels = {
        importRuns: "Import Runs",
        thangReview: "Thang Review",
        adminManagement: "Admin Management",
        operationsCenter: "Operations Center",
        libraryWorkbench: "Library Workbench",
        weeklyQCalendar: "Weekly Q Calendar",
    };

    return labels[viewName] || "Screen";
}

function getLazyRouteRenderer(viewName) {
    const existingPromise = lazyRoutePromises.get(viewName);

    if (existingPromise) {
        return existingPromise;
    }

    const loader = lazyRouteLoaders[viewName];

    if (!loader) {
        return Promise.reject(
            new Error(
                `No lazy route loader is registered for "${viewName}".`
            )
        );
    }

    const loadingPromise = loader().catch(error => {
        /*
         * A failed chunk must not remain cached. Removing it allows
         * the retry button to make a fresh request.
         */
        lazyRoutePromises.delete(viewName);
        throw error;
    });

    lazyRoutePromises.set(viewName, loadingPromise);

    return loadingPromise;
}

function clearAppRoot() {
    const app = document.getElementById("app");

    if (!app) return null;

    app.replaceChildren();

    return app;
}

function renderLazyRouteLoading(viewName) {
    const app = clearAppRoot();

    if (!app) return;

    const container = document.createElement("main");
    container.className = "route-load-state";
    container.setAttribute("aria-live", "polite");

    const spinner = document.createElement("div");
    spinner.className = "route-load-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const message = document.createElement("p");
    message.className = "route-load-message";
    message.textContent =
        `Loading ${getLazyRouteLabel(viewName)}…`;

    container.append(spinner, message);
    app.append(container);
}

function renderLazyRouteError(viewName, error) {
    const app = clearAppRoot();

    if (!app) return;

    console.error(
        `Failed to load lazy route "${viewName}":`,
        error
    );

    const container = document.createElement("main");
    container.className =
        "route-load-state route-load-state-error";
    container.setAttribute("role", "alert");

    const heading = document.createElement("h2");
    heading.className = "route-load-heading";
    heading.textContent = "Unable to load this screen";

    const message = document.createElement("p");
    message.className = "route-load-message";
    message.textContent =
        "Check your connection and try again.";

    const actions = document.createElement("div");
    actions.className = "route-load-actions";

    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "route-load-button";
    retryButton.textContent = "Try Again";

    retryButton.addEventListener("click", () => {
        lazyRoutePromises.delete(viewName);

        if (state.currentView === viewName) {
            renderApp();
        }
    });

    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.className =
        "route-load-button route-load-button-secondary";
    reloadButton.textContent = "Reload App";

    reloadButton.addEventListener("click", () => {
        window.location.reload();
    });

    actions.append(retryButton, reloadButton);
    container.append(heading, message, actions);
    app.append(container);
}

function renderLazyRoute(viewName, renderSequence) {
    renderLazyRouteLoading(viewName);

    getLazyRouteRenderer(viewName)
        .then(renderView => {
            /*
             * Ignore an old route request if the user navigated away
             * before its chunk finished loading.
             */
            if (
                renderSequence !== routeRenderSequence ||
                state.currentView !== viewName
            ) {
                return;
            }

            renderView();
        })
        .catch(error => {
            if (
                renderSequence !== routeRenderSequence ||
                state.currentView !== viewName
            ) {
                return;
            }

            renderLazyRouteError(viewName, error);
        });
}

function renderApp() {
    const currentRenderSequence = ++routeRenderSequence;

    const app = document.getElementById("app");

    if (app) {
        app.classList.add(`view-${state.currentView}`); 
    }

    saveNavState(state);

    if (state.currentView !== lastRenderedView) {
        const previousView = lastRenderedView;

        window.scrollTo({ top: 0, left: 0, behavior: "auto" });

        /*logAppEvent({
            type: APP_EVENTS.VIEW_OPENED,
            metadata: {
                view: state.currentView,
                previousView,
            },
        });*/

        lastRenderedView = state.currentView;
    }
    
    if (state.currentView === "dashboard") { 
        renderDashboard();
    } else if (state.currentView === "auth") {
        renderAuthView();
    } else if (state.currentView === "roster") {
        renderRoster();
    } else if (state.currentView === "session"){
        renderSession();
    } else if (state.currentView === "sessionHistory"){
        renderSessionHistory();
    } else if (state.currentView === "sessionDetail") {
        renderSessionDetail();
    } else if (state.currentView === "memberDetail") {
        renderMemberDetail();
    } else if (state.currentView === "memberEdit") {
        renderMemberEdit();
    } else if (state.currentView === "workoutPlanner") {
        renderWorkoutPlanner();
    } else if (state.currentView === "plannedWorkoutList") {
        renderPlannedWorkoutsList();
    } else if (state.currentView === "plannedWorkoutDetail") {
        renderPlannedWorkoutDetail();
    } else if (state.currentView === "myPlanner") {
        renderMyPlanner();
    } else if (state.currentView === "stalePax") {
        renderStalePaxView();
    } else if (state.currentView === "qSignup") {
        renderQSignupView();
    } else if (state.currentView === "aoManagement") {
        renderAoManagementView();
    } else if (state.currentView === "aoEdit") {
        renderAoEditView();
    } else if (state.currentView === "preblast") {
        renderPreblastView();
    } else if (state.currentView === "regionGate") {
        renderRegionGateView();
    } else if (state.currentView === "claimMember") {
        renderClaimMemberView();
    } else if (state.currentView === "backblast") {
        renderBackblastView();
    } else if (state.currentView === "resetPassword"){
        renderResetPasswordView();
    } else if (state.currentView === "adminFlags") {
        renderAdminFlagsView();
    } else if (state.currentView === "adminSettings") {
        renderAdminSettingsView();
    } else if (state.currentView === "templateHub") {
        renderTemplateHubView();
    } else if (state.currentView === "weeklyQCalendar") {
        renderLazyRoute(
            "weeklyQCalendar",
            currentRenderSequence
        );
    } else if (state.currentView === "regionInsights") {
        renderRegionInsightsView();
    } else if (state.currentView === "aoInsights") {
        renderAoInsightsView();
    } else if (state.currentView === "importRuns") {
        renderLazyRoute(
            "importRuns",
            currentRenderSequence
        );
    } else if (state.currentView === "announcementManagement") {
        renderAnnouncementManagementView();
    } else if (state.currentView === "thangReview") {
        renderLazyRoute(
            "thangReview",
            currentRenderSequence
        );
    } else if (state.currentView === "qReadiness") {
        renderQReadinessView();
    } else if (state.currentView === "qSourceManagement") {
        renderQSourceManagementView();
    } else if (state.currentView === "libraryWorkbench") {
        renderLazyRoute(
            "libraryWorkbench",
            currentRenderSequence
        );
    } else if (state.currentView === "adminManagement") {
        renderLazyRoute(
            "adminManagement",
            currentRenderSequence
        );
    } else if (state.currentView === "thirdFManagement") {
        renderThirdFManagementView();
    } else if (state.currentView === "thirdF") {
        renderThirdFView();
    } else if (state.currentView === "aoInsightDetail") {
        renderAoInsightDetailView();
    } else if (state.currentView === "paxProfile") {
        renderPaxProfileView();
    } else if (state.currentView === "sessionAudit") {
        renderSessionAuditView();
    } else if (state.currentView === "paxCommunity") {
        renderPaxCommunityView();
    } else if (state.currentView === "settings") {
        renderSettingsView();
    } else if (state.currentView === "operationsCenter") {
        renderLazyRoute(
            "operationsCenter",
            currentRenderSequence
        );
    } else {
        console.warn("Unknown view. Resetting to dashboard:", state.currentView);

        state.currentView = "dashboard";
        saveNavState(state);

        renderDashboard ();
    }
}

function hideBootSplash() {
    const splash = document.getElementById("boot-splash");
    if (!splash) return;

    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 220);
}

function hydrateHistoricalBackblastLinks(regionId) {
    if (!regionId) return;

    state.isHydratingHistoricalBackblasts = true;

    loadBackblastLinks(regionId)
        .then(links => {
            const linksBySessionId = new Map();

            (links || []).forEach(link => {
                if (!link.session_id) return;

                const existing = linksBySessionId.get(link.session_id);

                if (
                    !existing ||
                    (link.confidence_score || 0) > (existing.confidence_score || 0)
                ) {
                    linksBySessionId.set(link.session_id, link);
                }
            });

            state.sessions = state.sessions.map(session => {
                const historicalBackblast = linksBySessionId.get(session.id);

                return {
                    ...session,
                    hasHistoricalBackblast: Boolean(historicalBackblast),
                    historicalBackblastLink: historicalBackblast || null,
                };
            });

            state.isHydratingHistoricalBackblasts = false;

            if (
                state.currentView === "sessionHistory" ||
                state.currentView === "sessionDetail" ||
                state.currentView === "dashboard"
            ) {
                renderApp();
            }
        })
        .catch(error => {
            state.isHydratingHistoricalBackblasts = false;
            console.error("Failed to hydrate historical backblast links:", error);
        });
}

function hydrateOfflineBootSnapshot(snapshot) {
    const {
        profile,
        availableRegions,
        profileAoPermissions,
        profileRegionPositions,
        regionData,
    } = snapshot;

    state.currentUserId =
        snapshot.userId;

    state.currentUserRole =
        profile.role || "pax";

    state.currentUserDisplayName =
        profile.displayName || "User";

    state.currentUserProfileId =
        profile.id;

    state.profileRegionId = profile.regionId;

    // New workspace model
    state.homeRegionId = profile.regionId;
    state.activeRegionId = profile.regionId;
    state.accessibleRegionIds = [profile.regionId];
    
    state.currentRegionId = profile.regionId;
    
    state.regionOverrideId = null;

    state.currentUserMemberId =
        profile.memberId || null;

    state.customTemplates =
        profile.customTemplates ||
        state.customTemplates;

    state.availableRegions =
        availableRegions || [];

    state.profileAoPermissions =
        profileAoPermissions || [];

    state.profileRegionPositions =
        profileRegionPositions || [];

    state.hasInitializedQSignupFilter =
        false;

    replacePersistedData(regionData);
}

function bootFromOfflineSnapshot({
    session,
    sharedWorkoutId,
}) {
    const snapshot =
        loadOfflineBootSnapshot(
            session.user.id
        );

    if (!snapshot) {
        return false;
    }

    hydrateOfflineBootSnapshot(snapshot);

    if (sharedWorkoutId) {
        const sharedWorkoutExists =
            state.plannedWorkouts.some(
                workout =>
                    workout.id ===
                    sharedWorkoutId
            );

        if (sharedWorkoutExists) {
            state.selectedPlannedWorkoutId =
                sharedWorkoutId;

            state.sharedWorkoutViewMode = true;
            state.currentView =
                "plannedWorkoutDetail";
        } else {
            state.currentView = "dashboard";
        }
    } else if (!state.currentUserMemberId) {
        /*
         * Claiming a member requires the network.
         * Do not send an offline user into that flow.
         */
        state.currentView = "dashboard";
    } else {
        const restoredNav =
            getRestoredNavState();

        if (restoredNav) {
            restoreNavState(restoredNav);
        } else {
            state.currentView = "dashboard";
        }
    }

    renderApp();
    hideBootSplash();

    console.log(
        "The Q booted from its offline snapshot..",
        {
            snapshotSavedAt:
                snapshot.savedAt,
            regionId:
                state.currentRegionId,
        }
    );

    return true;
}

async function loadActiveRegionData(
    activeRegionId,
    bootPhases = null
) {
    return loadWorkspace(activeRegionId, bootPhases);
}

function getSharedWorkoutIdFromUrl() {
    const hash = window.location.hash;
    const hashQueryString = hash.includes("?") ? hash.split("?")[1] : "";
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hashQueryString);

    return searchParams.get("workoutId") || hashParams.get("workoutId");
}

async function synchronizePendingSessionsForCurrentContext() {
    if (!state.currentUserId || !state.currentRegionId) {
        return {
            status: "skipped",
            reason: "missing_context",
        };
    }

    try {
        const {
            synchronizePendingSessions,
        } = await import(
            "./services/pendingSessionSyncService.js"
        );

        const result =
            await synchronizePendingSessions({
                ownerUserId: state.currentUserId,
                regionId: state.currentRegionId,
            });

        if (result?.processedCount > 0) {
            const regionLoaded =
                await loadActiveRegionData(
                    state.currentRegionId
                );

            if (regionLoaded) {
                renderApp();
            }
        }

        return result;
    } catch (error) {
        console.warn(
            "Pending session synchronization failed:",
            error
        );

        return {
            status: "failed",
            error,
        };
    }
}

function recordBootDiagnostic(step, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        step,
        online: navigator.onLine,
        ...details,
    };

    const existing = JSON.parse(
        localStorage.getItem("bootDiagnostics") || "[]"
    );

    existing.push(entry);

    localStorage.setItem(
        "bootDiagnostics",
        JSON.stringify(existing.slice(-50))
    );

    console.warn("BOOT DIAGNOSTIC:", entry);
}

async function bootApp() {
    const bootStartedAt = performance.now();
    const bootPhases = {};

    recordBootDiagnostic("boot_started");

    console.log("=== bootApp started ===");
    console.log("Initial online status:", navigator.onLine);

    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const sharedWorkoutId = getSharedWorkoutIdFromUrl();

    if (mode === "reset-password") {
        state.currentView = "resetPassword";
        renderApp();
        hideBootSplash();
        return;
    }

    try {
        let phaseStartedAt = performance.now();

        recordBootDiagnostic("before_get_current_session");

        console.log("bootApp: requesting current session");

        let session = await getCurrentSession();

        recordBootDiagnostic("after_get_current_session", {
            hasSession: Boolean(session),
            userId: session?.user?.id || null,
        });

        console.log("bootApp: getCurrentSession completed");
        console.log("bootApp: session present:", Boolean(session));
        console.log("bootApp: session user id:", session?.user?.id || null);
    
        bootPhases.getCurrentSessionMs = Math.round(
            performance.now() - phaseStartedAt
        );
    
        if (!session) {
            phaseStartedAt = performance.now();
    
            await new Promise(resolve => setTimeout(resolve, 500));
            session = await getCurrentSession();
    
            bootPhases.sessionRetryMs = Math.round(
                performance.now() - phaseStartedAt
            );
        } else {
            bootPhases.sessionRetryMs = 0;
        }

        if (!session) {
            console.log("No session found, rendering auth");
        
            console.log(
                `bootApp: ${(performance.now() - bootStartedAt).toFixed(1)} ms`
            );
        
            state.currentView = "auth";
            renderAuthView();
            hideBootSplash();
            return;
        }

        try {
            phaseStartedAt = performance.now();

            recordBootDiagnostic("before_ensure_profile");

            console.log("bootApp: online before profile lookup:", navigator.onLine);
            console.log("bootApp: requesting profile");

            const profile = await ensureMyProfile(
                session.user.id,
                session
            );

            recordBootDiagnostic("after_ensure_profile", {
                hasProfile: Boolean(profile),
                profileId: profile?.id || null,
                regionId: profile?.region_id || null,
            });

            console.log("bootApp: profile lookup completed");
            console.log("bootApp: profile present:", Boolean(profile));
            console.log("bootApp: profile id:", profile?.id || null);
            console.log("bootApp: profile region id:", profile?.region_id || null);

            bootPhases.ensureMyProfileMs = Math.round(
                performance.now() - phaseStartedAt
            );

            state.currentUserId = session.user.id;
            state.currentUserRole = profile.role || "pax";
            state.currentUserDisplayName = profile.display_name || "User";
            state.currentUserProfileId = profile.id;
            state.profileRegionId = profile.region_id;
            state.regionOverrideId = null;

            // New workspace model
            state.homeRegionId = profile.region_id;
            state.activeRegionId = profile.region_id;
            state.accessibleRegionIds = [profile.region_id];

            state.currentUserMemberId = profile.member_id || null;
            state.customTemplates = profile.custom_templates || state.customTemplates;
            state.hasInitializedQSignupFilter = false;

            phaseStartedAt = performance.now();

            const regions = await loadAllRegions();

            bootPhases.loadAllRegionsMs = Math.round(
                performance.now() - phaseStartedAt
            );

            state.availableRegions = regions || [];
            
            phaseStartedAt = performance.now();

            const timeRegionalPhase = async (phaseName, operation) => {
                const startedAt = performance.now();

                try {
                    return await operation();
                } finally {
                    bootPhases[phaseName] = Math.round(
                        performance.now() - startedAt
                    );
                }
            };

            const [
                regionLoaded,
                profileAoPermissions,
                profileRegionPositions,
            ] = await Promise.all([
                timeRegionalPhase(
                    "activeRegionDataMs",
                    () =>
                        loadActiveRegionData(
                            profile.region_id,
                            bootPhases
                        )
                ),
                timeRegionalPhase(
                    "profileAoPermissionsMs",
                    () => loadProfileAoPermissions(profile.region_id)
                ),
                timeRegionalPhase(
                    "profileRegionPositionsMs",
                    () => loadProfileRegionPositions(profile.region_id)
                ),
            ]);

            bootPhases.regionBootstrapMs = Math.round(
                performance.now() - phaseStartedAt
            );

            if (!regionLoaded) {
                console.log(
                    `bootApp: ${(performance.now() - bootStartedAt).toFixed(1)} ms`
                );

                hideBootSplash();
                return;
            }

            state.profileAoPermissions = profileAoPermissions || [];
            state.profileRegionPositions = profileRegionPositions || [];

            try {
                saveOfflineBootSnapshot({
                    userId:
                        session.user.id,
            
                    profile,
            
                    availableRegions:
                        state.availableRegions,
            
                    profileAoPermissions:
                        state.profileAoPermissions,
            
                    profileRegionPositions:
                        state.profileRegionPositions,
            
                    regionData: {
                        regionName:
                            state.regionName,
            
                        members:
                            state.members,
            
                        sessions:
                            state.sessions,
            
                        plannedWorkouts:
                            state.plannedWorkouts,
            
                        aos:
                            state.aos,
            
                        sites:
                            state.sites,
            
                        qSlots:
                            state.qSlots,
            
                        savedPlannerSections:
                            state.savedPlannerSections,
            
                        workoutFieldLabels:
                            state.workoutFieldLabels,
            
                        announcements:
                            state.announcements,
            
                        qSources:
                            state.qSources,
            
                        memberStats:
                            state.memberStats,
            
                        memberStatsByMemberId:
                            state.memberStatsByMemberId,
            
                        fngNamingPostNumber:
                            state.fngNamingPostNumber,
            
                        aoLeadershipContacts:
                            state.aoLeadershipContacts,
                    },
                });
            } catch (error) {
                console.warn(
                    "Online boot succeeded, but the offline snapshot could not be saved:",
                    error
                );
            }
            recordBootDiagnostic("cloud_boot_succeeded");
        } catch (cloudBootError) {
            recordBootDiagnostic("cloud_boot_failed", {
                errorName:
                    cloudBootError?.name || null,
                errorMessage:
                    cloudBootError?.message ||
                    String(cloudBootError),
                navigatorOnline:
                    navigator.onLine,
            });
    
            console.warn(
                "Cloud bootstrap failed. Attempting offline snapshot:",
                cloudBootError
            );
    
            const offlineBooted =
                bootFromOfflineSnapshot({
                    session,
                    sharedWorkoutId,
                });
    
            recordBootDiagnostic(
                offlineBooted
                    ? "offline_boot_succeeded"
                    : "offline_boot_snapshot_missing"
            );
    
            if (offlineBooted) {
                return;
            }
    
            throw cloudBootError;
        }

        if (sharedWorkoutId) {
            state.selectedPlannedWorkoutId = sharedWorkoutId;
            state.sharedWorkoutViewMode = true;
            state.currentView = "plannedWorkoutDetail";
        } else if (!state.currentUserMemberId) {
            state.currentView = "claimMember";
        } else {
            const restoredNav = getRestoredNavState();

            if (restoredNav) {
                restoreNavState(restoredNav);
            } else {
                state.currentView = "dashboard";
            }
        }
        
        const renderStartedAt = performance.now();

        renderApp();

        let hasRegisteredPendingSessionOnlineListener = false;

        // Attempt a sync once after boot.
        void synchronizePendingSessionsForCurrentContext();

        // Retry automatically whenever connectivity returns.
        if (!hasRegisteredPendingSessionOnlineListener) {
            hasRegisteredPendingSessionOnlineListener = true;
        
            window.addEventListener("online", () => {
                void synchronizePendingSessionsForCurrentContext();
            });
        }

        const usableAt = performance.now();
        const renderDurationMs = usableAt - renderStartedAt;
        const bootDurationMs = usableAt - bootStartedAt;

        const buildId =
            typeof __BUILD_ID__ !== "undefined"
                ? __BUILD_ID__
                : "unknown";

        const navigationEntry =
            performance.getEntriesByType("navigation")[0] || null;

        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            window.navigator.standalone === true;

        console.log(
            `renderApp:first: ${renderDurationMs.toFixed(1)} ms`
        );

        const launchStartedAt =
            typeof window.__launchStart === "number"
                ? window.__launchStart
                : bootStartedAt;

        const preBootDurationMs =
            bootStartedAt - launchStartedAt;

        const documentToUsableDurationMs =
            usableAt - launchStartedAt;

        logAppEvent({
            type: APP_EVENTS.APP_OPENED,
            metadata: {
                role: state.currentUserRole,
                hasLinkedMember: Boolean(state.currentUserMemberId),
                restoredFromSharedWorkout: Boolean(sharedWorkoutId),

                buildId,
                standalone: isStandalone,
                navigationType: navigationEntry?.type || null,

                preBootMs: Math.round(preBootDurationMs),
                bootMs: Math.round(bootDurationMs),
                renderMs: Math.round(renderDurationMs),
                documentToUsableMs: Math.round(
                    documentToUsableDurationMs
                ),

                phases: bootPhases,

                visibilityState: document.visibilityState,
                online: navigator.onLine,
            },
        });

        //hydrateHistoricalBackblastLinks(state.currentRegionId);

        getNotificationSettings(state.currentUserId)
            .then(dbNotificationSettings => {
                state.notificationSettings = dbNotificationSettings
                    ? {
                        pushEnabled: dbNotificationSettings.push_enabled,
                        timezone: dbNotificationSettings.timezone,
                        pushSubscription: dbNotificationSettings.push_subscription,
                    }
                    : {
                        pushEnabled: false,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        pushSubscription: null,
                    };

                if (state.currentView === "settings") {
                    renderApp();
                }
            })
            .catch(error => {
                console.error("Failed to load notification settings:", error);
            });
        
        console.log(
            `bootApp: ${(performance.now() - bootStartedAt).toFixed(1)} ms`
        );

        hideBootSplash();
    } catch (error) {
        recordBootDiagnostic("boot_failed", {
            errorName: error?.name || null,
            errorMessage: error?.message || String(error),
        });

        console.error("bootApp caught an error:", error);
        console.error("bootApp error name:", error?.name || null);
        console.error("bootApp error message:", error?.message || null);
        console.error("bootApp error stack:", error?.stack || null);
        console.error("bootApp online at failure:", navigator.onLine);
        console.log(
            `bootApp FAILED: ${(performance.now() - bootStartedAt).toFixed(1)} ms`
        );

        logActionFailure("bootApp", error, {
            mode,
            sharedWorkoutId: sharedWorkoutId || null,
            currentView: state.currentView || null,
            currentUserId: state.currentUserId || null,
            currentRegionId: state.currentRegionId || null,
            profileRegionId: state.profileRegionId || null,
        });

        recordBootDiagnostic(
            "rendering_auth_after_boot_failure"
        );
        
        state.currentView = "auth";
        renderAuthView();
        hideBootSplash();
    }
}

bootApp();

export { bootApp, renderApp };