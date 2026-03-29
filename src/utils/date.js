export function formatDate(date) {
    return new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function getTodayDate() {
    return new Date().toISOString().split("T")[0];
}