import { enableQReminders, dismissQReminderPrompt } from "../utils/notificationOptIn.js";

export function createQReminderPrompt({ onDone } = {}) {
    const card = document.createElement("div");
    card.classList.add("member-card", "q-reminder-prompt");

    const title = document.createElement("div");
    title.classList.add("q-reminder-prompt-title");
    title.textContent = "Want a reminder before your Q?";

    const copy = document.createElement("div");
    copy.classList.add("stats-line", "q-reminder-prompt-copy");
    copy.textContent =
        "The Q can remind you before your scheduled beatdown so you don't forget to preblast or launch your workout.";
    
    const actions = document.createElement("div");
    actions.classList.add("q-reminder-prompt-actions");

    const enableButton = document.createElement("button");
    enableButton.classList.add("primary-button");
    enableButton.textContent = "Enable Reminders";

    enableButton.addEventListener("click", async () => {
        try {
            enableButton.disabled = true;
            enableButton.textContent = "Enabling...";
            await enableQReminders();
            onDone?.();
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
        onDone?.();
    });

    actions.append(enableButton, notNowButton);
    card.append(title, copy, actions);

    return card;
}