export async function subscribeToPush() {
    if (!("serviceWorker" in navigator)) return null;

    const registration = await navigator.serviceWorker.ready;

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