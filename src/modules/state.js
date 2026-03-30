import { loadState } from "../utils/storage.js";
import { seedMembers } from "../data/seedMembers.js";

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
};