self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data?.json() || {};
    } catch (error) {
        data = {
            title: "F3 Reminder",
            body: event.data?.text() || "",
        };
    }
    event.waitUntil(
        self.registration.showNotification(data.title || "F3 Reminder", {
            body: data.body || "",
        })
    );
});