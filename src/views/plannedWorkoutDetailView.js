import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createSession } from "../modules/sessions.js";
import { deletePlannedWorkout } from "../services/appData.js";

export function renderPlannedWorkoutDetail() {
    const app = document.getElementById("app");
    app.textContent = "";

    const workout = state.plannedWorkouts.find(
        w => w.id === state.selectedPlannedWorkoutId
    );

    const backButton = document.createElement("button");
    backButton.classList.add("secondary-button");
    backButton.textContent = "Back to Plans";
    backButton.addEventListener("click", () => {
        state.currentView = "plannedWorkoutList";
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

    if (workout.sourceSessionId) {
        const sourceSession = state.sessions.find(
            s => s.id === workout.sourceSessionId
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
    const visibilitySection = createDetailSection(
        "Visibility",
        workout.isShared ? "Shared with Region" : "Private Draft"
    );

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Workout";
    editButton.addEventListener("click", () => {
        if (
            state.currentUserRole !== "admin" &&
            workout.createdByUserId !== state.currentUserId
        ) {
            alert("You do not have permission to edit this workout.");
            return;
        }

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

        state.draftSession = session;
        state.selectedSessionId = null;
        state.editingSessionId = null;
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
            createdByUserId: state.currentUserId,
            isShared: false,
        };

        state.draftPlannedWorkout = newWorkout;
        state.editingPlannedWorkoutId = null;
        state.currentView = "workoutPlanner";

        renderApp();
    })

    const canEditWorkout = 
        state.currentUserRole === "admin" ||
        workout.createdByUserId === state.currentUserId;

    const canDeleteWorkout = 
        state.currentUserRole === "admin" ||
        workout.createdByUserId === state.currentUserId;

    let deleteButton = null;

    if (canDeleteWorkout) {
        deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete Workout";
        deleteButton.classList.add("danger-button");

        deleteButton.addEventListener("click", async () => {
            const confirmed = confirm("Are you sure you want to delete this workout?");
            if(!confirmed) return;

            try {
                await deletePlannedWorkout(workout.id);

                state.selectedPlannedWorkoutId = null;
                state.editingPlannedWorkoutId = null;
                state.currentView = "plannedWorkoutList";

                renderApp();
            } catch (error) {
                console.error("Failed to delete workout:", error);
                alert("Failed to delete workout.")
            }
        });
    }

    const primaryActionsRow = document.createElement("div");
    primaryActionsRow.classList.add("button-row", "primary-actions-row");

    const secondaryActionsRow = document.createElement("div");
    secondaryActionsRow.classList.add("button-row", "secondary-actions-row");

    const backRow = document.createElement("div");
    backRow.classList.add("button-row", "back-actions-row");

    if (canEditWorkout) {
        primaryActionsRow.append(editButton);
    }

    primaryActionsRow.append(logButton);
    secondaryActionsRow.append(copyButton);

    if (canDeleteWorkout && deleteButton) {
        secondaryActionsRow.append(deleteButton);
    }

    backRow.append(backButton);

    app.append(
        title,
        dateSection,
        aoSection,
        visibilitySection,
        ...(sourceSection ? [sourceSection] : []),
        warmoramaSection,
        thangsSection,
        finisherSection,
        notesSection,
        primaryActionsRow,
        secondaryActionsRow,
        backRow,
    );
}
