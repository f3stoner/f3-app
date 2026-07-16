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
import { importPaxMasterCsv, repairAggielandDeltaSessions, auditPotentialMergedMembers, auditMergedMemberDetail, splitMergedMemberByRawName, runAggielandSync } from "./services/importAggieland.js";
import { importAoLogCsv, runAggielandDeltaAoImports } from "./services/importAggieland.js";
import { getCurrentSession, ensureMyProfile } from "./services/auth.js";
import { renderAuthView } from "./views/authView.js";
import { renderMyPlanner } from "./views/myPlannerView.js";
import { groupHistoricRowsIntoSessions, parseHistoricCsvToPreview, mapGroupedSessionsToAppFormat } from "./utils/historicImport.js";
import { renderHistoricImportPreview } from "./views/historicImportPreviewView.js";
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
import { renderWeeklyQCalendarView } from "./views/weeklyQCalendarView.js";
import { generateQSlotsForCurrentRegion } from "./services/qSlotGeneration.js";
import { renderRegionInsightsView } from "./views/regionInsightsView.js";
import { renderAoInsightsView } from "./views/aoInsightsView.js";
import { triagePotentialMemberMisassignments } from "./utils/memberIdentityAudit.js";
import { renderImportRunsView } from "./views/importRunsView.js";
import { importOld300AttendanceCsv } from "./services/importOld300.js";
import { loadBackblastLinks } from "./services/cloudData.js";
import { hasPermission, PERMISSIONS, isRegionalAdmin, getManagedAoIds, managesAo } from "./utils/permissions.js";
import { renderAnnouncementManagementView } from "./views/announcementManagementView.js";
import { renderBackblastReview } from "./views/backblastReviewView.js";
import { renderThangReviewView } from "./views/thangReviewView.js";
import { renderQReadinessView } from "./views/qReadinessView.js";
import { renderQSourceManagementView } from "./views/qSourceManagementView.js";
import { renderLibraryWorkbenchView } from "./views/libraryWorkbenchView.js";
import { loadLibraryAutocompleteItems, loadLibraryFilterOptions } from "./services/libraryData.js";
import { renderAdminManagementView } from "./views/adminManagementView.js";
import { renderThirdFManagementView } from "./views/thirdFManagementView.js";
import { renderThirdFView } from "./views/thirdFView.js";
import { renderAoInsightDetailView } from "./views/aoInsightsDetailView.js";
import { renderPaxProfileView } from "./views/paxProfileView.js";
import { renderSessionAuditView } from "./views/sessionAuditView.js";
import { renderPaxCommunityView } from "./views/paxCommunity.js";
import { renderSettingsView } from "./views/settingsView.js";
import { renderOperationsCenterView } from "./views/operationsCenterView.js";

if (process.env.NODE_ENV === "development") {
window.state = state;
window.renderApp = renderApp;
window.runAggielandDeltaAoImports = runAggielandDeltaAoImports;
window.importPaxMasterCsv = importPaxMasterCsv;
window.repairAggielandDeltaSessions = repairAggielandDeltaSessions;
window.auditPotentialMergedMembers = auditPotentialMergedMembers;
window.auditMergedMemberDetail = auditMergedMemberDetail;
window.splitMergedMemberByRawName = splitMergedMemberByRawName;
window.logAppEvent = logAppEvent;
window.triagePotentialMemberMisassignments = triagePotentialMemberMisassignments;
window.runAggielandSync = runAggielandSync;
window.importOld300AttendanceCsv = importOld300AttendanceCsv;
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

async function runHistoricPreview() {
    const response = await fetch("/import/Historic_Log.csv");
    const csvText = await response.text();

    const preview = parseHistoricCsvToPreview(csvText);
    const grouped = groupHistoricRowsIntoSessions(preview.parsedRows);
    const converted = mapGroupedSessionsToAppFormat(grouped, state.members);

    console.log("Converted Sessions:", converted.sessions.length);
    console.log("Missing Pax:", converted.missingPax);

    state._historicImport = converted;

    renderHistoricImportPreview(preview, converted);
}

async function runPaxImport() {
    const response = await fetch("/import/Pax_Master.csv");
    const csvText = await response.text();
    await importPaxMasterCsv(csvText);
    console.log("Pax Master import complete");
}

async function runForestImport() {
    const response = await fetch("/import/Forest_Log.csv");
    const csvText = await response.text();
    await importAoLogCsv(csvText, "Forest");
    console.log("Forest Import complete");
}

async function runAggielandAoImports() {
    const aoFiles = [
        ["Forest", "/import/Forest_Log.csv"],
        ["Cave", "/import/Cave_Log.csv"],
        ["Iron", "/import/Iron_Log.csv"],
        ["Keep", "/import/Keep_Log.csv"],
        ["Rock", "/import/Rock_Log.csv"],
        ["Mine", "/import/Mine_Log.csv"],
        ["Southie", "/import/Southie_Log.csv"],
        ["Watch", '/import/Watch_Log.csv'],
        ["Dads", "/import/Dads_Log.csv"],
        ["BlackOps", "/import/BlackOps_Log.csv"],
        ["CSAUP", "/import/CSAUP_Log.csv"],
        ["Other", "/import/Other_Log.csv"],
    ];

    for (const [aoName, path] of aoFiles) {
        const response = await fetch(path);
        const csvText = await response.text();
        await importAoLogCsv(csvText, aoName);
        console.log(`${aoName} import complete`);
    }

    console.log("All AO imports complete");
}

let lastRenderedView = null;

function renderApp() {

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
        renderWeeklyQCalendarView();
    } else if (state.currentView === "regionInsights") {
        renderRegionInsightsView();
    } else if (state.currentView === "aoInsights") {
        renderAoInsightsView();
    } else if (state.currentView === "importRuns") {
        renderImportRunsView();
    } else if (state.currentView === "announcementManagement") {
        renderAnnouncementManagementView();
    } else if (state.currentView === "backblastReview") {
        renderBackblastReview();
    } else if (state.currentView === "thangReview") {
        renderThangReviewView();
    } else if (state.currentView === "qReadiness") {
        renderQReadinessView();
    } else if (state.currentView === "qSourceManagement") {
        renderQSourceManagementView();
    } else if (state.currentView === "libraryWorkbench") {
        renderLibraryWorkbenchView();
    } else if (state.currentView === "adminManagement") {
        renderAdminManagementView();
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
        renderOperationsCenterView();
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
        
        logAppEvent({
            type: APP_EVENTS.APP_OPENED,
            metadata: {
                role: state.currentUserRole,
                hasLinkedMember: Boolean(state.currentUserMemberId),
                restoredFromSharedWorkout: Boolean(sharedWorkoutId),
            },
        });

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

        console.log(
            `renderApp:first: ${(performance.now() - renderStartedAt).toFixed(1)} ms`
        );

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
        
        console.log(
            `Launch: app usable ${
                (
                    performance.now() -
                    (window.__launchStart ?? bootStartedAt)
                ).toFixed(1)
            } ms`
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

console.log(
    `Launch: before bootApp ${
        (
            performance.now() -
            (window.__launchStart ?? performance.now())
        ).toFixed(1)
    } ms`
);

bootApp();

export { bootApp, renderApp };