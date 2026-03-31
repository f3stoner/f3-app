const STORAGE_KEY = "f3AppState";

export function saveState(state) {
    const data = JSON.stringify({
        regionName: state.regionName,
        members: state.members,
        sessions: state.sessions,
        plannedWorkouts: state.plannedWorkouts
    });
    localStorage.setItem(STORAGE_KEY, data);
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
        return saved;
    } catch (error) {
        console.error("Failed to load state", error);
        return null;
    }
}