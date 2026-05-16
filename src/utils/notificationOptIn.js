import { state } from "../modules/state.js";
import { upsertNotificationSettings } from "../services/cloudData.js";
import { subscribeToPush } from "../services/pushNotifications.js";
import { showToast } from "./toast.js";

const DISMISSED_KEY = "theQNotificationPromptDismissed";

export function shouldShowQReminderPrompt() {
    if (!state.currentUserId) return false;
    if (state.notificationSettings?.pushEnabled) return false;
    if (localStorage.getItem(DISMISSED_KEY) === "true") return false;
    if (!("Notification" in window)) return false;
    if (Notification.permission === "denied") return false;

    return true;
}

export async function enableQReminders() {
    const subscription = await subscribeToPush();
    const pushSubscription = subscription?.toJSON() ?? null;

    await upsertNotificationSettings(state.currentUserId, {
        push_enabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        push_subscription: pushSubscription,
    });

    state.notificationSettings = {
        ...state.notificationSettings,
        pushEnabled: true,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        pushSubscription,
    };

    localStorage.removeItem(DISMISSED_KEY);

    showToast("Q reminders enabled.", "success");
}

export function dismissQReminderPrompt() {
    localStorage.setItem(DISMISSED_KEY, "true");
}