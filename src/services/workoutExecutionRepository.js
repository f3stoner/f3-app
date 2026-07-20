import {
    validateWorkoutExecutionSnapshot,
} from "./workoutExecutionSnapshot.js";

const DATABASE_NAME = "the-q-offline";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "workoutExecutionSnapshots";

function createSnapshotKey({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    if (
        !ownerUserId ||
        !regionId ||
        !plannedWorkoutId
    ) {
        throw new Error(
            "Owner user id, region id, and workout id are required."
        );
    }

    return [
        ownerUserId,
        regionId,
        plannedWorkoutId,
    ].join("::");
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.addEventListener(
            "success",
            () => resolve(request.result),
            { once: true }
        );

        request.addEventListener(
            "error",
            () => reject(
                request.error ||
                new Error("IndexedDB request failed.")
            ),
            { once: true }
        );
    });
}

function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
        transaction.addEventListener(
            "complete",
            () => resolve(),
            { once: true }
        );

        transaction.addEventListener(
            "abort",
            () => reject(
                transaction.error ||
                new Error(
                    "IndexedDB transaction was aborted."
                )
            ),
            { once: true }
        );

        transaction.addEventListener(
            "error",
            () => reject(
                transaction.error ||
                new Error(
                    "IndexedDB transaction failed."
                )
            ),
            { once: true }
        );
    });
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(
                new Error(
                    "IndexedDB is not available in this browser."
                )
            );
            return;
        }

        const request = indexedDB.open(
            DATABASE_NAME,
            DATABASE_VERSION
        );

        request.addEventListener(
            "upgradeneeded",
            event => {
                const database =
                    event.target.result;

                if (
                    !database.objectStoreNames.contains(
                        SNAPSHOT_STORE
                    )
                ) {
                    const store =
                        database.createObjectStore(
                            SNAPSHOT_STORE,
                            {
                                keyPath: "snapshotKey",
                            }
                        );

                    store.createIndex(
                        "ownerUserId",
                        "ownerUserId",
                        {
                            unique: false,
                        }
                    );

                    store.createIndex(
                        "ownerRegion",
                        [
                            "ownerUserId",
                            "regionId",
                        ],
                        {
                            unique: false,
                        }
                    );

                    store.createIndex(
                        "plannedWorkoutId",
                        "plannedWorkoutId",
                        {
                            unique: false,
                        }
                    );
                }
            },
            { once: true }
        );

        request.addEventListener(
            "success",
            () => {
                const database = request.result;

                database.addEventListener(
                    "versionchange",
                    () => database.close()
                );

                resolve(database);
            },
            { once: true }
        );

        request.addEventListener(
            "error",
            () => reject(
                request.error ||
                new Error(
                    "Failed to open the offline workout database."
                )
            ),
            { once: true }
        );

        request.addEventListener(
            "blocked",
            () => reject(
                new Error(
                    "The offline workout database upgrade is blocked."
                )
            ),
            { once: true }
        );
    });
}

export async function getWorkoutExecutionSnapshot({
    ownerUserId,
    regionId,
    plannedWorkoutId,
}) {
    const snapshotKey = createSnapshotKey({
        ownerUserId,
        regionId,
        plannedWorkoutId,
    });

    const database = await openDatabase();

    try {
        const transaction =
            database.transaction(
                SNAPSHOT_STORE,
                "readonly"
            );

        const store =
            transaction.objectStore(
                SNAPSHOT_STORE
            );

        const snapshot =
            await requestToPromise(
                store.get(snapshotKey)
            );

        await transactionToPromise(transaction);

        return snapshot || null;
    } finally {
        database.close();
    }
}

export async function getVerifiedWorkoutExecutionSnapshot(
    identity
) {
    try {
        const snapshot =
            await getWorkoutExecutionSnapshot(
                identity
            );

        if (!snapshot) {
            return {
                ok: false,
                offlineReady: false,
                snapshot: null,
                error: null,
                reason: "not_found",
            };
        }

        validateWorkoutExecutionSnapshot(
            snapshot
        );

        const expectedKey = createSnapshotKey(
            identity
        );

        if (
            snapshot.snapshotKey !==
            expectedKey
        ) {
            throw new Error(
                "Stored workout snapshot identity does not match the request."
            );
        }

        return {
            ok: true,
            offlineReady: true,
            snapshot,
            error: null,
            reason: null,
        };
    } catch (error) {
        console.warn(
            "Stored workout snapshot failed verification:",
            error
        );

        return {
            ok: false,
            offlineReady: false,
            snapshot: null,
            error,
            reason: "invalid",
        };
    }
}

export async function saveWorkoutExecutionSnapshot(
    snapshot
) {
    try {
        /*
         * Reject malformed input before opening a write
         * transaction. This prevents an invalid replacement
         * from overwriting a valid stored snapshot.
         */
        validateWorkoutExecutionSnapshot(
            snapshot
        );

        const database = await openDatabase();

        try {
            const transaction =
                database.transaction(
                    SNAPSHOT_STORE,
                    "readwrite"
                );

            const store =
                transaction.objectStore(
                    SNAPSHOT_STORE
                );

            await requestToPromise(
                store.put(snapshot)
            );

            await transactionToPromise(
                transaction
            );
        } finally {
            database.close();
        }

        /*
         * Verification intentionally occurs through a separate
         * database connection and read transaction.
         */
        const verification =
            await getVerifiedWorkoutExecutionSnapshot({
                ownerUserId:
                    snapshot.ownerUserId,
                regionId:
                    snapshot.regionId,
                plannedWorkoutId:
                    snapshot.plannedWorkoutId,
            });

        if (!verification.ok) {
            throw (
                verification.error ||
                new Error(
                    "Workout snapshot readback verification failed."
                )
            );
        }

        return {
            ok: true,
            offlineReady: true,
            snapshot:
                verification.snapshot,
            error: null,
            reason: null,
        };
    } catch (error) {
        console.warn(
            "Failed to save workout execution snapshot:",
            error
        );

        return {
            ok: false,
            offlineReady: false,
            snapshot: null,
            error,
            reason: "save_failed",
        };
    }
}

export async function deleteWorkoutExecutionSnapshot(
    identity
) {
    const snapshotKey =
        createSnapshotKey(identity);

    const database = await openDatabase();

    try {
        const transaction =
            database.transaction(
                SNAPSHOT_STORE,
                "readwrite"
            );

        const store =
            transaction.objectStore(
                SNAPSHOT_STORE
            );

        await requestToPromise(
            store.delete(snapshotKey)
        );

        await transactionToPromise(
            transaction
        );

        return {
            ok: true,
            error: null,
        };
    } catch (error) {
        return {
            ok: false,
            error,
        };
    } finally {
        database.close();
    }
}

export async function deleteWorkoutExecutionSnapshotsForUser(
    ownerUserId
) {
    if (!ownerUserId) {
        throw new Error(
            "Owner user id is required."
        );
    }

    const database = await openDatabase();

    try {
        const transaction =
            database.transaction(
                SNAPSHOT_STORE,
                "readwrite"
            );

        const store =
            transaction.objectStore(
                SNAPSHOT_STORE
            );

        const index =
            store.index("ownerUserId");

        const request =
            index.openCursor(
                IDBKeyRange.only(ownerUserId)
            );

        await new Promise((resolve, reject) => {
            request.addEventListener(
                "success",
                () => {
                    const cursor =
                        request.result;

                    if (!cursor) {
                        resolve();
                        return;
                    }

                    cursor.delete();
                    cursor.continue();
                }
            );

            request.addEventListener(
                "error",
                () => reject(
                    request.error ||
                    new Error(
                        "Failed to delete user workout snapshots."
                    )
                ),
                { once: true }
            );
        });

        await transactionToPromise(
            transaction
        );

        return {
            ok: true,
            error: null,
        };
    } catch (error) {
        return {
            ok: false,
            error,
        };
    } finally {
        database.close();
    }
}