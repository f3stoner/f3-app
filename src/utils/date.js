export function formatDate(dateString) {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);

    return localDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function formatShortDate(dateString) {
    const date = parseLocalDate(dateString);

    return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

export function getTodayDate() {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function isPastWorkoutGracePeriod(
    displayTime,
    now = new Date()
) {
    const [hourString, minuteString] =
        String(displayTime || "").split(":");

    const hour = Number(hourString);
    const minute = Number(minuteString || 0);

    if (
        !displayTime ||
        Number.isNaN(hour) ||
        Number.isNaN(minute)
    ) {
        return false;
    }

    const cutoff = new Date(now);
    cutoff.setHours(hour + 4, minute, 0, 0);

    return now >= cutoff;
}

export function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function formatMonthDayYear(dateString) {
    if (!dateString) return "";

    const date = parseLocalDate(dateString);

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
