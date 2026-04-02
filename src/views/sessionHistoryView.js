import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";

export function renderSessionHistory() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Session History";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search sessions...";
    searchInput.classList.add("session-search");
    searchInput.value = state.sessionHistorySearchTerm || "";

    const sessionList = document.createElement("div");

    function createSessionCard(session) {
        const card = document.createElement("div");
    card.classList.add("member-card", "session-history-card");

    const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

    const qNames = effectiveQIds
        .map(qId => state.members.find(m => m.id === qId))
        .filter(Boolean)
        .map(member => member.paxName);

    const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";

    const titleLine = document.createElement("div");
    titleLine.classList.add("member-name");
    titleLine.textContent = session.aoName;

    const dateLine = document.createElement("div");
    dateLine.classList.add("stats-line");
    dateLine.textContent = formatDate(session.date);

    const qLine = document.createElement("div");
    qLine.classList.add("stats-line", "q-line");
    qLine.textContent = `Q: ${qLabel}`;

    const statsLine = document.createElement("div");
    statsLine.classList.add("stats-line");
    statsLine.textContent = `${session.attendeeIds.length} PAX • ${session.fngs.length} FNGs`;

    const previewLine = document.createElement("div");
    previewLine.classList.add("stats-line", "session-preview-line");
    previewLine.textContent =
        session.workout?.title ||
        session.workout?.thangs?.split("\n")[0] ||
        session.notes?.split("\n")[0] ||
        "No workout logged";

    card.append(titleLine, dateLine, qLine, statsLine, previewLine);

    card.addEventListener("click", () => {
        state.selectedSessionId = session.id;
        state.currentView = "sessionDetail";
        renderApp();
    });

    return card;
}

    function renderSessionList() {

        sessionList.textContent = "";

        const searchTerm = (state.sessionHistorySearchTerm || "").trim().toLowerCase();

        const filteredSessions = state.sessions.filter((session) => {
            if (!searchTerm) return true;

            const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

            const qNames = effectiveQIds
                .map(qId => state.members.find(m => m.id === qId))
                .filter(Boolean)
                .map(member => member.paxName.toLowerCase())
                .join(" ");

            const paxNames = session.attendeeIds
                .map(id => state.members.find(m => m.id === id))
                .filter(Boolean)
                .map(member => member.paxName.toLowerCase())
                .join(" ");

            const aoName = (session.aoName || "").toLowerCase();
            const notes = (session.notes || "").toLowerCase();
            const workoutTitle = (session.workout?.title || "").toLowerCase();
            const workoutPreview = (session.workout?.thangs?.split("\n")[0]  || "").toLowerCase();
            const formattedDate = formatDate(session.date).toLowerCase();
            const rawDate = (session.date || "").toLowerCase();

            return (
                aoName.includes(searchTerm) ||
                qNames.includes(searchTerm) ||
                paxNames.includes(searchTerm) ||
                notes.includes(searchTerm) ||
                workoutTitle.includes(searchTerm) ||
                workoutPreview.includes(searchTerm) ||
                formattedDate.includes(searchTerm) ||
                rawDate.includes(searchTerm)
            );
        });

        const sortedSessions = [...filteredSessions].sort((a, b) => {
            if (a.date !== b.date) {
                return b.date.localeCompare(a.date);
            }

            const aCreatedAt = a.createdAt || 0;
            const bCreatedAt = b.createdAt || 0;

            return bCreatedAt - aCreatedAt;
        })
        if (sortedSessions.length === 0) {
            sessionList.textContent = searchTerm
                ? "No matching sessions found"            
                : "No sessions saved yet";
            return;
        } 

        let lastDate = null;

        sortedSessions.forEach((session) => {
            if (session.date !== lastDate) {
                const dateHeader = document.createElement("div");
                dateHeader.classList.add("detail-label", "session-date-divider");
                dateHeader.textContent = formatDate(session.date);

                sessionList.appendChild(dateHeader);
                lastDate = session.date;
            }
            sessionList.appendChild(createSessionCard(session));
            });
        }
    searchInput.addEventListener("input", (event) => {
        state.sessionHistorySearchTerm = event.target.value;
        renderSessionList();
    });

    const backButton = document.createElement("button");
    backButton.textContent = "Back to Dashboard";
    backButton.addEventListener("click", () => {
        state.currentView = "dashboard";
        renderApp();
    });

    const nav = createGlobalNav();

    renderSessionList();

    app.append(title, searchInput, sessionList, backButton, nav);
}