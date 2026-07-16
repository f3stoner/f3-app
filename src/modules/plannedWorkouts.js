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
        announcementMode: "auto",
        announcementText: "",
        announcementLegacyText: "",

        thirdFMode: "auto",
        thirdFText: "",
        thirdFLegacyText: "",
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