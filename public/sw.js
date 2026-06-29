self.addEventListener("push", event => {
    let data = {};

    try {
        data = event.data?.json() || {};
    } catch (error) {
        data = {
            title: "F3 Reminder",
            body: event.data?.text() || "",
            data: {},
        };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || "F3 Reminder", {
            body: data.body || "",
            data: data.data || {},
        })
    );
});

self.addEventListener("notificationclick", event => {
    event.notification.close();

    const notificationData = event.notification.data || {};
    const targetUrl = notificationData.url || "/f3-app/";

    event.waitUntil(
        clients.matchAll({
            type: "window",
            includeUncontrolled: true,
        }).then(clientList => {
            for (const client of clientList) {
                if ("focus" in client) {
                    client.focus();
                    return;
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});