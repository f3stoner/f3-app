import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { insertAo, updateAoInCloud } from "../services/cloudData.js";

const DAY_OPTIONS = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
];

export function renderAoEditView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const isEditing = Boolean(state.editingAoId);
    const existingAo = isEditing
    ? state.aos.find(ao => ao.id === state.editingAoId)
    : null;

    const draftAo = existingAo
    ? { ...existingAo, daysOfWeek: [...(existingAo.daysOfWeek || [])] }
    : {
        id: crypto.randomUUID(),
        name: "",
        locationName: "",
        daysOfWeek: [],
        time: "05:30",
        isActive: true,
        createdAt: new Date().toISOString(),
    };

    const title = document.createElement("h1");
    title.textContent = isEditing ? "Edit AO" : "Add AO";

    const nameLabel = document.createElement("div");
    nameLabel.classList.add("detail-label");
    nameLabel.textContent = "AO Name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = draftAo.name || "";

    nameInput.addEventListener("input", (event) => {
        draftAo.name = event.target.value;
    });

    const locationLabel = document.createElement("div");
    locationLabel.classList.add("detail-label");
    locationLabel.textContent = "Location Name";

    const locationInput = document.createElement("input");
    locationInput.type = "text";
    locationInput.value = draftAo.locationName || "";

    locationInput.addEventListener("input", (event) => {
        draftAo.locationName = event.target.value;
    });

    const timeLabel = document.createElement("div");
    timeLabel.classList.add("detail-label");
    timeLabel.textContent = "Time";

    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.value = draftAo.time || "";

    timeInput.addEventListener("input", (event) => {
        draftAo.time = event.target.value;
    });

    const daysLabel = document.createElement("div");
    daysLabel.classList.add("detail-label");
    daysLabel.textContent = "Days of Week";

    const daysWrap = document.createElement("div");
    daysWrap.classList.add("section", "ao-days-grid");

    DAY_OPTIONS.forEach(day => {
        const label = document.createElement("label");
        label.classList.add("ao-day-option");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = draftAo.daysOfWeek.includes(day.value);

        checkbox.addEventListener("change", (event) => {
            if (event.target.checked) {
                if (!draftAo.daysOfWeek.includes(day.value)) {
                    draftAo.daysOfWeek.push(day.value);
                }
            } else {
                draftAo.daysOfWeek = draftAo.daysOfWeek.filter(value => value !== day.value);
            }

            draftAo.daysOfWeek.sort((a, b) => a - b);
        });

        label.append(checkbox, document.createTextNode(` ${day.label}`));
        daysWrap.appendChild(label);
    });

    const activeLabel = document.createElement("div");
    activeLabel.classList.add("detail-label");
    activeLabel.textContent = "Status";

    const activeWrap = document.createElement("label");
    activeWrap.classList.add("ao-status-toggle");

    const activeInput = document.createElement("input");
    activeInput.type = "checkbox";
    activeInput.checked = draftAo.isActive ?? true;

    activeInput.addEventListener("change", (event) => {
        draftAo.isActive = event.target.checked;
    });

    activeWrap.append(activeInput, document.createTextNode(" Active"));

    const statusRow = document.createElement("div");
    statusRow.classList.add("ao-status-row");
    statusRow.append(activeWrap);

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save AO";

    saveButton.addEventListener("click", async () => {
        if (!draftAo.name.trim()) {
            alert("Please enter an AO name.");
            return;
        }

        if (!draftAo.daysOfWeek.length) {
            alert("Please select at least one day.");
            return;
        }

        const activeRegionId = state.currentRegionId;
        if (!activeRegionId) {
            alert("No active region found.");
            return;
        }

        draftAo.name = draftAo.name.trim();
        draftAo.locationName = draftAo.locationName.trim();

        try {
            if (isEditing) {
                const savedAo = await updateAoInCloud(activeRegionId, draftAo);
                const index = state.aos.findIndex(ao => ao.id === savedAo.id);

                if (index !== -1) {
                    state.aos[index] = savedAo;
                }
            } else {
                const savedAo = await insertAo(activeRegionId, draftAo);
                state.aos.push(savedAo);
            }

            state.editingAoId = null;
            state.currentView = "aoManagement";
            renderApp();
        } catch (error) {
            console.error("Failed to save AO:", error);
            alert("Failed to save AO.");
        }
    });

    const saveRow = document.createElement("div");
    saveRow.classList.add("button-row", "ao-save-row");
    saveRow.append(saveButton);

    const nav = createGlobalNav();

    app.append(
        title,
        nameLabel,
        nameInput,
        locationLabel,
        locationInput,
        timeLabel,
        timeInput,
        daysLabel,
        daysWrap,
        activeLabel,
        statusRow,
        saveRow,
        nav
    );
}
