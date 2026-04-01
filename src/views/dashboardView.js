import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { importData } from "../utils/importData.js";
import { exportState } from "../utils/export.js";
import { createGlobalNav } from "../components/globalNav.js";

export function renderDashboard() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = state.regionName || "F3 App";

    const isAdmin = state.currentUserRole === "admin";

    if (isAdmin) {
        const adminBadge = document.createElement("div");
        adminBadge.textContent ="Admin";
        adminBadge.classList.add("detail-label");
        app.append(adminBadge);
    }

    const recentSessionsSection = document.createElement("div");
    const recentHeading = document.createElement("h2");
    const recentSessionList = document.createElement("div");
    recentHeading.textContent = "Recent Sessions";
    recentSessionsSection.append(recentHeading);
    const sortedSessions = [...state.sessions].sort((a,b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
        }

        const aCreatedAt = a.createdAt || 0;
        const bCreatedAt = b.createdAt || 0;

        return bCreatedAt - aCreatedAt;
    })
    if (state.sessions.length === 0) {
        recentSessionList.textContent = "No sessions saved yet";
    } else {
        sortedSessions.slice(0, 3).forEach((session) => {
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
            })
            recentSessionList.appendChild(sessionDetail);
        })
    }
    recentSessionsSection.append(recentSessionList);

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json";
    importInput.style.display = "none";

    const importButton = document.createElement("button");
    importButton.textContent = "Import Data";

    importButton.addEventListener("click", () => {
        importInput.click();
    });

    importInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            importData(data);
            renderApp();
        } catch (error) {
            console.error("Import failed:", error);
            alert("Import failed. Please choose a valid JSON file.");
        }

        importInput.value = "";
    })

    const exportButton = document.createElement("button");
    exportButton.textContent = "Export Data";

    exportButton.addEventListener("click", () => {
        exportState(state);
        alert("Data exported!");
    });

    const dataToolsHeading = document.createElement("div");
    dataToolsHeading.textContent = "Data Tools";
    dataToolsHeading. classList.add("detail-label");

    const dataToolsRow = document.createElement("div");
    dataToolsRow.classList.add("button-row");

    if(isAdmin){
    dataToolsRow.append(importButton, exportButton);
    }

    const nav = createGlobalNav();

    app.append(title);

    if (isAdmin) {
        app.append(dataToolsHeading, dataToolsRow, importInput);
    }
    app.append(recentSessionsSection, nav);
}