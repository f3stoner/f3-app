const STORAGE_KEY = "f3AppState";
const NAV_STATE_KEY = "theQNavState";

export function saveState(state) {
    const data = JSON.stringify({
        regionName: state.regionName,
        members: state.members,
        sessions: state.sessions,
        plannedWorkouts: state.plannedWorkouts,
        sentNotificationKeys: state.sentNotificationKeys,
    });
    localStorage.setItem(STORAGE_KEY, data);
}

export function saveNavState(state) {
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify({
        currentView: state.currentView,
        selectedPlannedWorkoutId: state.selectedPlannedWorkoutId,
        editingPlannedWorkoutId: state.editingPlannedWorkoutId,
        plannedWorkoutLaunchMode: state.plannedWorkoutLaunchMode,
        selectedSessionId: state.selectedSessionId,
        editingSessionId: state.editingSessionId,
        selectedPreblastWorkoutId: state.selectedPreblastWorkoutId,
    }));
}

export function loadNavState() {
    return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || "null");
}

export function loadState() {

    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return null;

        const saved = JSON.parse(data);

        if (saved.groupName && !saved.regionName) {
            saved.regionName = saved.groupName;
            delete saved.groupName;
        }

        if (!saved.plannedWorkouts) {
            saved.plannedWorkouts = [];
        }

        if (!saved.sentNotificationKeys) {
            saved.sentNotificationKeys = [];
        }
        return saved;
    } catch (error) {
        console.error("Failed to load state", error);
        return null;
    }
}