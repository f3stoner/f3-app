import { loadState } from "../utils/storage.js";
import { seedMembers } from "../data/seedMembers.js";
import { insertSessionsBatch } from "../services/cloudData.js";

const savedState = loadState();

export const state = {
    regionName: savedState?.regionName || "F3 Old 300",
    members: savedState?.members || [...seedMembers],
    sessions: savedState?.sessions || [],
    currentView: "dashboard",
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
    sharedWorkoutViewMode: false,
    editingWorkoutTimerId: null,
    editingWorkoutTimerSection: null,
    activeWorkoutTimerId: null,
    activeWorkoutTimerStatus: "idle",
    activeWorkoutTimerStartedAt: null,
    activeWorkoutTimerRemainingSeconds: null,
    activeWorkoutTimerPhase: null,
    activeWorkoutTimerRound: null,
    savedPlannerSections: [],
    plannerSectionModalOpen: false,
    plannerSectionModalType: null,
    plannerSectionModalTarget: null,
    sessionHistoryFilterType: "all",
    sessionHistoryAoFilter: "",
    sessionHistoryQFilter: "",
};

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