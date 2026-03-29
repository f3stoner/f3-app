import { loadState } from "../utils/storage.js";
import { seedMembers } from "../data/seedMembers.js";

const savedState = loadState();

export const state = {
    groupName: savedState?.groupName || "The Hub",
    members: savedState?.members || [...seedMembers],
    sessions: savedState?.sessions || [],
    currentView: "dashboard",
    selectedSessionId: null,
    editingSessionId: null,
    selectedMemberId: null,
};