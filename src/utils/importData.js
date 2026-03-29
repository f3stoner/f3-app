import { saveState } from "./storage.js";
import { state } from "../modules/state.js";

export function importData(importedData) {
    state.members = importedData.members;
    state.sessions = importedData.sessions;

    state.selectedMemberId = null;
    state.selectedSessionId = null;
    state.editingMemberId = null;
    state.editingSessionId = null;

    saveState(state);
}