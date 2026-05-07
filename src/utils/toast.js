import { state } from "../modules/state.js";

let toastTimeoutId = null;

export function showToast(message, type = "info") {
    state.toastMessage = message;
    state.toastType = type;

    renderToast();

    clearTimeout(toastTimeoutId);

    toastTimeoutId = setTimeout(() => {
        state.toastMessage = null;
        state.toastType = "info";
        renderToast();
    }, 2500);
}

function renderToast() {
    const existingToast = document.getElementById("toast");

    if (existingToast) {
        existingToast.remove();
    }

    if (!state.toastMessage) return;

    const toast = document.createElement("div");
    toast.id = "toast";
    toast.classList.add("toast", `toast-${state.toastType}`);
    toast.textContent = state.toastMessage;

    document.body.appendChild(toast);
}