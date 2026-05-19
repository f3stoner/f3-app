import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { updateQSlotInCloud, deleteQSlotFromCloud, insertQSlot } from "../services/cloudData.js";
import { generateQSlotsForCurrentRegion } from "../services/qSlotGeneration.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { unclaimQSlot } from "../services/qSlots.js";
import { logActionFailure, logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { userAlreadyHasQOnDate } from "../utils/qSlotValidation.js";
import { shouldShowQReminderPrompt } from "../utils/notificationOptIn.js";
import { createQReminderPrompt } from "../components/qReminderPrompt.js";
import { createQReminderPromptModal } from "../components/qReminderPromptModal.js";

export function renderQSignupView() {
    const isGeneratingQSlots = Boolean(state.isGeneratingQSlots);

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

    if (!state.hasInitializedQSignupFilter) {
        state.qSignupAoFilter = homeAo ? homeAo.id : "all";
        state.hasInitializedQSignupFilter = true;
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
    let addSlotButton = null;

    if (state.currentUserRole === "admin") {
        generateButton = document.createElement("button");
        generateButton.textContent = isGeneratingQSlots
            ? "Generating..."
            : "Generate Next 365 Days";
        generateButton.disabled = isGeneratingQSlots;

        manageAosButton = document.createElement("button");
        manageAosButton.textContent = "Manage AOs";

        generateButton.addEventListener("click", async () => {
            if (state.isGeneratingQSlots) return;

            state.isGeneratingQSlots = true;
            renderApp();

            try {
                const result = await generateQSlotsForCurrentRegion();
                showToast(`Created ${result.createdCount} Q Slots.`, "success");
            } catch (error) {
                console.error("Failed to generate Q slots:", error);
                showToast("Failed to generate Q slots.", "error");
            } finally {
                state.isGeneratingQSlots = false;
                renderApp();
            }
        });

        manageAosButton.addEventListener("click", () => {
            navigateTo("aoManagement");
        });

        addSlotButton = document.createElement("button");
        addSlotButton.textContent = "Add One-Off Slot";

        addSlotButton.addEventListener("click", () => {
            openAddSlotModal();
        });
    }

    const adminRow = document.createElement("div");
    adminRow.classList.add("button-row");

    if (generateButton) adminRow.appendChild(generateButton);
    if (manageAosButton) adminRow.appendChild(manageAosButton);
    if (addSlotButton) adminRow.appendChild(addSlotButton);

    const listContainer = document.createElement("div");

    function openAddSlotModal() {
        const overlay = document.createElement("div");
        overlay.classList.add("modal-overlay");

        const modal = document.createElement("div");
        modal.classList.add("modal");

        const heading = document.createElement("h2");
        heading.textContent = "Add One-Off Slot";

        const aoLabel = document.createElement("div");
        aoLabel.classList.add("detail-label");
        aoLabel.textContent = "AO";

        const aoSelect = document.createElement("select");

        const activeAos = [...state.aos]
            .filter(ao => ao.isActive)
            .sort((a, b) => a.name.localeCompare(b.name));

        activeAos.forEach(ao => {
            const option = document.createElement("option");
            option.value = ao.id;
            option.textContent = ao.name;
            aoSelect.appendChild(option);
        });

        const dateLabel = document.createElement("div");
        dateLabel.classList.add("detail-label");
        dateLabel.textContent = "Date";

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = getTodayDate();

        const qLabel = document.createElement("div");
        qLabel.classList.add("detail-label");
        qLabel.textContent = "Q";

        const qSelect = document.createElement("select");

        const openOption = document.createElement("option");
        openOption.value = "";
        openOption.textContent = "Open";
        qSelect.appendChild(openOption);

        const activeMembers = [...state.members]
            .filter(member => member.status !== "inactive")
            .sort((a, b) => a.paxName.localeCompare(b.paxName));

        activeMembers.forEach(member => {
            const option = document.createElement("option");
            option.value = member.id;
            option.textContent = member.paxName;
            qSelect.appendChild(option);
        });

        const buttonRow = document.createElement("div");
        buttonRow.classList.add("button-row");

        const cancelButton = document.createElement("button");
        cancelButton.classList.add("secondary-button");
        cancelButton.textContent = "Cancel";

        cancelButton.addEventListener("click", () => {
            overlay.remove();
        });

        const createButton = document.createElement("button");
        createButton.textContent = "Create Slot";

        createButton.addEventListener("click", async () => {
            const activeRegionId = state.currentRegionId;

            if (!activeRegionId) {
                alert("No active region");
                return;
            }

            if (!aoSelect.value) {
                alert("Please select an AO.");
                return;
            }

            if (!dateInput.value) {
                alert("Please select a date.");
                return;
            }

            if (
                qSelect.value &&
                userAlreadyHasQOnDate(dateInput.value, qSelect.value)
            ) {
                showToast("That PAX already has a Q scheduled that day.", "error");
                return;
            }

            const newSlot = {
                id: crypto.randomUUID(),
                aoId: aoSelect.value,
                date: dateInput.value,
                qUserId: qSelect.value || null,
                createdAt: new Date().toISOString(),
            };

            try {
                const saved = await insertQSlot(activeRegionId, newSlot);
                state.qSlots.push(saved);

                overlay.remove();
                renderApp();
            } catch (error) {
                console.error("Failed to create one-off Q slot:", error);
                showToast("Failed to create Q slot.", "error");
            }
        });

        buttonRow.append(cancelButton, createButton);

        modal.append(
            heading,
            aoLabel,
            aoSelect,
            dateLabel,
            dateInput,
            qLabel,
            qSelect,
            buttonRow
        );

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function openAssignQModal(slot) {
        const overlay = document.createElement("div");
        overlay.classList.add("modal-overlay");

        const modal = document.createElement("div");
        modal.classList.add("modal");

        const heading = document.createElement("h2");
        heading.textContent = "Assign Q";

        const qLabel = document.createElement("div");
        qLabel.classList.add("detail-label");
        qLabel.textContent = "Q";

        const qSelect = document.createElement("select");

        const activeMembers = [...state.members]
            .filter(member => member.status !== "inactive")
            .sort((a, b) => a.paxName.localeCompare(b.paxName));

        activeMembers.forEach(member => {
            const option = document.createElement("option");
            option.value = member.id;
            option.textContent = member.paxName;
            qSelect.appendChild(option);
        });

        if (slot.qUserId) {
            qSelect.value = slot.qUserId;
        }

        const buttonRow = document.createElement("div");
        buttonRow.classList.add("button-row");

        const cancelButton = document.createElement("button");
        cancelButton.classList.add("secondary-button");
        cancelButton.textContent = "Cancel";

        cancelButton.addEventListener("click", ()=> {
            overlay.remove();
        });

        const assignButton = document.createElement("button");
        assignButton.textContent = "Assign Q";

        assignButton.addEventListener("click", async () => {
            if (!qSelect.value) {
                alert("Please select a Q.");
                return;
            }

            await assignQSlot(slot, qSelect.value);
            overlay.remove();
        });

        buttonRow.append(cancelButton, assignButton);

        modal.append(
            heading,
            qLabel,
            qSelect,
            buttonRow
        );

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    async function claimQSlot(slot) {
        try {
            const activeRegionId = state.currentRegionId;
            if (!activeRegionId) {
                throw new Error("No active region id");
            }

            if (userAlreadyHasQOnDate(slot.date, state.currentUserMemberId, slot.id)) {
                showToast("You already have a Q scheduled that day.", "error");
                return;
            }

            const ao = state.aos.find(a => a.id === slot.aoId);

            const updatedSlot = await updateQSlotInCloud(activeRegionId, {
                ...slot,
                qUserId: state.currentUserMemberId,
            });

            const index = state.qSlots.findIndex(q => q.id === slot.id);
            if (index !== -1) {
                state.qSlots[index] = updatedSlot;
            }

            logAppEvent({
                type: APP_EVENTS.Q_SLOT_CLAIMED,
                metadata: {
                    qSlotId: slot.id,
                    aoId: slot.aoId || null,
                    aoName: ao?.name || null,
                    date: slot.date || null,
                    qUserId: state.currentUserMemberId || null,
                },
            });

            showToast("Q claimed.", "success");
            renderApp();

            if (shouldShowQReminderPrompt()) {
                document.body.appendChild(createQReminderPromptModal());
            }
        } catch (error) {
            console.error("Failed to claim Q slot:", error);
            showToast("Failed to claim Q slot.", "error");

            logActionFailure("claimQSlot", error, {
                qSlotId: slot?.id || null,
                aoId: slot?.aoId || null,
                date: slot?.date || null,
                currentUserMemberId: state.currentUserMemberId || null,
            });
        }
    }

    async function assignQSlot(slot, memberId) {
        try {
            const activeRegionId = state.currentRegionId;
            if(!activeRegionId) {
                throw new Error("No active region id");
            }

            if (userAlreadyHasQOnDate(slot.date, memberId, slot.id)) {
                showToast("That PAX already has a Q scheduled that day.", "error");
                return;
            }

            const updatedSlot = await updateQSlotInCloud(activeRegionId, {
                ...slot,
                qUserId: memberId,
            });

            const index = state.qSlots.findIndex(q => q.id === slot.id);
            if (index !== -1) {
                state.qSlots[index] = updatedSlot;
            }

            renderApp();
        } catch (error) {
            console.error("failed to assign Q slot:", error);
            showToast("Failed to assign Q slot.", "error");
        }
    }

    async function deleteQSlot(slot) {
        const confirmed = confirm("Remove this Q slot? It may be recreated if slots are regenerated.");
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
            showToast("Failed to delete Q slot.", "error");
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

    function getMonthKeyFromDateString(dateString) {
        return dateString.slice(0, 7);
    }

    function getCurrentMonthKey() {
        return getMonthKeyFromDateString(getTodayDate());
    }

    function getMonthLabel(monthKey) {
        const [year, month] = monthKey.split("-").map(Number);
        const date = new Date(year, month - 1, 1);

        return date.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
        });
    }

    function shiftMonthKey(monthKey, offset) {
        const [year, month] = monthKey.split("-").map(Number);
        const date = new Date(year, month - 1 + offset, 1);

        const nextYear = date.getFullYear();
        const nextMonth = String(date.getMonth() + 1).padStart(2, "0");

        return `${nextYear}-${nextMonth}`;
    }

    if (!state.qSignupMonth) {
        state.qSignupMonth = getCurrentMonthKey();
    }

    const selectedMonth = state.qSignupMonth || getCurrentMonthKey();
    const isCurrentMonth = selectedMonth === getCurrentMonthKey();

    const futureSlots = state.qSlots.filter(slot =>
        slot.date >= today &&
        getMonthKeyFromDateString(slot.date) === selectedMonth
    );

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
                            thangSections: [
                                {
                                    id: crypto.randomUUID(),
                                    title: "Thang 1",
                                    content: "",
                                },
                            ],
                            finisher: "",
                            notes: "",
                            sourceWorkoutId: null,
                            sourceSessionId: null,
                            createdAt: Date.now(),
                            lastModifiedAt: null,
                            createdByUserId: state.currentUserId,
                            isShared: false,
                            timers: [],
                        };

                        state.editingPlannedWorkoutId = null;
                        navigateTo("workoutPlanner");
                    }
                });

                const unclaimButton = document.createElement("button");
                unclaimButton.textContent = "Unclaim";

                unclaimButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    try {
                        await unclaimQSlot(slot);
                        renderApp();
                    } catch (error) {
                        console.error("Failed to unclaim Q slot:", error);
                        showToast("Failed to unclaim Q slot.", "error");

                        logActionFailure("unclaimQSlot", error, {
                            qSlotId: slot?.id || null,
                            aoId: slot?.aoId || null,
                            date: slot?.date || null,
                            currentUserMemberId: state.currentUserMemberId || null,
                        });
                    }
                });

                actionWrap.append(workoutButton, unclaimButton);
            }

            let adminActions = null;

            if (state.currentUserRole === "admin") {
                adminActions = document.createElement("div");
                adminActions.classList.add("q-slot-admin-actions");

                const assignButton = document.createElement("button");
                assignButton.textContent = "Assign Q";

                assignButton.addEventListener("click", (event) => {
                    event.stopPropagation();
                    openAssignQModal(slot);
                });

                const clearButton = document.createElement("button");
                clearButton.textContent = "Clear Q";

                clearButton.disabled = !slot.qUserId;

                clearButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    
                    try{
                        await unclaimQSlot(slot, { bypassDropGuard: true });
                        renderApp();
                    } catch (error) {
                        console.error("Failed to clear Q slot:", error);
                        showToast("Failed to clear Q slot.", "error");

                        logActionFailure("clearQSlot", error, {
                            qSlotId: slot?.id || null,
                            aoId: slot?.aoId || null,
                            date: slot?.date || null,
                            bypassDropGuard: true,
                        });
                    }
                });

                const deleteButton = document.createElement("button");
                deleteButton.classList.add("danger-button");
                deleteButton.textContent = "Remove";

                deleteButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    await deleteQSlot(slot);
                });

                adminActions.append(assignButton, clearButton, deleteButton);
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

    const monthNavRow = document.createElement("div");
    monthNavRow.classList.add("q-signup-month-row");

    const previousMonthButton = document.createElement("button");
    previousMonthButton.classList.add("month-nav-button");
    previousMonthButton.textContent = "←";
    previousMonthButton.disabled = isCurrentMonth;

    previousMonthButton.addEventListener("click", () => {
        state.qSignupMonth = shiftMonthKey(selectedMonth, -1);
        renderApp();
    });

    const monthLabel = document.createElement("div");
    monthLabel.classList.add("q-signup-month-label");
    monthLabel.textContent = getMonthLabel(selectedMonth);

    const nextMonthButton = document.createElement("button");
    nextMonthButton.classList.add("month-nav-button");
    nextMonthButton.textContent = "→";

    nextMonthButton.addEventListener("click", () => {
        state.qSignupMonth = shiftMonthKey(selectedMonth, 1);
        renderApp();
    });

    monthNavRow.append(
        previousMonthButton,
        monthLabel,
        nextMonthButton,
    );

    const controlsRow = document.createElement("div");
    controlsRow.classList.add("q-signup-controls-row");
    controlsRow.append(aoFilterSelect, openOnlyWrap);

    app.append(
        title,
        subtitle,
        ...(adminRow.children.length ? [adminRow] : []),
        monthNavRow,
        aoFilterLabel,
        controlsRow,
        listContainer,
        nav
    );
}