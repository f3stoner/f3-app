import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

export function renderBackblastView (backblast) {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Backblast";

    const textBlock = document.createElement("pre");
    textBlock.textContent = backblast;

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy Backblast";
    copyButton.addEventListener("click", () => {
        console.log("COPYING:", backblast);
        navigator.clipboard.writeText(backblast);
        copyButton.textContent = "Copied";
        setTimeout(() => {
            copyButton.textContent = "Copy Backblast"
        }, 1500);
    });

    const doneButton = document.createElement("button");
    doneButton.textContent ="Done";
    doneButton.addEventListener("click", () => {
        state.currentView = "dashboard";
        renderApp();
    });

    app.append(title, textBlock, copyButton, doneButton);
}