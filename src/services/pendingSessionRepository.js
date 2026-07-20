import {
    createPendingSessionKey,
    validatePendingSessionCommand,
} from "./pendingSessionCommand.js";

const DATABASE_NAME = "the-q-pending-sessions";
const DATABASE_VERSION = 1;
const COMMAND_STORE = "pendingSessionCommands";

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
                new Error(
                    "IndexedDB request failed."
                )
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
            (event) => {
                const database = event.target.result;

                if (
                    !database.objectStoreNames.contains(
                        COMMAND_STORE
                    )
                ) {
                    const store =
                        database.createObjectStore(
                            COMMAND_STORE,
                            {
                                keyPath: "recordKey",
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
                        "status",
                        "status",
                        {
                            unique: false,
                        }
                    );

                    store.createIndex(
                        "queuedAt",
                        "queuedAt",
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
                    "Failed to open the pending session database."
                )
            ),
            { once: true }
        );

        request.addEventListener(
            "blocked",
            () => reject(
                new Error(
                    "The pending session database upgrade is blocked."
                )
            ),
            { once: true }
        );
    });
}

export async function getPendingSessionCommand({
    ownerUserId,
    regionId,
    sessionId,
}) {
    const recordKey = createPendingSessionKey({
        ownerUserId,
        regionId,
        sessionId,
    });

    const database = await openDatabase();

    try {
        const transaction =
            database.transaction(
                COMMAND_STORE,
                "readonly"
            );

        const store =
            transaction.objectStore(
                COMMAND_STORE
            );

        const record = await requestToPromise(
            store.get(recordKey)
        );

        await transactionToPromise(transaction);

        return record || null;
    } finally {
        database.close();
    }
}

export async function getVerifiedPendingSessionCommand(
    identity
) {
    try {
        const record =
            await getPendingSessionCommand(identity);

        if (!record) {
            return {
                ok: false,
                record: null,
                error: null,
                reason: "not_found",
            };
        }

        validatePendingSessionCommand(record);

        const expectedKey =
            createPendingSessionKey(identity);

        if (record.recordKey !== expectedKey) {
            throw new Error(
                "Stored pending session identity does not match the request."
            );
        }

        return {
            ok: true,
            record,
            error: null,
            reason: null,
        };
    } catch (error) {
        console.warn(
            "Stored pending session command failed verification:",
            error
        );

        return {
            ok: false,
            record: null,
            error,
            reason: "invalid",
        };
    }
}

export async function savePendingSessionCommand(
    record
) {
    try {
        /*
         * Validate before writing so malformed data cannot
         * replace a valid queued command.
         */
        validatePendingSessionCommand(record);

        const database = await openDatabase();

        try {
            const transaction =
                database.transaction(
                    COMMAND_STORE,
                    "readwrite"
                );

            const store =
                transaction.objectStore(
                    COMMAND_STORE
                );

            await requestToPromise(
                store.put(record)
            );

            await transactionToPromise(
                transaction
            );
        } finally {
            database.close();
        }

        /*
         * Verify persistence through a separate connection
         * and read transaction.
         */
        const verification =
            await getVerifiedPendingSessionCommand({
                ownerUserId:
                    record.ownerUserId,
                regionId:
                    record.regionId,
                sessionId:
                    record.sessionId,
            });

        if (!verification.ok) {
            throw (
                verification.error ||
                new Error(
                    "Pending session command readback verification failed."
                )
            );
        }

        return {
            ok: true,
            record: verification.record,
            error: null,
            reason: null,
        };
    } catch (error) {
        console.warn(
            "Failed to save pending session command:",
            error
        );

        return {
            ok: false,
            record: null,
            error,
            reason: "save_failed",
        };
    }
}

export async function getPendingSessionCommands({
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

    const database = await openDatabase();

    try {
        const transaction =
            database.transaction(
                COMMAND_STORE,
                "readonly"
            );

        const store =
            transaction.objectStore(
                COMMAND_STORE
            );

        const index =
            store.index("ownerRegion");

        const records = await requestToPromise(
            index.getAll(
                IDBKeyRange.only([
                    ownerUserId,
                    regionId,
                ])
            )
        );

        await transactionToPromise(transaction);

        const validRecords = [];

        for (const record of records || []) {
            try {
                validatePendingSessionCommand(record);
                validRecords.push(record);
            } catch (error) {
                console.warn(
                    "Ignoring invalid pending session command:",
                    record?.recordKey,
                    error
                );
            }
        }

        return validRecords.sort(
            (left, right) =>
                new Date(left.queuedAt).getTime() -
                new Date(right.queuedAt).getTime()
        );
    } finally {
        database.close();
    }
}

export async function countPendingSessionCommands({
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

    const database = await openDatabase();

    try {
        const transaction =
            database.transaction(
                COMMAND_STORE,
                "readonly"
            );

        const store =
            transaction.objectStore(
                COMMAND_STORE
            );

        const index =
            store.index("ownerRegion");

        const count = await requestToPromise(
            index.count(
                IDBKeyRange.only([
                    ownerUserId,
                    regionId,
                ])
            )
        );

        await transactionToPromise(transaction);

        return count;
    } finally {
        database.close();
    }
}

export async function deletePendingSessionCommand(
    identity
) {
    const recordKey =
        createPendingSessionKey(identity);

    const database = await openDatabase();

    try {
        const transaction =
            database.transaction(
                COMMAND_STORE,
                "readwrite"
            );

        const store =
            transaction.objectStore(
                COMMAND_STORE
            );

        await requestToPromise(
            store.delete(recordKey)
        );

        await transactionToPromise(transaction);

        return {
            ok: true,
            error: null,
        };
    } catch (error) {
        console.warn(
            "Failed to delete pending session command:",
            error
        );

        return {
            ok: false,
            error,
        };
    } finally {
        database.close();
    }
}