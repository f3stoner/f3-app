import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { generateBackblast } from "../modules/backblast.js";
import { saveState } from "../utils/storage.js";

export function renderSessionDetail() {
    const app = document.getElementById("app");
    app.textContent = "";

    const session = state.sessions.find(s => s.id === state.selectedSessionId);
    const backButton = document.createElement("button");
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
    title.textContent = "Session Detail";
    const formattedDate = formatDate(session.date);
    const qMember = state.members.find(m => m.id === session.qId);
    const qName = qMember ? qMember.paxName : "-";
    const paxNamesArray = session.attendeeIds.map(id => {
        const member = state.members.find(m => m.id === id);
        return member ? member.paxName : "Unknown";
    });
    const paxNames = paxNamesArray.join(", ");

    const notesText = session.notes ? session.notes : "-";

    function createDetailSection (labelText, valueText) {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = labelText;
        label.classList.add("detail-label");

        const value = document.createElement("div");
        value.textContent = valueText;
        value.classList.add("detail-value");

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
            value.textContent = "None";
        } else {
            session.fngs.forEach((fng) => {
                const row = document.createElement("div");
                row.classList.add("fng-detail-row");

                const displayName = fng.paxName || fng.realName;

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

                addButton.addEventListener("click", () => {
                    const newMember = {
                        id: crypto.randomUUID(),
                        paxName: fng.paxName || fng.realName,
                        realName: fng.realName,
                        homeAo: session.aoName,
                        invitedById: fng.invitedById,
                        firstPostDate: session.date,
                        status: "active",
                    };

                    state.members.push(newMember);
                    fng.memberId = newMember.id;
                    saveState(state);

                    addButton.textContent = "On Roster";
                    addButton.disabled = true;
                });

                row.append(text, addButton);
                value.appendChild(row);
            });   
        }
        section.append(label, value);
        return section;
    }

    const dateSection = createDetailSection("Date", formattedDate);
    const aoSection = createDetailSection("AO", session.aoName);
    const qSection = createDetailSection("Q", qName);
    const paxSection = createDetailSection("PAX", paxNames);
    const fngSection = createFngSection();
    const notesSection = createDetailSection("Notes", notesText);

    const backblastButton = document.createElement("button");
    backblastButton.textContent = "Generate Backblast";
    backblastButton.addEventListener("click", () => {
        const backblast = generateBackblast(session, state.members);
        renderBackblastModal(backblast);
    })

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Session";
    editButton.addEventListener("click", () => {
        state.editingSessionId = session.id;
        state.currentView = "session";
        renderApp();
    })

    app.append(title, dateSection, aoSection, qSection, paxSection, fngSection, notesSection, backblastButton, editButton, backButton);

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

    modal.append(title, preview, copyButton, closeButton);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}