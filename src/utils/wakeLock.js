let wakeLock = null;

export async function requestWakeLock() {
    try {
        if (!("wakeLock" in navigator)) {
            return;
        }

        wakeLock = await navigator.wakeLock.request("screen");

        wakeLock.addEventListener("release", () => {
            wakeLock = null;
        });

    } catch (error) {
        console.warn("Wake lock request failed:", error);
    }
}

export async function releaseWakeLock() {
    try {
        if (wakeLock) {
            await wakeLock.release();
            wakeLock = null;
        }
    } catch (error) {
        console.warn("Wake lock release failed:", error);
    }
}

export async function restoreWakeLock() {
    try {
        if (
            document.visibilityState === "visible" &&
            !wakeLock
        ) {
            await requestWakeLock();
        }
    } catch (error) {
        console.warn("Wake lock restore failed:", error);
    }
}