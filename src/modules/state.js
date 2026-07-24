import { loadState } from "../utils/storage.js";
import { seedMembers } from "../data/seedMembers.js";
import { insertSessionsBatch } from "../services/cloudData.js";

// Home region never changes because of navigation.
//
// Active region determines the regional workspace.
//
// Accessible regions determine which workspaces
// may become active.

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
    draftPlannedWorkout: null,
    rosterSearchTerm: "",
    draftSession: null,
    currentUserId: null,
    currentUserRole: null,
    currentUserDisplayName: null,
    
    profileAoPermissions: [],
    profileRegionPositions: [],
    _historicImport: null,
    runHistoricImport: null,
    plannedWorkoutLaunchMode: null,
    stalePaxThresholdDays: 180,
    stalePaxSearchTerm: "",
    aos: savedState?.aos || [],
    sites: savedState?.sites || [],
    qSlots: savedState?.qSlots || [],
    homeAoId: savedState?.homeAoId || null,
    favoriteAoIds: savedState?.favoriteAoIds || null,

    // Legacy region state (temporary during workspace refactor)
    currentRegionId: null,
    profileRegionId: savedState?.profileRegionId || null,
    regionOverrideId: savedState?.regionOverrideId || null,
    
    // New workspace model
    homeRegionId: savedState?.homeRegionId || null,
    activeRegionId: savedState?.activeRegionId || null,
    pendingRegionId: null,
    workspaceGeneration: 0,
    accessibleRegionIds: savedState?.accessibleRegionIds || [],
    accessibleRegions: [],

    availableRegions: [],

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
    adminFlags: [],
    hasLoadedAdminFlags: false,
    isLoadingAdminFlags: false,
    adminFlagsLoadError: null,
    operationsOverviewScope: "all",
    operationsOverviewByScope: {},
    operationsOverviewLoadingScope: null,
    operationsOverviewErrorsByScope: {},
    sharedWorkoutViewMode: false,
    editingWorkoutTimerId: null,
    editingWorkoutTimerSection: null,
    activeWorkoutTimerId: null,
    activeWorkoutTimerStatus: "idle",
    activeWorkoutTimerStartedAt: null,
    activeWorkoutTimerRemainingSeconds: null,
    activeWorkoutTimerPhase: null,
    activeWorkoutTimerRound: null,
    activeWorkoutTimerDeadlineAt: null,
    activeWorkoutTimerLastEmomMinute: 0,
    savedPlannerSections: [],
    plannerSectionModalOpen: false,
    plannerSectionModalType: null,
    plannerSectionModalTarget: null,
    sessionHistoryFilterType: "all",
    sessionHistoryAoFilter: "",
    sessionHistoryQFilter: "",
    workoutFieldLabels: savedState?.workoutFieldLabels || {},
    pendingPlannerDate: null,
    pendingPlannerAoName: null,
    executionContext: {
        plannedWorkoutId: null,
        launchSource: null,
        startedAt: null,
        executionDate: null,
        allowSessionLogging: true,
    },
    weeklyQCalendarStartDate: null,
    weatherByAoDate: {},
    rosterFilter: null,
    exercises: [],
    isMainMenuOpen: false,
    isWorkspaceMenuOpen: false,
    announcements: [],
    allAnnouncements: [],
    memberStats: [],
    memberStatsByMemberId: {},
    libraryWorkbenchItems: [],
    hasLoadedLibraryWorkbenchItems: false,
    isLoadingLibraryWorkbenchItems: false,
    libraryWorkbenchStatusFilter: "imported",
    libraryWorkbenchTypeFilter: "all",
    libraryWorkbenchSearch: "",
    selectedLibraryWorkbenchItemId: null,
    libraryItems: [],
    hasLoadedLibraryItems: false,
    isLoadingLibraryItems: false,
    libraryFilterOptions: savedState?.libraryFilterOptions || {
        tags: [],
        equipment: [],
        emphasis: [],
    },
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