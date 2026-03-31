import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createSession } from "../modules/sessions.js";

export function renderPlannedWorkoutDetail() {
    const app = document.getElementById("app");
    app.textContent = "";

    const workout = state.plannedWorkouts.find(
        w => w.id === state.selectedPlannedWorkoutId
    );

    const backButton = document.createElement("button");
    backButton.textContent = "Back to Plans";
    backButton.addEventListener("click", () => {
        state.currentView = "plannedWorkoutsList";
        renderApp();
    });

    if (!workout) {
        app.textContent = "No Planned Workout Found";
        app.append(backButton);
        return;
    }

    const title = document.createElement("h1");
    title.textContent = workout.title || "Planned Workout";

    function createDetailSection (labelText, valueText) {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = labelText;
        label.classList.add("detail-label");

        const value = document.createElement("div");
        value.textContent = valueText;
        value.classList.add("detail-value");

        section.append(label, value);

        return section;
    }

    const dateSection = createDetailSection("Date", formatDate(workout.date));
    const aoSection = createDetailSection("AO", workout.aoName || "-");

    let sourceSection = null;

    if (workout.sourceWorkoutId) {
        const sourceWorkout = state.plannedWorkouts.find(
            w => w.id === workout.sourceWorkoutId
        );

        if (sourceWorkout) {
            const sourceLabel = sourceWorkout.title || `${formatDate(sourceWorkout.date)} - ${sourceWorkout.aoName || "AO"}`;
            sourceSection = createDetailSection("Copied From Workout", sourceLabel);
        }
    }

    if (workout.sourceSessionID) {
        const sourceSession = state.sessions.find(
            s => s.id === workout.sourceSessionID
        );

        if (sourceSession) {
            const sourceLabel = `${formatDate(sourceSession.date)} = ${sourceSession.aoName || "AO"}`;
            sourceSection = createDetailSection("Copied From Session", sourceLabel);
        }
    }

    const warmoramaSection = createDetailSection("Warm-O-Rama", workout.warmorama || "-");
    const thangsSection = createDetailSection("Thangs", workout.thangs || "-");
    const finisherSection = createDetailSection("Mary / Finisher", workout.finisher || "-");
    const notesSection = createDetailSection("Planner Notes", workout.notes || "-");

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Workout";
    editButton.addEventListener("click", () => {
        state.editingPlannedWorkoutId = workout.id;
        state.currentView = "workoutPlanner";
        renderApp();
    });

    const logButton = document.createElement("button");
    logButton.textContent = "Log This Workout";
    logButton.addEventListener("click", () => {
        const session = createSession(workout.date, workout.aoName);
        session.workout = {
            title: workout.title,
            warmorama: workout.warmorama,
            thangs: workout.thangs,
            finisher: workout.finisher,
            notes: workout.notes,
        };
        session.sourcePlannedWorkoutId = workout.id;
        state.sessions.push(session);
        state.selectedSessionId = session.id;
        state.editingSessionId = session.id;
        state.currentView = "session";
        renderApp();
    });

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy to New Plan";

    copyButton.addEventListener("click", () => {
        const newWorkout = {
            ...workout,
            id: crypto.randomUUID(),
            date: "",
            createdAt: Date.now(),
            lastModifiedAt: null,
            sourceWorkoutId: workout.id,
        };

        state.plannedWorkouts.push(newWorkout);

        state.editingPlannedWorkoutId = newWorkout.id;
        state.currentView = "workoutPlanner";

        renderApp();
    })

    app.append(
        title,
        dateSection,
        aoSection,
        ...(sourceSection ? [sourceSection] : []),
        warmoramaSection,
        thangsSection,
        finisherSection,
        notesSection,
        editButton,
        copyButton,
        logButton,
        backButton,
    )
}
