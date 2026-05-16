import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createSession } from "../modules/sessions.js";
import { deletePlannedWorkout } from "../services/appData.js";
import { REGION_INTRO_TEMPLATES } from "../config.js";
import { generatePreblast } from "../modules/generatePreblast.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { saveNavState } from "../utils/storage.js";
import { showToast } from "../utils/toast.js";
import { getTimersForSection, formatTimerSummary } from "../utils/workoutTimers.js";
import { getWorkoutFieldLabel } from "../utils/workoutLabels.js";
import { logActionFailure, logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";

let activeTimerIntervalId = null;
let timerAudio = null;

const TIMER_SOUND_URL =
    `${window.location.origin}${process.env.NODE_ENV === "production" ? "/f3-app" : ""}/sounds/timer-complete.wav`;

function getTimerAudio() {
    if (!timerAudio) {
        timerAudio = new Audio(TIMER_SOUND_URL);
        timerAudio.preload = "auto";
        timerAudio.volume = 1;
    }

    return timerAudio;
}

async function unlockTimerAudio() {
    try {
        const audio = getTimerAudio();
        audio.currentTime = 0;
        audio.volume = 0;

        await audio.play();

        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
    } catch (error) {
        console.warn("Timer audio unlock failed:", error);
    }
}

function clearActiveTimerInterval() {
    if (activeTimerIntervalId) {
        clearInterval(activeTimerIntervalId);
        activeTimerIntervalId = null;
    }
}

function removeActiveTimerModal() {
    document.querySelectorAll(".timer-modal-overlay").forEach(modal => {
        modal.remove();
    });
}

function launchWorkoutExecution(workout, launchSource = "plannedWorkoutDetail") {
    state.executionContext = {
        plannedWorkoutId: workout.id,
        launchSource,
        startedAt: Date.now(),
        executionDate: getTodayDate(),
        allowSessionLogging: true,
    };

    logAppEvent({
        type: APP_EVENTS.EXECUTION_STARTED,
        metadata: {
            plannedWorkoutId: workout.id,
            launchSource,
            workoutDate: workout.date || null,
            aoName: workout.aoName || null,
            isShared: Boolean(workout.isShared),
            timerCount: workout.timers?.length || 0,
            executionDate: state.executionContext.executionDate,
        },
    });

    state.selectedPlannedWorkoutId = workout.id;
    state.plannedWorkoutLaunchMode = "execution";

    state.activeWorkoutTimerId = null;
    state.activeWorkoutTimerStatus = null;
    state.activeWorkoutTimerStartedAt = null;
    state.activeWorkoutTimerRemainingSeconds = null;
    state.activeWorkoutTimerPhase = null;
    state.activeWorkoutTimerRound = null;

    saveNavState(state);
    renderApp();
}

export function renderPlannedWorkoutDetail() {
    removeActiveTimerModal();

    const app = document.getElementById("app");
    app.textContent = "";

    const workout = state.plannedWorkouts.find(
        w => w.id === state.selectedPlannedWorkoutId
    );

    const currentMember = state.members.find(
        member => member.id === state.currentUserMemberId
    );

    const isExecutionMode = state.plannedWorkoutLaunchMode === "execution";
    const isTodayWorkout = workout?.date === getTodayDate();

    if (!workout) {
        console.warn("Missing workout. Redirecting to safe view.");
        state.currentView = "plannedWorkoutList";
        saveNavState(state);
        renderApp();
        return;
    }

    console.log("Region intro lookup:", {

        currentRegionId: state.currentRegionId,
      
        template: REGION_INTRO_TEMPLATES[state.currentRegionId],
      
      });

    const introTemplateFn = REGION_INTRO_TEMPLATES[state.currentRegionId];
    const regionIntroTemplate = 
        typeof introTemplateFn === "function"
            ? introTemplateFn?.(currentMember?.paxName)
            : "";
    const resolvedIntroduction = workout.introduction || regionIntroTemplate;

    const backButton = document.createElement("button");
    backButton.classList.add("secondary-button");
    
    backButton.textContent = "← Back";
    
    backButton.addEventListener("click", () => {
        if (state.sharedWorkoutViewMode) {
            state.sharedWorkoutViewMode = false;
            state.selectedPlannedWorkoutId = null;
            state.currentView = "plannedWorkoutList";
            renderApp();
            return;
        }

        if (isExecutionMode) {
            const confirmed = confirm("Exit workout view?");
            if (!confirmed) return;
    
            state.plannedWorkoutLaunchMode = null;
            state.executionContext = {
                plannedWorkoutId: null,
                launchSource: null,
                startedAt: null,
                executionDate: null,
                allowSessionLogging: true,
            }

            clearActiveTimerInterval();

            state.activeWorkoutTimerId = null;
            state.activeWorkoutTimerStatus = "idle";
            state.activeWorkoutTimerStartedAt = null;
            state.activeWorkoutTimerRemainingSeconds = null;
            state.activeWorkoutTimerPhase = null;
            state.activeWorkoutTimerRound = null;

            state.currentView = "plannedWorkoutDetail";
            saveNavState(state);
            renderApp();
            return;
        }
    
        state.plannedWorkoutLaunchMode = null;
        goBack(workout.isShared ? "plannedWorkoutList" : "myPlanner");
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
        executionBanner.textContent = `Running workout at ${workout.aoName || "AO"}`;
    }

    function createTimerButtonsForSection(section) {
        const timers = getTimersForSection(workout, section);

        if (!isExecutionMode || timers.length === 0) {
            return [];
        }

        return timers.map(timer => {
            const button = document.createElement("button");
            button.classList.add("secondary-button", "workout-timer-button");
            const timerName = timer.label || "Timer";
            button.textContent = `▶ ${timerName} · ${formatTimerSummary(timer)}`;

            button.addEventListener("click", () =>{
                state.activeWorkoutTimerId = timer.id;
                state.activeWorkoutTimerStatus = "idle";
                state.activeWorkoutTimerStartedAt = null;

                state.activeWorkoutTimerPhase = timer.type === "interval" ? "work" : null;
                state.activeWorkoutTimerRound = timer.type === "interval" ? 1 : null;

                state.activeWorkoutTimerRemainingSeconds =
                    timer.type === "interval"
                        ? timer.workSeconds || 45
                        : timer.durationSeconds || 300;
                renderApp();
            });

            return button;
        });
    }

    function formatTimerClock(totalSeconds) {
        const safeSeconds = Math.max(0, totalSeconds || 0);
        const minutes = Math.floor(safeSeconds / 60);
        const seconds = safeSeconds % 60;

        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function getActiveTimer() {
        return (workout.timers || []).find(
            timer => timer.id === state.activeWorkoutTimerId
        ) || null;
    }

    function createActiveTimerPanel() {
        const timer = getActiveTimer();

        if (!isExecutionMode || !timer) {
            return null;
        }

        const panel = document.createElement("div");
        panel.classList.add("modal-overlay", "timer-modal-overlay");

        const modal = document.createElement("div");
        modal.classList.add("modal", "active-timer-panel");

        if (timer.type === "interval") {
            modal.classList.add(
                state.activeWorkoutTimerPhase === "rest"
                    ? "timer-rest"
                    : "timer-work"
            );
        }

        const label = document.createElement("div");
        label.classList.add("detail-label");
        label.textContent = timer.label || "Workout Timer";

        const summary = document.createElement("div");
        summary.classList.add("stats-line");
        summary.textContent = formatTimerSummary(timer);

        let intervalStatus = null;

        if (timer.type === "interval") {
            intervalStatus = document.createElement("div");
            intervalStatus.classList.add("stats-line");
            intervalStatus.textContent = `${state.activeWorkoutTimerPhase === "rest" ? "Rest" : "Work"} · ${state.activeWorkoutTimerRound || 1} of ${timer.rounds || 1}`;
        }

        let phaseBadge = null;

        if (timer.type === "interval") {
            phaseBadge = document.createElement("div");
            phaseBadge.classList.add("timer-phase-badge");

            if (state.activeWorkoutTimerPhase === "rest") {
                phaseBadge.classList.add("rest");
                phaseBadge.textContent = "REST";
            } else {
                phaseBadge.classList.add("work");
                phaseBadge.textContent = "WORK";
            }
        }

        const totalSeconds =
            timer.type === "interval"
                ? timer.workSeconds || 45
                : timer.durationSeconds || 300;

        const remainingSeconds =
            state.activeWorkoutTimerRemainingSeconds ?? totalSeconds;

        function playTimerAlert() {
            console.log("playTimerAlert fired", {
                timerId: timer?.id,
                timerType: timer?.type,
                remaining: state.activeWorkoutTimerRemainingSeconds,
                url: TIMER_SOUND_URL,
            });

            navigator.vibrate?.([200, 100, 200]);

            const audio = getTimerAudio();
            audio.currentTime = 0;
            audio.volume = 1;

            audio.play().catch((error) => {
                console.warn("Timer sound failed:", error);
                logActionFailure("timerAudioPlay", error, {
                    plannedWorkoutId: workout?.id || null,
                    timerId: timer?.id || null,
                    timerType: timer?.type || null,
                    timerStatus: state.activeWorkoutTimerStatus || null,
                    remainingSeconds: state.activeWorkoutTimerRemainingSeconds ?? null,
                    currentView: state.currentView || null,
                    launchMode: state.plannedWorkoutLaunchMode || null,
                });
            });
        }
        if (state.activeWorkoutTimerStatus === "running" && !activeTimerIntervalId) {
            activeTimerIntervalId = setInterval(() => {
                const currentRemaining = state.activeWorkoutTimerRemainingSeconds ?? totalSeconds;

                if (currentRemaining <= 1) {
                    if (timer.type === "interval") {
                        playTimerAlert();

                        const currentRound = state.activeWorkoutTimerRound || 1;
                        const currentPhase = state.activeWorkoutTimerPhase || "work";

                        if (currentPhase === "work") {
                            state.activeWorkoutTimerPhase = "rest";
                            state.activeWorkoutTimerRemainingSeconds = timer.restSeconds ?? 15;
                        } else {
                            if (currentRound >= (timer.rounds || 1)) {
                                state.activeWorkoutTimerRemainingSeconds = 0;
                                state.activeWorkoutTimerStatus = "done";
                                state.activeWorkoutTimerPhase = null;
                                clearActiveTimerInterval();
                            } else {
                                state.activeWorkoutTimerRound = currentRound + 1;
                                state.activeWorkoutTimerPhase = "work";
                                state.activeWorkoutTimerRemainingSeconds = timer.workSeconds || 45;
                            }
                        }

                        renderApp();
                        return;
                    }

                   playTimerAlert();

                    state.activeWorkoutTimerRemainingSeconds = 0;
                    state.activeWorkoutTimerStatus = "done";
                    clearActiveTimerInterval();
                    renderApp();
                    return;
                }

                if (
                    timer.type === "emom" &&
                    currentRemaining !== totalSeconds &&
                    currentRemaining % 60 === 0
                ) {
                    playTimerAlert();
                }

                state.activeWorkoutTimerRemainingSeconds = currentRemaining - 1;
                renderApp();
            }, 1000);
        }

        if (state.activeWorkoutTimerStatus !== "running") {
            clearActiveTimerInterval();
        }

        const clock = document.createElement("div");
        clock.classList.add("active-timer-clock");
        clock.textContent = formatTimerClock(remainingSeconds);
        
        clock.classList.remove("running", "paused", "done");
        clock.classList.add(state.activeWorkoutTimerStatus);
        
        if (timer.type === "interval") {
            clock.classList.add(
                state.activeWorkoutTimerPhase === "rest"
                    ? "timer-rest"
                    : "timer-work"
            );
        }

        const buttonRow = document.createElement("div");
        buttonRow.classList.add("button-row");

        const startButton = document.createElement("button");
        startButton.textContent = state.activeWorkoutTimerStatus === "running"
            ? "Pause"
            : state.activeWorkoutTimerStatus === "done"
                ? "Restart"
                : "Start";

        startButton.addEventListener("click", async () => {
            await unlockTimerAudio();

            const wasDone =
            state.activeWorkoutTimerStatus === "done" ||
            state.activeWorkoutTimerRemainingSeconds === 0;
            
            if (state.activeWorkoutTimerStatus === "running") {
                state.activeWorkoutTimerStatus = "paused";
            } else {
                state.activeWorkoutTimerStatus = "running";

                if (wasDone) {
                    state.activeWorkoutTimerRemainingSeconds = totalSeconds;
                }
            }

            state.activeWorkoutTimerStartedAt = Date.now();

            renderApp();
        });

        const resetButton = document.createElement("button");
        resetButton.classList.add("secondary-button");
        resetButton.textContent = "Reset";

        resetButton.addEventListener("click", () => {
            state.activeWorkoutTimerStatus = "idle";
            state.activeWorkoutTimerStartedAt = null;

            if (timer.type === "interval") {
                state.activeWorkoutTimerPhase = "work";
                state.activeWorkoutTimerRound = 1;
                state.activeWorkoutTimerRemainingSeconds = timer.workSeconds || 45;
            } else {
            state.activeWorkoutTimerRemainingSeconds = totalSeconds;
            state.activeWorkoutTimerPhase = null;
            state.activeWorkoutTimerRound = null;
            }

            renderApp();
        });

        const closeButton = document.createElement("button");
        closeButton.classList.add("secondary-button");
        closeButton.textContent = "Close";

        closeButton.addEventListener("click", () => {
            clearActiveTimerInterval();
            removeActiveTimerModal();

            state.activeWorkoutTimerId = null;
            state.activeWorkoutTimerStatus = "idle";
            state.activeWorkoutTimerStartedAt = null;
            state.activeWorkoutTimerRemainingSeconds = null;
            state.activeWorkoutTimerPhase = null;
            state.activeWorkoutTimerRound = null;
            renderApp();
        });

        buttonRow.append(startButton, resetButton, closeButton);

        modal.append(
            label,
            summary,
            ...(intervalStatus ? [intervalStatus] : []),
            ...(phaseBadge ? [phaseBadge] : []),
            clock,
            buttonRow
        );
        panel.appendChild(modal);

        panel.addEventListener("click", (event) => {
            event.stopPropagation();
        });

        modal.addEventListener("click", (event) => {
            event.stopPropagation();
        });

        return panel;
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

    function buildWorkoutShareText(workout) {
        return [
            workout.title || "Workout",
            "",
            `${formatDate(workout.date)} • ${workout.aoName || "AO"}`,
            "",
            resolvedIntroduction ? `${getWorkoutFieldLabel(state, "introduction").toUpperCase()}\n${resolvedIntroduction}` : "",
            workout.warmorama ? `${getWorkoutFieldLabel(state, "warmorama").toUpperCase()}\n${workout.warmorama}` : "",
            workout.thangs ? `${getWorkoutFieldLabel(state, "thangs").toUpperCase()}\n${workout.thangs}` : "",
            workout.finisher ? `${getWorkoutFieldLabel(state, "finisher").toUpperCase()}\n${workout.finisher}` : "",
            workout.notes ? `${getWorkoutFieldLabel(state, "notes").toUpperCase()}\n${workout.notes}` : ""
        ]
            .filter(Boolean)
            .join("\n\n");
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

    const introductionSection = createDetailSection(
        getWorkoutFieldLabel(state, "introduction"),
        resolvedIntroduction || "",
        { hideIfEmpty: isExecutionMode }
        );
    const warmoramaSection = createDetailSection(getWorkoutFieldLabel(state, "warmorama"), workout.warmorama || "-", { hideIfEmpty: isExecutionMode });
    const thangsSection = createDetailSection(getWorkoutFieldLabel(state, "thangs"), workout.thangs || "-", { hideIfEmpty: isExecutionMode });
    const finisherSection = createDetailSection(getWorkoutFieldLabel(state, "finisher"), workout.finisher || "-", { hideIfEmpty: isExecutionMode });
    const notesSection = createDetailSection(isExecutionMode ? "Closing / Notes" : getWorkoutFieldLabel(state, "notes"), workout.notes || "-", { hideIfEmpty: isExecutionMode });
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

        state.returnToViewAfterPlanner = "plannedWorkoutDetail";
        state.returnToLaunchModeAfterPlanner = isExecutionMode ? "execution" : null;
        

        state.plannedWorkoutLaunchMode = null;
        state.editingPlannedWorkoutId = workout.id;
        navigateTo("workoutPlanner")
    });

    const logButton = document.createElement("button");
    logButton.textContent = isExecutionMode ? "Log This Session" : "Log This Workout";
    logButton.addEventListener("click", () => {
        const sessionDate =
            state.executionContext?.executionDate ||
            workout.date ||
            getTodayDate();

        const session = createSession(sessionDate, workout.aoName);

        const currentMemberId = state.currentUserMemberId || null;

        session.qIds = currentMemberId ? [currentMemberId] : [];
        session.attendeeIds = currentMemberId ? [currentMemberId] : [];
        
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
        navigateTo("session");
    });

    const runWorkoutButton = document.createElement("button");
    runWorkoutButton.classList.add("primary-button");
    runWorkoutButton.textContent = "Run Workout";

    runWorkoutButton.addEventListener("click", () => {
        launchWorkoutExecution(workout);
    });

    function getNextClaimedQSlot() {
        const today = getTodayDate();

        return [...state.qSlots]
            .filter(slot =>
                slot.qUserId === state.currentUserMemberId &&
                slot.date >= today
            )
            .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    }       

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy to New Plan";

    copyButton.addEventListener("click", () => {
        const nextQSlot = getNextClaimedQSlot();
        const nextAo = state.aos.find(ao => ao.id === nextQSlot?.aoId);

        const newWorkout = {
            ...workout,
            id: crypto.randomUUID(),
            date: nextQSlot?.date || getTodayDate(),
            aoName: nextAo?.name || workout.aoName || "",
            createdAt: Date.now(),
            lastModifiedAt: null,
            sourceWorkoutId: workout.id,
            createdByUserId: state.currentUserId,
            isShared: false,
            timers: (workout.timers || []).map(timer => ({
                ...timer,
                id: crypto.randomUUID()
            })),
        };

        state.draftPlannedWorkout = newWorkout;
        state.editingPlannedWorkoutId = null;
        navigateTo("workoutPlanner");
    })

    const isWorkoutOwner = workout.createdByUserId === state.currentUserId;
    const isSharedViewer = state.sharedWorkoutViewMode && !isWorkoutOwner;

    const canEditWorkout = 
        !state.sharedWorkoutViewMode &&
        (
            state.currentUserRole === "admin" ||
            workout.createdByUserId === state.currentUserId
        );

    const canDeleteWorkout = 
        !state.sharedWorkoutViewMode &&
        (
            state.currentUserRole === "admin" ||
            workout.createdByUserId === state.currentUserId
        );

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
                showToast("Failed to delete workout.", "error")
            }
        });
    }

    const preblastButton = document.createElement("button");
    preblastButton.textContent = "Create Preblast";

    preblastButton.addEventListener("click", () => {
        state.selectedPreblastWorkoutId = workout.id;
        state.draftPreblastText = generatePreblast(workout, state.aos);

        logAppEvent({
            type: APP_EVENTS.PREBLAST_GENERATED,
            metadata: {
                plannedWorkoutId: workout.id,
                workoutDate: workout.date || null,
                aoName: workout.aoName || null,
                title: workout.title || null,
                isShared: Boolean(workout.isShared),
            },
        });

        state.hasAddedPreblastForecast = false;
        state.currentView = "preblast";
        renderApp();
    });

    const shareButton = document.createElement("button");
    shareButton.textContent = "Share Workout";

    shareButton.addEventListener("click", async () => {
        const shareText = buildWorkoutShareText(workout);

        try {
            if (navigator.share) {
                const APP_BASE_URL = "https://f3stoner.github.io/f3-app/";

                await navigator.share({
                    title: workout.title || "Workout",
                    text: "Check out this workout in The Q:",
                    url: `${APP_BASE_URL}#?workoutId=${workout.id}`
                });
            } else {
                await navigator.clipboard.writeText(shareText);
                showToast("Workout copied to clipboard.", "success");
            }
        } catch (error) {
            if (error.name === "AbortError") return;

            console.error("Failed to share workout:", error);
            showToast("Failed to share workout.", "error");

            logActionFailure("shareWorkout", error, {
                plannedWorkoutId: workout?.id || null,
                title: workout?.title || null,
                workoutDate: workout?.date || null,
                aoName: workout?.aoName || null,
                isShared: Boolean(workout?.isShared),
                usedNativeShare: Boolean(navigator.share),
            });
        }
    });

    const primaryActionsRow = document.createElement("div");
    primaryActionsRow.classList.add("button-row", "primary-actions-row");

    const secondaryActionsRow = document.createElement("div");
    secondaryActionsRow.classList.add("button-row", "secondary-actions-row");

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
        primaryActionsRow.append(runWorkoutButton);

        if (canEditWorkout) {
            secondaryActionsRow.append(editButton);
        }

        if (isSharedViewer) {
            copyButton.textContent = "Save to My Planner";
            secondaryActionsRow.append(copyButton);
        } else {
            secondaryActionsRow.append(logButton, preblastButton, shareButton, copyButton);
        }

        if (canDeleteWorkout && deleteButton) {
            secondaryActionsRow.append(deleteButton);
        }
    }

    const header = document.createElement("div");
    header.classList.add("view-header", "workout-detail-header");

    const headerTopRow = document.createElement("div");
    headerTopRow.classList.add("view-header-top-row");

    const headerActions = document.createElement("div");
    headerActions.classList.add("view-header-actions");

    if (canEditWorkout) {
        const headerEditButton = document.createElement("button");
        headerEditButton.type = "button";
        headerEditButton.classList.add("secondary-button");
        headerEditButton.textContent = "Edit";

        headerEditButton.addEventListener("click", () => {
            editButton.click();
        });

        headerActions.appendChild(headerEditButton);
    }

    headerTopRow.append(backButton, headerActions)
    header.append(headerTopRow, title);

    const activeTimerPanel = createActiveTimerPanel();

    app.append(
        header,
        ...(executionBanner ? [executionBanner] : []),
        ...(dateSection ? [dateSection] : []),
        ...(aoSection ? [aoSection] : []),
        ...(!isExecutionMode ? [visibilitySection] : []),
        ...(!isExecutionMode && sourceSection ? [sourceSection] : []),
        ...(introductionSection ? [introductionSection] : []),
        ...(warmoramaSection ? [warmoramaSection] : []),
        ...createTimerButtonsForSection("warmorama"),
        ...(thangsSection ? [thangsSection] : []),
        ...createTimerButtonsForSection("thangs"),
        ...(finisherSection ? [finisherSection] : []),
        ...createTimerButtonsForSection("finisher"),
        ...(notesSection ? [notesSection] : []),
        primaryActionsRow,
        ...(secondaryActionsRow.childElementCount > 0 ? [secondaryActionsRow] : []),
    );

    if (activeTimerPanel) {
        document.body.appendChild(activeTimerPanel);
    }
}
