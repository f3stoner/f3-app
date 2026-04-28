import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createPlannedWorkout } from "../modules/plannedWorkouts.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { addPlannedWorkout, updatePlannedWorkout } from "../services/appData.js";
import { REGION_AOS, REGION_INTRO_TEMPLATES } from "../config.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";

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

    if (isEditing) {
        const existingWorkout = state.plannedWorkouts.find(workout => workout.id === state.editingPlannedWorkoutId);
        draftWorkout = { ...existingWorkout };
    } else if (state.draftPlannedWorkout) {
        draftWorkout = { ...state.draftPlannedWorkout };
    } else {
        draftWorkout = createPlannedWorkout(getTodayDate(), "");
        draftWorkout.createdByUserId = state.currentUserId;
    }

    function persistDraft() {
        state.draftPlannedWorkout = { ...draftWorkout };

        localStorage.setItem(
            SAVED_PLANNED_WORKOUT_DRAFT_KEY,
            JSON.stringify(state.draftPlannedWorkout)
        );
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

    const inferredAoOptions = [
        ...(state.aos || []).map(ao => ao.name).filter(Boolean),
        ...state.sessions.map(s => s.aoName).filter(Boolean),
        ...state.plannedWorkouts.map(w => w.aoName).filter(Boolean),
    ];

    const aoOptions = [...new Set([
        ...configuredAoOptions,
        ...inferredAoOptions,
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
    
    if (!draftWorkout.aoName && aoOptions.length > 0) {
        draftWorkout.aoName = aoOptions[0];
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
    introductionLabel.textContent = "Introduction";
    introductionLabel.classList.add("detail-label");

    const introductionInput = document.createElement("textarea");
    introductionInput.classList.add("notes");
    introductionInput.value = draftWorkout.introduction || "";

    introductionInput.addEventListener("input", (event) => {
        draftWorkout.introduction = event.target.value;
        persistDraft();
    });

    const warmoramaLabel = document.createElement("div");
    warmoramaLabel.textContent = "Warm-O-Rama";
    warmoramaLabel.classList.add("detail-label");

    const warmoramaInput = document.createElement("textarea");
    warmoramaInput.classList.add("notes");
    warmoramaInput.value = draftWorkout.warmorama || "";

    warmoramaInput.addEventListener("input", (event) => {
        draftWorkout.warmorama = event.target.value;
        persistDraft();
    });

    const thangsLabel = document.createElement("div");
    thangsLabel.textContent = "Thangs";
    thangsLabel.classList.add("detail-label");

    const thangsInput = document.createElement("textarea");
    thangsInput.classList.add("notes");
    thangsInput.value = draftWorkout.thangs || "";

    thangsInput.addEventListener("input", (event) => {
        draftWorkout.thangs = event.target.value;
        persistDraft();
    });

    const finisherLabel = document.createElement("div");
    finisherLabel.textContent = "Mary/Finisher";
    finisherLabel.classList.add("detail-label");

    const finisherInput = document.createElement("textarea");
    finisherInput.classList.add("notes");
    finisherInput.value = draftWorkout.finisher || "";

    finisherInput.addEventListener("input", (event) => {
        draftWorkout.finisher = event.target.value;
        persistDraft();
    });

    const notesLabel = document.createElement("div");
    notesLabel.textContent = "Planner Notes";
    notesLabel.classList.add("detail-label");

    const notesInput = document.createElement("textarea");
    notesInput.classList.add("notes");
    notesInput.value = draftWorkout.notes || "";

    notesInput.addEventListener("input", (event) => {
        draftWorkout.notes = event.target.value;
        persistDraft();
    });

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
        try{
            draftWorkout.lastModifiedAt = Date.now();

            if (isEditing) {
                await updatePlannedWorkout(state.editingPlannedWorkoutId, draftWorkout);
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
        warmoramaLabel,
        warmoramaInput,
        thangsLabel,
        thangsInput,
        finisherLabel,
        finisherInput,
        notesLabel,
        notesInput,
        shareLabel,
        shareSelect,
        primaryActionsRow,
    );

    if (state.workoutBrowseModalOpen) {
        app.appendChild(createWorkoutBrowseModal(closeWorkoutBrowseModal, copyWorkoutToPlanner));
    }
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
        warmLabel.textContent = "Warm-O-Rama";
        warmLabel.classList.add("detail-label");

        const previewWarmorama = document.createElement("pre");
        previewWarmorama.textContent = selectedWorkout.warmorama || "No Warm-O-Rama";
       
        const thangLabel = document.createElement("div");
        thangLabel.textContent = "Thangs";
        thangLabel.classList.add("detail-label");
        
        const previewThangs = document.createElement("pre");
        previewThangs.textContent = selectedWorkout.thangs || "No Thangs";

        const finisherLabel = document.createElement("div");
        finisherLabel.textContent = "Mary/Finisher";
        finisherLabel.classList.add("detail-label");

        const previewFinisher = document.createElement("pre");
        previewFinisher.textContent = selectedWorkout.finisher || "No Mary/Finisher";

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