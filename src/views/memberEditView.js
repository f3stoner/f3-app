import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { saveState } from "../utils/storage.js";

export function renderMemberEdit () {
    
    const app = document.getElementById("app");
    app.textContent = "";

    const member = state.members.find(m => m.id === state.editingMemberId);
    console.log("editingMemberID:", state.editingMemberId);
    console.log("member found:", member);
    console.log("paxName:", member?.paxName);
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
        state.editingMemberId = null;
        state.currentView = "memberDetail";
        renderApp();
    });

    if (!member) {
        app.textContent = "No Member Found";
        app.append(cancelButton);
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

    const invitedBySelect = document.createElement("select");

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "None";
    invitedBySelect.appendChild(defaultOption);

    state.members
        .filter(m => m.id !== member.id)
        .forEach(m => {
            const option = document.createElement("option");
            option.value = m.id;
            option.textContent = m.paxName;
            invitedBySelect.appendChild(option);
        });
    invitedBySelect.value = member.invitedById || "";
    
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";

    saveButton.addEventListener("click", () => {
        member.paxName = paxNameInput.value.trim() || member.paxName;
        member.realName = realNameInput.value.trim();
        member.invitedById = invitedBySelect.value || null;

        saveState(state);

        state.selectedMemberId = member.id;
        state.editingMemberId = null;
        state.currentView = "memberDetail";
        renderApp();
    });

    app.append(title, paxNameLabel, paxNameInput, realNameLabel, realNameInput, invitedByLabel, invitedBySelect, saveButton, cancelButton);
}