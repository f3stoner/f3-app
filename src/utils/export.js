export function exportState(state) {
    const dataStr = JSON.stringify(state, null, 2);

    const blob = new Blob([dataStr], { type: "application/json" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;

    const date = new Date().toISOString().slice(0, 10);
    a. download = `f3-data-${date}.json`;

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}