import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createInvitedByField } from "../components/invitedByField.js";
import { updateMember } from "../services/appData.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderMemberEdit () {
    
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "memberDetail",
        showMenu: true,
    });

    const member = state.members.find(m => m.id === state.editingMemberId);
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
        state.editingMemberId = null;
        navigateTo("memberDetail");
    });

    if (!member) {
        app.textContent = "No Member Found";
        app.append(cancelButton);
        return;
    }

    const canEditMember =
    state.currentUserRole === "admin" ||
    member?.id === state.currentUserMemberId;

    if (!canEditMember) {
        alert("You can only edit your own profile.");
        navigateTo("dashboard");
        return;
    }

    const title = document.createElement("h1");
    title.textContent = "Edit Member";

    const paxNameLabel = document.createElement("div");
    paxNameLabel.textContent = "PAX Name";
    paxNameLabel.classList.add("detail-label");

    const paxNameInput = document.createElement("input");
    paxNameInput.type = "text";
    paxNameInput.value = member.paxName || "";

    const realNameLabel = document.createElement("div");
    realNameLabel.textContent = "Real Name";
    realNameLabel.classList.add("detail-label");

    const realNameInput = document.createElement("input");
    realNameInput.type = "text";
    realNameInput.value = member.realName || "";

    const invitedByLabel = document.createElement("div");
    invitedByLabel.textContent = "Invited By";
    invitedByLabel.classList.add("detail-label");

    const invitedByField = createInvitedByField(member.invitedById || "");
    
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";

    saveButton.addEventListener("click", async () => {
        const invitedByInput = app.querySelector(".fng-invited-by-select");

        const updatedMember = {
            ...member,
            paxName: paxNameInput.value.trim() || member.paxName,
            realName: realNameInput.value.trim(),
            invitedById: invitedByInput.value || null,
        };

        try {
            await updateMember(member.id, updatedMember);
            state.selectedMemberId = member.id;
            state.editingMemberId = null;
            navigateTo("memberDetail");
        } catch (error) {
            console.error("Failed to update member:", error);
            showToast("Failed to save member", "error");
        }   
    });

    app.append(
        header,
        title,
        paxNameLabel, 
        paxNameInput, 
        realNameLabel, 
        realNameInput, 
        invitedByLabel, 
        invitedByField.wrapper, 
        saveButton, 
        cancelButton
    );
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu);
    }
}