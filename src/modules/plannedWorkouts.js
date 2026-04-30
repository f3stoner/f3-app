
export function createPlannedWorkout(date, aoName) {
    return {
        id: crypto.randomUUID(),
        date,
        aoName,
        introduction: "",
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
        isShared: false,
        timers: [],
    };
}