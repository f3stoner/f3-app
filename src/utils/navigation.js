import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { saveState, saveNavState } from "./storage.js";
import { runViewCleanup } from "./viewCleanup.js";
import { canViewPaxOverview } from "./permissions.js";

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

const PAX_PROFILE_VIEWS = new Set([
    "paxProfile",
    "paxCommunity",
]);

export function navigateTo(
    view,
    params = {}
) {
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
    state.currentViewParams = params;
    state.currentView = view;
    saveNavState(state);
    renderApp();
}

export function goBack(fallbackView = "dashboard") {
    const currentView = state.currentView;

    let previousView = state.viewHistory.pop();

    // When leaving the PAX profile area, skip profile tabs
    // and previous PAX profiles until reaching the source view.
    if (PAX_PROFILE_VIEWS.has(currentView)) {
        while (
            previousView &&
            PAX_PROFILE_VIEWS.has(previousView)
        ) {
            previousView = state.viewHistory.pop();
        }
    }

    const nextView = previousView || fallbackView;

    if (currentView && currentView !== nextView) {
        runViewCleanup(currentView);
    }
    state.currentViewParams = {};
    state.currentView = nextView;
    saveNavState(state);
    renderApp();
}

export function navigateToPaxProfile(memberId) {
    if (!memberId) return;

    state.selectedPaxId = memberId;

    navigateTo(
        canViewPaxOverview(memberId)
            ? "paxProfile"
            : "paxCommunity"
    );
}