export async function subscribeToPush() {
    if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers are not supported in this browser.");
    }

    if (!("Notification" in window)) {
        throw new Error("Notifications are not supported in this browser.");
    }

    if (!("PushManager" in window)) {
        throw new Error("Push notifications are not supported in this browser.");
    }

    const registration = await navigator.serviceWorker.ready;

    if (!registration.pushManager) {
        throw new Error("Push manager is not available.");
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
        throw new Error("Permission denied");
    }

    const vapidKey = process.env.VAPID_PUBLIC_KEY;

    if (!vapidKey) {
        throw new Error("Missing VAPID public key.");
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
    }

    return subscription;
}

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}