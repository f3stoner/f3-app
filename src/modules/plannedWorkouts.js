
export function createPlannedWorkout(date, aoName) {
    return {
        id: crypto.randomUUID(),
        date,
        aoName,
        title: "",
        warmorama: "",
        thangs: "",
        finisher: "",
        notes: "",
        createdAt: Date.now(),
        lastModifiedAt: Date.now(),
        sourceWorkoutId: null,
        sourceSessionId: null,
        createdByUserId: null,
    };
}