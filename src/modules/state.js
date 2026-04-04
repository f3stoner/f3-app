import { loadState } from "../utils/storage.js";
import { seedMembers } from "../data/seedMembers.js";
import { insertSessionsBatch } from "../services/cloudData.js";
import { REGION_ID } from "../config.js";

const savedState = loadState();

export const state = {
    regionName: savedState?.regionName || "F3 Old 300",
    members: savedState?.members || [...seedMembers],
    sessions: savedState?.sessions || [],
    currentView: "dashboard",
    selectedSessionId: null,
    editingSessionId: null,
    selectedMemberId: null,
    editingMemberId: null,
    sessionSearchTerm: "",
    sessionShowAllOthers: false,
    sessionShowAllRecent: false,
    sessionSelectedExpanded: false,
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
    _historicImport: null,
    runHistoricImport: null,
    plannedWorkoutLaunchMode: null,
    stalePaxThresholdDays: 180,
    stalePaxSearchTerm: "",
    aos: savedState?.aos || [],
    qSlots: savedState?.qSlots || [],
    homeAoId: savedState?.homeAoId || null,
    favoriteAoIds: savedState?.favoriteAoIds || null,
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
    
        await insertSessionsBatch(REGION_ID, batch);
    }

    state.sessions = [...state.sessions, ...sessions];
    state._historicImport = null;

    console.log("Import complete");
};