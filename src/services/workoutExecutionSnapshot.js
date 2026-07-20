import { normalizeThangSections } from "../utils/thangs.js";

export const WORKOUT_EXECUTION_SNAPSHOT_SCHEMA_VERSION = 1;

function cloneSerializable(value) {
    if (value === undefined) return null;

    return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }

    if (
        value &&
        typeof value === "object"
    ) {
        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
                result[key] = canonicalize(value[key]);
                return result;
            }, {});
    }

    return value;
}

function canonicalStringify(value) {
    return JSON.stringify(canonicalize(value));
}

/*
 * This digest detects accidental inconsistency or corruption.
 * It is not intended to provide cryptographic security.
 */
export function calculateWorkoutExecutionSnapshotDigest(snapshot) {
    const digestSource = {
        ...snapshot,
        contentDigest: null,
    };

    const input = canonicalStringify(digestSource);

    let hash = 0x811c9dc5;

    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);

        hash = Math.imul(hash, 0x01000193);
    }

    return `fnv1a-${(hash >>> 0)
        .toString(16)
        .padStart(8, "0")}`;
}

function normalizeTimer(timer) {
    return {
        id: timer?.id || null,
        label: timer?.label || "",
        type: timer?.type || null,
        section: timer?.section || null,
        durationSeconds:
            Number.isFinite(timer?.durationSeconds)
                ? timer.durationSeconds
                : null,
        workSeconds:
            Number.isFinite(timer?.workSeconds)
                ? timer.workSeconds
                : null,
        restSeconds:
            Number.isFinite(timer?.restSeconds)
                ? timer.restSeconds
                : null,
        rounds:
            Number.isFinite(timer?.rounds)
                ? timer.rounds
                : null,
    };
}

function validateTimer(timer, index) {
    if (!timer || typeof timer !== "object") {
        throw new Error(
            `Workout timer ${index + 1} is invalid.`
        );
    }

    if (!timer.id) {
        throw new Error(
            `Workout timer ${index + 1} is missing an id.`
        );
    }

    if (
        !["countdown", "emom", "interval"].includes(
            timer.type
        )
    ) {
        throw new Error(
            `Workout timer ${index + 1} has an unsupported type.`
        );
    }

    if (
        timer.type === "interval" &&
        (
            !Number.isFinite(timer.workSeconds) ||
            timer.workSeconds <= 0 ||
            !Number.isFinite(timer.rounds) ||
            timer.rounds <= 0
        )
    ) {
        throw new Error(
            `Interval timer ${index + 1} is incomplete.`
        );
    }

    if (
        timer.type !== "interval" &&
        (
            !Number.isFinite(timer.durationSeconds) ||
            timer.durationSeconds <= 0
        )
    ) {
        throw new Error(
            `Timer ${index + 1} is missing a valid duration.`
        );
    }
}

export function buildWorkoutExecutionSnapshot({
    workout,
    ownerUserId,
    ownerMemberId = null,
    regionId,
    ao = null,
    qSlot = null,
    resolvedIntroduction = "",
    resolvedAnnouncementText = "",
    resolvedThirdFText = "",
    workoutFieldLabels = {},
    cachedAt = new Date().toISOString(),
}) {
    if (!workout?.id) {
        throw new Error(
            "Cannot build an execution snapshot without a workout id."
        );
    }

    const normalizedSections =
        normalizeThangSections(workout).map(
            (section, index) => ({
                id:
                    section.id ||
                    `section-${index + 1}`,
                title:
                    section.title ||
                    `Thang ${index + 1}`,
                content: section.content || "",
            })
        );

    const timers = (workout.timers || [])
        .map(normalizeTimer);

    const snapshot = {
        schemaVersion:
            WORKOUT_EXECUTION_SNAPSHOT_SCHEMA_VERSION,

        snapshotKey: [
            ownerUserId,
            regionId,
            workout.id,
        ].join("::"),

        plannedWorkoutId: workout.id,
        sourceQSlotId:
            workout.sourceQSlotId ||
            qSlot?.id ||
            null,

        ownerUserId,
        ownerMemberId,
        regionId,

        ao: {
            id:
                workout.aoId ||
                ao?.id ||
                null,
            siteId:
                workout.siteId ||
                qSlot?.siteId ||
                null,
            name:
                workout.aoName ||
                ao?.name ||
                "",
        },

        schedule: {
            date:
                workout.date ||
                qSlot?.date ||
                null,
            startTime:
                workout.startTime ||
                qSlot?.overrideTime ||
                qSlot?.startTime ||
                null,
            durationMinutes:
                workout.durationMinutes ??
                qSlot?.durationMinutes ??
                null,
        },

        workout: {
            title: workout.title || "Planned Workout",
            introduction:
                resolvedIntroduction || "",
            warmorama: workout.warmorama || "",
            thangs: workout.thangs || "",
            thangSections: normalizedSections,
            finisher: workout.finisher || "",
            notes: workout.notes || "",
            timers,
            announcementText:
                resolvedAnnouncementText || "",
            thirdFText:
                resolvedThirdFText || "",
            isShared: Boolean(workout.isShared),
        },

        workoutFieldLabels:
            cloneSerializable(workoutFieldLabels || {}),

        serverLastModifiedAt:
            workout.lastModifiedAt ||
            workout.updatedAt ||
            null,

        cachedAt,
        contentDigest: null,
    };

    snapshot.contentDigest =
        calculateWorkoutExecutionSnapshotDigest(snapshot);

    validateWorkoutExecutionSnapshot(snapshot);

    return snapshot;
}

export function validateWorkoutExecutionSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        throw new Error(
            "Workout execution snapshot is missing."
        );
    }

    if (
        snapshot.schemaVersion !==
        WORKOUT_EXECUTION_SNAPSHOT_SCHEMA_VERSION
    ) {
        throw new Error(
            `Unsupported workout execution snapshot schema: ${snapshot.schemaVersion}.`
        );
    }

    if (!snapshot.snapshotKey) {
        throw new Error(
            "Workout execution snapshot is missing its key."
        );
    }

    if (!snapshot.plannedWorkoutId) {
        throw new Error(
            "Workout execution snapshot is missing its workout id."
        );
    }

    if (!snapshot.ownerUserId) {
        throw new Error(
            "Workout execution snapshot is missing its owner user id."
        );
    }

    if (!snapshot.regionId) {
        throw new Error(
            "Workout execution snapshot is missing its region id."
        );
    }

    const expectedKey = [
        snapshot.ownerUserId,
        snapshot.regionId,
        snapshot.plannedWorkoutId,
    ].join("::");

    if (snapshot.snapshotKey !== expectedKey) {
        throw new Error(
            "Workout execution snapshot key does not match its identity."
        );
    }

    if (
        !snapshot.workout ||
        typeof snapshot.workout !== "object"
    ) {
        throw new Error(
            "Workout execution snapshot is missing workout content."
        );
    }

    if (!snapshot.workout.title) {
        throw new Error(
            "Workout execution snapshot is missing a title."
        );
    }

    if (
        !Array.isArray(
            snapshot.workout.thangSections
        )
    ) {
        throw new Error(
            "Workout execution snapshot has invalid thang sections."
        );
    }

    snapshot.workout.thangSections.forEach(
        (section, index) => {
            if (
                !section ||
                typeof section !== "object" ||
                !section.id ||
                typeof section.content !== "string"
            ) {
                throw new Error(
                    `Workout section ${index + 1} is invalid.`
                );
            }
        }
    );

    if (!Array.isArray(snapshot.workout.timers)) {
        throw new Error(
            "Workout execution snapshot has invalid timers."
        );
    }

    snapshot.workout.timers.forEach(
        validateTimer
    );

    if (!snapshot.cachedAt) {
        throw new Error(
            "Workout execution snapshot is missing its cache timestamp."
        );
    }

    if (!snapshot.contentDigest) {
        throw new Error(
            "Workout execution snapshot is missing its digest."
        );
    }

    const expectedDigest =
        calculateWorkoutExecutionSnapshotDigest(
            snapshot
        );

    if (
        snapshot.contentDigest !==
        expectedDigest
    ) {
        throw new Error(
            "Workout execution snapshot digest does not match its content."
        );
    }

    return true;
}