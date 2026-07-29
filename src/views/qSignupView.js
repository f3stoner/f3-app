import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import {
    updateQSlotInCloud,
    deleteQSlotFromCloud,
    insertQSlot,
    loadMappedQSlots,
    subscribeToQSlotChanges,
    unsubscribeFromChannel,
    loadQSlotCommitmentSummaries,
    setQSlotCommitment,
} from "../services/cloudData.js";
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
import { hasPermission, PERMISSIONS, managesAo, managesQSlot } from "../utils/permissions.js";
import { createModalShell, closeActiveModal } from "../utils/modal.js";
import { createWorkoutEmphasisBadge } from "../components/workoutEmphasisBadge.js";
import { findWorkoutForQSlot } from "../utils/qSlotMatching.js";
import { savePlannerDraft, createNewPlannerDraft, createExistingPlannerDraft } from "../services/plannerDraftRepository.js";
import { resolveSiteForQSlot } from "../utils/siteResolution.js";


let qSlotRealtimeChannel = null;
let qSlotRealtimeRegionId = null;
let qSlotRefreshTimerId = null;
let expandedQSlotId = null;

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

    const canManageAos = hasPermission(PERMISSIONS.MANAGE_AOS);

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const intro = document.createElement("section");
    intro.classList.add("q-signup-intro");

    const title = document.createElement("h1");
    title.textContent = "Q Signup";

    const subtitle = document.createElement("div");
    subtitle.classList.add("q-signup-subtitle");
    subtitle.textContent = "See upcoming workouts and claim a Q.";

    intro.append(title, subtitle);

    const currentMember = state.members.find(
        member => member.id === state.currentUserMemberId);

    const homeAoName = currentMember?.homeAo || "";
    const homeAo = state.aos.find(ao => ao.name === homeAoName) || null;

    const aoFilterSelect = document.createElement("select");

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All AOs";
    aoFilterSelect.appendChild(allOption);

    const filterAos = state.aos
        .filter(ao => ao.isActive !== false)
        .sort((a, b) => {
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

    const selectedFilterAoIsActive = filterAos.some(
        ao => ao.id === state.qSignupAoFilter
    );
    
    if (
        state.qSignupAoFilter !== "all" &&
        !selectedFilterAoIsActive
    ) {
        state.qSignupAoFilter = "all";
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

    const canAddOneOffSlots = state.aos.some(
        ao => ao.isActive !== false && managesQSlot(ao.id)
    );

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
    adminRow.classList.add(
        "button-row",
        "q-signup-admin-actions"
    );
    
    if (manageAosButton) {
        manageAosButton.classList.add(
            "q-signup-admin-button",
            "secondary-button"
        );
    
        adminRow.appendChild(manageAosButton);
    }
    
    if (addSlotButton) {
        addSlotButton.classList.add(
            "q-signup-admin-button",
            "primary-button"
        );
    
        adminRow.appendChild(addSlotButton);
    }

    const listContainer = document.createElement("div");
    listContainer.classList.add("q-signup-timeline");

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
            .filter(ao => managesQSlot(ao.id))
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

        const siteLabel = document.createElement("div");
        siteLabel.classList.add("detail-label");
        siteLabel.textContent = "Site";

        const siteSelect = document.createElement("select");

        function populateSiteOptions() {
            siteSelect.textContent = "";

            const selectedAo = state.aos.find(
                ao => ao.id === aoSelect.value
            ) || null;

            const defaultSite = state.sites?.find(
                site => site.id === selectedAo?.defaultSiteId
            ) || null;

            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = defaultSite
                ? `Use AO default — ${defaultSite.name}`
                : "Use AO default — No default configured";

            siteSelect.appendChild(defaultOption);

            const availableSites = [...(state.sites || [])]
                .filter(site =>
                    !site.regionId ||
                    site.regionId === state.currentRegionId
                )
                .sort((a, b) =>
                    String(a.name || "").localeCompare(
                        String(b.name || "")
                    )
                );

            availableSites.forEach(site => {
                const option = document.createElement("option");
                option.value = site.id;
                option.textContent =
                    site.name || "Unnamed Site";

                siteSelect.appendChild(option);
            });

            siteSelect.value = "";
        }

        populateSiteOptions();

        aoSelect.addEventListener("change", () => {
            populateSiteOptions();
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

        const getMemberDisplayName = member =>
            member.paxName ||
            member.realName ||
            member.fullName ||
            "Unnamed PAX";
        
        const activeMembers = [...state.members]
            .filter(member => member.status !== "inactive")
            .sort((a, b) =>
                getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
            );

        activeMembers.forEach(member => {
            const option = document.createElement("option");
            option.value = member.id;
            option.textContent = getMemberDisplayName(member);
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

            const selectedAo = state.aos.find(
                ao => ao.id === aoSelect.value
            ) || null;
            
            const selectedSiteId =
                siteSelect.value || null;
            
            if (
                !selectedSiteId &&
                !selectedAo?.defaultSiteId
            ) {
                showToast(
                    "Select a Site because this AO has no default Site.",
                    "error"
                );
            
                return;
            }

            if (!managesQSlot(aoSelect.value)) {
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
                siteId: selectedSiteId,
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
            siteLabel,
            siteSelect,
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

        const ao = state.aos.find(
            candidate => candidate.id === slot.aoId
        ) || null;
        
        const defaultSite = state.sites?.find(
            site => site.id === ao?.defaultSiteId
        ) || null;
        
        const siteLabel = document.createElement("div");
        siteLabel.classList.add("detail-label");
        siteLabel.textContent = "Site";
        
        const siteSelect = document.createElement("select");
        
        const defaultSiteOption = document.createElement("option");
        defaultSiteOption.value = "";
        defaultSiteOption.textContent = defaultSite
            ? `Use AO default — ${defaultSite.name}`
            : "Use AO default — No default configured";
        
        siteSelect.appendChild(defaultSiteOption);
        
        const availableSites = [...(state.sites || [])]
            .filter(site =>
                !site.regionId ||
                site.regionId === state.currentRegionId
            )
            .sort((a, b) =>
                String(a.name || "").localeCompare(
                    String(b.name || "")
                )
            );
        
        availableSites.forEach(site => {
            const option = document.createElement("option");
            option.value = site.id;
            option.textContent = site.name || "Unnamed Site";
        
            siteSelect.appendChild(option);
        });
        
        siteSelect.value = slot.siteId || "";
    
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

                const selectedSiteId =
                    siteSelect.value || null;

                if (!selectedSiteId && !ao?.defaultSiteId) {
                    showToast(
                        "Select a Site because this AO has no default Site.",
                        "error"
                    );

                    return;
                }
    
                await updateQSlotInCloud(activeRegionId, {
                    ...slot,
                    siteId: selectedSiteId,
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
            siteLabel,
            siteSelect,
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

        const getMemberDisplayName = member =>
            member.paxName ||
            member.realName ||
            member.fullName ||
            "Unnamed PAX";
        
        const activeMembers = [...state.members]
            .filter(member => member.status !== "inactive")
            .sort((a, b) =>
                getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
            );

        activeMembers.forEach(member => {
            const option = document.createElement("option");
            option.value = member.id;
            option.textContent = getMemberDisplayName(member);
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

    async function updateMyQSlotCommitment(
        qSlotId,
        commitmentType
    ) {
        if (!state.currentUserMemberId) {
            showToast(
                "Your account is not linked to a PAX record.",
                "error"
            );
    
            return;
        }
    
        if (
            state.qSlotCommitmentLoadingBySlotId?.[
                qSlotId
            ]
        ) {
            return;
        }
    
        const currentSummary =
            state.qSlotCommitmentSummariesBySlotId?.[
                qSlotId
            ] || {
                qSlotId,
                hcCount: 0,
                scCount: 0,
                myCommitment: null,
            };
    
        const previousCommitment =
            currentSummary.myCommitment || null;
    
        const nextCommitment =
            previousCommitment === commitmentType
                ? null
                : commitmentType;
    
        state.qSlotCommitmentLoadingBySlotId = {
            ...(
                state.qSlotCommitmentLoadingBySlotId ||
                {}
            ),
            [qSlotId]: true,
        };
    
        try {
            await setQSlotCommitment({
                qSlotId,
                memberId:
                    state.currentUserMemberId,
                commitmentType:
                    nextCommitment,
            });
    
            let hcCount =
                Number(currentSummary.hcCount || 0);
    
            let scCount =
                Number(currentSummary.scCount || 0);
    
            if (previousCommitment === "hc") {
                hcCount = Math.max(
                    0,
                    hcCount - 1
                );
            }
    
            if (previousCommitment === "sc") {
                scCount = Math.max(
                    0,
                    scCount - 1
                );
            }
    
            if (nextCommitment === "hc") {
                hcCount += 1;
            }
    
            if (nextCommitment === "sc") {
                scCount += 1;
            }
    
            state.qSlotCommitmentSummariesBySlotId = {
                ...(
                    state.qSlotCommitmentSummariesBySlotId ||
                    {}
                ),
                [qSlotId]: {
                    ...currentSummary,
                    qSlotId,
                    hcCount,
                    scCount,
                    myCommitment:
                        nextCommitment,
                },
            };
    
            showToast(
                nextCommitment === "hc"
                    ? "Hard Commit added."
                    : nextCommitment === "sc"
                        ? "Soft Commit added."
                        : "Commitment cleared.",
                "success"
            );
        } catch (error) {
            console.error(
                "Unable to update Q-slot commitment:",
                {
                    qSlotId,
                    commitmentType:
                        nextCommitment,
                    error,
                }
            );
    
            showToast(
                "Unable to update commitment.",
                "error"
            );
        } finally {
            state.qSlotCommitmentLoadingBySlotId = {
                ...(
                    state.qSlotCommitmentLoadingBySlotId ||
                    {}
                ),
                [qSlotId]: false,
            };
    
            if (
                state.currentView ===
                "qSignup"
            ) {
                renderApp();
            }
        }
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

    function addDaysToDateString(dateString, days) {
        const date = new Date(`${dateString}T00:00:00`);
        date.setDate(date.getDate() + days);
    
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
    
        return `${year}-${month}-${day}`;
    }
    
    function formatTimelineDate(dateString) {
        const date = new Date(`${dateString}T00:00:00`);
    
        return date
            .toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
            })
            .toUpperCase();
    }
    
    function buildTimelineSections(slots) {
        const tomorrow = addDaysToDateString(today, 1);
        const slotsByDate = new Map();
    
        slots.forEach(slot => {
            if (!slotsByDate.has(slot.date)) {
                slotsByDate.set(slot.date, []);
            }
    
            slotsByDate.get(slot.date).push(slot);
        });
    
        return [...slotsByDate.entries()].map(([date, dateSlots]) => {
            let label = formatTimelineDate(date);
            let tone = "future";
    
            if (date === today) {
                label = "TODAY";
                tone = "today";
            } else if (date === tomorrow) {
                label = "TOMORROW";
                tone = "tomorrow";
            }
    
            return {
                date,
                label,
                tone,
                slots: dateSlots,
            };
        });
    }
    
    function createTimelineSectionHeader(section) {
        const header = document.createElement("div");
    
        header.classList.add(
            "q-signup-timeline-header",
            `q-signup-timeline-header-${section.tone}`
        );
    
        const headingWrap = document.createElement("div");
        headingWrap.classList.add("q-signup-timeline-heading-wrap");
    
        const heading = document.createElement("div");
        heading.classList.add("q-signup-timeline-heading");
        heading.textContent = section.label;
    
        if (
            section.tone === "today" ||
            section.tone === "tomorrow"
        ) {
            const dateText = document.createElement("div");
            dateText.classList.add("q-signup-timeline-date");
    
            dateText.textContent = new Date(
                `${section.date}T00:00:00`
            )
                .toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                })
                .toUpperCase();
    
            headingWrap.append(heading, dateText);
        } else {
            headingWrap.appendChild(heading);
        }
    
        const count = document.createElement("div");
        count.classList.add("q-signup-timeline-count");
        count.textContent = String(section.slots.length);
    
        header.append(
            headingWrap,
            count
        );
    
        return header;
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
    
        const resolvedSiteA =
            resolveSiteForQSlot(
                a,
                state.aos.find(ao => ao.id === a.aoId)
            );

        const resolvedSiteB =
            resolveSiteForQSlot(
                b,
                state.aos.find(ao => ao.id === b.aoId)
            );

        const siteA =
            resolvedSiteA?.name || "";

        const siteB =
            resolvedSiteB?.name || "";
            
        return siteA.localeCompare(siteB);
    });

    function loadVisibleCommitmentSummaries(slots) {
        const qSlotIds = slots
            .map(slot => slot.id)
            .filter(Boolean);
    
        if (!qSlotIds.length) {
            return;
        }
    
        const requestKey = [
            state.currentRegionId,
            state.workspaceGeneration,
            ...qSlotIds,
        ].join("__");
    
        if (
            state.qSignupCommitmentSummaryRequestKey ===
            requestKey
        ) {
            return;
        }
    
        state.qSignupCommitmentSummaryRequestKey =
            requestKey;
    
        const requestGeneration =
            state.workspaceGeneration;
    
        loadQSlotCommitmentSummaries(qSlotIds)
            .then(summaries => {
                if (
                    requestGeneration !==
                    state.workspaceGeneration
                ) {
                    return;
                }
    
                const nextBySlotId = {};
    
                qSlotIds.forEach(qSlotId => {
                    nextBySlotId[qSlotId] = {
                        qSlotId,
                        hcCount: 0,
                        scCount: 0,
                        myCommitment: null,
                    };
                });
    
                summaries.forEach(summary => {
                    nextBySlotId[summary.qSlotId] =
                        summary;
                });
    
                state.qSlotCommitmentSummariesBySlotId = {
                    ...(
                        state.qSlotCommitmentSummariesBySlotId ||
                        {}
                    ),
                    ...nextBySlotId,
                };
    
                if (
                    state.currentView ===
                    "qSignup"
                ) {
                    renderApp();
                }
            })
            .catch(error => {
                console.error(
                    "Failed to load Q signup commitments:",
                    error
                );
    
                if (
                    requestGeneration ===
                    state.workspaceGeneration
                ) {
                    state.qSignupCommitmentSummaryRequestKey =
                        null;
                }
            });
    }

    loadVisibleCommitmentSummaries(sortedSlots);

    const timelineSections =
        buildTimelineSections(sortedSlots);

    if (sortedSlots.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("q-signup-empty-state");
    
        const emptyTitle = document.createElement("div");
        emptyTitle.classList.add("q-signup-empty-title");
        emptyTitle.textContent = state.qSignupOpenOnly
            ? "No open Q slots"
            : "No Q slots this month";
    
        const emptyMessage = document.createElement("div");
        emptyMessage.classList.add("q-signup-empty-message");
        emptyMessage.textContent = state.qSignupOpenOnly
            ? "Try another AO or turn off the open-only filter."
            : "Check another month or ask leadership to add the schedule.";
    
        empty.append(
            emptyTitle,
            emptyMessage
        );
    
        listContainer.appendChild(empty);
    } else {
        timelineSections.forEach(section => {
            const sectionElement =
                document.createElement("section");
    
            sectionElement.classList.add(
                "q-signup-timeline-section"
            );
    
            const sectionHeader =
                createTimelineSectionHeader(section);
    
            const sectionRows =
                document.createElement("div");
    
            sectionRows.classList.add(
                "q-signup-timeline-rows"
            );
    
            sectionElement.append(
                sectionHeader,
                sectionRows
            );
    
            section.slots.forEach(slot => {
            const managesThisAo = managesQSlot(slot);
    
            const ao = state.aos.find(
                candidate => candidate.id === slot.aoId
            );
    
            const site = resolveSiteForQSlot(
                slot,
                ao
            );

            const emphasisBadge = createWorkoutEmphasisBadge(
                slot,
                ao
            );
    
            const dayKey = String(
                new Date(`${slot.date}T00:00:00`).getDay()
            );
    
            const rawDisplayTime =
                slot.overrideTime ||
                slot.startTime ||
                ao?.timeSchedule?.[dayKey] ||
                ao?.time ||
                "";
    
            const displayTime = formatQSlotTime(
                rawDisplayTime
            );
    
            const displaySiteName =
                site?.name ||
                ao?.locationName ||
                "";

            const displayTitle = slot.overrideTitle || "";
    
            const isMine =
                slot.qUserId === state.currentUserMemberId;
    
            const canEditSlot =
                managesThisAo || isMine;
    
            const qMember = state.members.find(
                member => member.id === slot.qUserId
            );
    
            const qDisplayName =
                qMember?.paxName ||
                qMember?.realName ||
                qMember?.fullName ||
                "";
    
            const matchingWorkout = findWorkoutForQSlot(
                slot,
                state.plannedWorkouts,
                state.currentUserId,
                state.aos
            );
    
            const hasPlannedWorkout = Boolean(
                matchingWorkout
            );

            const commitmentSummary =
                state.qSlotCommitmentSummariesBySlotId?.[
                    slot.id
                ] || null;

            const isUpdatingCommitment =
                Boolean(
                    state.qSlotCommitmentLoadingBySlotId?.[
                        slot.id
                    ]
                );
    
    
            // Compact timeline row

            const card = document.createElement("article");
            card.classList.add("q-signup-slot-card");

            const isExpanded =
                expandedQSlotId === slot.id;

            if (isExpanded) {
                card.classList.add("expanded");
            }

            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.setAttribute(
                "aria-expanded",
                String(isExpanded)
            );

            if (!slot.qUserId) {
                card.classList.add("q-signup-slot-open");
            } else if (isMine) {
                card.classList.add("q-signup-slot-mine");
            } else {
                card.classList.add("q-signup-slot-filled");
            }


            // Main collapsed row

            const rowMain = document.createElement("div");
            rowMain.classList.add("q-signup-row-main");

            const identity = document.createElement("div");
            identity.classList.add("q-signup-row-identity");

            const titleRow = document.createElement("div");
            titleRow.classList.add("q-signup-row-title");

            const aoName = document.createElement("div");
            aoName.classList.add("q-signup-row-ao-name");
            aoName.textContent = ao?.name || "Unknown AO";

            titleRow.appendChild(aoName);

            if (emphasisBadge) {
                emphasisBadge.classList.add(
                    "q-signup-slot-emphasis"
                );

                titleRow.appendChild(emphasisBadge);
            }

            if (isMine) {
                const planningBadge = document.createElement("div");

                planningBadge.classList.add(
                    "q-signup-planning-status"
                );

                planningBadge.textContent = !hasPlannedWorkout
                    ? "Needs BD"
                    : matchingWorkout.isFinalized
                        ? "BD Ready"
                        : "Draft BD";

                titleRow.appendChild(planningBadge);
            }

            const metadata = document.createElement("div");
            metadata.classList.add("q-signup-row-metadata");

            if (displayTime) {
                const timeText = document.createElement("span");

                timeText.classList.add(
                    "q-signup-row-time"
                );

                timeText.textContent = displayTime;

                metadata.appendChild(timeText);
            }

            if (displaySiteName) {
                if (displayTime) {
                    const separator = document.createElement("span");

                    separator.classList.add(
                        "q-signup-row-metadata-separator"
                    );

                    separator.textContent = "•";

                    metadata.appendChild(separator);
                }

                const siteText = document.createElement("span");

                siteText.classList.add(
                    "q-signup-row-site"
                );

                siteText.textContent = displaySiteName;
                siteText.title = displaySiteName;

                metadata.appendChild(siteText);
            }

            if (!displayTime && !displaySiteName) {
                metadata.textContent = "Schedule not set";
            }

            identity.append(
                titleRow,
                metadata
            );

            if (displayTitle) {
                const customTitle = document.createElement("div");
                customTitle.classList.add(
                    "q-signup-slot-custom-title"
                );
                customTitle.textContent = displayTitle;

                identity.appendChild(customTitle);
            }


            // Status and primary action

            const statusArea = document.createElement("div");
            statusArea.classList.add("q-signup-row-status-area");

            const statusText = document.createElement("div");
            statusText.classList.add("q-signup-row-status");

            statusText.textContent = !slot.qUserId
                ? "OPEN"
                : isMine
                    ? "MY Q"
                    : qDisplayName || "Filled";

            const expandIndicator = document.createElement("span");

            expandIndicator.classList.add(
                "q-signup-expand-indicator"
            );
            
            expandIndicator.setAttribute(
                "aria-hidden",
                "true"
            );
            
            expandIndicator.textContent =
                isExpanded ? "⌃" : "⌄";
            
            const statusTopRow =
                document.createElement("div");
            
            statusTopRow.classList.add(
                "q-signup-status-top-row"
            );
            
            statusTopRow.append(
                statusText,
                expandIndicator
            );
            
            statusArea.appendChild(
                statusTopRow
            );

            if (!slot.qUserId) {
                const claimButton = document.createElement("button");

                claimButton.classList.add(
                    "q-signup-row-primary-button",
                    "q-signup-claim-button"
                );

                claimButton.textContent = "Claim";

                claimButton.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();
                        await claimQSlot(slot);
                    }
                );

                statusArea.appendChild(claimButton);
            } else if (isMine) {
                const workoutButton = document.createElement("button");

                workoutButton.classList.add(
                    "q-signup-row-primary-button",
                    "q-signup-workout-button"
                );

                workoutButton.textContent = !hasPlannedWorkout
                    ? "Plan BD"
                    : matchingWorkout.isFinalized
                        ? "View BD"
                        : "Continue";

                workoutButton.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();

                        if (hasPlannedWorkout) {
                            if (!matchingWorkout.isFinalized) {
                                savePlannerDraft(
                                    createExistingPlannerDraft(
                                        matchingWorkout
                                    )
                                );

                                state.selectedPlannedWorkoutId = null;

                                navigateTo("workoutPlanner");
                                return;
                            }

                            state.selectedPlannedWorkoutId =
                                matchingWorkout.id;

                            state.plannedWorkoutLaunchMode = null;

                            navigateTo("plannedWorkoutDetail");
                            return;
                        }

                        const newWorkout = createBlankWorkout({
                            date: slot.date,
                            aoId:
                                ao?.id ||
                                slot.aoId ||
                                null,
                            aoName: ao?.name || "",
                            siteId:
                                site?.id ||
                                null,
                            qSlotId: slot.id,
                        });

                        savePlannerDraft(
                            createNewPlannerDraft(
                                newWorkout
                            )
                        );

                        navigateTo("workoutPlanner");
                    }
                );

                statusArea.appendChild(workoutButton);
            }

            rowMain.append(
                identity,
                statusArea
            );

            card.appendChild(rowMain);


            // Secondary actions
            // These remain visible for this commit.
            // The next commit moves them into expansion.

            const secondaryActions =
                document.createElement("div");

            secondaryActions.classList.add(
                "q-signup-row-secondary-actions",
                "q-signup-expansion-panel"
            );

            secondaryActions.hidden = !isExpanded;

            if (canEditSlot) {
                const editButton = document.createElement("button");
                editButton.textContent = "Edit Slot";

                editButton.addEventListener("click", event => {
                    event.stopPropagation();
                    openEditSlotModal(slot);
                });

                secondaryActions.appendChild(editButton);
            }

            if (isMine) {
                const unclaimButton = document.createElement("button");
                unclaimButton.textContent = "Unclaim";

                unclaimButton.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();

                        try {
                            const result =
                                await unclaimQSlot(slot);

                            if (!result?.success) {
                                return;
                            }

                            renderApp();
                        } catch (error) {
                            console.error(
                                "Failed to unclaim Q slot:",
                                error
                            );

                            showToast(
                                "Failed to unclaim Q slot.",
                                "error"
                            );

                            logActionFailure(
                                "unclaimQSlot",
                                error,
                                {
                                    qSlotId:
                                        slot?.id ||
                                        null,
                                    aoId:
                                        slot?.aoId ||
                                        null,
                                    date:
                                        slot?.date ||
                                        null,
                                    currentUserMemberId:
                                        state.currentUserMemberId ||
                                        null,
                                }
                            );
                        }
                    }
                );

                secondaryActions.appendChild(
                    unclaimButton
                );
            }

            if (managesThisAo) {
                const assignButton = document.createElement("button");
                assignButton.textContent = "Assign Q";

                assignButton.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();
                        openAssignQModal(slot);
                    }
                );

                const clearButton = document.createElement("button");
                clearButton.textContent = "Clear Q";
                clearButton.disabled = !slot.qUserId;

                clearButton.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();

                        try {
                            const result =
                                await unclaimQSlot(
                                    slot,
                                    {
                                        bypassDropGuard: true,
                                    }
                                );

                            if (!result?.success) {
                                return;
                            }

                            renderApp();
                        } catch (error) {
                            console.error(
                                "Failed to clear Q slot:",
                                error
                            );

                            showToast(
                                "Failed to clear Q slot.",
                                "error"
                            );

                            logActionFailure(
                                "clearQSlot",
                                error,
                                {
                                    qSlotId:
                                        slot?.id ||
                                        null,
                                    aoId:
                                        slot?.aoId ||
                                        null,
                                    date:
                                        slot?.date ||
                                        null,
                                    bypassDropGuard: true,
                                }
                            );
                        }
                    }
                );

                const deleteButton = document.createElement("button");

                deleteButton.classList.add(
                    "danger-button"
                );

                deleteButton.textContent = "Remove";

                deleteButton.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();
                        await deleteQSlot(slot);
                    }
                );

                secondaryActions.append(
                    assignButton,
                    clearButton,
                    deleteButton
                );
            }

            const expandedDetails =
                document.createElement("div");

            expandedDetails.classList.add(
                "q-signup-expanded-details"
            );

            expandedDetails.hidden = !isExpanded;

            const commitmentRow =
                document.createElement("div");

            commitmentRow.classList.add(
                "q-signup-commitment-row"
            );

            const commitmentCounts =
                document.createElement("div");

            commitmentCounts.classList.add(
                "q-signup-commitment-counts"
            );

            const hcCount =
                document.createElement("span");

            hcCount.textContent = commitmentSummary
                ? `HC ${commitmentSummary.hcCount}`
                : "HC —";

            const scCount =
                document.createElement("span");

            scCount.textContent = commitmentSummary
                ? `SC ${commitmentSummary.scCount}`
                : "SC —";

            commitmentCounts.append(
                hcCount,
                scCount
            );

            const commitmentControls =
                document.createElement("div");

            commitmentControls.classList.add(
                "q-signup-commitment-controls"
            );

            const hcButton =
                document.createElement("button");

            hcButton.type = "button";
            hcButton.textContent = "HC";

            hcButton.classList.add(
                "q-signup-commitment-button",
                "q-signup-commitment-button-hc"
            );

            if (
                commitmentSummary?.myCommitment === "hc"
            ) {
                hcButton.classList.add("selected");
            }

            hcButton.disabled =
                isUpdatingCommitment ||
                !commitmentSummary;

            hcButton.setAttribute(
                "aria-pressed",
                String(
                    commitmentSummary?.myCommitment ===
                    "hc"
                )
            );

            hcButton.addEventListener(
                "click",
                async event => {
                    event.stopPropagation();

                    await updateMyQSlotCommitment(
                        slot.id,
                        "hc"
                    );
                }
            );

            const scButton =
                document.createElement("button");

            scButton.type = "button";
            scButton.textContent = "SC";

            scButton.classList.add(
                "q-signup-commitment-button",
                "q-signup-commitment-button-sc"
            );

            if (
                commitmentSummary?.myCommitment === "sc"
            ) {
                scButton.classList.add("selected");
            }

            scButton.disabled =
                isUpdatingCommitment ||
                !commitmentSummary;

            scButton.setAttribute(
                "aria-pressed",
                String(
                    commitmentSummary?.myCommitment ===
                    "sc"
                )
            );

            scButton.addEventListener(
                "click",
                async event => {
                    event.stopPropagation();

                    await updateMyQSlotCommitment(
                        slot.id,
                        "sc"
                    );
                }
            );

            commitmentControls.append(
                hcButton,
                scButton
            );

            commitmentRow.append(
                commitmentCounts,
                commitmentControls
            );

            expandedDetails.appendChild(
                commitmentRow
            );

            if (displayTitle || hasPlannedWorkout) {
                const workoutDetail =
                    document.createElement("div");

                workoutDetail.classList.add(
                    "q-signup-expanded-detail"
                );

                const workoutLabel =
                    document.createElement("div");

                workoutLabel.classList.add(
                    "q-signup-expanded-label"
                );

                workoutLabel.textContent = "Workout";

                const workoutValue =
                    document.createElement("div");

                workoutValue.classList.add(
                    "q-signup-expanded-value"
                );

                workoutValue.textContent =
                    displayTitle ||
                    matchingWorkout?.title ||
                    (
                        matchingWorkout
                            ? "Workout planned"
                            : "No beatdown planned yet"
                    );

                workoutDetail.append(
                    workoutLabel,
                    workoutValue
                );

                expandedDetails.appendChild(
                    workoutDetail
                );
            }

            card.appendChild(expandedDetails);

            if (secondaryActions.children.length) {
                card.appendChild(secondaryActions);
            }

            function toggleExpandedRow() {
                const shouldExpand =
                    expandedQSlotId !== slot.id;
            
                expandedQSlotId =
                    shouldExpand
                        ? slot.id
                        : null;
            
                renderApp();
            }
            
            rowMain.addEventListener(
                "click",
                toggleExpandedRow
            );
            
            card.addEventListener(
                "keydown",
                event => {
                    if (
                        event.key !== "Enter" &&
                        event.key !== " "
                    ) {
                        return;
                    }
            
                    event.preventDefault();
                    toggleExpandedRow();
                }
            );

            sectionRows.appendChild(card);
        });

        listContainer.appendChild(
            sectionElement
        );
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
        intro,
        ...(adminRow.children.length
            ? [adminRow]
            : []),
        monthNavRow,
        controlsRow,
        listContainer,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}