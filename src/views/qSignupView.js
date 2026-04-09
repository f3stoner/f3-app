import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
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
            card.classList.add("member-card");

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
                        state.currentView = "plannedWorkoutDetail";
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
                        state.currentView = "workoutPlanner";
                    }

                    renderApp();
                });

                const unclaimButton = document.createElement("button");
                unclaimButton.textContent = "Unclaim";

                unclaimButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await unclaimQSlot(slot);
                });

                actionWrap.append(workoutButton, unclaimButton);
            }

            const cardContent = document.createElement("div");
            cardContent.append(topLine, titleLine, previewLine);
            card.append(cardContent, actionWrap);

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
        ...(generateButton ? [generateButton] : []),
        aoFilterLabel,
        controlsRow,
        listContainer,
        nav
    );
}