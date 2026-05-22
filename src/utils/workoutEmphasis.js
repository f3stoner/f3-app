import { WORKOUT_EMPHASIS } from "../config.js";

function getDateOnly(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function getWeekIndexFromStart(slotDate, startsOnDate) {
    const startDate = getDateOnly(startsOnDate);
    const diffMs = slotDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return Math.floor(diffDays / 7);
}

function resolveEmphasisRule(rule, slotDateString) {
    if (!rule || !Array.isArray(rule.values) || !rule.values.length) {
        return null;
    }

    if (rule.pattern === "fixed") {
        return rule.values[0] || null;
    }

    if (rule.pattern === "alternating-weeks") {
        if (!rule.startsOnDate) {
            return rule.values[0] || null;
        }

        const slotDate = getDateOnly(slotDateString);
        const weekIndex = getWeekIndexFromStart(slotDate, rule.startsOnDate);
        const safeIndex =
            ((weekIndex % rule.values.length) + rule.values.length) % rule.values.length;

        return rule.values[safeIndex] || null;
    }

    return rule.values[0] || null;
}

export function getWorkoutEmphasisForSlot(slot, ao) {
    if (!slot?.date || !ao?.emphasisSchedule) return null;

    const slotDate = getDateOnly(slot.date);
    const dayOfWeek = String(slotDate.getDay());
    const rule = ao.emphasisSchedule[dayOfWeek];

    const key = resolveEmphasisRule(rule, slot.date);

    return key
        ? { key, ...WORKOUT_EMPHASIS[key] }
        : null;
}