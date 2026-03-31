import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";

export function renderPlannedWorkoutsList () {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Planned Workouts";

    const newWorkoutButton = document.createElement("button");
    newWorkoutButton.textContent = "Plan New Workout";

    newWorkoutButton.addEventListener("click", () => {
        state.editingPlannedWorkoutId = null;
        state.currentView = "workoutPlanner";
        renderApp();
    });

    const listContainer = document.createElement("div");

    const sortedWorkouts = [...state.plannedWorkouts].sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }

        const aModified = a.lastModifiedAt || a.createdAt || 0;
        const bModified = b.lastModifiedAt || b.createdAt || 0;

        return bModified - aModified;
    });

    if (sortedWorkouts.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No planned workouts yet";

        listContainer.appendChild(empty);
    } else {
        sortedWorkouts.forEach(workout => {
            const card = document.createElement("div");
            card.classList.add("member-card");

            const topLine = document.createElement("div");
            topLine.classList.add("member-name");
            topLine.textContent = `${formatDate(workout.date)} - ${workout.aoName || "AO"}`;

            const titleLine = document.createElement("div");
            titleLine.classList.add("stats-line");
            titleLine.textContent = workout.title || "(No Title)";

            const previewLine = document.createElement("div");
            previewLine.classList.add("stats-line");
            previewLine.textContent = workout.thangs
                ? workout.thangs.split("\n")[0]
                : (workout.notes ? workout.notes.split("\n")[0] : "No workout details");

            if (workout.date === getTodayDate()) {
                card.classList.add("today-workout");
            }

            card.append(topLine, titleLine, previewLine);

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
        newWorkoutButton,
        listContainer,
        nav
    );
}