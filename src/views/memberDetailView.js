import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { getMemberStats } from "../modules/stats.js";
import { formatDate } from "../utils/date.js";
import { saveState } from "../utils/storage.js";
import { updateMember } from "../services/appData.js";
import { goBack, navigateTo } from "../utils/navigation.js";

export function renderMemberDetail () {
    const app = document.getElementById("app");
    app.textContent = "";

    const member = state.members.find(m => m.id === state.selectedMemberId);

    const backButton = document.createElement("button");
    backButton.textContent = "← Back";
    backButton.classList.add("secondary-button");
    backButton.addEventListener("click", () => {
        goBack("roster");
    });

    if (!member) {
        app.textContent = "No Member Found";
        app.append(backButton);
        return;
    }

    const title = document.createElement("h1");
    title.textContent = "Member Detail";

    const stats = getMemberStats(member.id);

    const invitedByMember = state.members.find(m => m.id === member.invitedById);
    const invitedByName = invitedByMember ? invitedByMember.paxName : "-";

    const firstPost = stats.firstPostDate ? formatDate(stats.firstPostDate) : "-";
    const lastPost = stats.lastPostDate ? formatDate(stats.lastPostDate) : "-";
    const realName = member.realName || "-";
    const status = member.status || "active";

    function createDetailSection (labelText, valueText) {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = labelText;
        label.classList.add("detail-label");

        const value = document.createElement("div");
        value.textContent = valueText;
        value.classList.add("detail-value");

        section.append(label, value);

        return section;
    }

    const nameSection = createDetailSection("PAX Name", member.paxName);
    const realNameSection = createDetailSection("Real Name", realName);
    const statusSection = createDetailSection("Status", status);
    const invitedBySection = createDetailSection("Invited By", invitedByName);
    const postsSection = createDetailSection("Posts", String(stats.posts));
    const qsSection = createDetailSection("Qs", String(stats.qs));
    const firstPostSection = createDetailSection("First Post", firstPost);
    const lastPostSection = createDetailSection("Last Post", lastPost);

    const toggleStatusButton = document.createElement("button");
    toggleStatusButton.textContent = member.status === "active" 
    ? "Deactivate Member" 
    : "Reactivate Member";

    toggleStatusButton.addEventListener("click", async () => {
        const isInactive = member.status === "inactive";
        const nextStatus = isInactive ? "active" : "inactive";
        
        const confirmed = isInactive
            ? true
            : confirm("Are you sure you want to deactive this member?");

        if (!confirmed) return;

        try {
            const updatedMember = {
                ...member,
                status: nextStatus,
            };

            await updateMember(member.id, updatedMember);
            renderApp();
        } catch (error) {
            console.error("Failed to update member status:", error);
            alert("Failed to update member status.");
        }
    });

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Member";
    editButton.addEventListener("click", () => {
        state.editingMemberId = member.id;
        navigateTo("memberEdit");
    })

    const header = document.createElement("div");
    header.classList.add("view-header");
    header.append(backButton, title);

    app.append(
        header,
        nameSection, 
        realNameSection, 
        statusSection, 
        invitedBySection, 
        postsSection, 
        qsSection, 
        firstPostSection, 
        lastPostSection
    );
    
    if (state.currentUserRole === "admin") {
        app.append(toggleStatusButton);
    }

    app.append(editButton);
}