import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { updateQSlotInCloud, deleteQSlotFromCloud } from "../services/cloudData.js";
import { generateQSlotsForCurrentRegion } from "../services/qSlotGeneration.js";
import { navigateTo } from "../utils/navigation.js";

export function renderQSignupView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Q Signup";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Claim upcoming Q slots.";

    const currentMember = state.members.find(
        member => member.id === state.currentUserMemberId);

    const homeAoName = currentMember?.homeAo || "";
    const homeAo = state.aos.find(ao => ao.name === homeAoName) || null;

    const aoFilterLabel = document.createElement("div");
    aoFilterLabel.classList.add("detail-label");
    aoFilterLabel.textContent = "Filter by AO";

    const aoFilterSelect = document.createElement("select");

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All AOs";
    aoFilterSelect.appendChild(allOption);

    const filterAos = [...state.aos].sort((a, b) => {
        if (homeAo && a.id === homeAo.id) return -1;
        if (homeAo && b.id === homeAo.id) return 1;
        return a.name.localeCompare(b.name);
    });

    filterAos.forEach(ao => {
        const option = document.createElement("option");
        option.value = ao.id;
        option.textContent = homeAo && ao.id === homeAo.id
            ? `${ao.name} (Home)`
            : ao.name;
        aoFilterSelect.appendChild(option);
    });

    if (!state.qSignupAoFilter) {
        state.qSignupAoFilter = homeAo ? homeAo.id : "all";
    }

    aoFilterSelect.value = state.qSignupAoFilter || "";

    aoFilterSelect.addEventListener("change", (event) => {
        state.qSignupAoFilter = event.target.value;
        renderApp();
    });

    const openOnlyWrap = document.createElement("label");
    openOnlyWrap.classList.add("ao-status-toggle");

    const openOnlyInput = document.createElement("input");
    openOnlyInput.type = "checkbox";
    openOnlyInput.checked = state.qSignupOpenOnly;

    openOnlyInput.addEventListener("change", (event) => {
        state.qSignupOpenOnly = event.target.checked;
        renderApp();
    });

    openOnlyWrap.append(openOnlyInput, document.createTextNode(" Open only"));

    let generateButton = null;
    let manageAosButton = null;

    if (state.currentUserRole === "admin") {
        generateButton = document.createElement("button");
        generateButton.textContent = "Generate Next 12 Weeks";
        manageAosButton = document.createElement("button");
        manageAosButton.textContent = "Manage AOs";

        generateButton.addEventListener("click", async () => {
            try {
                const result = await generateQSlotsForCurrentRegion();
                alert(`Created ${result.createdCount} Q Slots.`);
                renderApp();
            } catch (error) {
                console.error("Failed to generate Q slots:", error);
                alert("Failed to generate Q slots.");
            }
        });

        manageAosButton.addEventListener("click", () => {
            navigateTo("aoManagement");
        });
    }

    const adminRow = document.createElement("div");
    adminRow.classList.add("button-row");

    if (generateButton) adminRow.appendChild(generateButton);
    if (manageAosButton) adminRow.appendChild(manageAosButton);

    const listContainer = document.createElement("div");

    async function claimQSlot(slot) {
        try {
            const activeRegionId = state.currentRegionId;
            if (!activeRegionId) {
                throw new Error("No active region id");
            }

            const updatedSlot = await updateQSlotInCloud(activeRegionId, {
                ...slot,
                qUserId: state.currentUserMemberId,
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

    async function deleteQSlot(slot) {
        const confirmed = confirm("Delete this Q slot? This cannot be undone.");
        if (!confirmed) return;

        try {
            const activeRegionId = state.currentRegionId;
            if (!activeRegionId) {
                throw new Error("No active region id");
            }

            await deleteQSlotFromCloud(activeRegionId, slot.id);

            state.qSlots = state.qSlots.filter(q => q.id !== slot.id);

            renderApp();
        } catch (error) {
            console.error("Failed to delete Q slot:", error);
            alert("Failed to delete Q slot.");
        }
    }

    function findMatchingPlannedWorkout(slot, ao) {
        return state.plannedWorkouts.find(workout => 
            workout.date === slot.date &&
            workout.createdByUserId === state.currentUserId &&
            workout.aoName === ao?.name
        );
    }

    const today = getTodayDate();
    const futureSlots = state.qSlots.filter(slot => slot.date >= today);

    const aoFilteredSlots = state.qSignupAoFilter === "all"
        ? futureSlots
        : futureSlots.filter(slot => slot.aoId === state.qSignupAoFilter);
    
    const filteredSlots = state.qSignupOpenOnly
        ? aoFilteredSlots.filter(slot => !slot.qUserId)
        : aoFilteredSlots;
        

    const sortedSlots = [...filteredSlots].sort((a, b) => {
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
        empty.textContent = state.qSignupOpenOnly
        ? "No open Q slots for this filter"
        : "No Q slots available yet";

        listContainer.appendChild(empty);
    } else {
        sortedSlots.forEach(slot => {
            const card = document.createElement("div");
            card.classList.add("member-card", "q-slot-card");

            const ao = state.aos.find(a => a.id === slot.aoId);
            const isMine = slot.qUserId === state.currentUserMemberId;
            const qMember = state.members.find(m => m.id === slot.qUserId);
            const matchingWorkout = findMatchingPlannedWorkout(slot, ao);
            const hasPlannedWorkout = Boolean(matchingWorkout);

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
            if (isMine) {
                previewLine.textContent = hasPlannedWorkout ? "BD Ready" : "Needs BD"
            } else {
                previewLine.textContent = ao?.time ? `Start: ${ao.time}` : "No time set";
            }

            const actionWrap = document.createElement("div");
            actionWrap.classList.add("q-slot-actions");

            if (!slot.qUserId) {
                const claimButton = document.createElement("button");
                claimButton.textContent = "Claim";
            
                claimButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await claimQSlot(slot);
                });
            
                actionWrap.appendChild(claimButton);
            } else if (isMine) {
                const workoutButton = document.createElement("button");
                workoutButton.textContent = hasPlannedWorkout ? "View BD" : "Plan BD";

                workoutButton.addEventListener("click", (event) => {
                    event.stopPropagation();

                    if (hasPlannedWorkout) {
                        state.selectedPlannedWorkoutId = matchingWorkout.id;
                        state.plannedWorkoutLaunchMode = null;
                        navigateTo("plannedWorkoutDetail");
                    } else {
                        state.draftPlannedWorkout = {
                            id: crypto.randomUUID(),
                            date: slot.date,
                            aoName: ao?.name || "",
                            title: "",
                            introduction: "",
                            warmorama: "",
                            thangs: "",
                            finisher: "",
                            notes: "",
                            sourceWorkoutId: null,
                            sourceSessionId: null,
                            createdAt: Date.now(),
                            lastModifiedAt: null,
                            createdByUserId: state.currentUserId,
                            isShared: false,
                        };

                        state.editingPlannedWorkoutId = null;
                        navigateTo("workoutPlanner");
                    }
                });

                const unclaimButton = document.createElement("button");
                unclaimButton.textContent = "Unclaim";

                unclaimButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await unclaimQSlot(slot);
                });

                actionWrap.append(workoutButton, unclaimButton);
            }

            let adminActions = null;

            if (state.currentUserRole === "admin") {
                adminActions = document.createElement("div");
                adminActions.classList.add("q-slot-admin-actions");

                const clearButton = document.createElement("button");
                clearButton.textContent = "Clear Q";

                clearButton.disabled = !slot.qUserId;

                clearButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await unclaimQSlot(slot);
                });

                const deleteButton = document.createElement("button");
                deleteButton.classList.add("danger-button");
                deleteButton.textContent = "Delete";

                deleteButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await deleteQSlot(slot);
                });

                adminActions.append(clearButton, deleteButton);
            }

            const mainRow = document.createElement("div");
            mainRow.classList.add("q-slot-main-row");

            const cardContent = document.createElement("div");
            cardContent.append(topLine, titleLine, previewLine);
            
            mainRow.append(cardContent, actionWrap);
            card.appendChild(mainRow);

            if (state.currentUserRole === "admin") {
                card.append(adminActions);
            }

            listContainer.appendChild(card);
        });
    }

    const nav = createGlobalNav();

    const controlsRow = document.createElement("div");
    controlsRow.classList.add("q-signup-controls-row");
    controlsRow.append(aoFilterSelect, openOnlyWrap);

    app.append(
        title,
        subtitle,
        ...(adminRow.children.length ? [adminRow] : []),
        aoFilterLabel,
        controlsRow,
        listContainer,
        nav
    );
}