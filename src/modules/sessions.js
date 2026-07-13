import { state } from "./state.js";

export function createSession(
    date,
    {
        aoId = null,
        aoName = "",
        siteId = null,
        startTime = null,
    } = {}
) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        siteId,
        aoName,
        startTime,
        attendeeIds: [],
        qIds: [],
        fngs: [],
        notes: "",
        workout: null,
        sourcePlannedWorkoutId: null,
        createdAt: Date.now(),
        createdByUserId: state.currentUserId,
        backblastText: "",
    };
}