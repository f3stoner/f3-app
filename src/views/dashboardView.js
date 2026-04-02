import { state } from "../modules/state.js";
import { bootApp, renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { importData } from "../utils/importData.js";
import { exportState } from "../utils/export.js";
import { createGlobalNav } from "../components/globalNav.js";
import { signOut } from "../services/auth.js";

export function renderDashboard() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = state.regionName || "F3 App";

    const userRow = document.createElement("div");
    userRow.classList.add("user-row");

    const roleBadge = document.createElement("span");
    roleBadge.classList.add("role-badge");
    roleBadge.dataset.role = state.currentUserRole;
    roleBadge.textContent = state.currentUserRole === "admin" ? "Admin" : "User";

    const userName = document.createElement("span");
    userName.classList.add("user-name");
    userName.textContent = state.currentUserDisplayName || "User";

    const userLeft = document.createElement("div");
    userLeft.classList.add("user-left");
    userLeft.append(roleBadge, userName);

    const signOutButton = document.createElement("button");
    signOutButton.textContent = "Sign Out";

    signOutButton.addEventListener("click", async () => {
        try{
            await signOut();

            state.regionName = "";
            state.members = [];
            state.sessions = [];
            state.plannedWorkouts = [];
            state.currentUserId = null;
            state.currentUserRole = null;
            state.currentUserDisplayName = null;
            state.selectedMemberId = null;
            state.selectedSessionId = null;
            state.selectedPlannedWorkoutId = null;
            state.editingMemberId = null;
            state.editingSessionId = null;
            state.editingPlannedWorkoutId = null;
            state.draftSession = null;
            state.currentView = "dashboard";

            await bootApp();
        } catch (error) {
            console.error("Failed to sign out:", error);
            alert("Failed to sign out.");
        }
    });

    const isAdmin = state.currentUserRole === "admin";

    const today = getTodayDate();

    const todaysWorkout = state.plannedWorkouts.find(workout => 
        workout.date === today &&
        workout.createdByUserId === state.currentUserId
    );

    let todaySection = null;

    if (todaysWorkout) {
        todaySection = document.createElement("div");
        todaySection.classList.add("section");

        const todayHeading = document.createElement("div");
        todayHeading.classList.add("detail-label");
        todayHeading.textContent = "Today";

        const todayCard = document.createElement("div");
        todayCard.classList.add("member-card");

        const todayCardContent = document.createElement("div");

        const todayTitle = document.createElement("div");
        todayTitle.classList.add("member-name");
        todayTitle.textContent = `You are Qing today at ${todaysWorkout.aoName}`;

        const todaySubtitle = document.createElement("div");
        todaySubtitle.classList.add("stats-line");
        todaySubtitle.textContent = todaysWorkout.title || "Workout planned";

        const todayPreview = document.createElement("div");
        todayPreview.classList.add("stats-line");
        todayPreview.textContent = todaysWorkout.thangs
            ? todaysWorkout.thangs.split("\n")[0]
            : (todaysWorkout.notes ? todaysWorkout.notes.split("\n")[0] : "Ready to run");
        
        todayCardContent.append(todayTitle, todaySubtitle, todayPreview);

        const startButton = document.createElement("button");
        startButton.textContent = "Start Today's Workout";
        startButton.classList.add("quick-start-button");
        startButton.addEventListener("click", (event) => {
            event.stopPropagation();
            state.selectedPlannedWorkoutId = todaysWorkout.id;
            state.plannedWorkoutLaunchMode = "execution";
            state.currentView = "plannedWorkoutDetail";
            renderApp();
        });

        todayCard.addEventListener("click", () => {
            state.selectedPlannedWorkoutId = todaysWorkout.id;
            state.plannedWorkoutLaunchMode = "execution";
            state.currentView = "plannedWorkoutDetail";
            renderApp();
        });

        todayCard.append(todayCardContent, startButton);
        todaySection.append(todayHeading, todayCard);
    }

    const quickAccessHeading = document.createElement("div");
    quickAccessHeading.textContent = "Quick Access";
    quickAccessHeading.classList.add("detail-label");

    const quickAccessRow = document.createElement("div");
    quickAccessRow.classList.add("quick-access-row");

    const workoutLibraryButton = document.createElement("button");
    workoutLibraryButton.classList.add("quick-access-card");
    workoutLibraryButton.textContent = "Workout Library";
    workoutLibraryButton.addEventListener("click", () => {
        state.currentView = "plannedWorkoutList";
        renderApp();
    });

    const rosterButton = document.createElement("button");
    rosterButton.classList.add("quick-access-card");
    rosterButton.textContent = "Roster";
    rosterButton.addEventListener("click", () => {
        state.currentView = "roster";
        renderApp()
    });

    quickAccessRow.append(workoutLibraryButton, rosterButton);

    const recentSessionsSection = document.createElement("div");
    const recentHeading = document.createElement("h2");
    const recentSessionList = document.createElement("div");
    recentHeading.textContent = "Recent Sessions";
    recentSessionsSection.append(recentHeading);
    const sortedSessions = [...state.sessions].sort((a,b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
        }

        const aCreatedAt = a.createdAt || 0;
        const bCreatedAt = b.createdAt || 0;

        return bCreatedAt - aCreatedAt;
    })
    if (state.sessions.length === 0) {
        recentSessionList.textContent = "No sessions saved yet";
    } else {
        sortedSessions.slice(0, 3).forEach((session) => {
            const sessionDetail = document.createElement("div");
            const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

            const qNames = effectiveQIds
                .map(qId => state.members.find(m => m.id === qId))
                .filter(Boolean)
                .map(member => member.paxName);
            
            const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";
            sessionDetail.textContent = `${formatDate(session.date)} - ${session.aoName} | Q: ${qLabel} | ${session.attendeeIds.length} PAX | ${session.fngs.length} FNGs`;
            sessionDetail.classList.add("section");
            sessionDetail.classList.add("member-card");
            sessionDetail.addEventListener("click", () => {
                state.selectedSessionId = session.id;
                state.currentView = "sessionDetail";
                renderApp();
            })
            recentSessionList.appendChild(sessionDetail);
        })
    }
    recentSessionsSection.append(recentSessionList);

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json";
    importInput.style.display = "none";

    const importButton = document.createElement("button");
    importButton.textContent = "Import Data";

    importButton.addEventListener("click", () => {
        importInput.click();
    });

    importInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            importData(data);
            renderApp();
        } catch (error) {
            console.error("Import failed:", error);
            alert("Import failed. Please choose a valid JSON file.");
        }

        importInput.value = "";
    })

    const exportButton = document.createElement("button");
    exportButton.textContent = "Export Data";

    exportButton.addEventListener("click", () => {
        exportState(state);
        alert("Data exported!");
    });

    const dataToolsHeading = document.createElement("div");
    dataToolsHeading.textContent = "Data Tools";
    dataToolsHeading. classList.add("detail-label");

    const dataToolsRow = document.createElement("div");
    dataToolsRow.classList.add("button-row");

    userRow.append(userLeft, signOutButton);

    if(isAdmin){
    dataToolsRow.append(importButton, exportButton);
    }

    const nav = createGlobalNav();

    app.append(title, userRow, ...(todaySection ? [todaySection] : []), quickAccessHeading, quickAccessRow);

    if (isAdmin) {
        app.append(dataToolsHeading, dataToolsRow, importInput);
    }
    app.append(recentSessionsSection, nav);
}