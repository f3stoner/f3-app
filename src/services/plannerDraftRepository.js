import { state } from "../modules/state.js";

const DRAFT_KEY = "draftPlannedWorkout";

function isCanonicalPlannerDraft(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        value.origin &&
        typeof value.origin === "object" &&
        value.content &&
        typeof value.content === "object" &&
        value.sync &&
        typeof value.sync === "object"
    );
}

function normalizePlannerDraft(value) {
    if (!value) {
        return null;
    }

    if (isCanonicalPlannerDraft(value)) {
        return {
            ...value,
            origin: {
                kind:
                    value.origin.kind === "existing"
                        ? "existing"
                        : "new",
                workoutId:
                    value.origin.kind === "existing"
                        ? value.origin.workoutId || value.content.id || null
                        : null,
            },
            content: value.content,
            sync: {
                ...value.sync,
                status: value.sync.status || "editing",
            },
        };
    }

    const editingWorkoutId = state.editingPlannedWorkoutId || null;

    const isExistingWorkout =
        Boolean(editingWorkoutId) &&
        (
            !value.id ||
            value.id === editingWorkoutId
        );

    return {
        origin: {
            kind: isExistingWorkout ? "existing" : "new",
            workoutId: isExistingWorkout
                ? editingWorkoutId
                : null,
        },
        content: value,
        sync: {
            status: "editing",
        },
    };
}

export function getPlannerDraft() {
    if (state.draftPlannedWorkout) {
        const draft = normalizePlannerDraft(
            state.draftPlannedWorkout
        );

        state.draftPlannedWorkout = draft;

        return draft;
    }

    try {
        const saved = localStorage.getItem(DRAFT_KEY);

        if (!saved) {
            return null;
        }

        const storedValue = JSON.parse(saved);
        const draft = normalizePlannerDraft(storedValue);

        state.draftPlannedWorkout = draft;

        return draft;
    } catch (error) {
        console.error("Failed to restore planner draft:", error);
        return null;
    }
}

export function savePlannerDraft(draft) {
    const normalizedDraft = normalizePlannerDraft(draft);

    state.draftPlannedWorkout = normalizedDraft;

    localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify(normalizedDraft)
    );

    return normalizedDraft;
}

export function clearPlannerDraft() {
    state.draftPlannedWorkout = null;

    localStorage.removeItem(DRAFT_KEY);
}