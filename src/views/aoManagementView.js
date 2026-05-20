import { renderApp } from "../index.js";
import { state } from "../modules/state.js";
import { createGlobalNav } from "../components/globalNav.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderAoManagementView() {
const app = document.getElementById("app");
app.textContent = "";

cleanupMainMenu();

const header = createAppHeader({
    title: "",
    showBack: true,
    fallbackView: "adminSettings",
    showMenu: true,
});

const title = document.createElement("h1");
title.textContent = "AO Management";

const addAoButton = document.createElement("button");
addAoButton.textContent = "Add AO";
addAoButton.addEventListener("click", () => {
    state.editingAoId = null;
    navigateTo("aoEdit");
});

const actionRow = document.createElement("div");
actionRow.classList.add("button-row");
actionRow.append(addAoButton);

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const sortedAos = [...state.aos].sort((a, b) => {
    if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
});

const listContainer = document.createElement("div");

if (sortedAos.length === 0) {
    const empty = document.createElement("div");
    empty.classList.add("detail-value");
    empty.textContent = "No AOs yet";
    listContainer.appendChild(empty);
} else {
    sortedAos.forEach((ao) => {
        const card = document.createElement("div");
        card.classList.add("member-card", "ao-card");
        if (!ao.isActive) {
            card.classList.add("inactive-card");
        }

        const nameLine = document.createElement("div");
        nameLine.classList.add("member-name");
        nameLine.textContent = ao.name || "Unnamed AO";

        const scheduleLine = document.createElement("div");
        scheduleLine.classList.add("stats-line");

        const dayText = ao.daysOfWeek?.length
            ? ao.daysOfWeek.map(day => DAY_LABELS[day]).join(", ")
            : "No days selected";

        const timeText = ao.time || "No time set";

        scheduleLine.textContent = `${dayText} • ${timeText}`;

        const locationLine = document.createElement("div");
        locationLine.classList.add("stats-line");
        locationLine.textContent = ao.locationName || "No location set";

        const statusLine = document.createElement("div");
        statusLine.classList.add("stats-line");
        statusLine.textContent = ao.isActive ? "Active" : "Inactive";

        if (!ao.isActive) {
            statusLine.classList.add("inactive-text");
        }

        const cardContent = document.createElement("div");
        cardContent.classList.add("ao-card-content");

        cardContent.append(nameLine, scheduleLine, locationLine);

        const statusWrap = document.createElement("div");
        statusWrap.classList.add("ao-card-status");
        statusWrap.append(statusLine);

        card.append(cardContent, statusWrap);


        card.addEventListener("click", () => {
            state.editingAoId = ao.id;
            navigateTo("aoEdit");
        });

        listContainer.appendChild(card);
    });
}

const nav = createGlobalNav();

app.append(
    header,
    title,
    actionRow,
    listContainer,
    nav,
);
if (state.isMainMenuOpen) {
    document.body.appendChild(createMainMenu());
}
}