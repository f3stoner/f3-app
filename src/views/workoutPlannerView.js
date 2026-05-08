import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createPlannedWorkout } from "../modules/plannedWorkouts.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { addPlannedWorkout, updatePlannedWorkout, addSavedPlannerSection, updateSavedPlannerSection, deleteSavedPlannerSection } from "../services/appData.js";
import { REGION_AOS, REGION_INTRO_TEMPLATES } from "../config.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { createWorkoutTimer, getTimersForSection, formatTimerSummary } from "../utils/workoutTimers.js";
import { createSavedPlannerSection, getSavedSectionsByType } from "../utils/plannerSections.js";
import { getWorkoutFieldLabel } from "../utils/workoutLabels.js";
import { deleteSavedPlannerSectionFromCloud } from "../services/cloudData.js";
import { logSaveFailure } from "../services/appEvents.js";


export function renderWorkoutPlanner() {
    const app = document.getElementById("app");
    app.textContent = "";

    const isEditing = Boolean(state.editingPlannedWorkoutId);
    let draftWorkout;

    const SAVED_PLANNED_WORKOUT_DRAFT_KEY = "draftPlannedWorkout";

    const savedDraft = localStorage.getItem(SAVED_PLANNED_WORKOUT_DRAFT_KEY);

    if (!state.draftPlannedWorkout && savedDraft) {
        state.draftPlannedWorkout = JSON.parse(savedDraft);
    }

    function returnAfterPlanner(fallbackView = "dashboard") {
        const returnView = state.returnToViewAfterPlanner || fallbackView;
        const returnLaunchMode = state.returnToLaunchModeAfterPlanner;

        state.returnToViewAfterPlanner = null;
        state.returnToLaunchModeAfterPlanner = null;
        state.editingPlannedWorkoutId = null;
        state.draftPlannedWorkout = null;
        state.plannedWorkoutLaunchMode = returnLaunchMode || null;
        state.currentView = returnView;
        localStorage.removeItem(SAVED_PLANNED_WORKOUT_DRAFT_KEY);
        renderApp();
    }

    if (state.draftPlannedWorkout) {
        draftWorkout = { ...state.draftPlannedWorkout };
    } else if (isEditing) {
        const existingWorkout = state.plannedWorkouts.find(workout => workout.id === state.editingPlannedWorkoutId);
        draftWorkout = { ...existingWorkout };
        state.draftPlannedWorkout = { ...draftWorkout };

        localStorage.setItem(
            SAVED_PLANNED_WORKOUT_DRAFT_KEY,
            JSON.stringify(state.draftPlannedWorkout)
        );
    } else {
        const plannerDate = state.pendingPlannerDate || getTodayDate();
        const plannerAoName = state.pendingPlannerAoName || "";

        draftWorkout = createPlannedWorkout(plannerDate, plannerAoName);
        draftWorkout.createdByUserId = state.currentUserId;

        state.pendingPlannerDate = null;
        state.pendingPlannerAoName = null;

        state.draftPlannedWorkout = { ...draftWorkout };

        localStorage.setItem(
            SAVED_PLANNED_WORKOUT_DRAFT_KEY,
            JSON.stringify(state.draftPlannedWorkout)
        );
    }

    function persistDraft() {
        state.draftPlannedWorkout = { ...draftWorkout };

        localStorage.setItem(
            SAVED_PLANNED_WORKOUT_DRAFT_KEY,
            JSON.stringify(state.draftPlannedWorkout)
        );
    }

    function createSectionTemplateControls(sectionType, input, labelText) {
        const controls = document.createElement("div");
        controls.classList.add("button-row", "section-template-controls");

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.classList.add("secondary-button");
        saveButton.textContent = "Save Section as Template";

        saveButton.addEventListener("click", async () => {
            const content = input.value.trim();

            if (!content) {
                showToast("Nothing to save yet.", "error");
                return;
            }

            const name = prompt(`Name this ${labelText} section:`);

            if(!name?.trim()) return;

            const newSection = createSavedPlannerSection({
                regionId: state.currentRegionId,
                sectionType,
                name: name.trim(),
                content,
                createdByUserId: state.currentUserId,
            });

            try {
                await addSavedPlannerSection(newSection);
                showToast("Section saved.", "success");
            } catch (error) {
                console.error("Failed to save section:", error);
                showToast("Failed to save section.", "error");
            }
        });

        const insertButton = document.createElement("button");
        insertButton.type ="button";
        insertButton.classList.add("secondary-button");
        insertButton.textContent = "Insert Saved Template";

        insertButton.addEventListener("click", () => {
            state.plannerSectionModalOpen = true;
            state.plannerSectionModalType = sectionType;
            state.plannerSectionModalTarget = sectionType;
            renderApp();
        });

        controls.append(saveButton, insertButton);

        return controls;
    }

    function renderTimerList(section) {
        draftWorkout.timers ||= [];

        const wrap = document.createElement("div");
        wrap.classList.add("timer-list");

        const timers = getTimersForSection(draftWorkout, section);

        timers.forEach(timer => {
            const row = document.createElement("div");
            row.classList.add("timer-row");

            const summary = document.createElement("div");
            summary.classList.add("stats-line");
            summary.textContent = `${timer.label || "Timer"} - ${formatTimerSummary(timer)}`;

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.textContent = "Remove";
            removeButton.classList.add("secondary-button");

            removeButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                draftWorkout.timers = draftWorkout.timers.filter(t => t.id !== timer.id);
                persistDraft();
                renderApp();
            });

            row.append(summary, removeButton);

            summary.addEventListener("click", () => {
                state.editingWorkoutTimerId = timer.id;
                state.editingWorkoutTimerSection = section;
                renderApp();
            });

            wrap.append(row);
        });

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "+ Add Timer";
        addButton.classList.add("secondary-button");

        addButton.addEventListener("click", () => {
            const newTimer = createWorkoutTimer(section);

            draftWorkout.timers.push(newTimer);
            persistDraft();

            state.editingWorkoutTimerId = newTimer.id;
            state.editingWorkoutTimerSection = section;

            renderApp();
        });

        wrap.appendChild(addButton);

        return wrap;
    }

    function copyWorkoutToPlanner(sourceWorkout) {
        const copiedWorkout = {
            ...sourceWorkout,
            id: crypto.randomUUID(),
            isShared: false,
            createdByUserId: state.currentUserId,
            lastModifiedAt: Date.now(),
            date: draftWorkout.date || getTodayDate(),
            aoName: draftWorkout.aoName || "",
        };

       copiedWorkout.timers = (sourceWorkout.timers || []).map(timer => ({
            ...timer,
            id: crypto.randomUUID(),
       }));
    
        state.draftPlannedWorkout = copiedWorkout;
    
        localStorage.setItem(
            SAVED_PLANNED_WORKOUT_DRAFT_KEY,
            JSON.stringify(copiedWorkout)
        );
    
        state.workoutBrowseModalOpen = false;
        state.selectedWorkoutPreviewId = null;
        state.workoutBrowseMode = "list";
        state.editingPlannedWorkoutId = null;

        showToast("Copied to Planner", "success");
    }

    function closeWorkoutBrowseModal() {
        state.workoutBrowseModalOpen = false;
        state.selectedWorkoutPreviewId = null;
        renderApp();
    }

    const currentMember = state.members.find(member => member.id === state.currentUserMemberId);

    console.log("planner region debug", {

        currentRegionId: state.currentRegionId,
    
        introTemplateValue: REGION_INTRO_TEMPLATES[state.currentRegionId],
    
    });

    const introTemplateFn = REGION_INTRO_TEMPLATES[state.currentRegionId];
    const regionIntroTemplate =
        typeof introTemplateFn === "function"
            ? introTemplateFn?.(currentMember?.paxName)
            : "";

    if (!draftWorkout.introduction) {
        draftWorkout.introduction = regionIntroTemplate;
    }

    const title = document.createElement("h1");
    title.textContent = isEditing ? "Edit Workout" : "Plan Workout";

    const backButton = document.createElement("button");
    backButton.classList.add("secondary-button");
    backButton.textContent = "← Back";
    backButton.addEventListener("click", () => {
        returnAfterPlanner(draftWorkout.isShared ? "plannedWorkoutList" : "myPlanner");
    })

    const browseWorkoutsButton = document.createElement("button");
    browseWorkoutsButton.textContent = "Browse & Copy Workouts";
    browseWorkoutsButton.classList.add("browse-workout-button");

    browseWorkoutsButton.addEventListener("click", () => {
        persistDraft();
        state.workoutBrowseModalOpen = true;
        state.workoutBrowseMode = "list";
        state.workoutBrowseScrollTop = 0;
        renderApp();
    });

    const divider = document.createElement("div");
    divider.classList.add("divider");

    const text = document.createElement("span");
    text.textContent = "OR";

    divider.appendChild(text);

    const browseRow = document.createElement("div");
    browseRow.classList.add("button-row");

    browseRow.append(browseWorkoutsButton);

    const dateLabel = document.createElement("div");
    dateLabel.textContent = isEditing ? "Edit Date" : "Date";
    dateLabel.classList.add("detail-label");

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = draftWorkout.date;
    dateInput.classList.add("native-date-input");

    const today = getTodayDate();
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - 30);

    const minYear = minDate.getFullYear();
    const minMonth = String(minDate.getMonth() + 1).padStart(2, "0");
    const minDay = String(minDate.getDate()).padStart(2, "0");

    const min = `${minYear}-${minMonth}-${minDay}`;

    dateInput.min = min;

    function updateDraftDate(event) {
        draftWorkout.date = event.target.value;
        dateDisplay.textContent = formatDate(draftWorkout.date);
        persistDraft();
    }

    dateInput.addEventListener("change", updateDraftDate);
    dateInput.addEventListener("input", updateDraftDate);
    dateInput.addEventListener("click", () => {
        dateInput.showPicker?.();
    });

    const dateInputWrap = document.createElement("label");
    dateInputWrap.classList.add("fake-date-field");

    const dateDisplay = document.createElement("div");
    dateDisplay.classList.add("fake-date-display");
    dateDisplay.textContent = formatDate(draftWorkout.date || getTodayDate());

    dateInputWrap.append(dateDisplay, dateInput);

    const configuredAoOptions = REGION_AOS[state.currentRegionId] || [];

    const cloudAoOptions = (state.aos || [])
        .filter(ao => ao.isActive !== false)
        .map(ao => ao.name)
        .filter(Boolean);
        

    const aoOptions = [...new Set([
        ...configuredAoOptions,
        ...cloudAoOptions,
    ])]
        .filter(ao => ao && ao !== "DR")
        .sort();
    
    const aoLabel = document.createElement("div");
    aoLabel.textContent = "AO";
    aoLabel.classList.add("detail-label");
    
    const aoSelect = document.createElement("select");
    
    aoOptions.forEach(ao => {
        const option = document.createElement("option");
        option.value = ao;
        option.textContent = ao;
        aoSelect.appendChild(option);
    });
    
    if (draftWorkout.aoName && !aoOptions.includes(draftWorkout.aoName)) {
        const option = document.createElement("option");
        option.value = draftWorkout.aoName;
        option.textContent = draftWorkout.aoName;
        aoSelect.appendChild(option);
    }
    
    aoSelect.value = draftWorkout.aoName || "";
    
    aoSelect.addEventListener("change", (event) => {
        draftWorkout.aoName = event.target.value;
        persistDraft();
    });

    const workoutTitleLabel = document.createElement("div");
    workoutTitleLabel.textContent = "Workout Title";
    workoutTitleLabel.classList.add("detail-label");

    const workoutTitleInput = document.createElement("input");
    workoutTitleInput.type = "text";
    workoutTitleInput.value = draftWorkout.title || "";

    workoutTitleInput.addEventListener("input", (event) => {
        draftWorkout.title = event.target.value;
        persistDraft();
    });

    const introductionLabel = document.createElement("div");
    introductionLabel.textContent = getWorkoutFieldLabel(state, "introduction");
    introductionLabel.classList.add("detail-label");

    const introductionInput = document.createElement("textarea");
    introductionInput.classList.add("notes");
    introductionInput.value = draftWorkout.introduction || "";

    introductionInput.addEventListener("input", (event) => {
        draftWorkout.introduction = event.target.value;
        persistDraft();
    });

    const introductionTemplateControls = createSectionTemplateControls(
        "introduction",
        introductionInput,
        getWorkoutFieldLabel(state, "introduction")
    );

    const warmoramaLabel = document.createElement("div");
    warmoramaLabel.textContent = getWorkoutFieldLabel(state, "warmorama");
    warmoramaLabel.classList.add("detail-label");

    const warmoramaInput = document.createElement("textarea");
    warmoramaInput.classList.add("notes");
    warmoramaInput.value = draftWorkout.warmorama || "";

    warmoramaInput.addEventListener("input", (event) => {
        draftWorkout.warmorama = event.target.value;
        persistDraft();
    });

    const warmoramaTemplateControls = createSectionTemplateControls(
        "warmorama",
        warmoramaInput,
        getWorkoutFieldLabel(state, "warmorama")
    );

    const thangsLabel = document.createElement("div");
    thangsLabel.textContent = getWorkoutFieldLabel(state, "thangs");
    thangsLabel.classList.add("detail-label");

    const thangsInput = document.createElement("textarea");
    thangsInput.classList.add("notes");
    thangsInput.value = draftWorkout.thangs || "";

    thangsInput.addEventListener("input", (event) => {
        draftWorkout.thangs = event.target.value;
        persistDraft();
    });

    const thangsTemplateControls = createSectionTemplateControls(
        "thangs",
        thangsInput,
        getWorkoutFieldLabel(state, "thangs")
    );

    const finisherLabel = document.createElement("div");
    finisherLabel.textContent = getWorkoutFieldLabel(state, "finisher");
    finisherLabel.classList.add("detail-label");

    const finisherInput = document.createElement("textarea");
    finisherInput.classList.add("notes");
    finisherInput.value = draftWorkout.finisher || "";

    finisherInput.addEventListener("input", (event) => {
        draftWorkout.finisher = event.target.value;
        persistDraft();
    });

    const finisherTemplateControls = createSectionTemplateControls(
        "finisher",
        finisherInput,
        getWorkoutFieldLabel(state, "finisher")
    );

    const warmoramaTimers = renderTimerList("warmorama");
    const thangsTimers = renderTimerList("thangs");
    const finisherTimers = renderTimerList("finisher");

    const notesLabel = document.createElement("div");
    notesLabel.textContent = getWorkoutFieldLabel(state, "notes");
    notesLabel.classList.add("detail-label");

    const notesInput = document.createElement("textarea");
    notesInput.classList.add("notes");
    notesInput.value = draftWorkout.notes || "";

    notesInput.addEventListener("input", (event) => {
        draftWorkout.notes = event.target.value;
        persistDraft();
    });

    const notesTemplateControls = createSectionTemplateControls(
        "notes",
        notesInput,
        getWorkoutFieldLabel(state, "notes")
    );

    const shareLabel = document.createElement("div");
    shareLabel.textContent = "Visibility";
    shareLabel.classList.add("detail-label");

    const shareSelect = document.createElement("select");

    const privateOption = document.createElement("option");
    privateOption.value = "private";
    privateOption.textContent = "Private Draft";

    const sharedOption = document.createElement("option");
    sharedOption.value = "shared";
    sharedOption.textContent = "Shared with Region";

    shareSelect.append(privateOption, sharedOption);
    shareSelect.value = draftWorkout.isShared ? "shared" : "private";

    shareSelect.addEventListener("change", (event) => {
        draftWorkout.isShared = event.target.value === "shared";
        persistDraft();
    });
    
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Workout";

    saveButton.addEventListener("click", async () => {
        console.log("isEditing:", isEditing);
        console.log("editingPLannedWorkoutId:", state.editingPlannedWorkoutId);
        console.log("draftWorkout before save:", draftWorkout)
        try {
            draftWorkout.lastModifiedAt = Date.now();

            if (!isEditing) {
                draftWorkout.id ||= crypto.randomUUID();
            }

            draftWorkout.createdByUserId ||= state.currentUserId;
            draftWorkout.regionId ||= state.currentRegionId;
            draftWorkout.date ||= getTodayDate();
            draftWorkout.aoName ||= "";
            draftWorkout.isShared = Boolean(draftWorkout.isShared);

            if (isEditing) {
                const workoutToSave = {
                    ...draftWorkout,
                    id: state.editingPlannedWorkoutId,
                };
                await updatePlannedWorkout(state.editingPlannedWorkoutId, workoutToSave);
                state.editingPlannedWorkoutId = null;
            } else {
                await addPlannedWorkout(draftWorkout);
            }

            const destinationView = draftWorkout.isShared ? "plannedWorkoutList" : "myPlanner";
            const successMessage = draftWorkout.isShared
            ? "Workout shared to Workout Library."
            : "Saved to My Planner.";

            showToast(successMessage, "success");

            if(state.returnToViewAfterPlanner) {
                returnAfterPlanner(destinationView);
                return;
            }

            state.draftPlannedWorkout = null;
            state.currentView = destinationView;
            localStorage.removeItem(SAVED_PLANNED_WORKOUT_DRAFT_KEY);
            renderApp();

        } catch (error) {
            console.error("Failed to save workout:", error);
            showToast("Failed to save workout.", "error")

            logSaveFailure("workoutPlannerView.savePlannedWorkout", error, {
                editingPlannedWorkoutId: state.editingPlannedWorkoutId || null,
                selectedPlannedWorkoutId: state.selectedPlannedWorkoutId || null,
                draftWorkoutId: draftWorkout?.id || null,
                plannedWorkoutDate: draftWorkout?.date || null,
                plannedWorkoutAoName: draftWorkout?.aoName || null,
                plannedWorkoutTitle: draftWorkout?.title || null,
                isShared: Boolean(draftWorkout?.isShared),
            });
        }
});

    const primaryActionsRow = document.createElement("div");
    primaryActionsRow.classList.add("button-row", "primary-actions-row");

    primaryActionsRow.append(saveButton);

    const header = document.createElement("div");
    header.classList.add("view-header");
    header.append(backButton, title);

    app.append(
        header,
        browseRow,
        divider,
        dateLabel,
        dateInputWrap,
        aoLabel,
        aoSelect,
        workoutTitleLabel,
        workoutTitleInput,
        introductionLabel,
        introductionInput,
        introductionTemplateControls,
        warmoramaLabel,
        warmoramaInput,
        warmoramaTemplateControls,
        warmoramaTimers,
        thangsLabel,
        thangsInput,
        thangsTemplateControls,
        thangsTimers,
        finisherLabel,
        finisherInput,
        finisherTemplateControls,
        finisherTimers,
        notesLabel,
        notesInput,
        notesTemplateControls,
        shareLabel,
        shareSelect,
        primaryActionsRow,
    );

    if (state.workoutBrowseModalOpen) {
        app.appendChild(createWorkoutBrowseModal(closeWorkoutBrowseModal, copyWorkoutToPlanner));
    }

    if (state.editingWorkoutTimerId) {
        app.appendChild(createTimerEditorModal({
            draftWorkout,
            persistDraft,
            onClose: () => {
                state.editingWorkoutTimerId = null;
                state.editingWorkoutTimerSection = null;
                renderApp();
            }
        }));
    }

    if (state.plannerSectionModalOpen) {
        app.appendChild(createSavedSectionModal({
            draftWorkout,
            persistDraft,
            onClose: () => {
                state.plannerSectionModalOpen = false;
                state.plannerSectionModalType = null;
                state.plannerSectionModalTarget = null;
                renderApp();
            }
        }));
    }
}

function createTimerEditorModal({ draftWorkout, persistDraft, onClose }) {
    const timer = (draftWorkout.timers || []).find(
        t => t.id === state.editingWorkoutTimerId
    );

    if (!timer) {
        onClose();
        return document.createElement("div");
    }

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const heading = document.createElement("h2");
    heading.textContent = "Edit Timer";

    const labelLabel = document.createElement("div");
    labelLabel.classList.add("detail-label");
    labelLabel.textContent = "Timer Label";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = timer.label || "";
    labelInput.placeholder = "Thang 1 EMOM";

    const typeLabel = document.createElement("div");
    typeLabel.classList.add("detail-label");
    typeLabel.textContent = "Timer Type";

    const typeSelect = document.createElement("select");

    [
        ["countdown", "Countdown"],
        ["emom", "EMOM"],
        ["interval", "Interval / Tabata"],
    ].forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        typeSelect.appendChild(option);
    });

    typeSelect.value = timer.type || "countdown";

    const fieldsWrap = document.createElement("div");

    function saveTimerChanges() {
        timer.label = labelInput.value;
        timer.type = typeSelect.value;
        persistDraft();
    }

    function renderTypeFields() {
        fieldsWrap.textContent = "";

        if (typeSelect.value === "interval") {
            const roundsLabel = document.createElement("div");
            roundsLabel.classList.add("detail-label");
            roundsLabel.textContent = "Rounds";

            const roundsInput = document.createElement("input");
            roundsInput.type = "number";
            roundsInput.min = "1";
            roundsInput.value = timer.rounds || 8;

            const workLabel = document.createElement("div");
            workLabel.classList.add("detail-label");
            workLabel.textContent = "Work Seconds";

            const workInput = document.createElement("input");
            workInput.type = "number";
            workInput.min = "1";
            workInput.value = timer.workSeconds || 45;

            const restLabel = document.createElement("div");
            restLabel.classList.add("detail-label");
            restLabel.textContent = "Rest Seconds";

            const restInput = document.createElement("input");
            restInput.type = "number";
            restInput.min = "0";
            restInput.value = timer.restSeconds ?? 15;

            function updateIntervalTimer() {
                timer.rounds = Number(roundsInput.value) || 1;
                timer.workSeconds = Number(workInput.value) || 1;
                timer.restSeconds = Number(restInput.value) || 0;
                timer.durationSeconds = null;
                persistDraft();
            }

            roundsInput.addEventListener("input", updateIntervalTimer);
            workInput.addEventListener("input", updateIntervalTimer);
            restInput.addEventListener("input", updateIntervalTimer);

            fieldsWrap.append(
                roundsLabel,
                roundsInput,
                workLabel,
                workInput,
                restLabel,
                restInput
            );

            return;
        }

        const durationLabel = document.createElement("div");
        durationLabel.classList.add("detail-label");
        durationLabel.textContent = "Duration Minutes";

        const durationInput = document.createElement("input");
        durationInput.type = "number";
        durationInput.min = "1";
        durationInput.value = Math.max(1, Math.round((timer.durationSeconds || 300) / 60));

        durationInput.addEventListener("input", () => {
            timer.durationSeconds = (Number(durationInput.value) || 1) * 60;
            timer.workSeconds = null;
            timer.restSeconds = null;
            timer.rounds = null;
            persistDraft();
        });

        fieldsWrap.append(durationLabel, durationInput);
    }

    labelInput.addEventListener("input", saveTimerChanges);

    typeSelect.addEventListener("change", () => {
        timer.type = typeSelect.value;

        if (timer.type === "interval") {
            timer.durationSeconds = null;
            timer.workSeconds ??= 45;
            timer.restSeconds ??= 15;
            timer.rounds ??= 8;
        } else {
            timer.durationSeconds = timer.durationSeconds || 300;
            timer.workSeconds = null;
            timer.restSeconds = null;
            timer.rounds = null;
        }

        persistDraft();
        renderTypeFields();
    });

    const buttonRow = document.createElement("div");
    buttonRow.classList.add("button-row");

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.classList.add("secondary-button");
    cancelButton.textContent = "Close";

    cancelButton.addEventListener("click", onClose);

    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.textContent = "Done";

    doneButton.addEventListener("click", () => {
        saveTimerChanges();
        onClose();
    });

    buttonRow.append(cancelButton, doneButton);

    renderTypeFields();

    modal.append(
        heading,
        labelLabel,
        labelInput,
        typeLabel,
        typeSelect,
        fieldsWrap,
        buttonRow
    );

    overlay.appendChild(modal);

    overlay.addEventListener("click", onClose);
    modal.addEventListener("click", event => event.stopPropagation());

    return overlay;
}

function createSavedSectionModal({ draftWorkout, persistDraft, onClose }) {
    const sectionType = state.plannerSectionModalType;

    const savedSections = getSavedSectionsByType(
        state.savedPlannerSections,
        sectionType,
        state.currentUserId
    );

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");
    
    const title = document.createElement("h2");
    title.textContent = "Insert Saved Section";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "x";
    closeButton.classList.add("secondary-button", "modal-close-button");
    closeButton.addEventListener("click", onClose);

    if (savedSections.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.classList.add("stats-line");
        emptyMessage.textContent = "No saved sections yet.";

        modal.append(title, emptyMessage, closeButton);
    } else {
        const list = document.createElement("div");
        list.classList.add("saved-section-list");

        savedSections.forEach(section => {
            const card = document.createElement("div");
            card.classList.add("workout-browse-card");

            const name = document.createElement("div");
            name.classList.add("workout-browse-title");
            name.textContent = section.name;

            const preview = document.createElement("pre");
            preview.textContent = section.content;
            preview.classList.add("saved-section-preview");

            const actions = document.createElement("div");
            actions.classList.add("button-row");

            const replaceButton = document.createElement("button");
            replaceButton.type = "button";
            replaceButton.textContent = "Replace Section";

            replaceButton.addEventListener("click", async () => {
                draftWorkout[sectionType] = section.content;
                section.lastUsedAt = new Date().toISOString();

                try {
                    await updateSavedPlannerSection(section);
                } catch (error) {
                    console.error("failed to update section usage:", error);
                }

                persistDraft();
                onClose();
                showToast("Section inserted.", "success");
            });

            const appendButton = document.createElement("button");
            appendButton.type = "button";
            appendButton.classList.add("button");
            appendButton.textContent = "Add to Section";

            appendButton.addEventListener("click", async () => {
                const currentContent = draftWorkout[sectionType] || "";

                draftWorkout[sectionType] = currentContent
                    ? `${currentContent}\n\n${section.content}`
                    : section.content;

                section.lastUsedAt = new Date().toISOString();

                try {
                    await updateSavedPlannerSection(section);
                } catch (error) {
                    console.error("Failed to update section usage:", error);
                }

                persistDraft();
                onClose();
                showToast("Section inserted.", "success");
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.classList.add("danger-button");
            deleteButton.textContent = "Delete";

            deleteButton.addEventListener("click", async () => {
                const confirmed = confirm(`Delete "${section.name}"?`);
                if (!confirmed) return;

                try {
                    await deleteSavedPlannerSection(section.id);
                    showToast("Section deleted.", "success");
                    renderApp();
                } catch (error) {
                    console.error("Failed to delete saved section:", error);
                    showToast("Failed to delete section.", "error");
                }
            });

            actions.append(replaceButton, appendButton, deleteButton);
            card.append(name, preview, actions);
            list.append(card);
        });

        modal.append(title, closeButton, list);
    }

    overlay.appendChild(modal);

    overlay.addEventListener("click", onClose);
    modal.addEventListener("click", event => event.stopPropagation());

    return overlay;
}

function createWorkoutBrowseModal(onClose, onCopyWorkout) {
    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    modal.classList.add("workout-browse-modal")

    if (state.workoutBrowseMode === "preview") {
        modal.classList.add("is-preview-mode");
    } else {
        modal.classList.add("is-list-mode");
    }

    const title = document.createElement("h2");
    title.textContent = "Browse & Copy Workouts";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.classList.add("secondary-button");

    const workoutList = document.createElement("div");
    workoutList.classList.add("workout-browse-list");

    const workouts = (state.plannedWorkouts || [])
        .filter(workout => workout.createdByUserId === state.currentUserId)
        .sort((a, b) => {
            const aTime = a.lastModifiedAt || 0;
            const bTime = b.lastModifiedAt || 0;
            return bTime - aTime;
        });

    const selectedWorkout = workouts.find(
        workout => workout.id === state.selectedWorkoutPreviewId
    );

    if (workouts.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.textContent = "No saved workouts yet.";
        workoutList.appendChild(emptyMessage);
    } else {
        workouts.forEach(workout => {
            const workoutCard = document.createElement("div");
            workoutCard.classList.add("workout-browse-card");
            workoutCard.setAttribute("role", "button");
            workoutCard.tabIndex = 0;

            const workoutTitle = document.createElement("div");
            workoutTitle.textContent = workout.title || "Untitled Workout";
            workoutTitle.classList.add("workout-browse-title");

            const workoutMeta = document.createElement("div");
            workoutMeta.textContent = `${formatDate(workout.date)} • ${workout.aoName || "No AO"}`;
            workoutMeta.classList.add("workout-browse-meta");

            const copyButton = document.createElement("button");
            copyButton.type = "button";
            copyButton.textContent = "Copy to Planner";
            copyButton.classList.add("secondary-button");

            copyButton.addEventListener("click", (event) => {
                event.stopPropagation();
                onCopyWorkout(workout);
            })

            const cardActions = document.createElement("div");
            cardActions.classList.add("workout-browse-card-actions");

            cardActions.appendChild(copyButton);

            workoutCard.addEventListener("click", () => {
                state.workoutBrowseScrollTop = workoutList.scrollTop;
                state.selectedWorkoutPreviewId = workout.id;
                state.workoutBrowseMode = "preview";
                renderApp();
            });

            if (workout.id === state.selectedWorkoutPreviewId) {
                workoutCard.classList.add("selected");
            }

            workoutCard.append(workoutTitle, workoutMeta, cardActions);
            workoutList.appendChild(workoutCard);
        });
    }

    setTimeout(() => {
        workoutList.scrollTop = state.workoutBrowseScrollTop || 0;
    }, 0);

    const preview = document.createElement("div");
    preview.classList.add("workout-preview");

    if (selectedWorkout) {
        const backToListButton = document.createElement("button");
        backToListButton.type = "button";
        backToListButton.textContent = "← Back to Workouts";
        backToListButton.classList.add("secondary-button");

        backToListButton.addEventListener("click", () => {
            state.workoutBrowseMode = "list";
            renderApp();
        });

        const previewTitle = document.createElement("h3");
        previewTitle.textContent = selectedWorkout.title || "Untitled Workout";

        const warmLabel = document.createElement("div");
        warmLabel.textContent = getWorkoutFieldLabel(state, "warmorama");
        warmLabel.classList.add("detail-label");

        const previewWarmorama = document.createElement("pre");
        previewWarmorama.textContent = selectedWorkout.warmorama || `No ${getWorkoutFieldLabel(state, "warmorama")}`;
       
        const thangLabel = document.createElement("div");
        thangLabel.textContent = getWorkoutFieldLabel(state, "thangs");
        thangLabel.classList.add("detail-label");
        
        const previewThangs = document.createElement("pre");
        previewThangs.textContent = selectedWorkout.thangs || `No ${getWorkoutFieldLabel(state, "thangs")}`;

        const finisherLabel = document.createElement("div");
        finisherLabel.textContent = getWorkoutFieldLabel(state, "finisher");
        finisherLabel.classList.add("detail-label");

        const previewFinisher = document.createElement("pre");
        previewFinisher.textContent = selectedWorkout.finisher || `No ${getWorkoutFieldLabel(state, "finisher")}`;

        const previewCopyButton = document.createElement("button");
        previewCopyButton.textContent = "Copy to Planner";
        
        previewCopyButton.addEventListener("click", () => {
            onCopyWorkout(selectedWorkout);
        });

        preview.append(
            backToListButton,
            previewTitle,
            previewCopyButton,
            warmLabel,
            previewWarmorama,
            thangLabel,
            previewThangs,
            finisherLabel,
            previewFinisher
        );
    }

    if (!selectedWorkout) {
        preview.style.display = "none";
    }

    closeButton.addEventListener("click", onClose);

    overlay.addEventListener("click", onClose);

    modal.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    const modalBody = document.createElement("div");
    modalBody.classList.add("workout-browse-modal-body");

    modalBody.append(workoutList, preview);

    modal.append(title, closeButton, modalBody);
    overlay.appendChild(modal);

    return overlay;
}