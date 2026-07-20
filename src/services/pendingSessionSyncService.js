import {
    executeSessionSaveCommand,
} from "./cloudData.js";

import {
    getPendingSessionCommands,
    deletePendingSessionCommand,
} from "./pendingSessionRepository.js";

let pendingSessionSyncPromise = null;

export async function retryNextPendingSessionCommand({
    ownerUserId,
    regionId,
}) {
    if (!ownerUserId) {
        throw new Error(
            "Owner user id is required."
        );
    }

    if (!regionId) {
        throw new Error(
            "Region id is required."
        );
    }

    const pendingCommands =
        await getPendingSessionCommands({
            ownerUserId,
            regionId,
        });

    const record = pendingCommands[0] || null;

    if (!record) {
        return {
            status: "empty",
            record: null,
            result: null,
        };
    }

    const result =
        await executeSessionSaveCommand(
            record.command
        );

    const deleteResult =
        await deletePendingSessionCommand({
            ownerUserId:
                record.ownerUserId,
            regionId:
                record.regionId,
            sessionId:
                record.sessionId,
        });

    if (!deleteResult.ok) {
        throw (
            deleteResult.error ||
            new Error(
                "Session uploaded, but its pending record could not be removed."
            )
        );
    }

    return {
        status: "saved",
        record,
        result,
    };
}

export async function processPendingSessionCommands({
    ownerUserId,
    regionId,
}) {
    const pendingCommands =
        await getPendingSessionCommands({
            ownerUserId,
            regionId,
        });

    if (pendingCommands.length === 0) {
        return {
            status: "empty",
            processedCount: 0,
            failedCount: 0,
            remainingCount: 0,
            results: [],
        };
    }

    const results = [];
    let processedCount = 0;

    for (const record of pendingCommands) {
        try {
            const result =
                await executeSessionSaveCommand(
                    record.command
                );

            const deletion =
                await deletePendingSessionCommand({
                    ownerUserId:
                        record.ownerUserId,
                    regionId:
                        record.regionId,
                    sessionId:
                        record.sessionId,
                });

            if (!deletion.ok) {
                throw (
                    deletion.error ||
                    new Error(
                        "Saved session could not be removed from the pending queue."
                    )
                );
            }

            processedCount += 1;

            results.push({
                status: "saved",
                sessionId: record.sessionId,
                result,
            });
        } catch (error) {
            results.push({
                status: "failed",
                sessionId: record.sessionId,
                error,
            });

            return {
                status: "partial",
                processedCount,
                failedCount: 1,
                remainingCount:
                    pendingCommands.length -
                    processedCount,
                results,
            };
        }
    }

    return {
        status: "complete",
        processedCount,
        failedCount: 0,
        remainingCount: 0,
        results,
    };
}

export async function synchronizePendingSessions({
    ownerUserId,
    regionId,
}) {
    if (!ownerUserId) {
        throw new Error(
            "Owner user id is required."
        );
    }

    if (!regionId) {
        throw new Error(
            "Region id is required."
        );
    }

    if (pendingSessionSyncPromise) {
        return pendingSessionSyncPromise;
    }

    pendingSessionSyncPromise =
        processPendingSessionCommands({
            ownerUserId,
            regionId,
        });

    try {
        return await pendingSessionSyncPromise;
    } finally {
        pendingSessionSyncPromise = null;
    }
}