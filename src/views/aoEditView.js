import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { insertAo, updateAoInCloud, deleteUpcomingQSlotsForAo, syncAoRecurringSchedules, deleteQSlotsByIds } from "../services/cloudData.js";
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

    app.classList.add("view-aoEdit");

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
        emphasisSchedule: structuredClone(existingAo.emphasisSchedule || {}),
        timeSchedule: { ...(existingAo.timeSchedule || {}) },
     }
     : {
        id: crypto.randomUUID(),
        name: "",
        defaultSiteId: null,
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
        isPublic: true,
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

    const defaultSiteLabel = document.createElement("div");
    defaultSiteLabel.classList.add("detail-label");
    defaultSiteLabel.textContent = "Default Site";

    const defaultSiteSelect = document.createElement("select");

    const noDefaultSiteOption = document.createElement("option");
    noDefaultSiteOption.value = "";
    noDefaultSiteOption.textContent = "No default Site";
    defaultSiteSelect.appendChild(noDefaultSiteOption);

    const availableSites = [...(state.sites || [])]
        .filter(site => site.isActive !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    availableSites.forEach(site => {
        const option = document.createElement("option");
        option.value = site.id;
        option.textContent = site.name || "Unnamed Site";
        defaultSiteSelect.appendChild(option);
    });

    defaultSiteSelect.value = draftAo.defaultSiteId || "";

    defaultSiteSelect.addEventListener("change", event => {
        draftAo.defaultSiteId = event.target.value || null;
        renderSiteSelectionState();
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

    const siteDetailsWrap = document.createElement("div");
    siteDetailsWrap.classList.add("section");

    const siteDetailsName = document.createElement("div");
    siteDetailsName.classList.add("member-name");

    const siteDetailsAddress = document.createElement("div");
    siteDetailsAddress.classList.add("stats-line");

    const siteDetailsWeather = document.createElement("div");
    siteDetailsWeather.classList.add("stats-line");

    siteDetailsWrap.append(
        siteDetailsName,
        siteDetailsAddress,
        siteDetailsWeather
    );

    const legacyLocationWrap = document.createElement("div");
    legacyLocationWrap.classList.add("section");

    legacyLocationWrap.append(
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
        weatherEnabledRow
    );

    function renderSiteSelectionState() {
        const selectedSite = (state.sites || []).find(
            site => site.id === draftAo.defaultSiteId
        );

        const hasSelectedSite = Boolean(selectedSite);

        siteDetailsWrap.hidden = !hasSelectedSite;
        legacyLocationWrap.hidden = hasSelectedSite;

        if (!selectedSite) {
            siteDetailsName.textContent = "";
            siteDetailsAddress.textContent = "";
            siteDetailsWeather.textContent = "";
            return;
        }

        siteDetailsName.textContent =
            selectedSite.name || "Unnamed Site";

        siteDetailsAddress.textContent =
            selectedSite.address || "No address set";

        if (selectedSite.weatherEnabled) {
            const weatherLabel =
                selectedSite.weatherLocationLabel ||
                selectedSite.name ||
                "Weather location not set";

            siteDetailsWeather.textContent =
                `Weather enabled • ${weatherLabel}`;
        } else {
            siteDetailsWeather.textContent =
                "Weather disabled";
        }
    }

    renderSiteSelectionState();

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
    const originalEmphasisSchedule = structuredClone(draftAo.emphasisSchedule);
    const existingRotation = draftAo.emphasisSchedule["*"];
    const hasWeekdayRules = Object.keys(draftAo.emphasisSchedule).some(key => key !== "*");
    const hasLegacyRules = Boolean(existingRotation && (hasWeekdayRules || existingRotation.pattern !== "rotating-slots"));

    let emphasisMode = hasLegacyRules ? "mixed" : existingRotation ? "rotating" : "weekday";

    const emphasisModeLabel = document.createElement("div");
    emphasisModeLabel.classList.add("detail-label");
    emphasisModeLabel.textContent = "Scheduling Method";

    const emphasisModeSelect = document.createElement("select");

    [
        { value: "weekday", label: "By Weekday" },
        { value: "rotating", label: "Rotating Workouts" },
        ...(hasLegacyRules ? [{ value: "mixed", label: "Preserve Existing Rules" }] : [])
    ].forEach(option => {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        emphasisModeSelect.appendChild(el);
    });

    emphasisModeSelect.value = emphasisMode;

    const weekdayEmphasisWrap = document.createElement("div");
    const rotatingEmphasisWrap = document.createElement("div");
    rotatingEmphasisWrap.classList.add("emphasis-day-card");

    const rotationDescription = document.createElement("p");
    rotationDescription.textContent = "Emphases advance with each scheduled workout, regardless of weekday.";

    const rotationValuesLabel = document.createElement("div");
    rotationValuesLabel.classList.add("detail-label");
    rotationValuesLabel.textContent = "Rotation Order";

    const rotationValuesWrap = document.createElement("div");
    rotationValuesWrap.classList.add("emphasis-values-wrap");

    const rotationDateLabel = document.createElement("div");
    rotationDateLabel.classList.add("detail-label");
    rotationDateLabel.textContent = "Rotation Start Date";

    const rotationDateInput = document.createElement("input");
    rotationDateInput.type = "date";
    rotationDateInput.value = existingRotation?.startsOnDate || "";

    const rotationPreviewLabel = document.createElement("div");
    rotationPreviewLabel.classList.add("detail-label");
    rotationPreviewLabel.textContent = "Four-Week Preview";

    const rotationPreviewDescription = document.createElement("p");
    rotationPreviewDescription.classList.add("ao-editor-section-description");
    rotationPreviewDescription.textContent = "Four calendar weeks beginning with the week containing your selected start date.";

    const rotationPreview = document.createElement("div");
    rotationPreview.classList.add("stats-line", "ao-rotation-preview");

    function getRotationValues() {
        return [...rotationValuesWrap.querySelectorAll("select")]
            .map(select => select.value)
            .filter(Boolean);
    }

    function renderRotationPreview() {
        rotationPreview.replaceChildren();

        const values = getRotationValues();
        const days = [...draftAo.daysOfWeek].sort((a, b) => a - b);
        const startDate = rotationDateInput.value;

        if (!values.length || !days.length || !startDate) {
            rotationPreview.textContent = "Select workout days, emphases, and a start date to preview the rotation.";
            return;
        }

        const [year, month, day] = startDate.split("-").map(Number);
        const start = new Date(year, month - 1, day);
        const startDay = start.getDay();

        const firstWeek = new Date(start);
        firstWeek.setDate(start.getDate() - startDay);

        const table = document.createElement("table");
        const header = document.createElement("tr");

        ["Week", ...days.map(value => DAY_OPTIONS.find(day => day.value === value)?.label || value)].forEach(label => {
            const cell = document.createElement("th");
            cell.textContent = label;
            header.appendChild(cell);
        });

        table.appendChild(header);

        let rotationIndex = 0;

        for (let week = 0; week < 4; week++) {
            const row = document.createElement("tr");
            const weekCell = document.createElement("td");
            weekCell.textContent = String(week + 1);
            row.appendChild(weekCell);

            days.forEach(weekday => {
                const cell = document.createElement("td");
                const date = new Date(firstWeek);
                date.setDate(firstWeek.getDate() + week * 7 + weekday);

                if (date < start) {
                    cell.textContent = "—";
                } else {
                    cell.textContent = formatEmphasisValues([values[rotationIndex % values.length]]);
                    rotationIndex++;
                }

                cell.title = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                row.appendChild(cell);
            });

            table.appendChild(row);
        }

        rotationPreview.appendChild(table);
    }

    function addRotationValue(value = "") {
        const row = document.createElement("div");
        row.classList.add("emphasis-value-row");

        const select = createEmphasisSelect(value);
        select.addEventListener("change", renderRotationPreview);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.classList.add("secondary-button");

        removeButton.addEventListener("click", () => {
            row.remove();
            renderRotationPreview();
        });

        row.append(select, removeButton);
        rotationValuesWrap.appendChild(row);
    }

    (existingRotation?.values?.length ? existingRotation.values : [""]).forEach(addRotationValue);

    const addRotationButton = document.createElement("button");
    addRotationButton.type = "button";
    addRotationButton.textContent = "Add Rotation";
    addRotationButton.classList.add("secondary-button", "emphasis-add-button");

    addRotationButton.addEventListener("click", () => {
        addRotationValue();
        rotationValuesWrap.appendChild(addRotationButton);
        renderRotationPreview();
    });

    rotationDateInput.addEventListener("change", renderRotationPreview);
    rotationValuesWrap.appendChild(addRotationButton);

    rotatingEmphasisWrap.append(
        rotationDescription,
        rotationValuesLabel,
        rotationValuesWrap,
        rotationDateLabel,
        rotationDateInput,
        rotationPreviewLabel,
        rotationPreviewDescription,
        rotationPreview
    );

    function renderEmphasisMode() {
        weekdayEmphasisWrap.hidden = emphasisMode !== "weekday";
        rotatingEmphasisWrap.hidden = emphasisMode !== "rotating";
    }

    emphasisModeSelect.addEventListener("change", () => {
        emphasisMode = emphasisModeSelect.value;
        renderEmphasisMode();
        renderRotationPreview();
    });
    
    const emphasisLabel = document.createElement("div");
    emphasisLabel.classList.add("detail-label");
    emphasisLabel.textContent = "Weekly Emphasis Schedule";
    
    const emphasisWrap = document.createElement("div");
    emphasisWrap.classList.add("section");

    emphasisWrap.append(
        emphasisModeLabel,
        emphasisModeSelect,
        rotatingEmphasisWrap,
        weekdayEmphasisWrap
    );

    renderEmphasisMode();
    renderRotationPreview();
    
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

        const unsupportedPattern = rule.pattern && !PATTERN_OPTIONS.some(option => option.value === rule.pattern);

        if (unsupportedPattern) {
            const option = document.createElement("option");
            option.value = rule.pattern;
            option.textContent = `Existing: ${rule.pattern}`;
            patternSelect.appendChild(option);
            patternSelect.value = rule.pattern;
            patternSelect.disabled = true;
        }
    
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

        if (unsupportedPattern) {
            const notice = document.createElement("p");
            notice.classList.add("ao-editor-section-description");
            notice.textContent = "This day uses an existing scheduling rule that cannot be edited here. Its configuration will be preserved.";
            row.replaceChildren(dayLabel, notice);
        }

        weekdayEmphasisWrap.appendChild(row);
    });    

    /*const mapUrlLabel = document.createElement("div");
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

            renderRotationPreview();
        
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
        draftAo.defaultSiteId = draftAo.defaultSiteId || null;
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
        if (emphasisMode === "rotating") {
            const values = getRotationValues();

            if (!draftAo.daysOfWeek.length || !values.length || !rotationDateInput.value) {
                showToast("Select workout days, rotation emphases, and a start date.", "error");
                return;
            }

            draftAo.emphasisSchedule = {
                "*": {
                    pattern: "rotating-slots",
                    values,
                    startsOnDate: rotationDateInput.value,
                    daysOfWeek: [...draftAo.daysOfWeek]
                }
            };
        } else if (emphasisMode === "mixed") {
            draftAo.emphasisSchedule = structuredClone(originalEmphasisSchedule);
        } else {
            delete draftAo.emphasisSchedule["*"];
        }
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

                await syncAoRecurringSchedules(activeRegionId, savedAo);

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

                await syncAoRecurringSchedules(activeRegionId, savedAo);

                try {
                    await generateQSlotsForCurrentRegion();
                } catch (slotError) {
                    console.error(
                        "AO created, but future Q-slot generation failed:",
                        slotError
                    );
            
                    showToast(
                        "AO created, but future Q slots could not be generated.",
                        "error"
                    );
            
                    state.editingAoId = null;
                    navigateTo("aoManagement");
                    return;
                }
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

    const aoSections = [];

    function closeAoSections() {
        aoSections.forEach(({ section, button, content }) => {
            section.classList.remove("expanded");
            button.setAttribute("aria-expanded", "false");
            content.hidden = true;
        });
    }

    function createAoSection(title, summary, ...elements) {
        const section = document.createElement("section");
        section.classList.add("ao-editor-section");

        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("ao-editor-section-trigger");
        button.setAttribute("aria-expanded", "false");

        const headingWrap = document.createElement("div");
        headingWrap.classList.add("ao-editor-section-heading");

        const heading = document.createElement("h2");
        heading.classList.add("ao-editor-section-title");
        heading.textContent = title;

        const summaryText = document.createElement("div");
        summaryText.classList.add("ao-editor-section-summary");

        const chevron = document.createElement("span");
        chevron.classList.add("ao-editor-section-chevron");
        chevron.textContent = "⌄";
        chevron.setAttribute("aria-hidden", "true");

        headingWrap.append(heading, summaryText);
        button.append(headingWrap, chevron);

        const content = document.createElement("div");
        content.classList.add("ao-editor-section-content");
        content.hidden = true;
        content.append(...elements);

        button.addEventListener("click", () => {
            const wasExpanded = button.getAttribute("aria-expanded") === "true";
            closeAoSections();

            if (!wasExpanded) {
                section.classList.add("expanded");
                button.setAttribute("aria-expanded", "true");
                content.hidden = false;
            }
        });

        section.append(button, content);
        aoSections.push({ section, button, content, summaryText, summary });

        return section;
    }

    const detailsSection = createAoSection(
        "AO Details",
        () => {
            const site = (state.sites || []).find(site => site.id === draftAo.defaultSiteId);
            return `${draftAo.name.trim() || "Unnamed AO"} · ${site?.name || draftAo.locationName || "No site"}`;
        },
        nameLabel,
        nameInput,
        defaultSiteLabel,
        defaultSiteSelect,
        siteDetailsWrap,
        legacyLocationWrap
    );

    const scheduleSection = createAoSection(
        "Workout Schedule",
        () => {
            const days = draftAo.daysOfWeek.map(value => DAY_OPTIONS.find(day => day.value === value)?.label).filter(Boolean);
            const overrides = Object.keys(draftAo.timeSchedule || {}).filter(day => draftAo.daysOfWeek.includes(Number(day))).length;
            return `${days.join(" / ") || "No recurring days"} · ${draftAo.time || "No default time"}${overrides ? ` · ${overrides} time override${overrides === 1 ? "" : "s"}` : ""}`;
        },
        timeLabel,
        timeInput,
        daysLabel,
        daysWrap,
        timeScheduleLabel,
        timeScheduleWrap
    );

    const emphasisSection = createAoSection(
        "Workout Emphasis",
        () => {
            if (emphasisMode === "rotating") {
                const values = getRotationValues();
                return `Rotating Workouts · ${values.length} emphasis${values.length === 1 ? "" : "es"}`;
            }

            if (emphasisMode === "mixed") return "Preserve Existing Rules";

            const count = draftAo.daysOfWeek.filter(day => draftAo.emphasisSchedule[String(day)]?.values?.length).length;
            return `By Weekday · ${count} configured day${count === 1 ? "" : "s"}`;
        },
        emphasisWrap
    );

    const statusSection = createAoSection(
        "AO Status",
        () => draftAo.isActive ? "Active" : "Inactive",
        activeLabel,
        statusRow
    );

    function updateAoSectionSummaries() {
        aoSections.forEach(({ summaryText, summary }) => {
            summaryText.textContent = summary();
        });
    }

    app.addEventListener("input", updateAoSectionSummaries);
    app.addEventListener("change", updateAoSectionSummaries);

    emphasisWrap.addEventListener("click", () => {
        queueMicrotask(updateAoSectionSummaries);
    });

    updateAoSectionSummaries();

    app.append(
        header,
        title,
        detailsSection,
        scheduleSection,
        emphasisSection,
        statusSection,
        saveRow,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}
