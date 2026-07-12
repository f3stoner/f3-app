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