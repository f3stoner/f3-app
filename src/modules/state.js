import { loadState, loadNavState } from "../utils/storage.js";
import { seedMembers } from "../data/seedMembers.js";
import { insertSessionsBatch } from "../services/cloudData.js";

const savedState = loadState();
const savedNav = loadNavState();

const RESTORABLE_VIEWS = new Set([
    "dashboard",
    "myPlanner",
    "plannedWorkoutDetail",
    "plannedWorkoutList",
    "workoutPlanner",
    "sessionHistory",
    "roster",
    "preblast",
    "qSignup",
]);

const restoredView = RESTORABLE_VIEWS.has(savedNav?.currentView)
    ? savedNav.currentView
    : "dashboard";

export const state = {
    regionName: savedState?.regionName || "F3 Old 300",
    members: savedState?.members || [...seedMembers],
    sessions: savedState?.sessions || [],
    currentView: restoredView,
    viewHistory: [],
    selectedSessionId: null,
    editingSessionId: null,
    selectedMemberId: null,
    editingMemberId: null,
    sessionSearchTerm: "",
    sessionShowAllOthers: false,
    sessionShowAllRecent: false,
    sessionSelectedExpanded: false,
    sessionQExpanded: false,
    sessionHistorySearchTerm: "",
    plannedWorkouts: savedState?.plannedWorkouts || [],
    showMyPlannedWorkoutsOnly: false,
    selectedPlannedWorkoutId: null,
    editingPlannedWorkoutId: null,
    draftPlannedWorkout: null,
    rosterSearchTerm: "",
    draftSession: null,
    currentUserId: null,
    currentUserRole: null,
    currentUserDisplayName: null,
    currentRegionId: null,
    _historicImport: null,
    runHistoricImport: null,
    plannedWorkoutLaunchMode: null,
    stalePaxThresholdDays: 180,
    stalePaxSearchTerm: "",
    aos: savedState?.aos || [],
    qSlots: savedState?.qSlots || [],
    homeAoId: savedState?.homeAoId || null,
    favoriteAoIds: savedState?.favoriteAoIds || null,
    regionOverrideId: savedState?.regionOverrideId || null,
    availableRegions: [],
    profileRegionId: savedState?.profileRegionId || null,
    selectedAoId: null,
    editingAoId: null,
    qSignupAoFilter: savedState?.qSignupAoFilter || "",
    qSignupOpenOnly: savedState?.qSignupOpenOnly ?? false,
    draftPreblastText: "",
    selectedPreblastWorkoutId: null,
    currentUserMemberId: null,
    claimingMemberId: null,
    claimMemberSearchTerm: "",
    draftPreblastMediaFiles: [],
    draftBackblastMediaFiles: [],
    draftBackblastText: "",
    notificationSettings: null,
    sentNotificationKeys: savedState?.sentNotificationKeys || [],
    customTemplates: savedState?.customTemplates || {
        preblast: {
            activeTemplateId: "default",
            savedTemplates: [],
        },
        backblast: {
            activeTemplateId: "default",
            savedTemplates: [],
        },
    },
    returnToViewAfterPlanner: null,
    returnToLaunchModeAfterPlanner: null,
    workoutBrowseModalOpen: false,
    selectedWorkoutPreviewId: null,
    workoutBrowseMode: "list",
    workoutBrowseScrollTop: 0,
    toastMessage: null,
    toastType: "info",
    adminFlags: savedState?.adminFlags || [],
};

if (savedNav) {
    state.selectedPlannedWorkoutId = savedNav.selectedPlannedWorkoutId || null;
    state.editingPlannedWorkoutId = savedNav.editingPlannedWorkoutId || null;
    state.plannedWorkoutLaunchMode = savedNav.plannedWorkoutLaunchMode || null;
    state.selectedSessionId = savedNav.selectedSessionId || null;
    state.editingSessionId = savedNav.editingSessionId || null;
    state.selectedPreblastWorkoutId = savedNav.selectedPreblastWorkoutId || null;
}

state.runHistoricImport = async function () {
    if (!state._historicImport) {
        console.error("No historic import data found");
        return;
    }

    if (state.sessions.length > 0) {
        const confirmed = confirm("This region already has sessions. Import may create duplicates. Continue?");
        if (!confirmed) return;
    }

    const { sessions } = state._historicImport;

    console.log("Uploading sessions:", sessions.length);

    const batchSize = 250; // or whatever you're using
    const totalBatches = Math.ceil(sessions.length / batchSize);
    
    for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize;
        const end = start + batchSize;
    
        const batch = sessions.slice(start, end);
    
        console.log(`Uploading batch ${i} with size ${batch.length}`);
    
        await insertSessionsBatch(state.currentRegionId, batch);
    }

    state.sessions = [...state.sessions, ...sessions];
    state._historicImport = null;

    console.log("Import complete");
};