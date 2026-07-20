import {
    cleanupOutdatedCaches,
    createHandlerBoundToURL,
    precacheAndRoute,
} from "workbox-precaching";

import {
    NavigationRoute,
    registerRoute,
} from "workbox-routing";

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const navigationHandler =
    createHandlerBoundToURL("/f3-app/index.html");

registerRoute(
    new NavigationRoute(navigationHandler)
);

self.addEventListener("message", event => {
    if (event.data?.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

self.addEventListener("push", event => {
    let data = {};

    try {
        data = event.data?.json() || {};
    } catch {
        data = {
            title: "F3 Reminder",
            body: event.data?.text() || "",
            data: {},
        };
    }

    event.waitUntil(
        self.registration.showNotification(
            data.title || "F3 Reminder",
            {
                body: data.body || "",
                data: data.data || {},
            }
        )
    );
});

self.addEventListener("notificationclick", event => {
    event.notification.close();

    const notificationData =
        event.notification.data || {};

    const targetUrl =
        notificationData.url || "/f3-app/";

    event.waitUntil(
        clients
            .matchAll({
                type: "window",
                includeUncontrolled: true,
            })
            .then(clientList => {
                for (const client of clientList) {
                    if ("focus" in client) {
                        return client.focus();
                    }
                }

                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }

                return undefined;
            })
    );
});