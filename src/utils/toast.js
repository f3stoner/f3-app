import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

let toastTimeoutId = null;

export function showToast(message, type = "info") {
    state.toastMessage = message;
    state.toastType = type;

    renderApp();

    clearTimeout(toastTimeoutId);

    toastTimeoutId = setTimeout(() => {
        state.toastMessage = null;
        state.toastType = "info";
        renderApp();
    }, 2500);
}