import { state } from "./modules/state.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderRoster } from "./views/rosterView.js";
import { renderSession } from "./views/sessionView.js";
import { renderSessionHistory } from "./views/sessionHistoryView.js";
import "./styles/main.css";
import { renderSessionDetail } from "./views/sessionDetailView.js";
import { renderMemberDetail } from "./views/memberDetailView.js";
import { renderMemberEdit } from "./views/memberEditView.js";
import { importData } from "./utils/importData.js";
import { renderWorkoutPlanner } from "./views/workoutPlannerView.js";
import { renderPlannedWorkoutsList } from "./views/plannedWorkoutsListView.js";
import { renderPlannedWorkoutDetail } from "./views/plannedWorkoutDetailView.js";
import { replacePersistedData } from "./services/appData.js";
import { loadRegionData } from "./services/cloudData.js";
import { REGION_ID } from "./config.js";
import { importPaxMasterCsv } from "./services/importAggieland.js";
import { importAoLogCsv } from "./services/importAggieland.js";
import { getCurrentSession, ensureMyProfile } from "./services/auth.js";
import { renderAuthView } from "./views/authView.js";
import { renderMyPlanner } from "./views/myPlannerView.js";
import { groupHistoricRowsIntoSessions, parseHistoricCsvToPreview, mapGroupedSessionsToAppFormat } from "./utils/historicImport.js";
import { renderHistoricImportPreview } from "./views/historicImportPreviewView.js";
import { renderStalePaxView } from "./views/stalePaxView.js";

window.state = state;

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

function renderApp() {
    
    console.log("SUPABASE URL:", process.env.SUPABASE_URL);

    if (state.currentView === "roster") {
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
    } else {
        renderDashboard ();
    }
}
async function bootApp() {
    try {
        console.log("bootApp starting");

        let session = await getCurrentSession();
        console.log("bootApp session 1:", session);

        if (!session) {
            await new Promise(resolve => setTimeout(resolve, 500));
            session = await getCurrentSession();
            console.log("bootApp session 2:", session);
        }

        if (!session) {
            console.log("No session found, rendering auth");
            renderAuthView();
            return;
        }

        const profile = await ensureMyProfile("96c9eef9-3b6e-4365-86cd-51dbeccf231a");
        console.log("bootApp profile:", profile);

        state.currentUserId = session.user.id;
        state.currentUserRole = profile.role || "user";
        state.currentUserDisplayName = profile.display_name || "User";

        const cloudData = await loadRegionData(profile.region_id);
        console.log("bootApp cloudData:", cloudData);

        replacePersistedData(cloudData);
        renderApp();
    } catch (error) {
        console.error("Failed to boot app:", error);
        renderAuthView();
    }
}

bootApp();

export { bootApp, renderApp };