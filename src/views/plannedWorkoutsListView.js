import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderPlannedWorkoutsList () {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    })

    const title = document.createElement("h1");
    title.textContent = "Workout Library";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = state.showMyPlannedWorkoutsOnly
        ? "Your shared workouts in the library."
        : "Shared workouts available to the region.";

    const myWorkoutsToggle = document.createElement("button");
    myWorkoutsToggle.textContent = state.showMyPlannedWorkoutsOnly
        ? "Show All Library Workouts"
        : "Show My Shared Workouts";

    myWorkoutsToggle.addEventListener("click", () => {
        state.showMyPlannedWorkoutsOnly = !state.showMyPlannedWorkoutsOnly;
        renderApp();
    })

    const newWorkoutButton = document.createElement("button");
    newWorkoutButton.textContent = "Plan New Workout";

    newWorkoutButton.addEventListener("click", () => {
        state.editingPlannedWorkoutId = null;
        navigateTo("workoutPlanner");
    });

    const listContainer = document.createElement("div");

    const sharedWorkouts = state.plannedWorkouts.filter(
        workout => workout.isShared
        )

    const visibleWorkouts = state.showMyPlannedWorkoutsOnly
        ? sharedWorkouts.filter(
            workout => workout.createdByUserId === state.currentUserId
        )
        : sharedWorkouts;

    const sortedWorkouts = [...visibleWorkouts].sort((a, b) => {
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
        empty.textContent = state.showMyPlannedWorkoutsOnly
            ? "You have not shared any workouts yet"
            : "No shared workouts in the library yet";

        listContainer.appendChild(empty);
    } else {
        sortedWorkouts.forEach(workout => {
            const card = document.createElement("div");
            card.classList.add("member-card", "planner-card");

            const cardContent = document.createElement("div");
            cardContent.classList.add("planner-card-content");

            const topLine = document.createElement("div");
            topLine.classList.add("member-name");
            topLine.textContent = `${formatDate(workout.date)} - ${workout.aoName || "AO"}`;

            const titleLine = document.createElement("div");
            titleLine.classList.add("stats-line", "planner-title-line");
            titleLine.textContent = workout.title || "(No Title)";

            const previewLine = document.createElement("div");
            previewLine.classList.add("stats-line", "planner-preview-line");
            previewLine.textContent = workout.thangs
                ? workout.thangs.split("\n")[0]
                : (workout.notes ? workout.notes.split("\n")[0] : "No workout details");

            if (workout.date === getTodayDate()) {
                card.classList.add("today-workout");
            }
            cardContent.append(topLine, titleLine, previewLine);
            card.append(cardContent);

            card.addEventListener("click", () => {
                state.selectedPlannedWorkoutId = workout.id;
                navigateTo("plannedWorkoutDetail");
            });

            listContainer.appendChild(card);
        });
    }

    const nav = createGlobalNav();

    app.append(
        header,
        title,
        subtitle,
        myWorkoutsToggle,
        newWorkoutButton,
        listContainer,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}