export function formatDate(date) {
    return new Date(date).toLocaleDateString();
}

export function getTodayDate() {
    return new Date().toISOString().split("T")[0];
}