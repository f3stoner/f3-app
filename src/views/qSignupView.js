import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { updateQSlotInCloud } from "../services/cloudData.js";
import { generateQSlotsForCurrentRegion } from "../services/qSlotGeneration.js";

export function renderQSignupView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Q Signup";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Claim upcoming Q slots.";

    let generateButton = null;

    if (state.currentUserRole === "admin") {
        generateButton = document.createElement("button");
        generateButton.textContent = "Generate Next 4 Weeks";

        generateButton.addEventListener("click", async () => {
            try {
                const result = await generateQSlotsForCurrentRegion(28);
                alert(`Created ${result.createdCount} Q Slots.`);
                renderApp();
            } catch (error) {
                console.error("Failed to generate Q slots:", error);
                alert("Failed to generate Q slots.");
            }
        });
    }

    const listContainer = document.createElement("div");

    async function claimQSlot(slot) {
        try {
            const activeRegionId = state.currentRegionId;
            if (!activeRegionId) {
                throw new Error("No active region id");
            }

            const updatedSlot = await updateQSlotInCloud(activeRegionId, {
                ...slot,
                qUserId: state.currentUserId,
            });

            const index = state.qSlots.findIndex(q => q.id ===slot.id);
            if (index !== -1) {
                state.qSlots[index] = updatedSlot;
            }

            renderApp();
        } catch (error) {
            console.error("Failed to claim Q slot:", error);
            alert("Failed to claim Q slot.");
        }
    }

    async function unclaimQSlot(slot) {
        try {
            const activeRegionId = state.currentRegionId;
            if (!activeRegionId) {
                throw new Error("No active region id");
            }

            const updatedSlot = await updateQSlotInCloud(activeRegionId, {
                ...slot,
                qUserId: null,
            });
    
            const index = state.qSlots.findIndex(q => q.id === slot.id);
            if (index !== -1) {
                state.qSlots[index] = updatedSlot;
            }
    
            renderApp();
        } catch (error) {
            console.error("Failed to unclaim Q slot:", error);
            alert("Failed to unclaim Q slot.");
        }
    }

    const sortedSlots = [...state.qSlots].sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }
    
        const aoA = state.aos.find(ao => ao.id === a.aoId)?.name || "";
        const aoB = state.aos.find(ao => ao.id === b.aoId)?.name || "";
    
        return aoA.localeCompare(aoB);
    });

    if (sortedSlots.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No Q slots available yet"

        listContainer.appendChild(empty);
    } else {
        sortedSlots.forEach(slot => {
            const card = document.createElement("div");
            card.classList.add("member-card");

            const ao = state.aos.find(a => a.id === slot.aoId);
            const isMine = slot.qUserId === state.currentUserId;
            const qMember = state.members.find(m => m.id === slot.qUserId);

            const topLine = document.createElement("div");
            topLine.classList.add("member-name");
            topLine.textContent = `${formatDate(slot.date)} - ${ao?.name || "Unknown AO"}`;

            const titleLine = document.createElement("div");
            titleLine.classList.add("stats-line");
            titleLine.textContent = isMine
                ? "Q: You"
                : qMember
                    ? `Q: ${qMember.paxName}`
                    : slot.qUserId
                        ? "Q: Filled"
                        : "Q: Open";

            const previewLine = document.createElement("div");
            previewLine.classList.add("stats-line");
            previewLine.textContent = ao?.time ? `Start: ${ao.time}` : "No time set";

            const actionWrap = document.createElement("div");

            if (!slot.qUserId) {
                const claimButton = document.createElement("button");
                claimButton.textContent = "Claim";
            
                claimButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await claimQSlot(slot);
                });
            
                actionWrap.appendChild(claimButton);
            } else if (slot.qUserId === state.currentUserId) {
                const unclaimButton = document.createElement("button");
                unclaimButton.textContent = "Unclaim";

                unclaimButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await unclaimQSlot(slot);
                })
                actionWrap.appendChild(unclaimButton);
            }

            const cardContent = document.createElement("div");
            cardContent.append(topLine, titleLine, previewLine);
            card.append(cardContent, actionWrap);

            listContainer.appendChild(card);
        });
    }

    const nav = createGlobalNav();

    app.append(
        title,
        subtitle,
        ...(generateButton ? [generateButton] : []),
        listContainer,
        nav
    );
}