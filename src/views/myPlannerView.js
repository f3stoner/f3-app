import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";

export function renderMyPlanner() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "My Planner";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Private drafts and workouts you are still planning.";

    const newWorkoutButton = document.createElement("button");
    newWorkoutButton.textContent = "Plan New Workout";

    newWorkoutButton.addEventListener("click", () => {
        state.editingPlannedWorkoutId = null;
        state.draftPlannedWorkout = null;
        state.currentView = "workoutPlanner";
        renderApp();
    });

    const listContainer = document.createElement("div");

    const myDrafts = state.plannedWorkouts.filter(workout =>
        workout.createdByUserId === state.currentUserId &&
        !workout.isShared
    );

    const sortedDrafts = [...myDrafts].sort((a, b) => {
        const aTime = a.lastModifiedAt || a.createdAt || 0;
        const bTime = b.lastModifiedAt || b.createdAt || 0;
        return bTime - aTime;
    });

    if (sortedDrafts.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "You have no private workouts yet. Start planning your next BD.";
        listContainer.appendChild(empty);
    } else {
        sortedDrafts.forEach(workout => {
            const card = document.createElement("div");
            card.classList.add("member-card", "planner-card");

            const cardContent = document.createElement("div");
            cardContent.classList.add("planner-card-content");

            const topLine = document.createElement("div");
            topLine.classList.add("member-name");

            const dateText = workout.date ? formatDate(workout.date) : "No Date";
            topLine.textContent = `${dateText} • ${workout.aoName || "AO"}`;

            const titleLine = document.createElement("div");
            titleLine.classList.add("stats-line", "planner-title-line");
            titleLine.textContent = workout.title || "Untitled Workout";

            const previewText = workout.thangs
                ? workout.thangs.split("\n")[0]
                : (workout.notes ? workout.notes.split("\n")[0] : "");

            const previewLine = document.createElement("div");
            previewLine.classList.add("stats-line", "planner-preview-line");
            previewLine.textContent = previewText;

            const privateBadge = document.createElement("div");
            privateBadge.classList.add("detail-label", "planner-status-line");
            privateBadge.textContent = "Private Draft";

            cardContent.append(topLine, titleLine);

            if (previewText) {
                cardContent.appendChild(previewLine);
            }

            cardContent.appendChild(privateBadge);
            card.append(cardContent);

            card.addEventListener("click", () => {
                state.selectedPlannedWorkoutId = workout.id;
                state.currentView = "plannedWorkoutDetail";
                renderApp();
            });

            listContainer.appendChild(card);
        });
    }

    const nav = createGlobalNav();

    app.append(
        title,
        subtitle,
        newWorkoutButton,
        listContainer,
        nav
    )
}