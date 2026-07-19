import { state } from "../modules/state.js";

const DRAFT_KEY = "draftPlannedWorkout";

export function getPlannerDraft() {
    if (state.draftPlannedWorkout) {
        return state.draftPlannedWorkout;
    }

    try {
        const saved = localStorage.getItem(DRAFT_KEY);

        if (!saved) {
            return null;
        }

        const draft = JSON.parse(saved);

        state.draftPlannedWorkout = draft;

        return draft;
    } catch (error) {
        console.error("Failed to restore planner draft:", error);
        return null;
    }
}

export function savePlannerDraft(draft) {
    state.draftPlannedWorkout = draft;

    localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify(draft)
    );
}

export function clearPlannerDraft() {
    state.draftPlannedWorkout = null;

    localStorage.removeItem(DRAFT_KEY);
}