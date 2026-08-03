import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { savePlannerDraft, createNewPlannerDraft } from "../services/plannerDraftRepository.js";

function createBlankWorkout() {
    return {
        id: crypto.randomUUID(),
        date: getTodayDate(),
        aoId: null,
        aoName: "",
        title: "",
        introduction: "",
        warmorama: "",
        thangs: "",
        thangSections: [
            {
                id: crypto.randomUUID(),
                title: "Thang 1",
                content: "",
            },
        ],
        finisher: "",
        notes: "",
        sourceWorkoutId: null,
        sourceSessionId: null,
        sourceQSlotId: null,
        createdAt: Date.now(),
        lastModifiedAt: null,
        createdByUserId: state.currentUserId,
        isShared: false,
        timers: [],
    };
}

export function renderPlannedWorkoutsList () {
    const app = document.getElementById("app");

    app.replaceChildren();
    app.className = "view-plannedWorkouts";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    })

    const title =
        document.createElement("h1");

    title.textContent =
        "Workout Library";

    title.classList.add(
        "workout-library-title"
    );

    const newWorkoutButton =
        document.createElement("button");

    newWorkoutButton.type = "button";
    newWorkoutButton.textContent =
        "Plan New Workout";

    newWorkoutButton.classList.add(
        "workout-library-new-button"
    );

    newWorkoutButton.addEventListener(
        "click",
        () => {
            const newWorkout =
                createBlankWorkout();

            savePlannerDraft(
                createNewPlannerDraft(
                    newWorkout
                )
            );

            navigateTo(
                "workoutPlanner"
            );
        }
    );

    const titleRow =
        document.createElement("div");

    titleRow.classList.add(
        "workout-library-title-row"
    );

    titleRow.append(
        title,
        newWorkoutButton
    );

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

    const controls =
        document.createElement("div");

    controls.classList.add(
        "workout-library-controls"
    );

    subtitle.classList.add(
        "workout-library-subtitle"
    );

    myWorkoutsToggle.classList.add(
        "workout-library-filter"
    );

    if (state.showMyPlannedWorkoutsOnly) {
        myWorkoutsToggle.classList.add(
            "active"
        );
    }

    controls.append(
        subtitle,
        myWorkoutsToggle
    );

    const listContainer = document.createElement("div");
    listContainer.classList.add(
        "workout-library-list"
    );

    const sharedWorkouts = (state.plannedWorkouts || []).filter(
        workout => workout.isShared
    );

    const visibleWorkouts = state.showMyPlannedWorkoutsOnly
        ? sharedWorkouts.filter(
            workout => workout.createdByUserId === state.currentUserId
        )
        : sharedWorkouts;

    const sortedWorkouts = [...visibleWorkouts].sort((a, b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
        }
    
        const aModified =
            a.lastModifiedAt ||
            a.createdAt ||
            0;
    
        const bModified =
            b.lastModifiedAt ||
            b.createdAt ||
            0;
    
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
            const card = document.createElement("button");

            card.type = "button";

            card.classList.add(
                "workout-library-row"
            );

            const cardContent = document.createElement("div");
            cardContent.classList.add(
                "workout-library-row-content"
            );

            const topLine = document.createElement("div");
            topLine.classList.add(
                "workout-library-row-meta"
            );
            topLine.textContent = `${formatDate(workout.date)} - ${workout.aoName || "AO"}`;

            const titleLine = document.createElement("div");
            titleLine.classList.add(
                "workout-library-row-title"
            );
            titleLine.textContent = workout.title || "(No Title)";

            const previewLine = document.createElement("div");
            previewLine.classList.add(
                "workout-library-row-preview"
            );
            previewLine.textContent = workout.thangs
                ? workout.thangs.split("\n")[0]
                : (workout.notes ? workout.notes.split("\n")[0] : "No workout details");

            if (workout.date === getTodayDate()) {
                card.classList.add("is-today");
            }
            cardContent.append(topLine, titleLine, previewLine);

            const chevron =
                document.createElement("span");

            chevron.classList.add(
                "workout-library-row-chevron"
            );

            chevron.setAttribute(
                "aria-hidden",
                "true"
            );

            chevron.textContent = "›";

            card.append(
                cardContent,
                chevron
            );

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
        titleRow,
        controls,
        listContainer,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}