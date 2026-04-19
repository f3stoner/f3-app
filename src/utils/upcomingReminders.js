
function formatDateKey(date) {
    return date.toISOString().split("T")[0];
}

export function buildNotificationKey({ type, slot }) {
    return `${type}_${slot?.id || "weekly"}_${slot?.date || ""}`;
}

function isAroundHour(targetHour, windowMinutes = 30) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(targetHour, 0, 0, 0);

    const diff = Math.abs(now - target);
    return diff <= windowMinutes * 60 * 1000;
}

function isSunday() {
    const now = new Date();
    return now.getDay() === 0;
}

const FORCE_TEST = true;

export function getUpcomingReminders(state) {
    if (!state.notificationSettings?.pushEnabled) return [];

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const todayKey = formatDateKey(today);
    const tomorrowKey = formatDateKey(tomorrow);

    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const weekEndKey = formatDateKey(weekEnd);
    
    const reminders = [];

    const mySlots = state.qSlots
        .filter(slot => 
            slot.qUserId === state.currentUserMemberId &&
            slot.date >= todayKey
        )
        .sort((a, b) => a.date.localeCompare(b.date));

    mySlots.forEach(slot => {
        if (slot.date === tomorrowKey && (FORCE_TEST || isAroundHour(11))) {
            const ao = state.aos.find(a => a.id === slot.aoId);

            reminders.push({
                type: "day-before",
                message: `You are Qing tomorrow at ${ao?.name || "your AO"} - don't forget to post a preblast`,
                slot,
                key: buildNotificationKey({ type: "day-before", slot }),
            });
        }
    });

    const weeklySlots = mySlots.filter(slot =>
        slot.date >= todayKey && slot.date < weekEndKey
    );

    if (weeklySlots.length > 0 && (FORCE_TEST || (isSunday() && isAroundHour(17)))) {
        const summaryParts = weeklySlots.map(slot => {
            const ao = state.aos.find(a => a.id === slot.aoId);
            const slotDate = new Date(`${slot.date}T12:00:00`);
            const shortDay = slotDate.toLocaleDateString(undefined, { weekday: "short" });
            return `${shortDay} @ ${ao?.name || "Unknown AO"}`;
        });
        const weeklyMessage =
            weeklySlots.length === 1
                ? `You are Qing this week: ${summaryParts[0]}`
                : `You are Qing ${weeklySlots.length}x this week: ${summaryParts.join(", ")}`;

        reminders.push({
            type: "weekly-summary",
            message: weeklyMessage,
            slots: weeklySlots,
            key: `weekly_${todayKey}`,
        });
    }
    return reminders.filter(r =>
        !state.sentNotificationKeys?.includes(r.key)
    );
}