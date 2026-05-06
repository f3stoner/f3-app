import { state } from "../modules/state.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";

export function renderMyPlanner() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "My Planner";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Your planned workouts, including private drafts and shared workouts.";

    const newWorkoutButton = document.createElement("button");
    newWorkoutButton.textContent = "Plan New Workout";

    newWorkoutButton.addEventListener("click", () => {
        state.editingPlannedWorkoutId = null;
        state.draftPlannedWorkout = null;
        navigateTo("workoutPlanner");
    });

    const upcomingQSection = document.createElement("div");
    upcomingQSection.classList.add("planner-upcoming-section");

    const upcomingQTitle = document.createElement("h2");
    upcomingQTitle.textContent = "Upcoming Qs";

    const upcomingQList = document.createElement("div");

    const today = getTodayDate();

    const myUpcomingQSlots = (state.qSlots || [])
        .filter(slot =>
            slot.qUserId === state.currentUserMemberId &&
            slot.date >= today
        )
        .sort((a, b) => a.date.localeCompare(b.date));

    const upcomingQKeys = new Set(
        myUpcomingQSlots.map(slot => {
            const ao = (state.aos || []).find(ao => ao.id === slot.aoId);
            const aoName = ao?.name || "AO";
            return `${slot.date}__${aoName}`;
        })
    );

    if (myUpcomingQSlots.length === 0) {
        const emptyUpcoming = document.createElement("div");
        emptyUpcoming.classList.add("detail-value");
        emptyUpcoming.textContent = "No upcoming Qs claimed.";
        upcomingQList.appendChild(emptyUpcoming);
    } else {
        myUpcomingQSlots.forEach(slot => {
            const ao = (state.aos || []).find(ao => ao.id === slot.aoId);
            const aoName = ao?.name || "AO";

            const matchingWorkout = (state.plannedWorkouts || []).find(workout =>
                workout.createdByUserId === state.currentUserId &&
                workout.date === slot.date &&
                workout.aoName === aoName
            );

            const card = document.createElement("div");
            card.classList.add("member-card", "planner-card");

            const cardContent = document.createElement("div");
            cardContent.classList.add("planner-card-content");

            const topLine = document.createElement("div");
            topLine.classList.add("member-name");
            topLine.textContent = `${formatDate(slot.date)} • ${aoName}`;

            const statusLine = document.createElement("div");
            statusLine.classList.add("stats-line", "planner-title-line");
            statusLine.textContent = matchingWorkout
                ? "BD Ready"
                : "No workout planned";

            const actionLine = document.createElement("div");
            actionLine.classList.add("detail-label", "planner-status-line");
            actionLine.textContent = matchingWorkout
                ? "Tap to view workout"
                : "Tap to plan workout";

            cardContent.append(topLine, statusLine, actionLine);
            card.append(cardContent);

            card.addEventListener("click", () => {
                if (matchingWorkout) {
                    state.selectedPlannedWorkoutId = matchingWorkout.id;
                    navigateTo("plannedWorkoutDetail");
                    return;
                }

                state.editingPlannedWorkoutId = null;
                state.draftPlannedWorkout = null;
                state.pendingPlannerDate = slot.date;
                state.pendingPlannerAoName = aoName;
                navigateTo("workoutPlanner");
            });

            upcomingQList.append(card);
        });
    }

    upcomingQSection.append(upcomingQTitle, upcomingQList);

    const workoutLibraryTitle = document.createElement("h2");
    workoutLibraryTitle.textContent = "Saved Workouts";

    const listContainer = document.createElement("div");

    const myWorkouts = state.plannedWorkouts.filter(workout => {
        if (workout.createdByUserId !== state.currentUserId) return false;

        const workoutKey = `${workout.date}__${workout.aoName}`;
        return !upcomingQKeys.has(workoutKey);
    });

    const sortedWorkouts = [...myWorkouts].sort((a, b) => {
        const aTime = a.lastModifiedAt || a.createdAt || 0;
        const bTime = b.lastModifiedAt || b.createdAt || 0;
        return bTime - aTime;
    });

    if (sortedWorkouts.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "You have no planned workouts yet. Start planning your next BD.";
        listContainer.appendChild(empty);
    } else {
        sortedWorkouts.forEach(workout => {
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
            privateBadge.textContent = workout.isShared ? "Shared Workout" : "Private Draft";

            cardContent.append(topLine, titleLine);

            if (previewText) {
                cardContent.appendChild(previewLine);
            }

            cardContent.appendChild(privateBadge);
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
        title,
        subtitle,
        newWorkoutButton,
        upcomingQSection,
        workoutLibraryTitle,
        listContainer,
        nav
    )
}