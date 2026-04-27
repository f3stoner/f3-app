import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createPlannedWorkout } from "../modules/plannedWorkouts.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { addPlannedWorkout, updatePlannedWorkout } from "../services/appData.js";
import { REGION_AOS, REGION_INTRO_TEMPLATES } from "../config.js";
import { goBack, navigateTo } from "../utils/navigation.js";

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
        state.showMyPlannedWorkoutsOnly = true;
        navigateTo("myPlanner");
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

            alert(successMessage);

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
            alert("Failed to save workout.")
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
}