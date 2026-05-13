import { AO_WORKOUT_EMPHASIS_RULES, WORKOUT_EMPHASIS } from "../config.js";

function getWeekIndexFromStart(slotDate, startsOnDate) {
    const startDate = new Date(`${startsOnDate}T12:00:00`);
    const diffMs = slotDate - startDate;
    const diffDays = Math.floor(diffMs / (100 * 60 * 60 * 24));

    return Math.floor(diffDays / 7);
}

export function getWorkoutEmphasisForSlot(slot, ao) {
    if (!slot?.date || !ao?.name) return null;

    const slotDate = new Date(`${slot.date}T12:00:00`);
    const dayOfWeek = slotDate.getDay();

    const rule = AO_WORKOUT_EMPHASIS_RULES.find(rule => 
        rule.aoName === ao.name &&
        rule.dayOfWeek === dayOfWeek
    );

    if (!rule) return null;

    if (rule.pattern === "fixed") {
        const key = rule.values?.[0];

        return key
            ? { key, ...WORKOUT_EMPHASIS[key] }
            : null;
    }

    if (rule.pattern === "alternating-weeks") {
        if (!rule.startsOnDate || !rule.values?.length) {
            return null;
        }

        const weekIndex = getWeekIndexFromStart(slotDate, rule.startsOnDate);
        const safeIndex = ((weekIndex % rule.values.length) + rule.values.length) % rule.values.length;
        const key = rule.values[safeIndex];

        return key
            ? { key, ...WORKOUT_EMPHASIS[key] }
            : null;
    }

    return null;
}