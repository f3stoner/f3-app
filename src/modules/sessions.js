import { state } from "./state.js";

export function createSession(date, aoName) {
    return {
        id: crypto.randomUUID(),
        date,
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