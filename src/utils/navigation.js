import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

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
    renderApp();
}

export function goBack(fallbackView = "dashboard") {
    const previousView = state.viewHistory.pop();

    state.currentView = previousView || fallbackView;
    renderApp();
}