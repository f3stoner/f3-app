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

    if (rule.pattern === "rotating-slots") {
        if (!rule.startsOnDate) {
            return rule.values[0] || null;
        }

        const allowedDays = rule.daysOfWeek || [];
        if (!allowedDays.length) {
            return rule.values[0] || null;
        }

        const slotDate = getDateOnly(slotDateString);
        const startDate = getDateOnly(rule.startsOnDate);

        let slotCount = 0;
        const cursor = new Date(startDate);

        while (cursor <= slotDate) {
            const dayMatches = allowedDays.includes(cursor.getDay());

            if (dayMatches) {
                if (
                    cursor.getFullYear() === slotDate.getFullYear() &&
                    cursor.getMonth() === slotDate.getMonth() &&
                    cursor.getDate() === slotDate.getDate()
                ) {
                    return rule.values[slotCount % rule.values.length] || null;
                }

                slotCount += 1;
            }

            cursor.setDate(cursor.getDate() + 1);
        }

        return null;
    }

    return rule.values[0] || null;
}

export function getWorkoutEmphasisMeta(key) {
    const normalizedKey = String(key || "").toLowerCase();

    return WORKOUT_EMPHASIS[normalizedKey]
        ? { key: normalizedKey, ...WORKOUT_EMPHASIS[normalizedKey] }
        : null;
}

export function getWorkoutEmphasisForSlot(slot, ao) {
    if (slot?.overrideEmphasis) {
        return getWorkoutEmphasisMeta(slot.overrideEmphasis);
    }

    if (!slot?.date || !ao?.emphasisSchedule) return null;

    const slotDate = getDateOnly(slot.date);
    const dayOfWeek = String(slotDate.getDay());
    const rule = ao.emphasisSchedule[dayOfWeek] || ao.emphasisSchedule["*"];

    const key = resolveEmphasisRule(rule, slot.date);

    console.log("EMPHASIS DEBUG", {
        aoName: ao?.name,
        slotDate: slot?.date,
        overrideEmphasis: slot?.overrideEmphasis,
        dayOfWeek,
        rule,
        resolvedKey: key,
    });

    return getWorkoutEmphasisMeta(key);
}