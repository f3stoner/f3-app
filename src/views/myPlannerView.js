import { state } from "../modules/state.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { findWorkoutForQSlot } from "../utils/qSlotMatching.js";
import { savePlannerDraft, createNewPlannerDraft, createExistingPlannerDraft } from "../services/plannerDraftRepository.js";

function createBlankWorkout({
    date = getTodayDate(),
    aoId = null,
    aoName = "",
    qSlotId = null,
} = {}) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        aoName,
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
        sourceQSlotId: qSlotId,
        createdAt: Date.now(),
        lastModifiedAt: null,
        createdByUserId: state.currentUserId,
        isShared: false,
        isFinalized: false,
        timers: [],
    };
}

function createMyPlannerWorkoutRow(
    workout
) {
    const card =
        document.createElement("button");

    card.type = "button";

    card.classList.add(
        "my-planner-row",
        "my-planner-saved-row"
    );

    const cardContent =
        document.createElement("div");

    cardContent.classList.add(
        "my-planner-row-content"
    );

    const titleLine =
        document.createElement("div");

    titleLine.classList.add(
        "my-planner-row-title"
    );

    titleLine.textContent =
        workout.title ||
        "Untitled Workout";

    const previewText =
        workout.thangs
            ? workout.thangs
                .split("\n")[0]
            : (
                workout.notes
                    ? workout.notes
                        .split("\n")[0]
                    : ""
            );

    const previewLine =
        document.createElement("div");

    previewLine.classList.add(
        "my-planner-row-preview"
    );

    previewLine.textContent =
        previewText;

    const topLine =
        document.createElement("div");

    topLine.classList.add(
        "my-planner-row-meta"
    );

    const dateText =
        workout.date
            ? formatDate(
                workout.date
            )
            : "No Date";

    topLine.textContent =
        `${dateText} • ` +
        `${workout.aoName || "AO"}`;

    cardContent.append(
        topLine,
        titleLine
    );
    
    if (previewText) {
        cardContent.append(
            previewLine
        );
    }

    if (workout.isShared) {
        const sharedBadge =
            document.createElement(
                "div"
            );

        sharedBadge.classList.add(
            "my-planner-row-status",
            "is-shared"
        );

        sharedBadge.textContent =
            "Shared";

        cardContent.append(
            sharedBadge
        );
    }

    const chevron =
        document.createElement("span");

    chevron.classList.add(
        "my-planner-row-chevron"
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

    card.addEventListener(
        "click",
        () => {
            if (
                workout.isFinalized ===
                true
            ) {
                state
                    .selectedPlannedWorkoutId =
                    workout.id;

                navigateTo(
                    "plannedWorkoutDetail"
                );

                return;
            }

            savePlannerDraft(
                createExistingPlannerDraft(
                    workout
                )
            );

            navigateTo(
                "workoutPlanner"
            );
        }
    );

    return card;
}

export function renderMyPlanner() {
    const app =
    document.getElementById("app");

    app.replaceChildren();
    app.className = "view-myPlanner";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title =
        document.createElement("h1");

    title.classList.add(
        "my-planner-title"
    );

    title.textContent =
        "My Planner";

    const newWorkoutButton =
        document.createElement("button");

    newWorkoutButton.type = "button";

    newWorkoutButton.classList.add(
        "my-planner-new-button"
    );

    newWorkoutButton.textContent =
        "+ New Workout";

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
        "my-planner-title-row"
    );

    titleRow.append(
        title,
        newWorkoutButton
    );

    const subtitle =
        document.createElement("div");

    subtitle.classList.add(
        "my-planner-subtitle"
    );

    subtitle.textContent =
        "Plan your upcoming workouts.";

    const upcomingQSection = document.createElement("div");
    upcomingQSection.classList.add(
        "my-planner-section",
        "my-planner-upcoming-section"
    );

    const upcomingQList = document.createElement("div");
    upcomingQList.classList.add(
        "my-planner-list",
        "my-planner-upcoming-list"
    );

    const today = getTodayDate();

    const myUpcomingQSlots = (state.qSlots || [])
        .filter(slot =>
            slot.qUserId === state.currentUserMemberId &&
            slot.date >= today
        )
        .sort((a, b) => a.date.localeCompare(b.date));

    const upcomingQKeys = new Set(
        myUpcomingQSlots.map(slot => `${slot.date}__${slot.aoId || ""}`)
    );

    const upcomingQHeader =
        document.createElement("div");

    upcomingQHeader.classList.add(
        "my-planner-upcoming-header"
    );

    const upcomingQHeading =
        document.createElement("div");

    upcomingQHeading.classList.add(
        "my-planner-upcoming-heading"
    );

    const upcomingQEyebrow =
        document.createElement("div");

    upcomingQEyebrow.classList.add(
        "my-planner-upcoming-eyebrow"
    );

    upcomingQEyebrow.textContent =
        "Your Q Schedule";

    const upcomingQTitle =
        document.createElement("h2");

    upcomingQTitle.classList.add(
        "my-planner-upcoming-title"
    );

    upcomingQTitle.textContent =
        "Upcoming Qs";

    const upcomingQSummary =
        document.createElement("div");

    upcomingQSummary.classList.add(
        "my-planner-upcoming-summary"
    );

    upcomingQSummary.textContent =
        myUpcomingQSlots.length === 1
            ? "1 Upcoming Workout"
            : `${myUpcomingQSlots.length} Upcoming Workouts`;

    upcomingQHeading.append(
        upcomingQEyebrow,
        upcomingQTitle
    );

    upcomingQHeader.append(
        upcomingQHeading,
        upcomingQSummary
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

            const matchingWorkout = findWorkoutForQSlot(
                slot,
                state.plannedWorkouts || [],
                state.currentUserId,
                state.aos || []
            );

            const isWorkoutFinalized =
                matchingWorkout?.isFinalized === true;

                const card =
                document.createElement("button");
            
            card.type = "button";
            
            card.classList.add(
                "my-planner-row",
                "my-planner-upcoming-row"
            );

            const cardContent = document.createElement("div");
            cardContent.classList.add(
                "my-planner-row-content"
            );

            const topLine = document.createElement("div");
            topLine.classList.add(
                "my-planner-row-meta"
            );
            topLine.textContent = `${formatDate(slot.date)} • ${aoName}`;

            const statusLine = document.createElement("div");
            statusLine.classList.add(
                "my-planner-row-title"
            );
            statusLine.textContent = !matchingWorkout
                ? "Workout Needed"
                : isWorkoutFinalized
                    ? "BD Ready"
                    : "Draft in Progress";

            if (!matchingWorkout) {
                card.classList.add(
                    "needs-plan"
                );
            } else if (isWorkoutFinalized) {
                card.classList.add(
                    "is-ready"
                );
            } else {
                card.classList.add(
                    "is-draft"
                );
            }

            const actionLine = document.createElement("div");
            actionLine.classList.add(
                "my-planner-row-helper"
            );
            actionLine.textContent = !matchingWorkout
                ? "Tap to plan workout"
                : isWorkoutFinalized
                    ? "Tap to view workout"
                    : "Tap to continue planning";

            cardContent.append(topLine, statusLine, actionLine);

            const chevron =
                document.createElement("span");

            chevron.classList.add(
                "my-planner-row-chevron"
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
                if (matchingWorkout) {
                    if (isWorkoutFinalized) {
                        state.selectedPlannedWorkoutId = matchingWorkout.id;
                        navigateTo("plannedWorkoutDetail");
                        return;
                    }
                
                    savePlannerDraft(
                        createExistingPlannerDraft(matchingWorkout)
                    );
                
                    navigateTo("workoutPlanner");
                    return;
                }

                const newWorkout = createBlankWorkout({
                    date: slot.date,
                    aoId: slot.aoId || null,
                    aoName,
                    qSlotId: slot.id,
                });
                
                savePlannerDraft(
                    createNewPlannerDraft(newWorkout)
                );
                
                navigateTo("workoutPlanner");
            });

            upcomingQList.append(card);
        });
    }

    upcomingQSection.append(
        upcomingQHeader,
        upcomingQList
    );

    const unscheduledList =
        document.createElement("div");

    unscheduledList.classList.add(
        "my-planner-list",
        "my-planner-saved-list"
    );

    const pastList =
        document.createElement("div");

    pastList.classList.add(
        "my-planner-list",
        "my-planner-saved-list"
);

    const myWorkouts =
        (state.plannedWorkouts || []).filter(
            workout => {
        if (workout.createdByUserId !== state.currentUserId) return false;

        const workoutKey = `${workout.date}__${workout.aoId || ""}`;

        if (workout.aoId) {
            return !upcomingQKeys.has(workoutKey);
        }

        const legacyKey = `${workout.date}__${workout.aoName}`;
        const legacyUpcomingKeys = new Set(
            myUpcomingQSlots.map(slot => {
                const ao = (state.aos || []).find(ao => ao.id === slot.aoId);
                return `${slot.date}__${ao?.name || "AO"}`;
            })
        );

        return !legacyUpcomingKeys.has(legacyKey);
    });

    const unscheduledWorkouts =
        myWorkouts
            .filter(workout => {
                return (
                    !workout.date ||
                    workout.date >= today
                );
            })
            .sort((a, b) => {
                const aDate =
                    a.date ||
                    "9999-12-31";

                const bDate =
                    b.date ||
                    "9999-12-31";

                const dateCompare =
                    aDate.localeCompare(
                        bDate
                    );

                if (dateCompare !== 0) {
                    return dateCompare;
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

    const pastWorkouts =
        myWorkouts
            .filter(workout => {
                return (
                    workout.date &&
                    workout.date < today
                );
            })
            .sort((a, b) => {
                const dateCompare =
                    (b.date || "")
                        .localeCompare(
                            a.date ||
                            ""
                        );

                if (dateCompare !== 0) {
                    return dateCompare;
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
            const unscheduledSection =
            document.createElement("section");
    
        unscheduledSection.classList.add(
            "my-planner-section",
            "my-planner-unscheduled-section"
        );
    
        const unscheduledTitle =
            document.createElement("h2");
    
        unscheduledTitle.classList.add(
            "my-planner-section-title"
        );
    
        unscheduledTitle.textContent =
            `Unscheduled Workouts (${unscheduledWorkouts.length})`;
    
        if (unscheduledWorkouts.length === 0) {
            const empty =
                document.createElement("div");
    
            empty.classList.add(
                "detail-value"
            );
    
            empty.textContent =
                "No unscheduled workouts.";
    
            unscheduledList.appendChild(
                empty
            );
        } else {
            unscheduledWorkouts.forEach(
                workout => {
                    unscheduledList.appendChild(
                        createMyPlannerWorkoutRow(
                            workout
                        )
                    );
                }
            );
        }
    
        unscheduledSection.append(
            unscheduledTitle,
            unscheduledList
        );
    
        const pastSection =
            document.createElement("section");
    
        pastSection.classList.add(
            "my-planner-section",
            "my-planner-past-section"
        );
    
        const pastTitle =
            document.createElement("h2");
    
        pastTitle.classList.add(
            "my-planner-section-title"
        );
    
        pastTitle.textContent =
            `Past Workouts (${pastWorkouts.length})`;
    
        if (pastWorkouts.length === 0) {
            const empty =
                document.createElement("div");
    
            empty.classList.add(
                "detail-value"
            );
    
            empty.textContent =
                "No past workouts yet.";
    
            pastList.appendChild(
                empty
            );
        } else {
            pastWorkouts.forEach(
                workout => {
                    pastList.appendChild(
                        createMyPlannerWorkoutRow(
                            workout
                        )
                    );
                }
            );
        }
    
        pastSection.append(
            pastTitle,
            pastList
        );
    
        const nav =
            createGlobalNav();
    
        app.append(
            header,
            titleRow,
            subtitle,
            upcomingQSection,
            unscheduledSection,
            pastSection,
            nav
        );
    
        if (state.isMainMenuOpen) {
            document.body.appendChild(
                createMainMenu()
            );
        }
    }