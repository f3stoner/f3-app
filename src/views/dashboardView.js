import { state } from "../modules/state.js";
import { bootApp, renderApp } from "../index.js";
import { formatShortDate, formatDate, getTodayDate } from "../utils/date.js";
import { importData } from "../utils/importData.js";
import { exportState } from "../utils/export.js";
import { createGlobalNav } from "../components/globalNav.js";
import { signOut } from "../services/auth.js";
import { checkRegionAccess, loadRegionData } from "../services/cloudData.js";
import { replacePersistedData } from "../services/appData.js";

export function renderDashboard() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = state.regionName || "F3 App";

    let regionSwitcher = null;
    let regionSwitcherLabel = null;

    if (state.currentUserRole === "admin" && state.availableRegions?.length) {
        regionSwitcherLabel = document.createElement("div");
        regionSwitcherLabel.classList.add("detail-label");
        regionSwitcherLabel.textContent = "Debug Region";
        
        regionSwitcher = document.createElement("select");

        const profileOption = document.createElement("option");
        profileOption.value = "";
        profileOption.textContent = "Use Profile Region";
        regionSwitcher.appendChild(profileOption);

        state.availableRegions.forEach(region => {
            const option = document.createElement("option");
            option.value = region.id;
            option.textContent = region.name;
            regionSwitcher.appendChild(option);
        });

        regionSwitcher.value = state.regionOverrideId || "";

        regionSwitcher.addEventListener("change", async (event) => {
            
            const selected = event.target.value;

            state.regionOverrideId = selected || null;

            const activeRegionId = state.regionOverrideId || state.profileRegionId;
            state.currentRegionId = activeRegionId;

            const access = await checkRegionAccess(state.currentUserId, activeRegionId);

            if (!access) {
                const region = state.availableRegions.find(r => r.id === activeRegionId);
                state.regionName = region?.name || state.regionName;
                state.currentView = "regionGate";
                renderApp();
                return;
            }

            const cloudData = await loadRegionData(activeRegionId);
            replacePersistedData(cloudData);
            
            console.log("Switching to Region:", activeRegionId);

            renderApp();
        });
}

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
            localStorage.removeItem("f3AppState");
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
            state.currentRegionId = null;
            state.profileRegionId = null;
            state.regionOverrideId = null;
            state.availableRegions = [];
            state.qSignupAoFilter = "all";
            state.qSignupOpenOnly = false;
            state.currentUserMemberId = null;
            state.claimingMemberId = null;

            await bootApp();
        } catch (error) {
            console.error("Failed to sign out:", error);
            alert("Failed to sign out.");
        }
    });

    const isAdmin = state.currentUserRole === "admin";

    function findMatchingPlannedWorkoutForSlot(slot) {
        const ao = state.aos.find(a => a.id === slot.aoId);

        return state.plannedWorkouts.find(workout => 
            workout.date === slot.date &&
            workout.createdByUserId === state.currentUserId &&
            workout.aoName === ao?.name
        );
    }

    function getMyUpcomingQSlots() {
        const today = getTodayDate();

        return state.qSlots
            .filter(slot =>
                slot.qUserId === state.currentUserMemberId &&
                slot.date >= today
            )
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    const today = getTodayDate();
    const myUpcomingQSlots = getMyUpcomingQSlots();
    const nextQSlot = myUpcomingQSlots[0] || null;

    let nextQSection = null;

    if (nextQSlot) {
        const ao = state.aos.find(a => a.id === nextQSlot.aoId);
        const matchingWorkout = findMatchingPlannedWorkoutForSlot(nextQSlot);
        const hasPlannedWorkout = Boolean(matchingWorkout);
        const isTodayQ = nextQSlot.date === today;

        nextQSection = document.createElement("div");
        nextQSection.classList.add("section");

        const nextQHeading = document.createElement("div");
        nextQHeading.classList.add("detail-label");
        nextQHeading.textContent = "Your Next Q";

        const nextQCard = document.createElement("div");
        nextQCard.classList.add("member-card");

        const nextQCardContent = document.createElement("div");

        const nextQTitle = document.createElement("div");
        nextQTitle.classList.add("member-name");
        nextQTitle.textContent = isTodayQ
            ? `You are Qing today at ${ao?.name || "Unknown AO"}`
            : `You are Qing at ${ao?.name || "Unknown AO"}`;

        const nextQSubtitle = document.createElement("div");
        nextQSubtitle.classList.add("stats-line");

        if (isTodayQ) {
            nextQSubtitle.textContent = hasPlannedWorkout
                ? (matchingWorkout.title || "BD Ready")
                : "No workout planned";
        } else {
            nextQSubtitle.textContent = ao?.time
                ? `${formatShortDate(nextQSlot.date)} • ${ao.time}`
                : formatShortDate(nextQSlot.date);
        }

        const nextQPreview = document.createElement("div");
        nextQPreview.classList.add("stats-line");
        nextQPreview.textContent = hasPlannedWorkout
            ? "BD Ready"
            : "No workout planned";

        nextQCardContent.append(nextQTitle, nextQSubtitle, nextQPreview);

        const actionButton = document.createElement("button");
        actionButton.classList.add("primary-button");

        if (!hasPlannedWorkout) {
            actionButton.textContent = "Plan Workout";

            actionButton.addEventListener("click", (event) => {
                event.stopPropagation();

                state.draftPlannedWorkout = {
                    id: crypto.randomUUID(),
                    date: nextQSlot.date,
                    aoName: ao?.name || "",
                    title: "",
                    introduction: "",
                    warmorama: "",
                    thangs: "",
                    finisher: "",
                    notes: "",
                    sourceWorkoutId: null,
                    sourceSessionId: null,
                    createdAt: Date.now(),
                    lastModifiedAt: null,
                    createdByUserId: state.currentUserId,
                    isShared: false,
                };

                state.editingPlannedWorkoutId = null;
                state.currentView = "workoutPlanner";
                renderApp();
            });
        } else if (isTodayQ) {
            actionButton.textContent = "Start Today's Workout";

            actionButton.addEventListener("click", (event) => {
                event.stopPropagation();
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = "execution";
                state.currentView = "plannedWorkoutDetail";
                renderApp();
            });
        } else {
            actionButton.textContent = "View Workout";

            actionButton.addEventListener("click", (event) => {
                event.stopPropagation();
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = null;
                state.currentView = "plannedWorkoutDetail";
                renderApp();
            });
        }

        nextQCard.addEventListener("click", () => {
            if (!hasPlannedWorkout) {
                state.draftPlannedWorkout = {
                    id: crypto.randomUUID(),
                    date: nextQSlot.date,
                    aoName: ao?.name || "",
                    title: "",
                    introduction: "",
                    warmorama: "",
                    thangs: "",
                    finisher: "",
                    notes: "",
                    sourceWorkoutId: null,
                    sourceSessionId: null,
                    createdAt: Date.now(),
                    lastModifiedAt: null,
                    createdByUserId: state.currentUserId,
                    isShared: false,
                };

                state.editingPlannedWorkoutId = null;
                state.currentView = "workoutPlanner";
            } else {
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = isTodayQ ? "execution" : null;
                state.currentView = "plannedWorkoutDetail";
            }

            renderApp();
        });

        nextQCard.append(nextQCardContent, actionButton);
        nextQSection.append(nextQHeading, nextQCard);
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

    const qSignupButton = document.createElement("button");
    qSignupButton.classList.add("quick-access-card");
    qSignupButton.textContent = "Q Signup";
    qSignupButton.addEventListener("click", () => {
        state.currentView = "qSignup";
        renderApp();
    });

    quickAccessRow.append(workoutLibraryButton, qSignupButton, rosterButton);

    function renderMyUpcomingQs() {
        const mySlots = myUpcomingQSlots.slice(1);

        const section = document.createElement("div");
        section.classList.add("section");

        const heading = document.createElement("div");
        heading.textContent = "My Upcoming Qs";
        heading.classList.add("detail-label");
        section.appendChild(heading); 

        if (mySlots.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No other upcoming Qs."
            section.appendChild(empty);
            return section;
        }

        mySlots.forEach(slot => {
            const row = document.createElement("div");
            row.classList.add("selected-summary-row");

            const ao = state.aos.find(a => a.id === slot.aoId);
            const hasPlannedWorkout = state.plannedWorkouts.some(workout =>
                workout.date === slot.date &&
                workout.createdByUserId === state.currentUserId &&
                workout.aoName === ao?.name
            );

            const title = document.createElement("div");
            title.classList.add("member-name");
            title.textContent = `${formatDate(slot.date)} - ${ao?.name || "Unknown AO"}`;

            const status = document.createElement("div");
            status.classList.add("stats-line");
            status.textContent = hasPlannedWorkout ? "BD Ready" : "No workout planned";
            row.append(title, status);

            section.appendChild(row);
        });

        return section;
    }

    const myUpcomingQsSection = renderMyUpcomingQs();

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
            const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

            const qNames = effectiveQIds
                .map(qId => state.members.find(m => m.id === qId))
                .filter(Boolean)
                .map(member => member.paxName);
            
            const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";
            const sessionDetail = document.createElement("div");
            sessionDetail.classList.add("member-card", "session-history-card");

            const topLine = document.createElement("div");
            topLine.classList.add("member-name");
            topLine.textContent = `${formatDate(session.date)} · ${session.aoName}`;

            const qLine = document.createElement("div");
            qLine.classList.add("stats-line", "q-line");
            qLine.textContent = `Q: ${qLabel}`;

            const summaryLine = document.createElement("div");
            summaryLine.classList.add("stats-line");
            summaryLine.textContent = `${session.attendeeIds.length} PAX · ${session.fngs.length} FNGs`;

            sessionDetail.append(topLine, qLine, summaryLine);
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

    const stalePaxButton = document.createElement("button");
    stalePaxButton.textContent = "Review Stale PAX";
    stalePaxButton.addEventListener("click", () => {
        state.currentView = "stalePax";
        renderApp();
    });

    const manageAosButton = document.createElement("button");
    manageAosButton.textContent = "Manage AOs";
    manageAosButton.addEventListener("click", () => {
        state.currentView = "aoManagement";
        renderApp();
    })

    const dataToolsHeading = document.createElement("div");
    dataToolsHeading.textContent = "Data Tools";
    dataToolsHeading. classList.add("detail-label");

    const dataToolsRow = document.createElement("div");
    dataToolsRow.classList.add("button-row");

    userRow.append(userLeft, signOutButton);

    if(isAdmin){
    dataToolsRow.append(importButton, exportButton, manageAosButton, stalePaxButton);
    }

    const nav = createGlobalNav();

    app.append(
        title, 
        ...(regionSwitcherLabel ? [regionSwitcherLabel] : []),
        ...(regionSwitcher ? [regionSwitcher] : []),
        userRow,
        ...(nextQSection ? [nextQSection] : []), 
        quickAccessHeading, 
        quickAccessRow, 
        myUpcomingQsSection);

    if (isAdmin) {
        app.append(dataToolsHeading, dataToolsRow, importInput);
    }
    app.append(recentSessionsSection, nav);
}