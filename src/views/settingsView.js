import { state } from "../modules/state.js";
import { updateCurrentUserMemberProfile } from "../services/appData.js";
import { showToast } from "../utils/toast.js";
import {
    cleanupMainMenu,
    createMainMenu,
} from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { enableQReminders, disableQReminders } from "../utils/notificationOptIn.js";

export function renderSettingsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const member =
        state.currentUserMember;

    if (!member) {
        const emptyState = document.createElement("div");
        emptyState.classList.add("detail-value");
        emptyState.textContent = "Your linked PAX profile could not be found.";

        app.append(header, emptyState);

        if (state.isMainMenuOpen) {
            document.body.appendChild(createMainMenu());
        }

        return;
    }

    const title = document.createElement("h1");
    title.textContent = "Settings";

    const subtitle = document.createElement("p");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent =
        "Manage your profile and notification preferences.";

    const profileSection = document.createElement("section");
    profileSection.classList.add("settings-section");

    const notificationsSection = document.createElement("section");
    notificationsSection.classList.add("settings-section");

    const appInfoSection = document.createElement("section");
    appInfoSection.classList.add("settings-section");

    const profileHeading = document.createElement("h2");
    profileHeading.textContent = "Profile";

    const paxNameLabel = document.createElement("div");
    paxNameLabel.classList.add("detail-label");
    paxNameLabel.textContent = "PAX Name";

    const paxNameValue = document.createElement("div");
    paxNameValue.classList.add("detail-value", "settings-readonly-value");
    paxNameValue.textContent = member.paxName || "-";

    const paxNameHelp = document.createElement("div");
    paxNameHelp.classList.add("settings-help-text");
    paxNameHelp.textContent =
        "Contact your region's Data Q to change your PAX name.";

    const realNameLabel = document.createElement("label");
    realNameLabel.classList.add("detail-label");
    realNameLabel.textContent = "Real Name";

    const realNameInput = document.createElement("input");
    realNameInput.type = "text";
    realNameInput.value = member.realName || "";
    realNameInput.autocomplete = "name";

    const homeAoLabel = document.createElement("label");
    homeAoLabel.classList.add("detail-label");
    homeAoLabel.textContent = "Home AO";

    const homeAoSelect = document.createElement("select");

    const noHomeAoOption = document.createElement("option");
    noHomeAoOption.value = "";
    noHomeAoOption.textContent = "No Home AO Selected";

    homeAoSelect.appendChild(
        noHomeAoOption
    );
    
    const currentHomeAoExists =
        (state.aos || []).some(
            ao =>
                ao.name === member.homeAo
        );
    
    if (
        member.homeAo &&
        !currentHomeAoExists
    ) {
        const currentHomeAoOption =
            document.createElement("option");
    
        currentHomeAoOption.value =
            member.homeAo;
    
        currentHomeAoOption.textContent =
            `${member.homeAo} (Home Region)`;
    
        currentHomeAoOption.selected = true;
    
        homeAoSelect.appendChild(
            currentHomeAoOption
        );
    }

    const activeAos = (state.aos || [])
        .filter(ao => ao.isActive !== false)
        .filter(ao => ao.name)
        .sort((a, b) => a.name.localeCompare(b.name));

    activeAos.forEach(ao => {
        const option = document.createElement("option");
        option.value = ao.name;
        option.textContent = ao.name;

        if (ao.name === member.homeAo) {
            option.selected = true;
        }

        homeAoSelect.appendChild(option);
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save Profile";
    saveButton.classList.add("primary-button", "settings-save-button");

    saveButton.addEventListener(
        "click",
        async () => {
            const realName =
                realNameInput.value.trim();
    
            const homeAo =
                homeAoSelect.value || null;
    
            saveButton.disabled = true;
            saveButton.textContent =
                "Saving…";
    
            try {
                await updateCurrentUserMemberProfile({
                    realName,
                    homeAo,
                });
    
                showToast(
                    "Settings saved",
                    "success"
                );
            } catch (error) {
                console.error(
                    "Failed to save settings:",
                    error
                );
    
                showToast(
                    "Failed to save settings",
                    "error"
                );
            } finally {
                saveButton.disabled = false;
                saveButton.textContent =
                    "Save Profile";
            }
        }
    );

    const notificationsHeading = document.createElement("h2");
    notificationsHeading.textContent = "Notifications";

    const pushLabel = document.createElement("div");
pushLabel.classList.add("detail-label");
pushLabel.textContent = "Push Notifications";

const pushStatus = document.createElement("div");

const pushHelp = document.createElement("div");
pushHelp.classList.add("settings-help-text");

const pushButton = document.createElement("button");
pushButton.type = "button";

function renderPushControls() {
    const notificationsSupported =
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window;

    const permissionDenied =
        "Notification" in window &&
        Notification.permission === "denied";

    const isEnabled =
        state.notificationSettings?.pushEnabled === true;

    pushStatus.className = "settings-status";
    pushButton.className = "";
    pushButton.disabled = false;
    pushButton.hidden = false;

    if (!notificationsSupported) {
        pushStatus.classList.add("settings-status-unsupported");
        pushStatus.textContent = "Not Supported";

        pushHelp.textContent =
            "Push notifications are not supported in this browser.";

        pushButton.hidden = true;
        return;
    }

    if (permissionDenied) {
        pushStatus.classList.add("settings-status-blocked");
        pushStatus.textContent = "Blocked";

        pushHelp.textContent =
            "Notifications are blocked in your browser or device settings.";

        pushButton.hidden = true;
        return;
    }

    if (isEnabled) {
        pushStatus.classList.add("settings-status-enabled");
        pushStatus.textContent = "Enabled";

        pushHelp.textContent =
            "You will receive supported reminders before upcoming Qs.";

        pushButton.classList.add("secondary-button");
        pushButton.textContent = "Disable Q Reminders";
        return;
    }

    pushStatus.classList.add("settings-status-disabled");
    pushStatus.textContent = "Disabled";

    pushHelp.textContent =
        "Enable notifications to receive supported reminders before upcoming Qs.";

    pushButton.classList.add("primary-button");
    pushButton.textContent = "Enable Q Reminders";
}

pushButton.addEventListener("click", async () => {
    const isEnabled =
        state.notificationSettings?.pushEnabled === true;

    pushButton.disabled = true;
    pushButton.textContent =
        isEnabled ? "Disabling…" : "Enabling…";

    try {
        if (isEnabled) {
            await disableQReminders();
        } else {
            await enableQReminders();
        }
    } catch (error) {
        console.error(
            "Failed to update notification settings:",
            error
        );

        if (
            "Notification" in window &&
            Notification.permission === "denied"
        ) {
            showToast(
                "Notifications are blocked in your browser or device settings.",
                "error"
            );
        } else {
            showToast(
                "Failed to update notification settings.",
                "error"
            );
        }
    }

    renderPushControls();
});

renderPushControls();

const appInfoHeading = document.createElement("h2");
appInfoHeading.textContent = "App Info";

const buildLabel = document.createElement("div");
buildLabel.classList.add("detail-label");
buildLabel.textContent = "Build";

const buildValue = document.createElement("div");
buildValue.classList.add(
    "detail-value",
    "settings-readonly-value"
);

const buildId =
    typeof __BUILD_ID__ !== "undefined"
        ? __BUILD_ID__
        : "unknown";

const buildDate = new Date(buildId);

buildValue.textContent =
    buildId === "unknown" ||
    Number.isNaN(buildDate.getTime())
        ? buildId
        : buildDate.toLocaleString();

profileSection.append(
        profileHeading,
        paxNameLabel,
        paxNameValue,
        paxNameHelp,
        realNameLabel,
        realNameInput,
        homeAoLabel,
        homeAoSelect,
        saveButton
    );
    
    notificationsSection.append(
        notificationsHeading,
        pushLabel,
        pushStatus,
        pushHelp,
        pushButton
    );

    appInfoSection.append(
        appInfoHeading,
        buildLabel,
        buildValue
    );
    
    app.append(
        header,
        title,
        subtitle,
        profileSection,
        notificationsSection,
        appInfoSection
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}