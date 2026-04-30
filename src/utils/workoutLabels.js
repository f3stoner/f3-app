const DEFAULT_WORKOUT_FIELD_LABELS = {
    introduction: "Introduction",
    warmorama: "Warm-O-Rama",
    thangs: "Thangs",
    finisher: "Mary / Finisher",
    notes: "Notes",
};

export function getWorkoutFieldLabel(state, fieldKey) {
    return (
        state.workoutFieldLabels?.[fieldKey] ||
        DEFAULT_WORKOUT_FIELD_LABELS[fieldKey] ||
        fieldKey
    );
}

export function getWorkoutFieldLabels(state) {
    return {
        ...DEFAULT_WORKOUT_FIELD_LABELS,
        ...(state.workoutFieldLabels || {}),
    };
}