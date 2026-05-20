import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { generateBackblast } from "../modules/backblast.js";
import { createGlobalNav } from "../components/globalNav.js";
import { createPlannedWorkout } from "../modules/plannedWorkouts.js";
import { addMember, deleteSession, updateSession } from "../services/appData.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { getWorkoutFieldLabel } from "../utils/workoutLabels.js";
import { logActionFailure, logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderSessionDetail() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const session = state.sessions.find(s => s.id === state.selectedSessionId);

    const canEditSession =
        session &&
        (
            state.currentUserRole === "admin" ||
            session.createdByUserId === state.currentUserId
        );

        if (!session) {
            app.append(header);
        
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No Session Found";
        
            app.append(empty);
            return;
        
     } else {
    const title = document.createElement("h1");
    title.textContent = "Session";
    const formattedDate = formatDate(session.date);
    const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

    const qNames = effectiveQIds
        .map(qId => state.members.find(m => m.id === qId))
        .filter(Boolean)
        .map(member => member.paxName);
    const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";
    const qIdSet = new Set(effectiveQIds);

    const paxNamesArray = session.attendeeIds
        .filter(id => !qIdSet.has(id))
        .map(id => {
            const member = state.members.find(m => m.id === id);
            return member ? member.paxName : "Unknown";
        });
    const paxNames = paxNamesArray.length > 0 
        ? paxNamesArray.join(", ") 
        : "-";

    const hasStructuredWorkout = Boolean(session.workout);
    const notesText = session.notes ? session.notes : "-";
    const shouldShowNotesSection = 
        hasStructuredWorkout && Boolean(session.notes && session.notes.trim());

    const summaryCard = document.createElement("div");
    summaryCard.classList.add("section", "session-detail-summary");

    const summaryTitle = document.createElement("div");
    summaryTitle.classList.add("member-name");
    summaryTitle.textContent = session.aoName;

    const summaryMeta = document.createElement("div");
    summaryMeta.classList.add("stats-line");
    summaryMeta.textContent = `${formattedDate} • ${session.attendeeIds.length} PAX • ${session.fngs.length} FNGs`;

    const summaryQ = document.createElement("div");
    summaryQ.classList.add("stats-line", "q-line");
    summaryQ.textContent = `Q: ${qLabel}`;

    const summaryWeather = document.createElement("div");
    summaryWeather.classList.add("stats-line");

    if (session.weatherSnapshot) {
        const weather = session.weatherSnapshot;

        const rainLabel =
            typeof weather.precipChance === "number"
                ? `${weather.precipChance}% rain`
                : "rain chance unavailable";

        const windLabel =
            typeof weather.windMph === "number"
                ? `${weather.windMph} mph wind`
                : "wind unavailable";

        summaryWeather.textContent =
            `Conditions: ${weather.temp}° and ${weather.condition}, ${rainLabel}, ${windLabel}`;
    }

    summaryCard.append(
        summaryTitle,
        summaryMeta,
        summaryQ,
        ...(session.weatherSnapshot ? [summaryWeather] : [])
    );

    function createDetailSection (labelText, valueText) {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = labelText;
        label.classList.add("detail-label", "session-detail-label");

        const value = document.createElement("div");
        value.textContent = valueText;
        value.classList.add("detail-value", "session-detail-value");

        section.append(label, value);

        return section;
    }

    function createFngSection() {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = "FNGs";
        label.classList.add("detail-label", "session-detail-label");

        const value = document.createElement("div");
        value.classList.add("detail-value");

        if (session.fngs.length === 0) {
            value.textContent = "No FNGs";
        } else {
            session.fngs.forEach((fng) => {
                const row = document.createElement("div");
                row.classList.add("fng-detail-row");

                const displayName = fng.paxName && fng.realName
                    ? `${fng.paxName} (${fng.realName})`
                    : (fng.paxName || fng.realName || "Unknown");

                let rowText = displayName;

                if (fng.invitedById) {
                    const inviter = state.members.find(m => m.id === fng.invitedById);
                    const inviterName = inviter ? inviter.paxName : "Unknown";
                    rowText += ` (Invited by ${inviterName})`;
                }

                const text = document.createElement("span");
                text.textContent = rowText;

                const existingMember = fng.memberId
                    ? state.members.find(m => m.id === fng.memberId)
                    : null;

                const alreadyOnRoster = Boolean(existingMember);

                const addButton = document.createElement("button");
                addButton.textContent = alreadyOnRoster ? "On Roster" : "Add to Roster";
                addButton.disabled = alreadyOnRoster;

                addButton.addEventListener("click", async () => {
                    const newMember = {
                        id: crypto.randomUUID(),
                        paxName: fng.paxName || fng.realName,
                        realName: fng.realName,
                        homeAo: session.aoName,
                        invitedById: fng.invitedById,
                        firstPostDate: session.date,
                        status: "active",
                    };

                    try{
                        const savedMember = await addMember(newMember);
                        
                        const updatedFngs = (session.fngs || []).map(existingFng => {
                            const isTargetFng =
                            existingFng.realName === fng.realName &&
                            existingFng.paxName === fng.paxName;

                        return isTargetFng
                            ? { ...existingFng, memberId: savedMember.id }
                            : existingFng;
                        });

                        await updateSession(session.id, {
                            ...session,
                            fngs: updatedFngs,
                        });

                        session.fngs = updatedFngs;

                        addButton.textContent = "On Roster";
                        addButton.disabled = true;
                        showToast("FNG added to roster.", "success")

                    } catch (error) {
                        console.error("Failed to add member:", error);
                        showToast("Failed to add member to roster.", "error");
                    }
                });

                row.append(text, addButton);
                value.appendChild(row);
            });   
        }
        section.append(label, value);
        return section;
    }

    function createWorkoutSection() {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = "Workout";
        label.classList.add("detail-label", "session-detail-label");

        const value = document.createElement("div");
        value.classList.add("detail-value");

        const workout = session.workout;

        if (!workout) {
            value.textContent = session.notes || "No workout logged";
        } else {
            const parts = [];

        if (workout.title) {
            parts.push(`Title: ${workout.title}`);
        }

        if (workout.warmorama) {
            parts.push(`${getWorkoutFieldLabel(state, "warmorama")}:\n${workout.warmorama}`);
        }

        if (workout.thangs) {
            parts.push(`${getWorkoutFieldLabel(state, "thangs")}:\n${workout.thangs}`);
        }

        if (workout.finisher) {
            parts.push(`${getWorkoutFieldLabel(state, "finisher")}:\n${workout.finisher}`);
        }

        if (workout.notes) {
            parts.push(`${getWorkoutFieldLabel(state, "notes")}:\n${workout.notes}`);
        }

        value.textContent = parts.length > 0
            ? parts.join("\n\n")
            : "-";
        }

        section.append(label, value);
        return section;
    }

    const paxSection = createDetailSection(`PAX (${paxNamesArray.length})`, paxNames);
    const fngSection = createFngSection();
    const workoutSection = createWorkoutSection();
    const notesSection = createDetailSection("Notes", notesText);

    const backblastButton = document.createElement("button");
    backblastButton.textContent = "Backblast";
    backblastButton.addEventListener("click", () => {
        const usedSavedBackblast = Boolean(session.backblastText);

        state.draftBackblastText =
            session.backblastText ||
            generateBackblast(session, state.members);

        state.draftBackblastMediaFiles = [];
        state.hasAddedBackblastWeather = false;
        navigateTo("backblast");

        try {
            logAppEvent({
                type: APP_EVENTS.BACKBLAST_GENERATED,
                metadata: {
                    sessionId: session.id,
                    sessionDate: session.date || null,
                    aoName: session.aoName || null,
                    paxCount: session.attendeeIds?.length || 0,
                    fngCount: session.fngs?.length || 0,
                    qCount: session.qIds?.length || 0,
                    sourcePlannedWorkoutId: session.sourcePlannedWorkoutId || null,
                    hasWorkout: Boolean(session.workout),
                    usedSavedBackblast,
                },
            });
        } catch (error) {
            console.error("Failed to log backblast generated:", error);
        }
    })

    const copyToPlanButton = document.createElement("button");
    copyToPlanButton.textContent = "Copy to Plan";

    copyToPlanButton.addEventListener("click", () => {
        const newWorkout = createPlannedWorkout(session.date, session.aoName);

        if (session.workout) {
            newWorkout.title = session.workout.title || "";
            newWorkout.warmorama = session.workout.warmorama || "";
            newWorkout.thangs = session.workout.thangs || "";
            newWorkout.finisher = session.workout.finisher || "";
            newWorkout.notes = session.workout.notes || "";
        } else {
            newWorkout.notes = session.notes || "";
        }

        newWorkout.id = crypto.randomUUID();
        newWorkout.createdByUserId = state.currentUserId;
        newWorkout.sourceSessionId = session.id;
        newWorkout.createdAt = Date.now();
        newWorkout.lastModifiedAt = Date.now();

        state.draftPlannedWorkout = newWorkout;
        state.editingPlannedWorkoutId = null;
        state.selectedPlannedWorkoutId = null;
        state.pendingPlannerDate = null;
        state.pendingPlannerAoName = null;
        state.plannedWorkoutLaunchMode = "planning";
        
        navigateTo("workoutPlanner");
    });

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Session";
    editButton.addEventListener("click", () => {
        if (!canEditSession) {
            alert("You can only edit sessions you created.");
            return;
        }

        state.editingSessionId = session.id;
        navigateTo("session");
    });

    const primaryActionsRow = document.createElement("div");
    primaryActionsRow.classList.add("button-row", "primary-actions-row");

    const secondaryActionsRow = document.createElement("div");
    secondaryActionsRow.classList.add("button-row", "secondary-actions-row");

    const nav = createGlobalNav();

    primaryActionsRow.append(backblastButton);
    if (canEditSession) {
        primaryActionsRow.append(editButton);
    }
    secondaryActionsRow.append(copyToPlanButton);

    if (state.currentUserRole === "admin") {
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete Session";
        deleteButton.classList.add("danger-button");

        deleteButton.addEventListener("click", async () => {
            const confirmed = confirm("Are you sure you want to delete this session?");
            if (!confirmed) return;

            try {
                await deleteSession(session.id);

                state.selectedSessionId = null;
                navigateTo("dashboard");
            } catch (error) {
                console.error("Failed to delete session:", error);
                showToast("Failed to delete session", "error");
            }
        });

        secondaryActionsRow.appendChild(deleteButton);
    }

    app.append(
        header,
        title,
        summaryCard,
        paxSection, 
        fngSection, 
        workoutSection,
        ...(shouldShowNotesSection ? [notesSection] : []), 
        primaryActionsRow,
        secondaryActionsRow,
        nav
    );
    }
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}