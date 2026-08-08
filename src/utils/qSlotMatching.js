export function findWorkoutForQSlot(slot, workouts, currentUserId, aos) {
    const ao = aos.find(a => a.id === slot.aoId);

    return workouts.find(workout => {
        const belongsToCurrentUser =
            workout.createdByUserId === currentUserId;

        if (!belongsToCurrentUser) {
            return false;
        }

        if (workout.sourceQSlotId) {
            return workout.sourceQSlotId === slot.id;
        }

        return (
            workout.date === slot.date &&
            (
                workout.aoId === slot.aoId ||
                (!workout.aoId && workout.aoName === ao?.name)
            )
        );
    });
}

/*
 * Resolve a planned workout for a regional/shared q-slot view.
 *
 * Unlike findWorkoutForQSlot(), this does not restrict the
 * result to the authenticated user's own planned workouts.
 */
export function findSharedWorkoutForQSlot(slot, workouts, aos) {
    if (!slot) return null;

    const exactMatch = workouts.find(
        workout =>
            workout.sourceQSlotId === slot.id
    );

    if (exactMatch) {
        return exactMatch;
    }

    const ao = aos.find(
        candidate =>
            candidate.id === slot.aoId
    );

    return workouts.find(workout => {
        return (
            workout.date === slot.date &&
            (
                workout.aoId === slot.aoId ||
                (
                    !workout.aoId &&
                    workout.aoName === ao?.name
                )
            )
        );
    }) || null;
}

export function getQSlotDisplayTime(
    slot,
    ao,
    workout = null
) {
    if (!slot || !ao) return "";

    const [year, month, day] =
        slot.date
            .split("-")
            .map(Number);

    const dayKey = String(
        new Date(
            year,
            month - 1,
            day
        ).getDay()
    );

    return (
        workout?.startTime ||
        slot.overrideTime ||
        slot.startTime ||
        ao.timeSchedule?.[dayKey] ||
        ao.time ||
        ""
    );
}