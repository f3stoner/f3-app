import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

export function renderPreblastView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Preblast";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Write and refine your preblast.";

    const textInput = document.createElement("textarea");
    textInput.classList.add("preblast-textarea");
    textInput.value = state.draftPreblastText || "";

    textInput.addEventListener("input", (event) => {
        state.draftPreblastText = event.target.value;
    });

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy Preblast";

    copyButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(state.draftPreblastText || "");
            copyButton.textContent = "Copied";
            setTimeout(() => {
                copyButton.textContent = "Copy Preblast";
            }, 1500);
        } catch (error) {
            console.error("Copy failed:", error);
            alert("Failed to copy preblast.");
        }
    });

    const shareButton = document.createElement("button");
    shareButton.textContent = "Share Preblast";

    if (typeof navigator.share !== "function") {
        shareButton.disabled = true;
        shareButton.textContent = "Share Not Available";
    } else {
        shareButton.addEventListener("click", async () => {
            try {
                await navigator.share({ text: state.draftPreblastText || "" });
            } catch (error) {
                console.error("Share failed:", error);
                alert("Share failed.")
            }
        });
    }

    const doneButton = document.createElement("button");
    doneButton.textContent = "Done";

    doneButton.addEventListener("click", () => {
        state.currentView = "plannedWorkoutDetail";
        renderApp();
    });

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");
    actionRow.append(shareButton, copyButton, doneButton);

    app.append(
        title,
        subtitle,
        textInput,
        actionRow,
    );
}