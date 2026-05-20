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
import { loadAllRegions, loadRegionData, getNotificationSettings, loadExercises } from "./services/cloudData.js";
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
    const response = await fetch("/Historic_Log.csv");
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
    const response = await fetch("/Pax_Master.csv");
    const csvText = await response.text();
    await importPaxMasterCsv(csvText);
    console.log("Pax Master import complete");
}

async function runForestImport() {
    const response = await fetch("/Forest_Log.csv");
    const csvText = await response.text();
    await importAoLogCsv(csvText, "Forest");
    console.log("Forest Import complete");
}

async function runAggielandAoImports() {
    const aoFiles = [
        ["Forest", "/Forest_Log.csv"],
        ["Cave", "/Cave_Log.csv"],
        ["Iron", "/Iron_Log.csv"],
        ["Keep", "/Keep_Log.csv"],
        ["Rock", "/Rock_Log.csv"],
        ["Mine", "/Mine_Log.csv"],
        ["Southie", "/Southie_Log.csv"],
        ["Watch", '/Watch_Log.csv'],
        ["Dads", "/Dads_Log.csv"],
        ["BlackOps", "/BlackOps_Log.csv"],
        ["CSAUP", "/CSAUP_Log.csv"],
        ["Other", "/Other_Log.csv"],
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

function autoHealQSlotsForAdmin() {
    if (state.currentUserRole !== "admin") return;
    if (state.isGeneratingQSlots) return;
    if (state.autoHealedQSlotsRegionId === state.currentRegionId) return;
    if (!state.currentRegionId) return;

    state.autoHealedQSlotsRegionId = state.currentRegionId;
    state.isGeneratingQSlots = true;

    generateQSlotsForCurrentRegion()
        .catch(error => {
            console.error("Failed to auto-heal Q slots:", error);
        })
        .finally(() => {
            state.isGeneratingQSlots = false;

            if (state.currentView !== "auth" && state.currentView !== "regionGate") {
                renderApp();
            }
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

    const [cloudData, exercises] = await Promise.all([
        loadRegionData(activeRegionId),
        loadExercises(),
    ]);

    replacePersistedData(cloudData);
    state.exercises = exercises;
    state.currentRegionId = activeRegionId;

    console.log("loaded exercises:", state.exercises.length);

    autoHealQSlotsForAdmin();

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
        let session = await getCurrentSession();

        if (!session) {
            await new Promise(resolve => setTimeout(resolve, 500));
            session = await getCurrentSession();
        }

        if (!session) {
            console.log("No session found, rendering auth");
            state.currentView = "auth";
            renderAuthView();
            hideBootSplash();
            return;
        }

        const profile = await ensureMyProfile(session.user.id);

        state.currentUserId = session.user.id;
        state.currentUserRole = profile.role || "user";
        state.currentUserDisplayName = profile.display_name || "User";
        state.profileRegionId = profile.region_id;
        state.regionOverrideId = null;
        state.currentUserMemberId = profile.member_id || null;
        state.customTemplates = profile.custom_templates || state.customTemplates;
        state.hasInitializedQSignupFilter = false;

        const [dbNotificationSettings, regions] = await Promise.all([
            getNotificationSettings(state.currentUserId),
            loadAllRegions(),
        ]);
        
        state.notificationSettings = dbNotificationSettings
            ? {
                pushEnabled: dbNotificationSettings.push_enabled,
                timezone: dbNotificationSettings.timezone,
                PushSubscription: dbNotificationSettings.push_subscription,
            }
            : {
                pushEnabled: false,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                PushSubscription: null,
            };
        
        state.availableRegions = regions || [];

        const regionLoaded = await loadActiveRegionData(profile.region_id);

        if (!regionLoaded) {
            hideBootSplash();
            return;
        }

        await logAppEvent({
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

        renderApp();
        hideBootSplash();
    } catch (error) {
        console.error("Failed to boot app:", error);

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