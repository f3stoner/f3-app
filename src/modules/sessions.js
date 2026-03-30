import { state } from "./state.js";

export function createSession(date, aoName) {
    return {
        id: crypto.randomUUID(),
        date,
        aoName,
        attendeeIds: [],
        qId: null,
        fngs: [],
        notes: "",
        createdAt: Date.now(),
    };
}