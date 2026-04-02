import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { generateBackblast } from "../modules/backblast.js";
import { createGlobalNav } from "../components/globalNav.js";
import { createPlannedWorkout } from "../modules/plannedWorkouts.js";
import { addMember, deleteSession } from "../services/appData.js";

export function renderSessionDetail() {
    const app = document.getElementById("app");
    app.textContent = "";

    const session = state.sessions.find(s => s.id === state.selectedSessionId);
    const backButton = document.createElement("button");
    backButton.classList.add("secondary-button");
    backButton.textContent = "Back to Session History";
    backButton.addEventListener("click", () => {
        state.currentView = "sessionHistory";
        renderApp();
    })

    if (!session) {
        app.textContent = "No Session Found";
        app.append(backButton);
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
        ? paxNamesArray.join(",\n") 
        : "-";

    const notesText = session.notes && session.notes !== session.workout?.thangs
        ? session.notes 
        : "-";

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

    summaryCard.append(summaryTitle, summaryMeta, summaryQ);

    function createDetailSection (labelText, valueText) {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = labelText;
        label.classList.add("detail-label");

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
        label.classList.add("detail-label");

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

                const alreadyOnRoster = Boolean(fng.memberId) || state.members.some(m => m.realName === fng.realName);

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
                        fng.memberId = newMember.id;

                        addButton.textContent = "On Roster";
                        addButton.disabled = true;
                    } catch (error) {
                        console.error("Failed to add member:", error);
                        alert("Failed to add member to roster.");
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
        label.classList.add("detail-label");

        const value = document.createElement("div");
        value.classList.add("detail-value");

        const workout = session.workout;

        if (!workout) {
            value.textContent = session.notes || "-";
        } else {
            const parts = [];

        if (workout.title) {
            parts.push(`Title: ${workout.title}`);
        }

        if (workout.warmorama) {
            parts.push(`Warm-O-Rama:\n${workout.warmorama}`);
        }

        if (workout.thangs) {
            parts.push(`Thangs:\n${workout.thangs}`);
        }

        if (workout.finisher) {
            parts.push(`Mary / Finisher:\n${workout.finisher}`);
        }

        if (workout.notes) {
            parts.push(`Planner Notes:\n${workout.notes}`);
        }

        value.textContent = parts.length > 0
            ? parts.join("\n\n")
            : "-";
        }

        section.append(label, value);
        return section;
    }

    const dateSection = createDetailSection("Date", formattedDate);
    const aoSection = createDetailSection("AO", session.aoName);
    const qSection = createDetailSection("Q", qLabel);
    const paxSection = createDetailSection(`PAX (${paxNamesArray.length})`, paxNames);
    const fngSection = createFngSection();
    const workoutSection = createWorkoutSection();
    const notesSection = createDetailSection("Notes", notesText);

    const backblastButton = document.createElement("button");
    backblastButton.textContent = "Generate Backblast";
    backblastButton.addEventListener("click", () => {
        const backblast = generateBackblast(session, state.members);
        renderBackblastModal(backblast);
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

        newWorkout.sourceSessionId = session.id;
        newWorkout.lastModifiedAt = Date.now();

        state.draftPlannedWorkout = newWorkout;
        state.editingPlannedWorkoutId = null;
        state.currentView = "workoutPlanner";
        renderApp();
    });

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Session";
    editButton.addEventListener("click", () => {
        state.editingSessionId = session.id;
        state.currentView = "session";
        renderApp();
    })

    const primaryActionsRow = document.createElement("div");
    primaryActionsRow.classList.add("button-row", "primary-actions-row");

    const secondaryActionsRow = document.createElement("div");
    secondaryActionsRow.classList.add("button-row", "secondary-actions-row");

    const backRow = document.createElement("div");
    backRow.classList.add("button-row", "back-actions-row");


    const nav = createGlobalNav();

    primaryActionsRow.append(backblastButton, editButton);
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
                state.currentView = "dashboard";

                renderApp();
            } catch (error) {
                console.error("Failed to delete session:", error);
                alert("Failed to delete session");
            }
        });

        secondaryActionsRow.appendChild(deleteButton);
    }

    backRow.append(backButton);

    app.append(
        title, 
        summaryCard,
        paxSection, 
        fngSection, 
        workoutSection,
        notesSection, 
        primaryActionsRow,
        secondaryActionsRow,
        backRow,
        nav
    );
    }
}

function renderBackblastModal(backblast) {
    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const title = document.createElement("h2");
    title.textContent = "Backblast Preview";

    const preview = document.createElement("pre");
    preview.textContent = backblast;

    const copyButton = document.createElement("button");
    copyButton.textContent ="Copy Backblast";
    copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(backblast);
        copyButton.textContent = "Copied!";
        setTimeout(() => {
            copyButton.textContent = "Copy Backblast";
        }, 1500);
    });

    const shareButton = document.createElement("button");
    shareButton.textContent = "Share Backblast";

    if (typeof navigator.share !== "function") {
        shareButton.disabled = true;
        shareButton.textContent = "Share Not Available";
    } else {
        shareButton.addEventListener("click", async () => {
            try {
                await navigator.share({ text: backblast });
            } catch (error) {
                console.error("Share failed: ", error);
            }
        });
    }

    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
        overlay.remove();
    });

    overlay.addEventListener("click", () => {
        overlay.remove();
    });

    modal.addEventListener("click", (event) => {
        event.stopPropagation();
    })

    modal.append(title, preview, copyButton, shareButton, closeButton);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}