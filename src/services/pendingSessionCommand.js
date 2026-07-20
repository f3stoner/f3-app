export const PENDING_SESSION_COMMAND_SCHEMA_VERSION = 1;

export const PENDING_SESSION_STATUS = {
    PENDING: "pending",
    SENDING: "sending",
    NEEDS_AUTH: "needs_auth",
    NEEDS_REVIEW: "needs_review",
};

const VALID_STATUSES = new Set(
    Object.values(PENDING_SESSION_STATUS)
);

function cloneSerializable(value) {
    if (value === undefined) return null;

    return JSON.parse(JSON.stringify(value));
}

export function createPendingSessionKey({
    ownerUserId,
    regionId,
    sessionId,
}) {
    if (!ownerUserId) {
        throw new Error(
            "Pending session command is missing its owner user id."
        );
    }

    if (!regionId) {
        throw new Error(
            "Pending session command is missing its region id."
        );
    }

    if (!sessionId) {
        throw new Error(
            "Pending session command is missing its session id."
        );
    }

    return [
        ownerUserId,
        regionId,
        sessionId,
    ].join("::");
}

function getCommandSessionId(command) {
    return command?.p_session?.id || null;
}

export function buildPendingSessionCommand({
    command,
    ownerUserId,
    ownerMemberId = null,
    queuedAt = new Date().toISOString(),
}) {
    if (!command || typeof command !== "object") {
        throw new Error(
            "A session save command is required."
        );
    }

    if (command.p_mode !== "create") {
        throw new Error(
            "Only create-mode session commands can currently be queued."
        );
    }

    const regionId = command.p_region_id;
    const sessionId = getCommandSessionId(command);

    const record = {
        schemaVersion:
            PENDING_SESSION_COMMAND_SCHEMA_VERSION,

        recordKey: createPendingSessionKey({
            ownerUserId,
            regionId,
            sessionId,
        }),

        commandId: crypto.randomUUID(),

        ownerUserId,
        ownerMemberId,
        regionId,
        sessionId,

        mode: command.p_mode,
        command: cloneSerializable(command),

        queuedAt,
        updatedAt: queuedAt,

        attemptCount: 0,
        lastAttemptAt: null,

        status: PENDING_SESSION_STATUS.PENDING,
        lastError: null,
    };

    validatePendingSessionCommand(record);

    return record;
}

export function validatePendingSessionCommand(record) {
    if (!record || typeof record !== "object") {
        throw new Error(
            "Pending session command is missing."
        );
    }

    if (
        record.schemaVersion !==
        PENDING_SESSION_COMMAND_SCHEMA_VERSION
    ) {
        throw new Error(
            `Unsupported pending session command schema: ${record.schemaVersion}.`
        );
    }

    if (!record.recordKey) {
        throw new Error(
            "Pending session command is missing its key."
        );
    }

    if (!record.commandId) {
        throw new Error(
            "Pending session command is missing its command id."
        );
    }

    if (!record.ownerUserId) {
        throw new Error(
            "Pending session command is missing its owner user id."
        );
    }

    if (!record.regionId) {
        throw new Error(
            "Pending session command is missing its region id."
        );
    }

    if (!record.sessionId) {
        throw new Error(
            "Pending session command is missing its session id."
        );
    }

    const expectedKey = createPendingSessionKey({
        ownerUserId: record.ownerUserId,
        regionId: record.regionId,
        sessionId: record.sessionId,
    });

    if (record.recordKey !== expectedKey) {
        throw new Error(
            "Pending session command key does not match its identity."
        );
    }

    if (record.mode !== "create") {
        throw new Error(
            "Only create-mode pending session commands are supported."
        );
    }

    if (
        !record.command ||
        typeof record.command !== "object"
    ) {
        throw new Error(
            "Pending session command is missing its RPC command."
        );
    }

    if (record.command.p_mode !== record.mode) {
        throw new Error(
            "Pending session command mode does not match its RPC command."
        );
    }

    if (
        record.command.p_region_id !==
        record.regionId
    ) {
        throw new Error(
            "Pending session command region does not match its RPC command."
        );
    }

    const commandSessionId =
        getCommandSessionId(record.command);

    if (commandSessionId !== record.sessionId) {
        throw new Error(
            "Pending session command session id does not match its RPC command."
        );
    }

    if (!record.queuedAt) {
        throw new Error(
            "Pending session command is missing its queued timestamp."
        );
    }

    if (!record.updatedAt) {
        throw new Error(
            "Pending session command is missing its updated timestamp."
        );
    }

    if (
        !Number.isInteger(record.attemptCount) ||
        record.attemptCount < 0
    ) {
        throw new Error(
            "Pending session command has an invalid attempt count."
        );
    }

    if (!VALID_STATUSES.has(record.status)) {
        throw new Error(
            `Pending session command has an unsupported status: ${record.status}.`
        );
    }

    return true;
}