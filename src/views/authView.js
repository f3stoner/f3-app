import { createProfile, signInWithEmail, signUpWithEmail } from "../services/auth.js";
import { bootApp } from "../index.js";

export function renderAuthView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const wrapper = document.createElement("div");
    wrapper.classList.add("auth-view");

    const card = document.createElement("div");
    card.classList.add("auth-card");

    const title = document.createElement("h1");
    title.textContent = "Welcome";

    let isSignUpMode = false;

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "Email";

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.placeholder = "Password";

    const displayNameInput = document.createElement("input");
    displayNameInput.type = "text";
    displayNameInput.placeholder = "Display Name";
    displayNameInput.style.display = "none";

    const regionSelect = document.createElement("select");
    regionSelect.style.display = "none";

    const regions = [
        { label: "Aggieland", value: "96c9eef9-3b6e-4365-86cd-51dbeccf231a" },
        { label: "Old 300", value: "0925d0c8-2c87-4d9c-882a-86efa0ce1c5a" },
    ];

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Select Region";
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    regionSelect.appendChild(placeholderOption);

    regions.forEach(region => {
        const option = document.createElement("option");
        option.value = region.value;
        option.textContent = region.label;
        regionSelect.appendChild(option);
    });

    const signInButton = document.createElement("button");
    signInButton.textContent = "Sign In";

    signInButton.addEventListener("click", async () => {
        try { 
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                alert("Email and password are required.");
                return;
            }

            if (!isSignUpMode) {
                await signInWithEmail(email, password);
                await bootApp();
                return;
            }

            const displayName = displayNameInput.value.trim();
            const regionId = regionSelect.value;

            if (!displayName || !regionId) {
                alert("Display name and region are required.");
                return;
            }

            const authData = await signUpWithEmail(email, password);
            const user = authData?.user || authData?.session?.user;

            if (!user) {
                alert("Account created. If email confirmation is enabled, confirm your email before signing in.");
                return;
            }

            await createProfile({
                id: user.id,
                email,
                displayName,
                regionId,
                role: "user",
            });

            await bootApp();
        } catch (error) {
            console.error("Auth action failed:", error);
            alert("Authentication failed.");
        }
    });

    const toggleModeButton = document.createElement("button");
    toggleModeButton.textContent = "Create Account Instead";

    toggleModeButton.addEventListener("click", () => {
        isSignUpMode = !isSignUpMode;

        title.textContent = isSignUpMode ? "Create Account" : "Welcome";
        signInButton.textContent = isSignUpMode ? "Create Account" : "Sign In";
        toggleModeButton.textContent = isSignUpMode ? "Back to Sign In" : "Create Account Instead";

        displayNameInput.style.display = isSignUpMode ? "block" : "none";
        regionSelect.style.display = isSignUpMode ? "block" : "none";
    });

    card.append(
        title, 
        emailInput, 
        passwordInput,
        displayNameInput,
        regionSelect,
        signInButton,
        toggleModeButton
    );
    wrapper.appendChild(card);
    app.appendChild(wrapper);
}