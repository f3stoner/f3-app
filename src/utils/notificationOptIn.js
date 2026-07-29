import { state } from "../modules/state.js";
import {
    deletePushSubscription,
    upsertNotificationSettings,
    upsertPushSubscription,
} from "../services/cloudData.js";
import { subscribeToPush } from "../services/pushNotifications.js";
import { showToast } from "./toast.js";

const DISMISSED_KEY =
    "theQNotificationPromptDismissed";

function getCurrentTimezone() {
    return Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone;
}

export function shouldShowQReminderPrompt() {
    if (!state.currentUserId) return false;
    if (state.notificationSettings?.pushEnabled) {
        return false;
    }

    if (
        localStorage.getItem(DISMISSED_KEY) ===
        "true"
    ) {
        return false;
    }

    if (!("Notification" in window)) {
        return false;
    }

    if (Notification.permission === "denied") {
        return false;
    }

    return true;
}

export async function enableQReminders() {
    if (!state.currentUserId) {
        throw new Error("No signed-in user.");
    }

    const subscription = await subscribeToPush();
    const pushSubscription =
        subscription?.toJSON();

    if (
        !pushSubscription?.endpoint
    ) {
        throw new Error(
            "The browser did not return a valid push subscription."
        );
    }

    const timezone = getCurrentTimezone();

    /*
     * Register this browser before enabling the
     * user-level notification preference.
     */
    await upsertPushSubscription(
        state.currentUserId,
        pushSubscription
    );

    await upsertNotificationSettings(
        state.currentUserId,
        {
            push_enabled: true,
            timezone,
        }
    );

    state.notificationSettings = {
        ...state.notificationSettings,
        pushEnabled: true,
        timezone,
    };

    localStorage.removeItem(DISMISSED_KEY);

    showToast(
        "Q reminders enabled.",
        "success"
    );
}

export async function disableQReminders() {
    if (!state.currentUserId) {
        throw new Error("No signed-in user.");
    }

    let subscription = null;

    if ("serviceWorker" in navigator) {
        const registration =
            await navigator.serviceWorker.ready;

        subscription =
            await registration.pushManager
                ?.getSubscription();
    }

    /*
     * Save the endpoint before unsubscribing because
     * the subscription may no longer be readable
     * afterward.
     */
    const endpoint =
        subscription?.endpoint || null;

    if (endpoint) {
        await deletePushSubscription(endpoint);
    }

    if (subscription) {
        const unsubscribed =
            await subscription.unsubscribe();

        if (!unsubscribed) {
            console.warn(
                "Browser push subscription could not be unsubscribed."
            );
        }
    }

    const timezone = getCurrentTimezone();

    await upsertNotificationSettings(
        state.currentUserId,
        {
            push_enabled: false,
            timezone,
        }
    );

    state.notificationSettings = {
        ...state.notificationSettings,
        pushEnabled: false,
        timezone,
    };

    showToast(
        "Q reminders disabled.",
        "success"
    );
}

export function dismissQReminderPrompt() {
    localStorage.setItem(
        DISMISSED_KEY,
        "true"
    );
}