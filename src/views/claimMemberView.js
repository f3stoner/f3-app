import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { updateMyProfile } from "../services/auth.js";
import { updateMemberInCloud } from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";

export function renderClaimMemberView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Claim Your PAX Profile";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Find yourself in the roster to finish setup.";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search by PAX name or real name";
    let searchTerm = "";

    searchInput.addEventListener("input", () => {
        searchTerm = searchInput.value.toLowerCase().trim();
        renderMemberList();
    })

    const listContainer = document.createElement("div");

    function renderMemberList() {
        listContainer.textContent = "";
    
        const filteredMembers = state.members
            .filter(member => member.status === "active")
            .filter(member => {
                const paxName = (member.paxName || "").toLowerCase();
                const realName = (member.realName || "").toLowerCase();
    
                if (!searchTerm) return true;
    
                return paxName.includes(searchTerm) || realName.includes(searchTerm);
            })
            .sort((a, b) => (a.paxName || "").localeCompare(b.paxName || ""));
    
        if (filteredMembers.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No matching PAX found.";
            listContainer.appendChild(empty);
            return;
        }
    
        filteredMembers.forEach(member => {
            const card = document.createElement("div");
            card.classList.add("member-card");
    
            const cardContent = document.createElement("div");
    
            const nameLine = document.createElement("div");
            nameLine.classList.add("member-name");
            nameLine.textContent = member.paxName || "Unknown PAX";
    
            const realNameLine = document.createElement("div");
            realNameLine.classList.add("stats-line");
            realNameLine.textContent = member.realName || "No real name";
    
            const homeAoLine = document.createElement("div");
            homeAoLine.classList.add("stats-line");
            homeAoLine.textContent = member.homeAo || "No home AO";
    
            cardContent.append(nameLine, realNameLine, homeAoLine);
            card.append(cardContent);
    
            card.addEventListener("click", () => {
                state.claimingMemberId = member.id;
                renderApp();
            });
    
            listContainer.appendChild(card);
        });
    }

    const selectedMember = state.members.find(
        member => member.id === state.claimingMemberId
    ) || null;

    if (!selectedMember) {
        renderMemberList();
    }


    let setupSection = null;

        if (selectedMember) {
            setupSection = document.createElement("div");
            setupSection.classList.add("section");
    
            const selectedLabel = document.createElement("div");
            selectedLabel.classList.add("detail-label");
            selectedLabel.textContent = "Selected PAX";
    
            const paxNameValue = document.createElement("div");
            paxNameValue.classList.add("detail-value");
            paxNameValue.textContent = selectedMember.paxName || "Unknown PAX";
    
            const realNameLabel = document.createElement("div");
            realNameLabel.classList.add("detail-label");
            realNameLabel.textContent = "Real Name";
    
            const realNameInput = document.createElement("input");
            realNameInput.type = "text";
            realNameInput.value = selectedMember.realName || "";
    
            const homeAoLabel = document.createElement("div");
            homeAoLabel.classList.add("detail-label");
            homeAoLabel.textContent = "Home AO";
    
            const homeAoSelect = document.createElement("select");

            const aoOptions = [...state.aos]
                .filter(ao => ao.isActive)
                .sort((a, b) => a.name.localeCompare(b.name));

            const emptyOption = document.createElement("option");
            emptyOption.value = "";
            emptyOption.textContent = "Select Home AO";
            homeAoSelect.appendChild(emptyOption);

            aoOptions.forEach(ao => {
                const option = document.createElement("option");
                option.value = ao.name;
                option.textContent = ao.name;
                homeAoSelect.appendChild(option);
            });

            homeAoSelect.value = selectedMember.homeAo || "";

            const saveButton = document.createElement("button");
            saveButton.textContent = "Save & Continue";
            saveButton.classList.add("primary-button");

            saveButton.addEventListener("click", async () => {
                try {
                    const updatedMember = {
                        ...selectedMember,
                        realName: realNameInput.value.trim() || null,
                        homeAo: homeAoSelect.value || null,
                    };

                    await updateMyProfile({
                        member_id: selectedMember.id,
                        display_name: selectedMember.paxName,
                    });

                    const savedMember = await updateMemberInCloud(
                        state.currentRegionId,
                        updatedMember
                    );

                    const index = state.members.findIndex(m => m.id === savedMember.id);
                    if (index !== -1) {
                        state.members[index] = savedMember;
                    }

                    state.currentUserMemberId = selectedMember.id;
                    state.currentUserDisplayName = selectedMember.paxName;
                    state.claimingMemberId = null;
                    state.currentView = "dashboard";

                    renderApp();
                } catch (error) {
                    console.error("Failed to claim member profile:", error);
                    showToast("Failed to save profile setup.", "error");
                }
            });

            const chooseDifferentButton = document.createElement("button");
            chooseDifferentButton.textContent = "Choose Different PAX";
            chooseDifferentButton.classList.add("secondary-button");

            chooseDifferentButton.addEventListener("click", () => {
                state.claimingMemberId = null;
                renderApp();
            });

            setupSection.append(
                selectedLabel,
                paxNameValue,
                realNameLabel,
                realNameInput,
                homeAoLabel,
                homeAoSelect,
                saveButton,
                chooseDifferentButton
            );
        }

        app.append(
            title,
            subtitle,
            ...(!selectedMember ? [searchInput, listContainer] : []),
            ...(setupSection ? [setupSection] : [])
        );
}