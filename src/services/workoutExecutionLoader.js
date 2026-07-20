import {
    getVerifiedWorkoutExecutionSnapshot,
} from "./workoutExecutionRepository.js";

export function convertExecutionSnapshotToWorkout(
    snapshot
) {
    if (!snapshot?.workout) {
        throw new Error(
            "Cannot convert an empty execution snapshot."
        );
    }

    return {
        id: snapshot.plannedWorkoutId,

        sourceQSlotId:
            snapshot.sourceQSlotId || null,

        regionId:
            snapshot.regionId || null,

        aoId:
            snapshot.ao?.id || null,

        siteId:
            snapshot.ao?.siteId || null,

        aoName:
            snapshot.ao?.name || "",

        date:
            snapshot.schedule?.date || null,

        startTime:
            snapshot.schedule?.startTime || null,

        durationMinutes:
            snapshot.schedule?.durationMinutes ??
            null,

        title:
            snapshot.workout.title ||
            "Planned Workout",

        introduction:
            snapshot.workout.introduction || "",

        warmorama:
            snapshot.workout.warmorama || "",

        thangs:
            snapshot.workout.thangs || "",

        thangSections:
            snapshot.workout.thangSections || [],

        finisher:
            snapshot.workout.finisher || "",

        notes:
            snapshot.workout.notes || "",

        timers:
            snapshot.workout.timers || [],

        announcementMode: "custom",

        announcementText:
            snapshot.workout.announcementText || "",

        announcementLegacyText: "",

        thirdFMode: "custom",

        thirdFText:
            snapshot.workout.thirdFText || "",

        thirdFLegacyText: "",

        isShared:
            Boolean(snapshot.workout.isShared),

        createdByUserId:
            snapshot.ownerUserId || null,

        lastModifiedAt:
            snapshot.serverLastModifiedAt || null,

        offlineSnapshot: true,

        offlineSnapshotCachedAt:
            snapshot.cachedAt || null,

        offlineSnapshotDigest:
            snapshot.contentDigest || null,
    };
}

export async function loadWorkoutExecutionFallback({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    const result =
        await getVerifiedWorkoutExecutionSnapshot({
            ownerUserId,
            regionId,
            plannedWorkoutId,
        });

    if (!result.ok || !result.snapshot) {
        return {
            ok: false,
            workout: null,
            snapshot: null,
            reason:
                result.reason ||
                "not_found",
            error:
                result.error ||
                null,
        };
    }

    try {
        const workout =
            convertExecutionSnapshotToWorkout(
                result.snapshot
            );

        return {
            ok: true,
            workout,
            snapshot:
                result.snapshot,
            reason: null,
            error: null,
        };
    } catch (error) {
        return {
            ok: false,
            workout: null,
            snapshot:
                result.snapshot,
            reason: "conversion_failed",
            error,
        };
    }
}