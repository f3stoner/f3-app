import { state } from "./state.js";

export function createSession(date, { aoId = null, aoName = "" } = {}) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        aoName,
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