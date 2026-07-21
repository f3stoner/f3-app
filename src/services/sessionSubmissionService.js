import {
    executeSessionSaveCommand,
} from "./cloudData.js";

import {
    buildPendingSessionCommand,
} from "./pendingSessionCommand.js";

import {
    savePendingSessionCommand,
} from "./pendingSessionRepository.js";

export async function submitSessionSaveCommand({
    command,
    ownerUserId,
    ownerMemberId = null,
}) {
    if (!command || typeof command !== "object") {
        throw new Error(
            "A session save command is required."
        );
    }

    if (!ownerUserId) {
        throw new Error(
            "Owner user id is required."
        );
    }

    /*
     * Updates remain online-only for now.
     */
    if (command.p_mode !== "create") {
        return {
            status: "saved",
            path: "online",
            databaseCommitted: true,
            queuedLocally: false,
            transportFallbackUsed: false,
            result:
                await executeSessionSaveCommand(
                    command
                ),
        };
    }

    let transportFallbackUsed = false;

    /*
     * Try the normal cloud save first unless the browser
     * explicitly knows it is offline.
     */
    if (navigator.onLine !== false) {
        try {
            return {
                status: "saved",
                path: "online",
                databaseCommitted: true,
                queuedLocally: false,
                transportFallbackUsed: false,
                result:
                    await executeSessionSaveCommand(
                        command
                    ),
            };
        } catch (error) {
            const errorMessage = String(
                error?.message ||
                error?.details ||
                error ||
                ""
            );

            const isTransportFailure =
                /failed to fetch/i.test(errorMessage) ||
                /network request failed/i.test(errorMessage) ||
                /internet disconnected/i.test(errorMessage);

            if (!isTransportFailure) {
                throw error;
            }

            transportFallbackUsed = true;

            console.warn(
                "Session transport failed; saving command locally.",
                error
            );
        }
    }

    const pendingRecord =
        buildPendingSessionCommand({
            command,
            ownerUserId,
            ownerMemberId,
        });

    const saveResult =
        await savePendingSessionCommand(
            pendingRecord
        );

    if (!saveResult.ok) {
        throw (
            saveResult.error ||
            new Error(
                "Failed to save the session on this device."
            )
        );
    }

    return {
        status: "queued",
        path: transportFallbackUsed
            ? "transport_fallback_queue"
            : "offline_queue",
        databaseCommitted: false,
        queuedLocally: true,
        transportFallbackUsed,
        result: null,
        pendingRecord: saveResult.record,
    };
}