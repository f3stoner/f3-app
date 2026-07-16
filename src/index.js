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
import { saveNavState, getRestoredNavState } from "./utils/storage.js";
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

if (process.env.NODE_ENV === "development") {
    window.state = state;
    window.renderApp = renderApp;
    window.logAppEvent = logAppEvent;

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

if ("serviceWorker" in navigator) {
    const swPath =
        process.env.NODE_ENV === "production"
            ? "/f3-app/sw.js"
            : "/sw.js";
    navigator.serviceWorker.register(swPath)
        .then(() => console.log("SW registered"))
        .catch(err => console.error("SW registration failed:", err));
}

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
    "backblastReview",
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

    state.editingPlannedWorkoutId = null;
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

    backblastReview: () =>
        import(
            /* webpackChunkName: "route-backblast-review" */
            "./views/backblastReviewView.js"
        ).then(module => module.renderBackblastReview),

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
        backblastReview: "Backblast Review",
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
    } else if (state.currentView === "backblastReview") {
        renderLazyRoute(
            "backblastReview",
            currentRenderSequence
        );
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

async function loadActiveRegionData(profileRegionId) {
    const activeRegionId = profileRegionId;

    const access = await checkRegionAccess(state.currentUserId, activeRegionId);

    if (!access) {
        state.currentRegionId = activeRegionId;
        const region = state.availableRegions.find(r => r.id === activeRegionId);
        state.regionName = region?.name || "";
        state.currentView = "regionGate";
        renderApp();
        return false;
    }

    const cloudData = await loadRegionData(activeRegionId);

    const replaceStartedAt = performance.now();

    replacePersistedData(cloudData);

    console.log(
        `replacePersistedData: ${(performance.now() - replaceStartedAt).toFixed(1)} ms`
    );

    state.currentRegionId = activeRegionId;

    Promise.all([
        loadLibraryAutocompleteItems(),
        loadLibraryFilterOptions(),
    ])
        .then(([items, filterOptions]) => {
            state.libraryItems = items;
            state.libraryFilterOptions = filterOptions;
            state.hasLoadedLibraryItems = true;
        })
        .catch(error => {
            console.warn("Failed to load library data:", error);
        });

    loadExercises()
        .then(exercises => {
            state.exercises = exercises;
        })
        .catch(error => {
            console.error("Failed to load exercises:", error);
        });

    return true;
}

function getSharedWorkoutIdFromUrl() {
    const hash = window.location.hash;
    const hashQueryString = hash.includes("?") ? hash.split("?")[1] : "";
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hashQueryString);

    return searchParams.get("workoutId") || hashParams.get("workoutId");
}

async function bootApp() {
    const bootStartedAt = performance.now();

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
        console.time("getCurrentSession");
        let session = await getCurrentSession();
        console.timeEnd("getCurrentSession");

        if (!session) {
            await new Promise(resolve => setTimeout(resolve, 500));
            session = await getCurrentSession();
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

        console.time("ensureMyProfile");
        const profile = await ensureMyProfile(session.user.id, session);
        console.timeEnd("ensureMyProfile");

        state.currentUserId = session.user.id;
        state.currentUserRole = profile.role || "pax";
        state.currentUserDisplayName = profile.display_name || "User";
        state.currentUserProfileId = profile.id;
        state.profileRegionId = profile.region_id;
        state.regionOverrideId = null;
        state.currentUserMemberId = profile.member_id || null;
        state.customTemplates = profile.custom_templates || state.customTemplates;
        state.hasInitializedQSignupFilter = false;

        console.time("settings-and-regions");
        const regions = await loadAllRegions();
        console.timeEnd("settings-and-regions");
                
        state.availableRegions = regions || [];
        
        const [
            regionLoaded,
            profileAoPermissions,
            profileRegionPositions,
        ] = await Promise.all([
            loadActiveRegionData(profile.region_id),
            loadProfileAoPermissions(profile.region_id),
            loadProfileRegionPositions(profile.region_id),
        ]);
        
        if (!regionLoaded) {
            console.log(
                `bootApp: ${(performance.now() - bootStartedAt).toFixed(1)} ms`
            );

            hideBootSplash();
            return;
        }

        state.profileAoPermissions = profileAoPermissions || [];
        state.profileRegionPositions = profileRegionPositions || [];

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

        logAppEvent({
            type: APP_EVENTS.APP_OPENED,
            metadata: {
                role: state.currentUserRole,
                hasLinkedMember: Boolean(state.currentUserMemberId),
                restoredFromSharedWorkout: Boolean(sharedWorkoutId),

                buildId,
                standalone: isStandalone,
                navigationType: navigationEntry?.type || null,

                preBootMs: Math.round(bootStartedAt),
                bootMs: Math.round(bootDurationMs),
                renderMs: Math.round(renderDurationMs),
                documentToUsableMs: Math.round(usableAt),

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

        renderAuthView();
        hideBootSplash();
    }
}

bootApp();

export { bootApp, renderApp };