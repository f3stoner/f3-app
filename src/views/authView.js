import { createProfile, signInWithEmail, signUpWithEmail, requestPasswordReset } from "../services/auth.js";
import { bootApp } from "../index.js";
import { showToast } from "../utils/toast.js";

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
    let isLoading = false;

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "Email";

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.placeholder = "Password";

    const confirmPasswordInput = document.createElement("input");
    confirmPasswordInput.type = "password";
    confirmPasswordInput.placeholder = "Confirm Password";
    confirmPasswordInput.style.display = "none";

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

    function getFriendlyAuthError(error) {
        const message = String(error?.message || "").toLowerCase();

        if (message.includes("invalid login credentials")) {
            return "Email or password is incorrect.";
        }

        if (message.includes("already registered") || message.includes("already exists")) {
            return "An account already exists for this email.";
        }

        if (message.includes("password")) {
            return "Password does not meet the requirements.";
        }

        return "Authentication failed. Please try again.";
    }

    const signInButton = document.createElement("button");
    signInButton.textContent = "Sign In";

    signInButton.addEventListener("click", async () => {
        if (isLoading) return;

        isLoading = true;
        signInButton.disabled = true;
        signInButton.textContent = isSignUpMode ? "Creating account..." : "Signing in...";

        try { 
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                showToast("Email and password are required.", "error");
                return;
            }

            if (!isSignUpMode) {
                const authData = await signInWithEmail(email, password);
                
                if (!authData?.session?.user) {
                    showToast("Email or password is incorrect.", "error");
                    return;
                }

                await bootApp();
                return;
            }

            const displayName = displayNameInput.value.trim();
            const regionId = regionSelect.value;
            const confirmPassword = confirmPasswordInput.value;

            if (!displayName || !regionId) {
                showToast("Display name and region are required.", "error");
                return;
            }

            if (password !== confirmPassword) {
                showToast("Passwords do not match.", "error");
                return;
            }

            const authData = await signUpWithEmail(email, password);
            const user = authData?.user || authData?.session?.user;

            if (!user) {
                showToast("Account created. If email confirmation is enabled, confirm your email before signing in.", "success");
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
            showToast(getFriendlyAuthError(error), "error");
        } finally {
            isLoading = false;
            signInButton.disabled = false;
            signInButton.textContent = isSignUpMode ? "Create Account" : "Sign In";
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
        confirmPasswordInput.style.display = isSignUpMode ? "block" : "none";
    });

    const forgotPasswordButton = document.createElement("button");
    forgotPasswordButton.textContent = "Forgot Password?";
    forgotPasswordButton.classList.add("secondary-button");

    forgotPasswordButton.addEventListener("click", async () => {
        const email = emailInput.value.trim();

        if (!email) {
            showToast("Enter your email first.", "error");
            return;
        }

        try {
            await requestPasswordReset(email);
            showToast("Password reset email sent. Check your inbox.", "success");
        } catch (error) {
            console.error("Password reset failed:", error);
            showToast("Failed to send password reset email.", "error");
        }
    });

    const passwordToggle = document.createElement("button");
    passwordToggle.type = "button";
    passwordToggle.classList.add("secondary-button");
    passwordToggle.textContent = "Show Password";

    passwordToggle.addEventListener("click", () => {
        const shouldShow = passwordInput.type === "password";

        passwordInput.type = shouldShow ? "text" : "password";
        confirmPasswordInput.type = shouldShow ? "text" : "password";
        passwordToggle.textContent = shouldShow ? "Hide Password" : "Show Password";
    });

    card.append(
        title, 
        emailInput, 
        passwordInput,
        confirmPasswordInput,
        passwordToggle,
        displayNameInput,
        regionSelect,
        signInButton,
        toggleModeButton,
        forgotPasswordButton
    );
    wrapper.appendChild(card);
    app.appendChild(wrapper);
}

