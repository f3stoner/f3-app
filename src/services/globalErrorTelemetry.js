import { logAppEvent } from "./appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";

let isInitialized = false;
let isHandlingGlobalError = false;

const RESOURCE_TAGS = new Set([
    "SCRIPT",
    "LINK",
]);

function getSafeConstructorName(value) {
    try {
        return value?.constructor?.name || null;
    } catch {
        return null;
    }
}

function getReasonType(reason) {
    if (reason === null) {
        return "null";
    }

    if (reason === undefined) {
        return "undefined";
    }

    if (reason instanceof Error) {
        return reason.name || "Error";
    }

    const reasonType = typeof reason;

    if (reasonType !== "object") {
        return reasonType;
    }

    const prototype =
        Object.getPrototypeOf(reason);

    if (
        prototype === Object.prototype ||
        prototype === null
    ) {
        return "plain_object";
    }

    return (
        getSafeConstructorName(reason) ||
        "object"
    );
}

function sanitizeUrl(value) {
    if (!value) {
        return null;
    }

    try {
        const url = new URL(
            String(value),
            window.location.href
        );

        url.search = "";
        url.hash = "";

        return url.toString();
    } catch {
        return String(value)
            .split("?")[0]
            .split("#")[0];
    }
}

function getResourceDetails(event) {
    try {
        const target = event?.target;

        if (
            !target ||
            target === window ||
            target === document
        ) {
            return null;
        }

        const tagName =
            String(
                target.tagName ||
                target.nodeName ||
                ""
            ).toUpperCase();

        if (!RESOURCE_TAGS.has(tagName)) {
            return null;
        }

        if (tagName === "LINK") {
            const relationship =
                String(
                    target.rel || ""
                ).toLowerCase();

            if (relationship !== "stylesheet") {
                return null;
            }
        }

        const resourceUrl =
            target.src ||
            target.href ||
            null;

        return {
            resourceTag: tagName,
            resourceUrl:
                sanitizeUrl(resourceUrl),
        };
    } catch {
        return null;
    }
}

function getWindowErrorMetadata(event) {
    const resourceDetails =
        getResourceDetails(event);

    if (resourceDetails) {
        return {
            source: "window_error",
            eventType:
                event?.type || "error",
            errorName:
                "ResourceLoadError",
            errorMessage:
                `Failed to load ${
                    resourceDetails.resourceTag
                } resource`,
            stack: null,
            filename: null,
            line: null,
            column: null,
            isResourceError: true,
            isCrossOriginScriptError: false,
            resourceTag:
                resourceDetails.resourceTag,
            resourceUrl:
                resourceDetails.resourceUrl,
        };
    }

    const error = event?.error;

    const errorMessage =
        error?.message ||
        event?.message ||
        "Uncaught JavaScript error";

    const isCrossOriginScriptError =
        errorMessage === "Script error." &&
        !error &&
        !event?.filename;

    return {
        source: "window_error",
        eventType:
            event?.type || "error",
        errorName:
            error?.name || "Error",
        errorMessage,
        stack:
            error?.stack || null,
        filename:
            sanitizeUrl(
                event?.filename || null
            ),
        line:
            Number.isFinite(event?.lineno)
                ? event.lineno
                : null,
        column:
            Number.isFinite(event?.colno)
                ? event.colno
                : null,
        isResourceError: false,
        isCrossOriginScriptError,
        resourceTag: null,
        resourceUrl: null,
    };
}

function getUnhandledRejectionMetadata(event) {
    const reason = event?.reason;
    const reasonType =
        getReasonType(reason);

    if (reason === null) {
        return {
            source:
                "unhandled_rejection",
            eventType:
                event?.type ||
                "unhandledrejection",
            reasonType,
            errorName: null,
            errorMessage:
                "Unhandled rejection with null reason",
            stack: null,
            errorCode: null,
            errorDetails: null,
            errorHint: null,
            errorStatus: null,
        };
    }

    if (reason === undefined) {
        return {
            source:
                "unhandled_rejection",
            eventType:
                event?.type ||
                "unhandledrejection",
            reasonType,
            errorName: null,
            errorMessage:
                "Unhandled rejection with undefined reason",
            stack: null,
            errorCode: null,
            errorDetails: null,
            errorHint: null,
            errorStatus: null,
        };
    }

    if (
        typeof reason === "string" ||
        typeof reason === "number" ||
        typeof reason === "boolean" ||
        typeof reason === "bigint"
    ) {
        return {
            source:
                "unhandled_rejection",
            eventType:
                event?.type ||
                "unhandledrejection",
            reasonType,
            errorName: null,
            errorMessage:
                String(reason),
            stack: null,
            errorCode: null,
            errorDetails: null,
            errorHint: null,
            errorStatus: null,
        };
    }

    const isPlainObject =
        typeof reason === "object" &&
        (
            Object.getPrototypeOf(reason) ===
                Object.prototype ||
            Object.getPrototypeOf(reason) ===
                null
        );

    if (
        reason instanceof Error ||
        isPlainObject
    ) {
        return {
            source:
                "unhandled_rejection",
            eventType:
                event?.type ||
                "unhandledrejection",
            reasonType,
            errorName:
                reason?.name || null,
            errorMessage:
                reason?.message ||
                "Unhandled Promise rejection",
            stack:
                reason?.stack || null,
            errorCode:
                reason?.code || null,
            errorDetails:
                reason?.details || null,
            errorHint:
                reason?.hint || null,
            errorStatus:
                reason?.status || null,
        };
    }

    return {
        source:
            "unhandled_rejection",
        eventType:
            event?.type ||
            "unhandledrejection",
        reasonType,
        errorName: null,
        errorMessage:
            `Unhandled rejection with ${reasonType} reason`,
        stack: null,
        errorCode: null,
        errorDetails: null,
        errorHint: null,
        errorStatus: null,
    };
}

function handleWindowError(event) {
    if (isHandlingGlobalError) {
        return;
    }

    isHandlingGlobalError = true;

    try {
        const metadata =
            getWindowErrorMetadata(event);

        void logAppEvent({
            type:
                APP_EVENTS.JAVASCRIPT_ERROR,
            severity: "error",
            message:
                metadata.errorMessage,
            metadata,
        });
    } catch {
        /*
         * Global telemetry must never cause
         * another global failure.
         */
    } finally {
        isHandlingGlobalError = false;
    }
}

function handleUnhandledRejection(event) {
    if (isHandlingGlobalError) {
        return;
    }

    isHandlingGlobalError = true;

    try {
        const metadata =
            getUnhandledRejectionMetadata(
                event
            );

        void logAppEvent({
            type:
                APP_EVENTS.UNHANDLED_REJECTION,
            severity: "error",
            message:
                metadata.errorMessage,
            metadata,
        });
    } catch {
        /*
         * Global telemetry must never cause
         * another global failure.
         */
    } finally {
        isHandlingGlobalError = false;
    }
}

export function initializeGlobalErrorTelemetry() {
    if (
        isInitialized ||
        typeof window === "undefined"
    ) {
        return;
    }

    isInitialized = true;

    window.addEventListener(
        "error",
        handleWindowError,
        true
    );

    window.addEventListener(
        "unhandledrejection",
        handleUnhandledRejection
    );
}