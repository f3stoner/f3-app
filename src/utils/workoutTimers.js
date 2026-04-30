export function createWorkoutTimer(section, type = "countdown") {
    return {
        id: crypto.randomUUID(),
        section,
        label: "",
        type,
        durationSeconds: type === "interval" ? null : 300,
        workSeconds: type === "interval" ? 45 : null,
        restSeconds: type === "interval" ? 15 : null,
        rounds: type === "interval" ? 8 : null,
    };
}

export function getTimersForSection(workout, section) {
    return (workout.timers || []).filter(timer => timer.section === section);
}

export function formatTimerSummary(timer) {
    if (timer.type === "interval") {
        return `${timer.rounds} rounds · ${timer.workSeconds}s on / ${timer.restSeconds}s off`;
    }

    const minutes = Math.floor((timer.durationSeconds || 0) / 60);
    const seconds = (timer.durationSeconds || 0) % 60;

    const durationText = seconds
        ? `${minutes}:${String(seconds).padStart(2, "0")}`
        : `${minutes} min`;

    if (timer.type === "emom") {
        return `EMOM · ${durationText}`;
    }

    return `Countdown · ${durationText}`;
}