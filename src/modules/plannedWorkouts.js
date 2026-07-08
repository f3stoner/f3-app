export function createPlannedWorkout(date, { aoId = null, aoName = "" } = {}) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        aoName,
        introduction: "",
        title: "",
        warmorama: "",
        thangs: "",
        thangSections: [
            {
                id: crypto.randomUUID(),
                title: "Thang 1",
                content: "",
            },
        ],
        finisher: "",
        notes: "",
        createdAt: Date.now(),
        lastModifiedAt: Date.now(),
        sourceWorkoutId: null,
        sourceSessionId: null,
        createdByUserId: null,
        isShared: false,
        isFinalized: false,
        timers: [],
    };
}