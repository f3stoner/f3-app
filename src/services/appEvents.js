import { supabase } from "./supabaseClient.js";
import { state } from "../modules/state.js";
import { APP_EVENTS } from "../constants/appEvents.js";

export async function logAppEvent({
    type,
    severity = "info",
    message = "",
    metadata = {},
} = {}) {
    if (!type) return;

    try {
        const user = await supabase.auth.getUser();
        const userId = user?.data?.id || null;

        const event = {
            region_id: state.currentRegionId || state.regionId || null,
            user_id: userId,
            type,
            severity,
            message,
            metadata: {
                ...metadata,
                view: state.currentView || null,
                userAgent: navigator.userAgent,
                timestampClient: new Date().toISOString(),
            },
        };

        const { error } = await supabase.from("app_events").insert(event);

        if (error) {
            console.warn("App event logging failed:", error.message);
        }
    } catch (error) {
        console.warn("App event logging crashed:", error);
    }
}

export function logSaveFailure(source, error, metadata = {}) {
    return logAppEvent({
        type: APP_EVENTS.SAVE_FAILURE,
        severity: "error",
        message: error?.message || "Save failed",
        metadata: {
            source,
            errorMessage: error?.message || null,
            errorName: error?.name || null,
            ...metadata,
        },
    });
}

export function logActionFailure(source, error, metadata = {}) {
    return logAppEvent({
        type: APP_EVENTS.ACTION_FAILURE,
        severity: "error",
        message: error?.message || "Action Failed",
        metadata: {
            source,
            errorMessage: error?.message || null,
            errorName: error?.name || null,
            ...metadata,
        },
    });
}