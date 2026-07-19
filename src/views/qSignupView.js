import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { updateQSlotInCloud, deleteQSlotFromCloud, insertQSlot, loadMappedQSlots, subscribeToQSlotChanges, unsubscribeFromChannel } from "../services/cloudData.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { unclaimQSlot } from "../services/qSlots.js";
import { logActionFailure, logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { userAlreadyHasQOnDate } from "../utils/qSlotValidation.js";
import { shouldShowQReminderPrompt } from "../utils/notificationOptIn.js";
import { createQReminderPromptModal } from "../components/qReminderPromptModal.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { getWorkoutEmphasisForSlot } from "../utils/workoutEmphasis.js";
import { createIcon } from "../utils/icons.js";
import { registerViewCleanup } from "../utils/viewCleanup.js";
import { hasPermission, PERMISSIONS, managesAo } from "../utils/permissions.js";
import { createModalShell, closeActiveModal } from "../utils/modal.js";
import { createWorkoutEmphasisBadge } from "../components/workoutEmphasisBadge.js";
import { findWorkoutForQSlot } from "../utils/qSlotMatching.js";
import { savePlannerDraft, createNewPlannerDraft, createExistingPlannerDraft } from "../services/plannerDraftRepository.js";


let qSlotRealtimeChannel = null;
let qSlotRealtimeRegionId = null;
let qSlotRefreshTimerId = null;

function createBlankWorkout({
    date = getTodayDate(),
    aoId = null,
    aoName = "",
    siteId = null,
    qSlotId = null,
} = {}) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        aoName,
        siteId,
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
        sourceQSlotId: qSlotId,
        createdAt: Date.now(),
        lastModifiedAt: null,
        createdByUserId: state.currentUserId,
        isShared: false,
        isFinalized: false,
        timers: [],
    };
}

export function cleanupQSlotRealtime() {
    if (qSlotRefreshTimerId) {
        clearTimeout(qSlotRefreshTimerId);
        qSlotRefreshTimerId = null;
    }

    if (qSlotRealtimeRegionId) {
        unsubscribeFromChannel(`q-slots-${qSlotRealtimeRegionId}`);
        qSlotRealtimeChannel = null;
    }

    qSlotRealtimeRegionId = null;
}

registerViewCleanup("qSignup", () => {
    cleanupQSlotRealtime();
    closeActiveModal();
});

function setupQSlotRealtime() {
    if (!state.currentRegionId) return;

    if (
        qSlotRealtimeChannel &&
        qSlotRealtimeRegionId === state.currentRegionId
    ) {
        return;
    }

    if (qSlotRealtimeRegionId) {
        unsubscribeFromChannel(`q-slots-${qSlotRealtimeRegionId}`);
    }

    qSlotRealtimeRegionId = state.currentRegionId;

    qSlotRealtimeChannel = subscribeToQSlotChanges(
        state.currentRegionId,
        () => {
            clearTimeout(qSlotRefreshTimerId);

            qSlotRefreshTimerId = setTimeout(async () => {
                try {
                    state.qSlots = await loadMappedQSlots(state.currentRegionId);

                    if (state.currentView === "qSignup") {
                        renderApp();
                    }
                } catch (error) {
                    console.error("Failed to refresh Q slots from realtime:", error);
                }
            }, 150);
        }
    );
}

function patchQSlotInState(updatedSlot) {
    state.qSlots = state.qSlots.map(slot =>
        slot.id === updatedSlot.id ? { ...slot, ...updatedSlot } : slot
    );
}

export function renderQSignupView() {
    const isGeneratingQSlots = Boolean(state.isGeneratingQSlots);

    const app = document.getElementById("app");
    app.textContent = "";

    setupQSlotRealtime();
    cleanupMainMenu();

    const canManageQSlots = hasPermission(PERMISSIONS.MANAGE_Q_SLOTS);
    const canManageAos = hasPermission(PERMISSIONS.MANAGE_AOS);

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

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

    let manageAosButton = null;
    let addSlotButton = null;

    const canAddOneOffSlots =
        canManageQSlots &&
        state.aos.some(ao => ao.isActive !== false && managesAo(ao.id));

    if (canManageAos) {
        manageAosButton = document.createElement("button");
        manageAosButton.textContent = "Manage AOs";

        manageAosButton.addEventListener("click", () => {
            navigateTo("aoManagement");
        });
    }

    if (canAddOneOffSlots) {
        addSlotButton = document.createElement("button");
        addSlotButton.textContent = "Add One-Off Slot";

        addSlotButton.addEventListener("click", () => {
            openAddSlotModal();
        });
    }

    const adminRow = document.createElement("div");
    adminRow.classList.add("button-row");

    if (manageAosButton) adminRow.appendChild(manageAosButton);
    if (addSlotButton) adminRow.appendChild(addSlotButton);

    const listContainer = document.createElement("div");

    const EMPHASIS_OPTIONS = [
        "heavy",
        "upper",
        "lower",
        "cardio",
        "ruck",
        "run",
        "core",
        "30/30",
        "stairs",
        "bootcamp",
        "benchmark",
        "murph_training",
        "other",
    ];
    
    function createEmphasisSelect(selectedValue = "") {
        const select = document.createElement("select");
    
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Use default";
        select.appendChild(defaultOption);
    
        EMPHASIS_OPTIONS.forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    
        select.value = selectedValue || "";
    
        return select;
    }

    async function refreshQSlotsFromCloud() {
        if (!state.currentRegionId) return;

        state.qSlots = await loadMappedQSlots(state.currentRegionId);
    }

    function openAddSlotModal() {
        const { modal, closeModal } = createModalShell();
        
        const heading = document.createElement("h2");
        heading.textContent = "Add One-Off Slot";

        const aoLabel = document.createElement("div");
        aoLabel.classList.add("detail-label");
        aoLabel.textContent = "AO";

        const aoSelect = document.createElement("select");

        const activeAos = [...state.aos]
            .filter(ao => ao.isActive !== false)
            .filter(ao => managesAo(ao.id))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (!activeAos.length) {
            showToast("You are not assigned to manage any AOs.", "error");
            closeModal();
            return;
        }

        activeAos.forEach(ao => {
            const option = document.createElement("option");
            option.value = ao.id;
            option.textContent = ao.name;
            aoSelect.appendChild(option);
        });

        if (activeAos.length === 1) {
            aoSelect.value = activeAos[0].id;
        }

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

        const timeLabel = document.createElement("div");
        timeLabel.classList.add("detail-label");
        timeLabel.textContent = "Override Time";

        const timeInput = document.createElement("input");
        timeInput.type = "text";
        timeInput.placeholder = "Example: 0500";

        const emphasisLabel = document.createElement("div");
        emphasisLabel.classList.add("detail-label");
        emphasisLabel.textContent = "Override Emphasis";

        const emphasisSelect = createEmphasisSelect();

        const titleLabel = document.createElement("div");
        titleLabel.classList.add("detail-label");
        titleLabel.textContent = "Override Title";

        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.placeholder = "Example: 0500 Ruck";

        const buttonRow = document.createElement("div");
        buttonRow.classList.add("button-row");

        const cancelButton = document.createElement("button");
        cancelButton.classList.add("secondary-button");
        cancelButton.textContent = "Cancel";

        cancelButton.addEventListener("click", () => {
            closeModal();
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

            if (!managesAo(aoSelect.value)) {
                showToast("You do not have permission to create slots for this AO.", "error");
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
                overrideTime: timeInput.value.trim() || null,
                overrideEmphasis: emphasisSelect.value || null,
                overrideTitle: titleInput.value.trim() || null,
            };

            try {
                await insertQSlot(activeRegionId, newSlot);
                await refreshQSlotsFromCloud();

                closeModal();
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
            timeLabel,
            timeInput,
            emphasisLabel,
            emphasisSelect,
            titleLabel,
            titleInput,
            buttonRow
        );
    }

    function openEditSlotModal(slot) {
        const { modal, closeModal } = createModalShell();
    
        const heading = document.createElement("h2");
        heading.textContent = "Edit Slot";
    
        const timeLabel = document.createElement("div");
        timeLabel.classList.add("detail-label");
        timeLabel.textContent = "Override Time";
    
        const timeInput = document.createElement("input");
        timeInput.type = "text";
        timeInput.placeholder = "Example: 0500";
        timeInput.value = slot.overrideTime || "";
    
        const emphasisLabel = document.createElement("div");
        emphasisLabel.classList.add("detail-label");
        emphasisLabel.textContent = "Override Emphasis";
    
        const emphasisSelect = createEmphasisSelect(slot.overrideEmphasis || "");

        const customEmphasisLabel = document.createElement("div");
        customEmphasisLabel.classList.add("detail-label");
        customEmphasisLabel.textContent = "Custom Emphasis Label";

        const customEmphasisInput = document.createElement("input");
        customEmphasisInput.type = "text";
        customEmphasisInput.placeholder = "Example: Murph Prep";
        customEmphasisInput.value = slot.customEmphasisLabel || "";
    
        const titleLabel = document.createElement("div");
        titleLabel.classList.add("detail-label");
        titleLabel.textContent = "Override Title";
    
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.placeholder = "Example: 0500 Ruck";
        titleInput.value = slot.overrideTitle || "";
    
        const buttonRow = document.createElement("div");
        buttonRow.classList.add("button-row");
    
        const cancelButton = document.createElement("button");
        cancelButton.classList.add("secondary-button");
        cancelButton.textContent = "Cancel";
    
        cancelButton.addEventListener("click", () => {
            closeModal();
        });
    
        const saveButton = document.createElement("button");
        saveButton.textContent = "Save Slot";
    
        saveButton.addEventListener("click", async () => {
            try {
                const activeRegionId = state.currentRegionId;
    
                if (!activeRegionId) {
                    throw new Error("No active region id");
                }
    
                await updateQSlotInCloud(activeRegionId, {
                    ...slot,
                    overrideEmphasis: emphasisSelect.value || null,
                    customEmphasisLabel: customEmphasisInput.value.trim() || null,
                    overrideTime: timeInput.value.trim() || null,
                    overrideTitle: titleInput.value.trim() || null,
                });
    
                await refreshQSlotsFromCloud();
    
                closeModal();
                showToast("Q slot updated.", "success");
                renderApp();
            } catch (error) {
                console.error("Failed to update Q slot:", error);
                showToast("Failed to update Q slot.", "error");
            }
        });
    
        buttonRow.append(cancelButton, saveButton);
    
        modal.append(
            heading,
            timeLabel,
            timeInput,
            emphasisLabel,
            emphasisSelect,
            customEmphasisLabel,
            customEmphasisInput,
            titleLabel,
            titleInput,
            buttonRow
        );    
    }

    function openAssignQModal(slot) {
        const { modal, closeModal } = createModalShell();

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
            closeModal();
        });

        const assignButton = document.createElement("button");
        assignButton.textContent = "Assign Q";

        assignButton.addEventListener("click", async () => {
            if (!qSelect.value) {
                alert("Please select a Q.");
                return;
            }
        
            assignButton.disabled = true;
            assignButton.textContent = "Assigning...";
        
            const didAssign = await assignQSlot(slot, qSelect.value);
        
            if (didAssign) {
                closeModal();
            } else {
                assignButton.disabled = false;
                assignButton.textContent = "Assign Q";
            }
        });

        buttonRow.append(cancelButton, assignButton);

        modal.append(
            heading,
            qLabel,
            qSelect,
            buttonRow
        );
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

            const updatedSlot = {
                ...slot,
                qUserId: state.currentUserMemberId,
            };
            
            await updateQSlotInCloud(activeRegionId, updatedSlot);
            patchQSlotInState(updatedSlot);

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
    
            if (!activeRegionId) {
                throw new Error("No active region id");
            }
    
            if (userAlreadyHasQOnDate(slot.date, memberId, slot.id)) {
                showToast("That PAX already has a Q scheduled that day.", "error");
                return false;
            }
    
            const updatedSlot = {
                ...slot,
                qUserId: memberId,
            };
    
            await updateQSlotInCloud(activeRegionId, updatedSlot);
            await refreshQSlotsFromCloud();
    
            showToast("Q assigned.", "success");
            renderApp();
    
            return true;
        } catch (error) {
            console.error("Failed to assign Q slot:", error);
            showToast("Failed to assign Q slot.", "error");
    
            logActionFailure("assignQSlot", error, {
                qSlotId: slot?.id || null,
                aoId: slot?.aoId || null,
                date: slot?.date || null,
                assignedMemberId: memberId || null,
            });
    
            return false;
        }
    }
    
    async function deleteQSlot(slot) {
        const confirmed = confirm("Permanently remove this Q slot?");
        if (!confirmed) return;

        try {
            const activeRegionId = state.currentRegionId;
            if (!activeRegionId) {
                throw new Error("No active region id");
            }

            await deleteQSlotFromCloud(activeRegionId, slot.id);

            await refreshQSlotsFromCloud();

            renderApp();
        } catch (error) {
            console.error("Failed to delete Q slot:", error);
            showToast("Failed to delete Q slot.", "error");
        }
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

    function formatQSlotTime(value) {
        const raw = String(value || "").trim();
    
        if (!raw) return "";
    
        const normalized = raw.includes(":")
            ? raw
            : raw.length === 4
                ? `${raw.slice(0, 2)}:${raw.slice(2)}`
                : raw;
    
        const match = normalized.match(/^(\d{1,2}):(\d{2})/);
    
        if (!match) return raw;
    
        const hours = Number(match[1]);
        const minutes = match[2];
    
        if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
            return raw;
        }
    
        const period = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 || 12;
    
        return `${displayHours}:${minutes} ${period}`;
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
    
        const timeA = a.startTime || a.overrideTime || "";
        const timeB = b.startTime || b.overrideTime || "";
    
        if (timeA !== timeB) {
            return timeA.localeCompare(timeB);
        }
    
        const aoA = state.aos.find(ao => ao.id === a.aoId)?.name || "";
        const aoB = state.aos.find(ao => ao.id === b.aoId)?.name || "";
    
        if (aoA !== aoB) {
            return aoA.localeCompare(aoB);
        }
    
        const siteA = state.sites?.find(site => site.id === a.siteId)?.name || "";
        const siteB = state.sites?.find(site => site.id === b.siteId)?.name || "";
    
        return siteA.localeCompare(siteB);
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
            const managesThisAo = managesAo(slot.aoId);

            const card = document.createElement("div");
            card.classList.add("member-card", "q-slot-card");

            if (managesThisAo) {
                card.classList.add("clickable-card");

                card.addEventListener("click", () => {
                    openEditSlotModal(slot);
                });
            }

            const ao = state.aos.find(a => a.id === slot.aoId);

            const site = state.sites?.find(
                candidate => candidate.id === slot.siteId
            ) || null;

            const emphasisBadge = createWorkoutEmphasisBadge(slot, ao);

            const dayKey = String(
                new Date(`${slot.date}T00:00:00`).getDay()
            );

            const rawDisplayTime =
                slot.overrideTime ||
                slot.startTime ||
                ao?.timeSchedule?.[dayKey] ||
                ao?.time ||
                "";

            const displayTime = formatQSlotTime(rawDisplayTime);
            const displaySiteName = site?.name || "";
            const displayTitle = slot.overrideTitle || "";
            const isMine = slot.qUserId === state.currentUserMemberId;
            const canEditSlot = managesThisAo || isMine;
            const qMember = state.members.find(m => m.id === slot.qUserId);
            const matchingWorkout = findWorkoutForQSlot(
                slot,
                state.plannedWorkouts,
                state.currentUserId,
                state.aos
            );
            const hasPlannedWorkout = Boolean(matchingWorkout);

            const topLine = document.createElement("div");
            topLine.classList.add("member-name");
            if (managesThisAo) {
                topLine.title = "Tap card to edit slot";
            }
            topLine.textContent = displayTitle
                ? `${formatDate(slot.date)} - ${ao?.name || "Unknown AO"} - ${displayTitle}`
                : `${formatDate(slot.date)} - ${ao?.name || "Unknown AO"}`;

            const siteLine = document.createElement("div");
            siteLine.classList.add("stats-line");
            
            if (displaySiteName) {
                siteLine.textContent = displaySiteName;
            }

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
                previewLine.textContent = !hasPlannedWorkout
                    ? "Needs BD"
                    : matchingWorkout.isFinalized
                        ? "BD Ready"
                        : "Draft BD";
            }

            const timeLine = document.createElement("div");
            timeLine.classList.add("stats-line");
            timeLine.textContent = displayTime ? `Start: ${displayTime}` : "No time set";

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
                workoutButton.textContent = !hasPlannedWorkout 
                    ? "Plan BD"
                    : matchingWorkout.isFinalized 
                        ? "View BD"
                        : "Continue Planning";

                workoutButton.addEventListener("click", (event) => {
                    event.stopPropagation();

                    if (hasPlannedWorkout) {
                        if (!matchingWorkout.isFinalized) {
                    
                            savePlannerDraft(
                                createExistingPlannerDraft(matchingWorkout)
                            );
                    
                            state.editingPlannedWorkoutId = matchingWorkout.id;
                            state.selectedPlannedWorkoutId = null;
                    
                            navigateTo("workoutPlanner");
                            return;
                        }
                    
                        state.selectedPlannedWorkoutId = matchingWorkout.id;
                        state.plannedWorkoutLaunchMode = null;
                        navigateTo("plannedWorkoutDetail");
                    } else {
                        const newWorkout = createBlankWorkout({
                            date: slot.date,
                            aoId: ao?.id || slot.aoId || null,
                            aoName: ao?.name || "",
                            siteId: slot.siteId || null,
                            qSlotId: slot.id,
                        });
                        
                        savePlannerDraft(
                            createNewPlannerDraft(newWorkout)
                        );
                        
                        state.editingPlannedWorkoutId = null;
                        navigateTo("workoutPlanner");
                    }
                });

                const unclaimButton = document.createElement("button");
                unclaimButton.textContent = "Unclaim";

                unclaimButton.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    try {
                        const result = await unclaimQSlot(slot);

                        if (!result?.success) {
                            return;
                        }

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

            if (canEditSlot) {
                const editButton = document.createElement("button");
                editButton.classList.add("q-slot-edit-button");
                editButton.textContent = "Edit";
            
                editButton.addEventListener("click", (event) => {
                    event.stopPropagation();
                    openEditSlotModal(slot);
                });
            
                actionWrap.appendChild(editButton);
            }

            if (managesThisAo) {
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
                        const result = await unclaimQSlot(slot, {
                            bypassDropGuard: true,
                        });
                        
                        if (!result?.success) {
                            return;
                        }
                        
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

            cardContent.append(topLine);

            if (displaySiteName) {
                cardContent.append(siteLine);
            }

            if (emphasisBadge) {
                cardContent.append(emphasisBadge);
            }

            cardContent.append(titleLine, timeLine);

            if (isMine) {
                cardContent.append(previewLine);
            }
                        
            mainRow.append(cardContent, actionWrap);
            card.appendChild(mainRow);  

            if (managesThisAo && adminActions) {
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
        header,
        title,
        subtitle,
        ...(adminRow.children.length ? [adminRow] : []),
        monthNavRow,
        aoFilterLabel,
        controlsRow,
        listContainer,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}