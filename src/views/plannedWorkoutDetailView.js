import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createSession } from "../modules/sessions.js";
import { deletePlannedWorkout } from "../services/appData.js";
import { REGION_INTRO_TEMPLATES } from "../config.js";
import { generatePreblast } from "../modules/generatePreblast.js";

export function renderPlannedWorkoutDetail() {
    const app = document.getElementById("app");
    app.textContent = "";

    const workout = state.plannedWorkouts.find(
        w => w.id === state.selectedPlannedWorkoutId
    );

    const regionIntroTemplate = REGION_INTRO_TEMPLATES[state.currentRegionId] || "";
    const resolvedIntroduction = workout.introduction || regionIntroTemplate;

    const isExecutionMode = state.plannedWorkoutLaunchMode === "execution";
    const isTodayWorkout = workout?.date === getTodayDate();

    if (!workout) {
        app.textContent = "No Planned Workout Found";
        return;
    }

    const backButton = document.createElement("button");
    backButton.classList.add("secondary-button");

    const backDestination = isExecutionMode
        ? "dashboard"
        : (workout.isShared ? "plannedWorkoutList" : "myPlanner");

    const backLabel = isExecutionMode
        ? "Back to Dashboard"
        : (workout.isShared ? "Back to Workout Library" : "Back to My Planner");

    backButton.textContent = backLabel;
    backButton.addEventListener("click", () => {
        if (isExecutionMode) {
            const confirmed = confirm("Exit workout view?");
            if(!confirmed) return;
        }

        state.plannedWorkoutLaunchMode = null;
        state.currentView = backDestination;
        renderApp();
});

    const title = document.createElement("h1");
    title.textContent = workout.title || "Planned Workout";
    if (isExecutionMode) {
        title.classList.add("execution-title");
    }

    let executionBanner = null;

    if (isExecutionMode) {
        executionBanner = document.createElement("div");
        executionBanner.classList.add("loaded-workout-banner");
        executionBanner.textContent = `You are Qing ${isTodayWorkout ? "today" : "this workout"} at ${workout.aoName}`;
    }

    function createDetailSection (labelText, valueText, { hideIfEmpty = false} = {}) {
        const isEmpty = !valueText || valueText === "-";

        if (hideIfEmpty && isEmpty) {
            return null;
        }
        
        const section = document.createElement("div");
        section.classList.add("section");
        if (isExecutionMode) {
            section.classList.add("execution-section");
        }

        const label = document.createElement("div");
        label.textContent = labelText;
        label.classList.add("detail-label");
        if (isExecutionMode) {
            label.classList.add("execution-label");
        }

        const value = document.createElement("div");
        value.textContent = valueText;
        value.classList.add("detail-value");
        if (isExecutionMode) {
            value.classList.add("execution-text");
        }

        section.append(label, value);

        return section;
    }

    const dateSection = isExecutionMode ? null : createDetailSection("Date", formatDate(workout.date));
    const aoSection = isExecutionMode ? null :createDetailSection("AO", workout.aoName || "-");

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

    const introductionSection = createDetailSection("Introduction", resolvedIntroduction || "", { hideIfEmpty: isExecutionMode });
    const warmoramaSection = createDetailSection("Warm-O-Rama", workout.warmorama || "-", { hideIfEmpty: isExecutionMode });
    const thangsSection = createDetailSection("Thangs", workout.thangs || "-", { hideIfEmpty: isExecutionMode });
    const finisherSection = createDetailSection("Mary / Finisher", workout.finisher || "-", { hideIfEmpty: isExecutionMode });
    const notesSection = createDetailSection(isExecutionMode ? "Closing / Notes" : "Planner Notes", workout.notes || "-", { hideIfEmpty: isExecutionMode });
    const visibilitySection = createDetailSection(
        "Visibility",
        workout.isShared ? "Workout Library" : "My Planner"
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

        state.plannedWorkoutLaunchMode = null;
        state.editingPlannedWorkoutId = workout.id;
        state.currentView = "workoutPlanner";
        renderApp();
    });

    const logButton = document.createElement("button");
    logButton.textContent = isExecutionMode ? "Log This Session" : "Log This Workout";
    logButton.addEventListener("click", () => {
        const session = createSession(workout.date || getTodayDate(), workout.aoName);

        const currentMember = state.members.find(
            member => member.paxName === state.currentUserDisplayName
        );

        session.qIds = currentMember ? [currentMember.id] : [];
        session.attendeeIds = currentMember ? [currentMember.id] : [];
        session.workout = {
            title: workout.title,
            introduction: resolvedIntroduction,
            warmorama: workout.warmorama,
            thangs: workout.thangs,
            finisher: workout.finisher,
            notes: workout.notes,
        };
        session.sourcePlannedWorkoutId = workout.id;

        state.draftSession = session;
        state.selectedSessionId = null;
        state.editingSessionId = null;
        state.plannedWorkoutLaunchMode = null;
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

    const preblastButton = document.createElement("button");
    preblastButton.textContent = "Create Preblast";

    preblastButton.addEventListener("click", () => {
        state.selectedPreblastWorkoutId = workout.id;
        state.draftPreblastText = generatePreblast(workout, state.aos);
        state.currentView = "preblast";
        renderApp();
    });

    const primaryActionsRow = document.createElement("div");
    primaryActionsRow.classList.add("button-row", "primary-actions-row");

    const secondaryActionsRow = document.createElement("div");
    secondaryActionsRow.classList.add("button-row", "secondary-actions-row");

    const backRow = document.createElement("div");
    backRow.classList.add("button-row", "back-actions-row");

    if (isExecutionMode) {
        logButton.textContent = "Finish & Log Session";
        logButton.classList.add("primary-button");

        editButton.textContent = "Edit Workout";
        editButton.classList.add("secondary-button");
        primaryActionsRow.append(logButton);

        if (canEditWorkout) {
            secondaryActionsRow.append(editButton);
        }
    } else {
        if (canEditWorkout) {
            primaryActionsRow.append(editButton);
        }

        primaryActionsRow.append(logButton, preblastButton);
        secondaryActionsRow.append(copyButton);

        if (canDeleteWorkout && deleteButton) {
            secondaryActionsRow.append(deleteButton);
        }
    }

    backRow.append(backButton);

    app.append(
        title,
        ...(executionBanner ? [executionBanner] : []),
        ...(dateSection ? [dateSection] : []),
        ...(aoSection ? [aoSection] : []),
        ...(!isExecutionMode ? [visibilitySection] : []),
        ...(!isExecutionMode && sourceSection ? [sourceSection] : []),
        ...(introductionSection ? [introductionSection] : []),
        ...(warmoramaSection ? [warmoramaSection] : []),
        ...(thangsSection ? [thangsSection] : []),
        ...(finisherSection ? [finisherSection] : []),
        ...(notesSection ? [notesSection] : []),
        primaryActionsRow,
        ...(secondaryActionsRow.childElementCount > 0 ? [secondaryActionsRow] : []),
        backRow,
    );
}
