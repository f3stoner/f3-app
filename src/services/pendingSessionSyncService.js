import {
    executeSessionSaveCommand,
} from "./cloudData.js";

import {
    getPendingSessionCommands,
    savePendingSessionCommand,
    deletePendingSessionCommand,
} from "./pendingSessionRepository.js";

import {
    PENDING_SESSION_STATUS,
    sanitizePendingSessionError,
} from "./pendingSessionCommand.js";

import { logPendingSessionSyncOutcome } from "./appEvents.js";

let pendingSessionSyncPromise = null;

function isProcessablePendingRecord(record) {
    return (
        record.status ===
        PENDING_SESSION_STATUS.PENDING
    );
}

async function persistPendingRecord(record) {
    const saveResult =
        await savePendingSessionCommand(record);

    if (!saveResult.ok) {
        throw (
            saveResult.error ||
            new Error(
                "Pending session state could not be persisted."
            )
        );
    }

    return saveResult.record;
}

async function synchronizePendingRecord(record) {
    const startedAt = Date.now();

    const attemptStartedAt =
        new Date().toISOString();

    const attemptedRecord =
        await persistPendingRecord({
            ...record,

            attemptCount:
                record.attemptCount + 1,

            lastAttemptAt:
                attemptStartedAt,

            updatedAt:
                attemptStartedAt,

            status:
                PENDING_SESSION_STATUS.SENDING,

            lastError: null,
        });

    let result;

    try {
        result =
            await executeSessionSaveCommand(
                attemptedRecord.command
            );
    } catch (error) {
        const updatedAt =
            new Date().toISOString();

        let persistedRecord =
            attemptedRecord;

        let statePersistenceError = null;

        try {
            persistedRecord =
                await persistPendingRecord({
                    ...attemptedRecord,

                    updatedAt,

                    status:
                        PENDING_SESSION_STATUS.PENDING,

                    lastError:
                        sanitizePendingSessionError(
                            error,
                            "Pending session upload failed."
                        ),
                });
        } catch (persistenceError) {
            statePersistenceError =
                persistenceError;
        }

        const outcome = {
            status: "upload_failed",

            record: persistedRecord,
            result: null,

            databaseCommitted: null,
            pendingRecordRemoved: false,

            error,
            statePersistenceError,
        };

        void logPendingSessionSyncOutcome({
            record,
            outcome,
            durationMs:
                Date.now() - startedAt,
        });

        return outcome;
    }

    const deletion =
        await deletePendingSessionCommand({
            ownerUserId:
                attemptedRecord.ownerUserId,

            regionId:
                attemptedRecord.regionId,

            sessionId:
                attemptedRecord.sessionId,
        });

    if (deletion.ok) {
        const outcome = {
            status: "synced",
        
            record: attemptedRecord,
            result,
        
            databaseCommitted: true,
            pendingRecordRemoved: true,
        
            error: null,
            statePersistenceError: null,
        };
        
        void logPendingSessionSyncOutcome({
            record,
            outcome,
            durationMs:
                Date.now() - startedAt,
        });
        
        return outcome;
    }

    const cleanupError =
        deletion.error ||
        new Error(
            "Session uploaded, but its pending record could not be removed."
        );

    let persistedRecord =
        attemptedRecord;

    let statePersistenceError = null;

    try {
        const updatedAt =
            new Date().toISOString();

        persistedRecord =
            await persistPendingRecord({
                ...attemptedRecord,

                updatedAt,

                status:
                    PENDING_SESSION_STATUS.NEEDS_REVIEW,

                lastError:
                    sanitizePendingSessionError(
                        cleanupError,
                        "Uploaded session could not be removed from the pending queue."
                    ),
            });
    } catch (persistenceError) {
        statePersistenceError =
            persistenceError;
    }

    const outcome = {
        status: "cleanup_failed",
    
        record: persistedRecord,
        result,
    
        databaseCommitted: true,
        pendingRecordRemoved: false,
    
        error: cleanupError,
        statePersistenceError,
    };
    
    void logPendingSessionSyncOutcome({
        record,
        outcome,
        durationMs:
            Date.now() - startedAt,
    });
    
    return outcome;
}

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

    const record =
        pendingCommands.find(
            isProcessablePendingRecord
        ) || null;

    if (!record) {
        return {
            status: "empty",
            record: null,
            result: null,

            databaseCommitted: null,
            pendingRecordRemoved: false,

            error: null,
            statePersistenceError: null,
        };
    }

    return synchronizePendingRecord(record);
}

export async function processPendingSessionCommands({
    ownerUserId,
    regionId,
}) {
    const allPendingCommands =
        await getPendingSessionCommands({
            ownerUserId,
            regionId,
        });

    const pendingCommands =
        allPendingCommands.filter(
            isProcessablePendingRecord
        );

    const reviewCount =
        allPendingCommands.filter(
            record =>
                record.status ===
                PENDING_SESSION_STATUS.NEEDS_REVIEW
        ).length;

    if (pendingCommands.length === 0) {
        return {
            status: "empty",

            processedCount: 0,
            syncedCount: 0,
            failedCount: 0,

            remainingCount: 0,
            reviewCount,

            results: [],
        };
    }

    const results = [];
    let syncedCount = 0;

    for (const record of pendingCommands) {
        const outcome =
            await synchronizePendingRecord(
                record
            );

        results.push({
            ...outcome,
            sessionId:
                record.sessionId,
        });

        if (outcome.status === "synced") {
            syncedCount += 1;
            continue;
        }

        return {
            status: "partial",

            processedCount:
                syncedCount,

            syncedCount,

            failedCount: 1,

            remainingCount:
                pendingCommands.length -
                syncedCount,

            reviewCount:
                reviewCount +
                (
                    outcome.status ===
                    "cleanup_failed"
                        ? 1
                        : 0
                ),

            results,
        };
    }

    return {
        status: "complete",

        processedCount:
            syncedCount,

        syncedCount,

        failedCount: 0,
        remainingCount: 0,
        reviewCount,

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