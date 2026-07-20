import {
    buildWorkoutExecutionSnapshot,
} from "./workoutExecutionSnapshot.js";

import {
    saveWorkoutExecutionSnapshot,
} from "./workoutExecutionRepository.js";

import {
    loadWorkoutExecutionFallback,
} from "./workoutExecutionLoader.js";

import {
    normalizeThangSections,
} from "../utils/thangs.js";

const workoutOfflineStatusByKey =
    new Map();

const offlineWorkoutFallbacksByKey =
    new Map();

const offlineWorkoutFallbackLoadsByKey =
    new Map();

const offlineWorkoutFallbackResultsByKey =
    new Map();

function getCacheKey({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    if (
        !ownerUserId ||
        !regionId ||
        !plannedWorkoutId
    ) {
        return null;
    }

    return [
        ownerUserId,
        regionId,
        plannedWorkoutId,
    ].join("::");
}

function getSnapshotFingerprint({
    workout,
    resolvedIntroduction,
    resolvedAnnouncementText,
    resolvedThirdFText,
    workoutFieldLabels,
}) {
    return JSON.stringify({
        workoutId:
            workout.id,

        lastModifiedAt:
            workout.lastModifiedAt ||
            workout.updatedAt ||
            null,

        date:
            workout.date || null,

        aoId:
            workout.aoId || null,

        siteId:
            workout.siteId || null,

        title:
            workout.title || "",

        introduction:
            resolvedIntroduction || "",

        warmorama:
            workout.warmorama || "",

        thangs:
            workout.thangs || "",

        thangSections:
            normalizeThangSections(
                workout
            ),

        finisher:
            workout.finisher || "",

        notes:
            workout.notes || "",

        timers:
            workout.timers || [],

        announcementText:
            resolvedAnnouncementText || "",

        thirdFText:
            resolvedThirdFText || "",

        workoutFieldLabels:
            workoutFieldLabels || {},
    });
}

export function getWorkoutOfflineStatus({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    const key =
        getCacheKey({
            ownerUserId,
            regionId,
            plannedWorkoutId,
        });

    return key
        ? workoutOfflineStatusByKey.get(
            key
        ) || null
        : null;
}

export function getCachedWorkoutFallback({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    const key =
        getCacheKey({
            ownerUserId,
            regionId,
            plannedWorkoutId,
        });

    return key
        ? offlineWorkoutFallbacksByKey.get(
            key
        ) || null
        : null;
}

export function getWorkoutFallbackResult({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    const key =
        getCacheKey({
            ownerUserId,
            regionId,
            plannedWorkoutId,
        });

    return key
        ? offlineWorkoutFallbackResultsByKey.get(
            key
        ) || null
        : null;
}

export function isWorkoutFallbackLoading({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    const key =
        getCacheKey({
            ownerUserId,
            regionId,
            plannedWorkoutId,
        });

    return Boolean(
        key &&
        offlineWorkoutFallbackLoadsByKey.has(
            key
        )
    );
}

export function ensureWorkoutFallbackLoaded({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    const key =
        getCacheKey({
            ownerUserId,
            regionId,
            plannedWorkoutId,
        });

    if (!key) {
        return Promise.resolve({
            ok: false,
            workout: null,
            snapshot: null,
            reason: "missing_identity",
            error: null,
        });
    }

    const existingWorkout =
        offlineWorkoutFallbacksByKey.get(
            key
        );

    if (existingWorkout) {
        return Promise.resolve({
            ok: true,
            workout:
                existingWorkout,
            snapshot: null,
            reason: null,
            error: null,
        });
    }

    const existingResult =
        offlineWorkoutFallbackResultsByKey.get(
            key
        );

    if (existingResult) {
        return Promise.resolve(
            existingResult
        );
    }

    const existingLoad =
        offlineWorkoutFallbackLoadsByKey.get(
            key
        );

    if (existingLoad) {
        return existingLoad;
    }

    const loadPromise =
        loadWorkoutExecutionFallback({
            ownerUserId,
            regionId,
            plannedWorkoutId,
        })
            .then(result => {
                if (
                    result.ok &&
                    result.workout
                ) {
                    offlineWorkoutFallbacksByKey.set(
                        key,
                        result.workout
                    );
                }

                offlineWorkoutFallbackResultsByKey.set(
                    key,
                    result
                );

                return result;
            })
            .catch(error => {
                console.warn(
                    "Failed to load offline workout fallback:",
                    error
                );

                const result = {
                    ok: false,
                    workout: null,
                    snapshot: null,
                    reason:
                        "load_failed",
                    error,
                };

                offlineWorkoutFallbackResultsByKey.set(
                    key,
                    result
                );

                return result;
            })
            .finally(() => {
                offlineWorkoutFallbackLoadsByKey.delete(
                    key
                );
            });

    offlineWorkoutFallbackLoadsByKey.set(
        key,
        loadPromise
    );

    return loadPromise;
}

export async function ensureWorkoutSnapshotCached({
    workout,
    ownerUserId,
    ownerMemberId,
    regionId,
    ao,
    qSlot,
    resolvedIntroduction,
    resolvedAnnouncementText,
    resolvedThirdFText,
    workoutFieldLabels,
    announcementsReady,
    thirdFReady,
    isPreviewMode,
}) {
    if (
        isPreviewMode ||
        workout?.offlineSnapshot
    ) {
        return {
            ok: true,
            changed: false,
            skipped: true,
            reason:
                isPreviewMode
                    ? "preview"
                    : "offline_fallback",
        };
    }

    const key =
        getCacheKey({
            ownerUserId,
            regionId,
            plannedWorkoutId:
                workout?.id,
        });

    if (!key) {
        return {
            ok: false,
            changed: false,
            skipped: true,
            reason:
                "missing_identity",
        };
    }

    if (
        !announcementsReady ||
        !thirdFReady
    ) {
        const existingStatus =
            workoutOfflineStatusByKey.get(
                key
            );

        if (
            existingStatus?.status !==
            "waiting"
        ) {
            workoutOfflineStatusByKey.set(
                key,
                {
                    status:
                        "waiting",
                    fingerprint:
                        null,
                    error:
                        null,
                }
            );

            return {
                ok: true,
                changed: true,
                skipped: true,
                reason:
                    "content_loading",
            };
        }

        return {
            ok: true,
            changed: false,
            skipped: true,
            reason:
                "content_loading",
        };
    }

    const fingerprint =
        getSnapshotFingerprint({
            workout,
            resolvedIntroduction,
            resolvedAnnouncementText,
            resolvedThirdFText,
            workoutFieldLabels,
        });

    const existingStatus =
        workoutOfflineStatusByKey.get(
            key
        );

    if (
        existingStatus?.fingerprint ===
            fingerprint &&
        (
            existingStatus.status ===
                "saving" ||
            existingStatus.status ===
                "ready"
        )
    ) {
        return {
            ok: true,
            changed: false,
            skipped: true,
            reason:
                existingStatus.status,
        };
    }

    workoutOfflineStatusByKey.set(
        key,
        {
            status: "saving",
            fingerprint,
            error: null,
        }
    );

    try {
        const snapshot =
            buildWorkoutExecutionSnapshot({
                workout,
                ownerUserId,
                ownerMemberId:
                    ownerMemberId ||
                    null,
                regionId,
                ao,
                qSlot,
                resolvedIntroduction,
                resolvedAnnouncementText,
                resolvedThirdFText,
                workoutFieldLabels:
                    workoutFieldLabels ||
                    {},
            });

        const result =
            await saveWorkoutExecutionSnapshot(
                snapshot
            );

        if (
            !result.ok ||
            !result.offlineReady
        ) {
            throw (
                result.error ||
                new Error(
                    "Offline workout verification failed."
                )
            );
        }

        workoutOfflineStatusByKey.set(
            key,
            {
                status:
                    "ready",
                fingerprint,
                cachedAt:
                    result.snapshot
                        ?.cachedAt ||
                    snapshot.cachedAt,
                error:
                    null,
            }
        );

        return {
            ok: true,
            changed: true,
            skipped: false,
            result,
        };
    } catch (error) {
        console.warn(
            "Failed to stage workout for offline execution:",
            error
        );

        workoutOfflineStatusByKey.set(
            key,
            {
                status:
                    "error",
                fingerprint,
                error,
            }
        );

        return {
            ok: false,
            changed: true,
            skipped: false,
            error,
        };
    }
}