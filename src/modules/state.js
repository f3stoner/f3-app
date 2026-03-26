import { seedMembers } from "../data/seedMembers.js";

export const state = {
    members: [...seedMembers],
    sessions: [],
    currentView: "dashboard",
};