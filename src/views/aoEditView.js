import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { insertAo, updateAoInCloud, deleteUpcomingQSlotsForAo, deleteQSlotsByIds } from "../services/cloudData.js";
import { generateQSlotsForCurrentRegion } from "../services/qSlotGeneration.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { getTodayDate } from "../utils/date.js";
import { showToast } from "../utils/toast.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";

const DAY_OPTIONS = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
];

const EMPHASIS_OPTIONS = [
    { value: "", label: "None" },
    { value: "heavy", label: "Heavy/Sandbag"},
    { value: "upper", label: "Upper" },
    { value: "lower", label: "Lower" },
    { value: "core", label: "Core" },
    { value: "cardio", label: "Cardio" },
    { value: "bootcamp", label: "Bootcamp" },
    { value: "ruck", label: "Ruck" },
    { value: "run", label: "Run" },
    { value: "30/30", label: "30/30" },
    { value: "benchmark", label: "Benchmark"},
    { value: "murph_training", label: "Murph Training"},
    { value: "stairs", label: "Stairs"},
];

export function renderAoEditView() {

    function sameDaysOfWeek(a = [], b = []) {
        if (a.length !== b.length) return false;

        const sortedA = [...a].sort((x, y) => x - y);
        const sortedB = [...b].sort((x, y) => x - y);

        return sortedA.every((day, index) => day === sortedB[index]);
    }

    function getDayOfWeekFromDateKey(dateKey) {
        const [year, month, day] = dateKey.split("-").map(Number);
        return new Date(year, month - 1, day).getDay();
    }

    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (!hasPermission(PERMISSIONS.MANAGE_AOS)) {
        app.textContent = "You do not have permission to edit AOs.";
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "aoManagement",
        showMenu: true,
    });

    const isEditing = Boolean(state.editingAoId);
    const existingAo = isEditing
    ? state.aos.find(ao => ao.id === state.editingAoId)
    : null;

    const draftAo = existingAo
    ? { 
        ...existingAo, 
        daysOfWeek: [...(existingAo.daysOfWeek || [])],
        emphasisSchedule: { ...(existingAo.emphasisSchedule || {}) },
        timeSchedule: { ...(existingAo.timeSchedule || {}) },
     }
    : {
        id: crypto.randomUUID(),
        name: "",
        locationName: "",
        address: "",
        mapUrl: "",
        latitude: null,
        longitude: null,
        weatherLocationLabel: "",
        weatherEnabled: false,
        emphasisSchedule: {},
        daysOfWeek: [],
        time: "05:30",
        isActive: true,
        createdAt: new Date().toISOString(),
        timeSchedule: {},
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

    const addressLabel = document.createElement("div");
    addressLabel.classList.add("detail-label");
    addressLabel.textContent = "Address";

    const addressInput = document.createElement("input");
    addressInput.type = "text";
    addressInput.placeholder = "Street address, city, state";
    addressInput.value = draftAo.address || "";

    addressInput.addEventListener("input", (event) => {
        draftAo.address = event.target.value;
    });

    const latitudeLabel = document.createElement("div");
    latitudeLabel.classList.add("detail-label");
    latitudeLabel.textContent = "Latitude";

    const latitudeInput = document.createElement("input");
    latitudeInput.type = "number";
    latitudeInput.step = "any";
    latitudeInput.placeholder = "Example: 30.1669";
    latitudeInput.value = draftAo.latitude ?? "";

    latitudeInput.addEventListener("input", (event) => {
        draftAo.latitude = event.target.value;
    });

    const longitudeLabel = document.createElement("div");
    longitudeLabel.classList.add("detail-label");
    longitudeLabel.textContent = "Longitude";

    const longitudeInput = document.createElement("input");
    longitudeInput.type = "number";
    longitudeInput.step = "any";
    longitudeInput.placeholder = "Example: -96.3977";
    longitudeInput.value = draftAo.longitude ?? "";

    longitudeInput.addEventListener("input", (event) => {
        draftAo.longitude = event.target.value;
    });

    const weatherLocationLabel = document.createElement("div");
    weatherLocationLabel.classList.add("detail-label");
    weatherLocationLabel.textContent = "Weather Location Label";

    const weatherLocationInput = document.createElement("input");
    weatherLocationInput.type = "text";
    weatherLocationInput.placeholder = "Example: Brenham, TX";
    weatherLocationInput.value = draftAo.weatherLocationLabel || "";

    weatherLocationInput.addEventListener("input", (event) => {
        draftAo.weatherLocationLabel = event.target.value;
    });

    const weatherEnabledLabel = document.createElement("div");
    weatherEnabledLabel.classList.add("detail-label");
    weatherEnabledLabel.textContent = "Weather";

    const weatherEnabledWrap = document.createElement("label");
    weatherEnabledWrap.classList.add("ao-status-toggle");

    const weatherEnabledInput = document.createElement("input");
    weatherEnabledInput.type = "checkbox";
    weatherEnabledInput.checked = draftAo.weatherEnabled ?? false;

    weatherEnabledInput.addEventListener("change", (event) => {
        draftAo.weatherEnabled = event.target.checked;
    });

    weatherEnabledWrap.append(weatherEnabledInput, document.createTextNode(" Enable weather for this AO"));

    const weatherEnabledRow = document.createElement("div");
    weatherEnabledRow.classList.add("ao-status-row");
    weatherEnabledRow.append(weatherEnabledWrap);

    const PATTERN_OPTIONS = [
        { value: "fixed", label: "Fixed" },
        { value: "alternating-weeks", label: "Alternating Weeks" },
    ];

    function createEmphasisSelect(value = "") {
        const select = document.createElement("select");
    
        EMPHASIS_OPTIONS.forEach(option => {
            const optionEl = document.createElement("option");
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            select.appendChild(optionEl);
        });
    
        select.value = value || "";
    
        return select;
    }

    function createEmphasisRuleForDay(dayValue) {
        return draftAo.emphasisSchedule?.[String(dayValue)] || {
            pattern: "fixed",
            values: [],
            startsOnDate: null,
        };
    }

    function formatEmphasisValues(values = []) {
        return values
            .map(value => {
                const option = EMPHASIS_OPTIONS.find(option => option.value === value);
                return option?.label || value;
            })
            .join(", ");
    }
    
    const emphasisRowsByDay = {};
    
    const emphasisLabel = document.createElement("div");
    emphasisLabel.classList.add("detail-label");
    emphasisLabel.textContent = "Weekly Emphasis Schedule";
    
    const emphasisWrap = document.createElement("div");
    emphasisWrap.classList.add("section");
    
    DAY_OPTIONS.forEach(day => {
        const dayKey = String(day.value);
        const rule = createEmphasisRuleForDay(day.value);
    
        const row = document.createElement("div");
        row.classList.add("form-row");
        row.classList.add("emphasis-day-card");
        row.dataset.dayValue = String(day.value);
        emphasisRowsByDay[String(day.value)] = row;

        row.hidden = !draftAo.daysOfWeek.includes(day.value);
    
        const dayLabel = document.createElement("div");
        dayLabel.classList.add("detail-label");
        dayLabel.textContent = day.label;
    
        const patternSelect = document.createElement("select");
    
        PATTERN_OPTIONS.forEach(option => {
            const optionEl = document.createElement("option");
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            patternSelect.appendChild(optionEl);
        });
    
        patternSelect.value = rule.pattern || "fixed";
    
        const valuesLabel = document.createElement("div");
        valuesLabel.classList.add("detail-label");
        valuesLabel.textContent = patternSelect.value === "alternating-weeks"
            ? "Rotation Order"
            : "Emphasis";
    
        const valuesWrap = document.createElement("div");
        valuesWrap.classList.add("emphasis-values-wrap");

        function renderValueSelectors() {
            valuesWrap.textContent = "";

            const isAlternating = patternSelect.value === "alternating-weeks";
            const values = rule.values?.length ? [...rule.values] : [""];

            if (!isAlternating) {
                const select = createEmphasisSelect(values[0] || "");
                select.addEventListener("change", syncRule);
                valuesWrap.appendChild(select);
                return;
            }

            values.forEach(value => {
                const row = document.createElement("div");
                row.classList.add("emphasis-value-row");

                const select = createEmphasisSelect(value);

                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.textContent = "x";
                removeButton.classList.add("secondary-button");
                removeButton.setAttribute("aria-label", "Remove rotation");

                select.addEventListener("change", syncRule);

                removeButton.addEventListener("click", () => {
                    row.remove();
                    syncRule();
                });

                row.append(select, removeButton);
                valuesWrap.appendChild(row);
            });

            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.textContent = "Add Rotation";
            addButton.classList.add("secondary-button", "emphasis-add-button");

            addButton.addEventListener("click", () => {
                const row = document.createElement("div");
                row.classList.add("emphasis-value-row");

                const select = createEmphasisSelect("");

                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.textContent = "Remove";
                removeButton.classList.add("secondary-button");

                select.addEventListener("change", syncRule);

                removeButton.addEventListener("click", () => {
                    row.remove();
                    syncRule();
                });

                row.append(select, removeButton);
                valuesWrap.insertBefore(row, addButton);
            });

            valuesWrap.appendChild(addButton);
        }
        
        const startsOnLabel = document.createElement("div");
        startsOnLabel.classList.add("detail-label");
        startsOnLabel.textContent = "Rotation Start Date";
    
        const startsOnInput = document.createElement("input");
        startsOnInput.type = "date";
        startsOnInput.value = rule.startsOnDate || "";
    
        function updateAlternatingVisibility() {
            const isAlternating = patternSelect.value === "alternating-weeks";
    
            startsOnLabel.style.display = isAlternating ? "" : "none";
            startsOnInput.style.display = isAlternating ? "" : "none";
    
            valuesLabel.textContent = isAlternating ? "Rotation Order" : "Emphasis";
            
            renderValueSelectors();
        }
    
        function syncRule() {
            const values = [...valuesWrap.querySelectorAll("select")]
                .map(select => select.value)
                .filter(Boolean);
        
            if (!values.length) {
                delete draftAo.emphasisSchedule[dayKey];
                return;
            }
        
            const isAlternating = patternSelect.value === "alternating-weeks";
        
            draftAo.emphasisSchedule[dayKey] = {
                pattern: patternSelect.value || "fixed",
                values,
                startsOnDate: isAlternating
                    ? startsOnInput.value || null
                    : null,
            };
        
            rule.pattern = draftAo.emphasisSchedule[dayKey].pattern;
            rule.values = values;
            rule.startsOnDate = draftAo.emphasisSchedule[dayKey].startsOnDate;
        
            updateAlternatingVisibility();
        }
    
        patternSelect.addEventListener("change", syncRule);
        startsOnInput.addEventListener("input", syncRule);
    
        updateAlternatingVisibility();
    
        row.append(
            dayLabel,
            patternSelect,
            valuesLabel,
            valuesWrap,
            startsOnLabel,
            startsOnInput
        );
    
        emphasisWrap.appendChild(row);
    });    /*const mapUrlLabel = document.createElement("div");
    mapUrlLabel.classList.add("detail-label");
    mapUrlLabel.textContent = "Map Link";

    const mapUrlInput = document.createElement("input");
    mapUrlInput.type = "url";
    mapUrlInput.placeholder = "Google Maps Link";
    mapUrlInput.value = draftAo.mapUrl || "";

    mapUrlInput.addEventListener("input", (event) => {
        draftAo.mapUrl = event.target.value;
    }); */

    const timeLabel = document.createElement("div");
    timeLabel.classList.add("detail-label");
    timeLabel.textContent = "Default Time";

    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.value = draftAo.time || "";

    timeInput.addEventListener("input", (event) => {
        draftAo.time = event.target.value;
    });

    const daysLabel = document.createElement("div");
    daysLabel.classList.add("detail-label");
    daysLabel.textContent = "Recurring Days";

    const daysWrap = document.createElement("div");
    daysWrap.classList.add("section", "ao-days-grid");

    const timeScheduleLabel = document.createElement("div");
    timeScheduleLabel.classList.add("detail-label");
    timeScheduleLabel.textContent = "Day-Specific Times";

    const timeScheduleWrap = document.createElement("div");
    timeScheduleWrap.classList.add("section");

    const timeRowsByDay = {};

    DAY_OPTIONS.forEach(day => {
        const dayKey = String(day.value);

        const row = document.createElement("div");
        row.classList.add("form-row", "ao-time-day-card");
        row.hidden = !draftAo.daysOfWeek.includes(day.value);
        timeRowsByDay[dayKey] = row;

        const label = document.createElement("div");
        label.classList.add("detail-label");
        label.textContent = day.label;

        const input = document.createElement("input");
        input.type = "time";
        input.value = draftAo.timeSchedule?.[dayKey] || "";

        input.addEventListener("input", event => {
            const value = event.target.value;

            if (value) {
                draftAo.timeSchedule[dayKey] = value;
            } else {
                delete draftAo.timeSchedule[dayKey];
            }
        });

        row.append(label, input);
        timeScheduleWrap.appendChild(row);
    });

    DAY_OPTIONS.forEach(day => {
        const label = document.createElement("label");
        label.classList.add("ao-day-option");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = draftAo.daysOfWeek.includes(day.value);

        checkbox.addEventListener("change", (event) => {
            const dayKey = String(day.value);

            const timeRow = timeRowsByDay[dayKey];

            if (timeRow) {
                timeRow.hidden = !event.target.checked;
            }

            if (!event.target.checked) {
                delete draftAo.timeSchedule[dayKey];
            }
        
            if (event.target.checked) {
                if (!draftAo.daysOfWeek.includes(day.value)) {
                    draftAo.daysOfWeek.push(day.value);
                }
            } else {
                draftAo.daysOfWeek = draftAo.daysOfWeek.filter(value => value !== day.value);
                delete draftAo.emphasisSchedule[dayKey];
            }
        
            draftAo.daysOfWeek.sort((a, b) => a - b);
        
            const emphasisRow = emphasisRowsByDay[dayKey];
        
            if (emphasisRow) {
                emphasisRow.hidden = !event.target.checked;
            }
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
        if (saveButton.disabled) return;

        if (!draftAo.name.trim()) {
            alert("Please enter an AO name.");
            return;
        }

        // No recurring days is allowed - This supports blackops/emerginAOs.
        //if (!draftAo.daysOfWeek.length) {
        //    alert("Please select at least one day.");
        //    return;
        //}

        const activeRegionId = state.currentRegionId;
        if (!activeRegionId) {
            alert("No active region found.");
            return;
        }

        draftAo.name = draftAo.name.trim();
        draftAo.locationName = draftAo.locationName.trim();
        draftAo.address = (draftAo.address || "").trim();
        draftAo.mapUrl = (draftAo.mapUrl || "").trim();

        const latitude = String(draftAo.latitude ?? "").trim() === ""
            ? null
            : Number(draftAo.latitude);

        const longitude = String(draftAo.longitude ?? "").trim() === ""
            ? null
            : Number(draftAo.longitude);
            
        if (
            (latitude !== null && Number.isNaN(latitude)) ||
            (longitude !== null && Number.isNaN(longitude))
        ) {
            showToast("Latitude and longitude must be valid numbers.", "error");
            return;
        }

        draftAo.latitude = latitude;
        draftAo.longitude = longitude;
        draftAo.weatherLocationLabel = (draftAo.weatherLocationLabel || "").trim();
        draftAo.weatherEnabled = Boolean(draftAo.weatherEnabled);
        draftAo.emphasisSchedule = draftAo.emphasisSchedule || {};
        draftAo.timeSchedule = draftAo.timeSchedule || {};

        Object.keys(draftAo.timeSchedule).forEach(dayKey => {
            if (!draftAo.daysOfWeek.includes(Number(dayKey))) {
                delete draftAo.timeSchedule[dayKey];
            }
        })

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            if (isEditing) {
                const wasActive = existingAo?.isActive === true;
                const oldDays = existingAo?.daysOfWeek || [];

                const savedAo = await updateAoInCloud(activeRegionId, draftAo);
                const index = state.aos.findIndex(ao => ao.id === savedAo.id);

                if (index !== -1) {
                    state.aos[index] = savedAo;
                }

                const today = getTodayDate();

                if (wasActive && !savedAo.isActive) {
                    await deleteUpcomingQSlotsForAo(activeRegionId, savedAo.id, today);

                    state.qSlots = state.qSlots.filter(slot =>
                        !(slot.aoId === savedAo.id && slot.date >= today)
                    );
                } else if (!wasActive && savedAo.isActive) {
                    await generateQSlotsForCurrentRegion();
                } else if (wasActive && savedAo.isActive && !sameDaysOfWeek(oldDays, savedAo.daysOfWeek || [])) {
                    const validDays = savedAo.daysOfWeek || [];

                    const slotsToDelete = state.qSlots.filter(slot => 
                        slot.aoId === savedAo.id &&
                        slot.date >= today &&
                        !validDays.includes(getDayOfWeekFromDateKey(slot.date))
                    );

                    await deleteQSlotsByIds(activeRegionId, slotsToDelete.map(slot => slot.id));

                    state.qSlots = state.qSlots.filter(slot =>
                        !slotsToDelete.some(deletedSlot => deletedSlot.id === slot.id)
                    );

                    await generateQSlotsForCurrentRegion();
                }
                
            } else {
                const savedAo = await insertAo(activeRegionId, draftAo);
                state.aos.push(savedAo);

                await generateQSlotsForCurrentRegion();
            }
            
           

            showToast(isEditing ? "AO updated." : "AO created.");
            state.editingAoId = null;
            navigateTo("aoManagement");
        } catch (error) {
            console.error("Failed to save AO:", error);
            showToast("Failed to save AO.", "error");
            saveButton.disabled = false;
            saveButton.textContent = "Save AO";
        }
    });

    const saveRow = document.createElement("div");
    saveRow.classList.add("button-row", "ao-save-row");
    saveRow.append(saveButton);

    const nav = createGlobalNav();

    app.append(
        header,
        title,
        nameLabel,
        nameInput,
        locationLabel,
        locationInput,
        addressLabel,
        addressInput,
        latitudeLabel,
        latitudeInput,
        longitudeLabel,
        longitudeInput,
        weatherLocationLabel,
        weatherLocationInput,
        weatherEnabledLabel,
        weatherEnabledRow,
        /*mapUrlLabel,
        mapUrlInput,*/
        timeLabel,
        timeInput,
        daysLabel,
        daysWrap,
        timeScheduleLabel,
        timeScheduleWrap,
        emphasisLabel,
        emphasisWrap,
        activeLabel,
        statusRow,
        saveRow,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}
