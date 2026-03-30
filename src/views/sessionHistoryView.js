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
    searchInput.value = state.sessionHistorySearchTerm || "";

    const sessionList = document.createElement("div");

    function renderSessionList() {

        sessionList.textContent = "";

        const searchTerm = (state.sessionHistorySearchTerm || "").trim().toLowerCase();

        const filteredSessions = state.sessions.filter((session) => {
            if (!searchTerm) return true;

            const qMember = state.members.find(m => m.id === session.qId);
            const qName = (qMember?.paxName || "").toLowerCase();

            const paxNames = session.attendeeIds
                .map(id => state.members.find(m => m.id === id))
                .filter(Boolean)
                .map(member => member.paxName.toLowerCase())
                .join(" ");

            const aoName = (session.aoName || "").toLowerCase();
            const notes = (session.notes || "").toLowerCase();
            const formattedDate = formatDate(session.date).toLowerCase();
            const rawDate = (session.date || "").toLowerCase();

            return (
                aoName.includes(searchTerm) ||
                qName.includes(searchTerm) ||
                paxNames.includes(searchTerm) ||
                notes.includes(searchTerm) ||
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
        sortedSessions.forEach((session) => {
            const sessionDetail = document.createElement("div");
            const qMember = state.members.find(m => m.id === session.qId);
            const qName = qMember ? qMember.paxName : "-";

            sessionDetail.textContent = `${formatDate(session.date)} - ${session.aoName} | Q: ${qName} | ${session.attendeeIds.length} PAX | ${session.fngs.length} FNGs`;
            sessionDetail.classList.add("section");
            sessionDetail.classList.add("member-card");

            sessionDetail.addEventListener("click", () => {
                    state.selectedSessionId = session.id;
                    state.currentView = "sessionDetail";
                    renderApp();
                });

                sessionList.appendChild(sessionDetail);
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