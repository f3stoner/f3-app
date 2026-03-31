import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createPlannedWorkout } from "../modules/plannedWorkouts.js";
import { getTodayDate } from "../utils/date.js";
import { addPlannedWorkout, updatePlannedWorkout } from "../services/appData.js";

export function renderWorkoutPlanner() {
    const app = document.getElementById("app");
    app.textContent = "";

    const isEditing = Boolean(state.editingPlannedWorkoutId);
    let draftWorkout;

    if (isEditing) {
        const existingWorkout = state.plannedWorkouts.find(workout => workout.id === state.editingPlannedWorkoutId);
        draftWorkout = { ...existingWorkout };
    } else {
        draftWorkout = createPlannedWorkout(getTodayDate(), "");
    }

    const title = document.createElement("h1");
    title.textContent = isEditing ? "Edit Workout" : "Plan Workout";

    const backButton = document.createElement("button");
    backButton.textContent = "Back to Dashboard";
    backButton.addEventListener("click", () => {
        state.editingPlannedWorkoutId = null;
        state.currentView = "dashboard";
        renderApp();
    })

    const dateLabel = document.createElement("div");
    dateLabel.textContent = isEditing ? "Edit Date" : "Date";
    dateLabel.classList.add("detail-label");

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = draftWorkout.date;

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
    }

    dateInput.addEventListener("change", updateDraftDate);
    dateInput.addEventListener("input", updateDraftDate);

    const aoOptions = [...new Set([
        ...state.members.map(m => m.homeAo).filter(ao => ao && ao !== "DR"),
        ...state.sessions.map(s => s.aoName).filter(ao => ao && ao !== "DR"),
        ...state.plannedWorkouts.map(w => w.aoName).filter(ao => ao && ao !== "DR"),
    ])].sort();
    
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
    });

    const workoutTitleLabel = document.createElement("div");
    workoutTitleLabel.textContent = "Workout Title";
    workoutTitleLabel.classList.add("detail-label");

    const workoutTitleInput = document.createElement("input");
    workoutTitleInput.type = "text";
    workoutTitleInput.value = draftWorkout.title || "";

    workoutTitleInput.addEventListener("input", (event) => {
        draftWorkout.title = event.target.value;
    });

    const warmoramaLabel = document.createElement("div");
    warmoramaLabel.textContent = "Warm-O-Rama";
    warmoramaLabel.classList.add("detail-label");

    const warmoramaInput = document.createElement("textarea");
    warmoramaInput.classList.add("notes");
    warmoramaInput.value = draftWorkout.warmorama || "";

    warmoramaInput.addEventListener("input", (event) => {
        draftWorkout.warmorama = event.target.value;
    });

    const thangsLabel = document.createElement("div");
    thangsLabel.textContent = "Thangs";
    thangsLabel.classList.add("detail-label");

    const thangsInput = document.createElement("textarea");
    thangsInput.classList.add("notes");
    thangsInput.value = draftWorkout.thangs || "";

    thangsInput.addEventListener("input", (event) => {
        draftWorkout.thangs = event.target.value;
    });

    const finisherLabel = document.createElement("div");
    finisherLabel.textContent = "Mary/Finisher";
    finisherLabel.classList.add("detail-label");

    const finisherInput = document.createElement("textarea");
    finisherInput.classList.add("notes");
    finisherInput.value = draftWorkout.finisher || "";

    finisherInput.addEventListener("input", (event) => {
        draftWorkout.finisher = event.target.value;
    });

    const notesLabel = document.createElement("div");
    notesLabel.textContent = "Planner Notes";
    notesLabel.classList.add("detail-label");

    const notesInput = document.createElement("textarea");
    notesInput.classList.add("notes");
    notesInput.value = draftWorkout.notes || "";

    notesInput.addEventListener("input", (event) => {
        draftWorkout.notes = event.target.value;
    });
    
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Workout";

    saveButton.addEventListener("click", async () => {
        try{
            draftWorkout.lastModifiedAt = Date.now();

            if (isEditing) {
                await updatePlannedWorkout(state.editingPlannedWorkoutId, draftWorkout);
                state.editingPlannedWorkoutId = null;
            } else {
                await addPlannedWorkout(draftWorkout);
            }

            state.currentView = "plannedWorkoutList";
            renderApp();
        } catch (error) {
            console.error("Failed to save workout:", error);
            alert("Failed to save workout.")
        }
});

    app.append(
        title,
        dateLabel,
        dateInput,
        aoLabel,
        aoSelect,
        workoutTitleLabel,
        workoutTitleInput,
        warmoramaLabel,
        warmoramaInput,
        thangsLabel,
        thangsInput,
        finisherLabel,
        finisherInput,
        notesLabel,
        notesInput,
        saveButton,
        backButton
    );
}