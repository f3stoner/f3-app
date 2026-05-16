import {
    enableQReminders,
    dismissQReminderPrompt,
} from "../utils/notificationOptIn.js";

import { state } from "../modules/state.js";

export function createQReminderPromptModal() {
    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal", "q-reminder-modal");

    const heading = document.createElement("h2");
    heading.textContent = "Want a reminder before your Q?";

    const copy = document.createElement("div");
    copy.classList.add("stats-line", "q-reminder-modal-copy");
    copy.textContent =
        "The Q can remind you before your scheduled beatdown so you don’t forget to preblast or launch your workout.";

    const buttonRow = document.createElement("div");
    buttonRow.classList.add("q-reminder-prompt-actions");

    const enableButton = document.createElement("button");
    enableButton.classList.add("primary-button");
    enableButton.textContent = "Enable Reminders";

    enableButton.addEventListener("click", async () => {
        try {
            enableButton.disabled = true;
            enableButton.textContent = "Enabling...";

            await enableQReminders();

            state.showReminderPromptAfterClaim = false;
            overlay.remove();
        } catch (error) {
            console.error("Failed to enable reminders:", error);
            enableButton.disabled = false;
            enableButton.textContent = "Enable Reminders";
            alert("Failed to enable reminders.");
        }
    });

    const notNowButton = document.createElement("button");
    notNowButton.classList.add("secondary-button");
    notNowButton.textContent = "Not Now";

    notNowButton.addEventListener("click", () => {
        dismissQReminderPrompt();
        state.showReminderPromptAfterClaim = false;
        overlay.remove();
    });

    buttonRow.append(enableButton, notNowButton);
    modal.append(heading, copy, buttonRow);
    overlay.appendChild(modal);

    return overlay;
}