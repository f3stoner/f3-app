import { supabase } from "./supabaseClient.js";
import { state } from "../modules/state.js";
import { APP_EVENTS } from "../constants/appEvents.js";

const isDevelopment =
    process.env.NODE_ENV === "development";

const TELEMETRY_SCHEMA_VERSION = 1;
const TELEMETRY_DIAGNOSTIC_KEY =
    "theQTelemetryDiagnostics";

const LIMITS = {
    type: 100,
    severity: 20,
    message: 2000,
    metadataString: 1000,
    stack: 8000,
    arrayItems: 25,
    objectKeys: 50,
    depth: 4,
    diagnosticCount: 9999,
    diagnosticErrorCode: 100,
    diagnosticErrorMessage: 500,
    buildId: 100,
};

const REDACTED_VALUE = "[Redacted]";
const CIRCULAR_VALUE = "[Circular]";
const TRUNCATED_VALUE = "[Truncated]";

const SENSITIVE_KEYS = new Set([
    "authorization",
    "accesstoken",
    "refreshtoken",
    "password",
    "secret",
    "apikey",
]);

let inMemoryTelemetryDiagnostic = null;

function truncateString(value, maxLength) {
    const stringValue =
        typeof value === "string"
            ? value
            : String(value ?? "");

    if (stringValue.length <= maxLength) {
        return stringValue;
    }

    return `${stringValue.slice(
        0,
        Math.max(0, maxLength - 15)
    )}[Truncated]`;
}

function getBuildId() {
    try {
        return truncateString(
            typeof __BUILD_ID__ !== "undefined"
                ? __BUILD_ID__
                : "unknown",
            LIMITS.buildId
        );
    } catch {
        return "unknown";
    }
}

function getUserAgent() {
    try {
        return typeof navigator !== "undefined"
            ? navigator.userAgent || null
            : null;
    } catch {
        return null;
    }
}

function getOnlineState() {
    try {
        return typeof navigator !== "undefined" &&
            typeof navigator.onLine === "boolean"
            ? navigator.onLine
            : null;
    } catch {
        return null;
    }
}

function getDisplayMode() {
    try {
        if (
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia(
                "(display-mode: standalone)"
            ).matches
        ) {
            return "standalone";
        }

        if (
            typeof navigator !== "undefined" &&
            navigator.standalone === true
        ) {
            return "standalone";
        }

        if (
            typeof window !== "undefined" ||
            typeof navigator !== "undefined"
        ) {
            return "browser";
        }

        return "unknown";
    } catch {
        return "unknown";
    }
}

function buildTelemetryContext() {
    return {
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        buildId: getBuildId(),
        view: state.currentView || null,
        timestampClient: new Date().toISOString(),
        userAgent: getUserAgent(),
        online: getOnlineState(),
        displayMode: getDisplayMode(),
    };
}

function normalizeKey(key) {
    return String(key)
        .toLowerCase()
        .replace(/[\s_-]/g, "");
}

function isSensitiveKey(key) {
    return SENSITIVE_KEYS.has(
        normalizeKey(key)
    );
}

function redactSensitiveString(value) {
    let result = value;

    result = result.replace(
        /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
        "Bearer [Redacted]"
    );

    try {
        result = result.replace(
            /([?&](?:access_token|refresh_token|token|api_key|apikey|authorization)=)[^&#\s]*/gi,
            "$1[Redacted]"
        );
    } catch {
        // Best-effort redaction only.
    }

    return result;
}

function isPlainObject(value) {
    if (
        !value ||
        typeof value !== "object"
    ) {
        return false;
    }

    const prototype =
        Object.getPrototypeOf(value);

    return (
        prototype === Object.prototype ||
        prototype === null
    );
}

function isDomNode(value) {
    try {
        return (
            typeof Node !== "undefined" &&
            value instanceof Node
        );
    } catch {
        return false;
    }
}

function isBrowserEvent(value) {
    try {
        return (
            typeof Event !== "undefined" &&
            value instanceof Event
        );
    } catch {
        return false;
    }
}

function isResponse(value) {
    try {
        return (
            typeof Response !== "undefined" &&
            value instanceof Response
        );
    } catch {
        return false;
    }
}

function normalizeKnownError(
    value,
    {
        depth,
        seen,
    }
) {
    const result = {};

    const fields = [
        "name",
        "message",
        "stack",
        "code",
        "details",
        "hint",
        "status",
    ];

    fields.forEach(field => {
        const fieldValue = value?.[field];

        if (
            fieldValue === undefined ||
            fieldValue === null
        ) {
            return;
        }

        const normalized = normalizeTelemetryValue(
            fieldValue,
            {
                depth: depth + 1,
                seen,
                key: field,
                inArray: false,
            }
        );

        if (normalized !== undefined) {
            result[field] = normalized;
        }
    });

    return result;
}

function normalizeTelemetryValue(
    value,
    {
        depth = 0,
        seen = new WeakSet(),
        key = "",
        inArray = false,
    } = {}
) {
    if (value === null) {
        return null;
    }

    if (value === undefined) {
        return inArray ? null : undefined;
    }

    const valueType = typeof value;

    if (valueType === "string") {
        const maxLength =
            normalizeKey(key) === "stack"
                ? LIMITS.stack
                : LIMITS.metadataString;

        return truncateString(
            redactSensitiveString(value),
            maxLength
        );
    }

    if (valueType === "number") {
        return Number.isFinite(value)
            ? value
            : null;
    }

    if (valueType === "boolean") {
        return value;
    }

    if (valueType === "bigint") {
        return value.toString();
    }

    if (
        valueType === "function" ||
        valueType === "symbol"
    ) {
        return inArray ? null : undefined;
    }

    if (depth >= LIMITS.depth) {
        return TRUNCATED_VALUE;
    }

    if (
        value &&
        typeof value === "object"
    ) {
        if (seen.has(value)) {
            return CIRCULAR_VALUE;
        }

        seen.add(value);

        try {
            if (value instanceof Date) {
                return Number.isNaN(
                    value.getTime()
                )
                    ? null
                    : value.toISOString();
            }

            if (value instanceof Error) {
                return normalizeKnownError(
                    value,
                    {
                        depth,
                        seen,
                    }
                );
            }

            if (isDomNode(value)) {
                const tagName =
                    value.nodeName ||
                    value.tagName ||
                    "unknown";

                return `[DOMNode:${String(
                    tagName
                ).toLowerCase()}]`;
            }

            if (isBrowserEvent(value)) {
                return `[Event:${
                    value.type || "unknown"
                }]`;
            }

            if (isResponse(value)) {
                return {
                    status:
                        Number.isFinite(value.status)
                            ? value.status
                            : null,
                    statusText:
                        truncateString(
                            value.statusText || "",
                            LIMITS.metadataString
                        ),
                    type:
                        truncateString(
                            value.type || "",
                            LIMITS.metadataString
                        ),
                    url:
                        truncateString(
                            redactSensitiveString(
                                value.url || ""
                            ),
                            LIMITS.metadataString
                        ),
                };
            }

            if (Array.isArray(value)) {
                return value
                    .slice(
                        0,
                        LIMITS.arrayItems
                    )
                    .map(item =>
                        normalizeTelemetryValue(
                            item,
                            {
                                depth:
                                    depth + 1,
                                seen,
                                key: "",
                                inArray: true,
                            }
                        )
                    );
            }

            if (!isPlainObject(value)) {
                const constructorName =
                    value?.constructor?.name ||
                    "Unknown";

                return `[Object:${truncateString(
                    constructorName,
                    100
                )}]`;
            }

            const result = {};

            Object.keys(value)
                .slice(0, LIMITS.objectKeys)
                .forEach(objectKey => {
                    if (
                        isSensitiveKey(objectKey)
                    ) {
                        result[objectKey] =
                            REDACTED_VALUE;
                        return;
                    }

                    const normalized =
                        normalizeTelemetryValue(
                            value[objectKey],
                            {
                                depth:
                                    depth + 1,
                                seen,
                                key: objectKey,
                                inArray: false,
                            }
                        );

                    if (
                        normalized !== undefined
                    ) {
                        result[objectKey] =
                            normalized;
                    }
                });

            return result;
        } finally {
            seen.delete(value);
        }
    }

    return truncateString(
        String(value),
        LIMITS.metadataString
    );
}

function normalizeMetadata(metadata) {
    if (!isPlainObject(metadata)) {
        return {};
    }

    const normalized =
        normalizeTelemetryValue(metadata);

    return isPlainObject(normalized)
        ? normalized
        : {};
}

function sanitizeDiagnosticError(error) {
    return {
        code: truncateString(
            error?.code ||
                error?.status ||
                error?.name ||
                "unknown",
            LIMITS.diagnosticErrorCode
        ),
        message: truncateString(
            redactSensitiveString(
                error?.message ||
                    "Telemetry persistence failed"
            ),
            LIMITS.diagnosticErrorMessage
        ),
    };
}

function getStoredTelemetryDiagnostic() {
    try {
        if (
            typeof localStorage ===
            "undefined"
        ) {
            return null;
        }

        const raw = localStorage.getItem(
            TELEMETRY_DIAGNOSTIC_KEY
        );

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        return isPlainObject(parsed)
            ? parsed
            : null;
    } catch {
        return null;
    }
}

function recordTelemetryFailure(
    eventType,
    error
) {
    try {
        const stored =
            getStoredTelemetryDiagnostic();

        const current =
            stored ||
            inMemoryTelemetryDiagnostic ||
            {};

        const sanitized =
            sanitizeDiagnosticError(error);

        const nextDiagnostic = {
            schemaVersion:
                TELEMETRY_SCHEMA_VERSION,
            failureCount: Math.min(
                Number.isFinite(
                    current.failureCount
                )
                    ? current.failureCount + 1
                    : 1,
                LIMITS.diagnosticCount
            ),
            lastFailureAt:
                new Date().toISOString(),
            lastEventType:
                truncateString(
                    eventType || "unknown",
                    LIMITS.type
                ),
            lastErrorCode:
                sanitized.code,
            lastErrorMessage:
                sanitized.message,
            buildId: getBuildId(),
        };

        inMemoryTelemetryDiagnostic =
            nextDiagnostic;

        try {
            if (
                typeof localStorage !==
                "undefined"
            ) {
                localStorage.setItem(
                    TELEMETRY_DIAGNOSTIC_KEY,
                    JSON.stringify(
                        nextDiagnostic
                    )
                );
            }
        } catch {
            // The in-memory fallback is already updated.
        }

        if (isDevelopment) {
            console.warn(
                "App event logging failed:",
                sanitized.message
            );
        }
    } catch {
        // Telemetry diagnostics must never escape.
    }
}

export async function logAppEvent({
    type,
    severity = "info",
    message = "",
    metadata = {},
} = {}) {
    if (!type) return;

    let normalizedType = "unknown";

    try {
        normalizedType =
            truncateString(
                type,
                LIMITS.type
            ) || "unknown";

        const event = {
            region_id:
                state.currentRegionId ||
                null,
            user_id:
                state.currentUserId ||
                null,
            type: normalizedType,
            severity:
                truncateString(
                    severity || "info",
                    LIMITS.severity
                ) || "info",
            message:
                truncateString(
                    message || "",
                    LIMITS.message
                ),
            metadata: {
                ...normalizeMetadata(
                    metadata
                ),
                ...buildTelemetryContext(),
            },
        };

        const { error } = await supabase
            .from("app_events")
            .insert(event);

        if (error) {
            recordTelemetryFailure(
                normalizedType,
                error
            );
        }
    } catch (error) {
        recordTelemetryFailure(
            normalizedType,
            error
        );
    }
}

export function logSaveFailure(
    source,
    error,
    metadata = {}
) {
    return logAppEvent({
        type: APP_EVENTS.SAVE_FAILURE,
        severity: "error",
        message:
            error?.message ||
            "Save failed",
        metadata: {
            source,
            errorMessage:
                error?.message || null,
            errorName:
                error?.name || null,
            ...metadata,
        },
    });
}

export function logSessionSaveOutcome({
    operation,
    outcome = null,
    error = null,
    durationMs = null,
    sessionId = null,
    aoId = null,
} = {}) {
    const status =
        outcome?.status ||
        "failed";

    const postSave =
        outcome?.postSave ||
        null;

    const degradedStages = [];

    if (
        postSave?.statsRefreshSucceeded ===
        false
    ) {
        degradedStages.push(
            "stats_refresh"
        );
    }

    if (
        postSave?.memberRefreshSucceeded ===
        false
    ) {
        degradedStages.push(
            "member_refresh"
        );
    }

    if (
        postSave
            ?.localStateRefreshSucceeded ===
        false
    ) {
        degradedStages.push(
            "local_state_refresh"
        );
    }

    return logAppEvent({
        type:
            APP_EVENTS
                .SESSION_SAVE_OUTCOME,

        severity:
            status === "failed"
                ? "error"
                : status === "partial"
                    ? "warning"
                    : "info",

        message:
            `Session save ${status}`,

        metadata: {
            operation:
                operation || null,

            status,

            path:
                outcome?.path ||
                null,

            durationMs:
                Number.isFinite(durationMs)
                    ? Math.max(
                        0,
                        Math.round(durationMs)
                    )
                    : null,

            sessionId:
                outcome
                    ?.savedSession
                    ?.id ||
                sessionId ||
                null,

            aoId:
                outcome
                    ?.savedSession
                    ?.aoId ||
                aoId ||
                null,

            databaseCommitted:
                typeof outcome
                    ?.databaseCommitted ===
                "boolean"
                    ? outcome
                        .databaseCommitted
                    : null,

            queuedLocally:
                typeof outcome
                    ?.queuedLocally ===
                "boolean"
                    ? outcome
                        .queuedLocally
                    : null,

            transportFallbackUsed:
                typeof outcome
                    ?.transportFallbackUsed ===
                "boolean"
                    ? outcome
                        .transportFallbackUsed
                    : null,

            degradedStages,

            postSave,

            errorName:
                error?.name ||
                null,

            errorMessage:
                error?.message ||
                null,
        },
    });
}

export function logActionFailure(
    source,
    error,
    metadata = {}
) {
    return logAppEvent({
        type: APP_EVENTS.ACTION_FAILURE,
        severity: "error",
        message:
            error?.message ||
            "Action Failed",
        metadata: {
            source,
            errorMessage:
                error?.message || null,
            errorName:
                error?.name || null,
            ...metadata,
        },
    });
}

export function logPendingSessionSyncOutcome({
    outcome,
    record,
    durationMs,
} = {}) {
    return logAppEvent({
        type:
            APP_EVENTS
                .PENDING_SESSION_SYNC_OUTCOME,

        severity:
            outcome?.status ===
            "cleanup_failed"
                ? "warning"
                : outcome?.status ===
                  "upload_failed"
                    ? "error"
                    : "info",

        message:
            `Pending session sync ${outcome?.status ?? "unknown"}`,

        metadata: {
            status:
                outcome?.status ?? null,

            durationMs:
                Number.isFinite(durationMs)
                    ? Math.max(
                        0,
                        Math.round(durationMs)
                    )
                    : null,

            pendingRecordId:
                record?.recordKey ??
                null,

            commandId:
                record?.commandId ??
                null,

            sessionId:
                record?.sessionId ??
                null,

            aoId:
                record?.command
                    ?.p_session
                    ?.ao_id ??
                null,

            attemptCount:
                outcome?.record
                    ?.attemptCount ??
                null,

            databaseCommitted:
                outcome
                    ?.databaseCommitted ??
                null,

            pendingRecordRemoved:
                outcome
                    ?.pendingRecordRemoved ??
                null,

            statePersistenceFailed:
                Boolean(
                    outcome
                        ?.statePersistenceError
                ),

            errorName:
                outcome?.error
                    ?.name ??
                null,

            errorMessage:
                outcome?.error
                    ?.message ??
                null,
        },
    });
}