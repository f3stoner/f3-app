// src/utils/dateAwareContent.js

export function getDateKey(date = new Date()) {
    if (typeof date === "string") return date.slice(0, 10);

    return date.toISOString().slice(0, 10);
}

export function isDateAwareContentActive(item, targetDate = new Date()) {
    const targetKey = getDateKey(targetDate);

    const startsOn =
        item.startsOn ||
        item.startDate ||
        item.weekStartDate ||
        null;

    const endsOn =
        item.endsOn ||
        item.expiresOn ||
        item.endDate ||
        null;

    if (startsOn && startsOn > targetKey) return false;
    if (endsOn && endsOn < targetKey) return false;

    return true;
}

export function filterDateAwareContent(items = [], targetDate = new Date()) {
    return items.filter(item => isDateAwareContentActive(item, targetDate));
}