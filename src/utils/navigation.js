import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { saveState, saveNavState } from "./storage.js";
import { runViewCleanup } from "./viewCleanup.js";

const NON_HISTORY_VIEWS = new Set([
    "auth",
    "regionGate",
    "claimMember",
    "resetPassword",
]);

const TOP_LEVEL_VIEWS = new Set([
    "dashboard",
    "roster",
    "qSignup",
    "sessionHistory",
    "plannedWorkoutList",
    "myPlanner",
    "aoManagement",
]);

export function navigateTo(view) {
    const currentView = state.currentView;

    if (currentView && currentView !== view) {
        runViewCleanup(currentView);
    }

    if (TOP_LEVEL_VIEWS.has(view)) {
        state.viewHistory = [];
    } else if (
        currentView &&
        currentView !== view &&
        !NON_HISTORY_VIEWS.has(currentView)
    ) {
        state.viewHistory.push(currentView);
    }
   
    state.currentView = view;
    saveNavState(state);
    renderApp();
}

export function goBack(fallbackView = "dashboard") {
    const currentView = state.currentView;
    const previousView = state.viewHistory.pop();
    const nextView = previousView || fallbackView;

    if (currentView && currentView !== nextView) {
        runViewCleanup(currentView);
    }

    state.currentView = nextView;
    saveNavState(state);
    renderApp();
}