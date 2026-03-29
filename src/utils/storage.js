const STORAGE_KEY = "f3AppState";

export function saveState(state) {
    const data = JSON.stringify({
        groupName: state.groupName,
        members: state.members,
        sessions: state.sessions,
    });
    localStorage.setItem(STORAGE_KEY, data);
}

export function loadState() {
    try{
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data);
    } catch (error) {
        console.error("Failed to load state", error);
        return null;
    }
}