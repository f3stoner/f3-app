import { renderApp } from "../index.js";
import { updateMyPassword } from "../services/auth.js";
import { state } from "../modules/state.js";

export function renderResetPasswordView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const wrapper = document.createElement("div");
    wrapper.classList.add("auth-view");

    const card = document.createElement("div");
    card.classList.add("auth-card");

    const title = document.createElement("h1");
    title.textContent = "Reset Password";

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.placeholder = "New Password";

    const confirmInput = document.createElement("input");
    confirmInput.type = "password";
    confirmInput.placeholder = "Confirm New Password";

    const saveButton = document.createElement("button");
    saveButton.textContent = "Update Password";

    saveButton.addEventListener("click", async () => {
        const password = passwordInput.value;
        const confirm = confirmInput.value;

        if (!password || !confirm) {
            alert("Enter and confirm your new password.");
            return;
        }

        if (password !== confirm) {
            alert("Passwords do not match.");
            return;
        }

        try {
            await updateMyPassword(password);
            alert("Password updated. Please sign in again.");

            window.history.replaceState({}, "", window.location.pathname);

            state.currentView = "auth";
            renderApp();
        } catch (error) {
            console.error("Password update failed:", error);
            alert("Failed to update password.");
        }
    });

    card.append(title, passwordInput, confirmInput, saveButton);
    wrapper.appendChild(card);
    app.appendChild(wrapper);
}