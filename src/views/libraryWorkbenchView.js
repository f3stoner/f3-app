import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createAppHeader } from "../components/appHeader.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import {
    loadLibraryWorkbenchItems,
    updateLibraryItemInCloud,
    deactivateLibraryItem,
} from "../services/libraryData.js";
import { registerViewCleanup } from "../utils/viewCleanup.js";

const dirtyItemIds = new Set();

const STATUS_OPTIONS = [
    ["imported", "Imported"],
    ["reviewed", "Reviewed"],
    ["all", "All"],
];

const TYPE_OPTIONS = [
    ["all", "All"],
    ["unknown", "Unknown"],
    ["exercise", "Exercise"],
    ["thang", "Thang"],
];

const ITEM_TYPE_OPTIONS = [
    ["", "Unknown"],
    ["exercise", "Exercise"],
    ["thang", "Thang"],
];

const TAG_OPTIONS = [
    "partner",
    "routine",
    "game",
    "competitive",
    "mary",
    "warmup",
    "finisher",
];

const EQUIPMENT_OPTIONS = [
    "coupon",
    "ruck",
    "sandbag",
    "pull_up_bar",
    "stairs",
];

const EMPHASIS_OPTIONS = [
    "upper",
    "lower",
    "core",
    "cardio",
    "heavy",
    "run",
    "ruck",
    "mobility",
];

function getSelectedItem() {
    return state.libraryWorkbenchItems.find(
        item => item.id === state.selectedLibraryWorkbenchItemId
    ) || state.libraryWorkbenchItems[0] || null;
}

function confirmDiscardUnsavedChanges() {
    if (dirtyItemIds.size === 0) return true;

    return window.confirm(
        "You have unsaved library changes. Continuing will discard them. Continue?"
    );
}

function formatType(itemType) {
    if (!itemType) return "Unknown";
    if (itemType === "exercise") return "Exercise";
    if (itemType === "thang") return "Thang";
    return itemType;
}

function formatList(values = []) {
    return values?.length ? values.join(", ") : "—";
}

function mergeOptions(defaults = [], dynamic = []) {
    return [...new Set([...defaults, ...dynamic])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function syncLibraryFilterOption(group, value) {
    state.libraryFilterOptions ||= {
        tags: [],
        equipment: [],
        emphasis: [],
    };

    state.libraryFilterOptions[group] = mergeOptions(
        state.libraryFilterOptions[group] || [],
        [value]
    );
}

function toggleValue(values = [], value) {
    return values.includes(value)
        ? values.filter(item => item !== value)
        : [...values, value];
}

function updateLocalItem(itemId, changes) {
    state.libraryWorkbenchItems = state.libraryWorkbenchItems.map(item =>
        item.id === itemId
            ? { ...item, ...changes }
            : item
    );

    dirtyItemIds.add(itemId);
    renderApp();
}

async function refreshLibraryWorkbenchItems() {
    state.isLoadingLibraryWorkbenchItems = true;
    renderApp();

    try {
        const items = await loadLibraryWorkbenchItems({
            reviewStatus: state.libraryWorkbenchStatusFilter || "imported",
            itemType: state.libraryWorkbenchTypeFilter || "all",
            search: state.libraryWorkbenchSearch || "",
            limit: 100,
        });

        state.libraryWorkbenchItems = items;
        state.hasLoadedLibraryWorkbenchItems = true;

        if (
            !state.selectedLibraryWorkbenchItemId ||
            !items.some(item => item.id === state.selectedLibraryWorkbenchItemId)
        ) {
            state.selectedLibraryWorkbenchItemId = items[0]?.id || null;
        }
    } catch (error) {
        console.error(error);
        showToast("Failed to load library items.", "error");
    } finally {
        state.isLoadingLibraryWorkbenchItems = false;
        renderApp();
    }
}

async function saveLibraryItem(item, { moveNext = false } = {}) {
    if (!item) return;

    try {
        const saved = await updateLibraryItemInCloud({
            ...item,
            reviewStatus: "reviewed",
        });

        state.libraryItems = (state.libraryItems || []).map(existing =>
            existing.id === saved.id ? saved : existing
        );
        
        if (!(state.libraryItems || []).some(existing => existing.id === saved.id)) {
            state.libraryItems = [...(state.libraryItems || []), saved];
        }

        (saved.tags || []).forEach(value => syncLibraryFilterOption("tags", value));
        (saved.equipment || []).forEach(value => syncLibraryFilterOption("equipment", value));
        (saved.emphasis || []).forEach(value => syncLibraryFilterOption("emphasis", value));

        dirtyItemIds.delete(item.id);

        const currentIndex = state.libraryWorkbenchItems.findIndex(
            existing => existing.id === item.id
        );

        const shouldRemoveFromImportedQueue =
            state.libraryWorkbenchStatusFilter === "imported";

        if (shouldRemoveFromImportedQueue) {
            state.libraryWorkbenchItems = state.libraryWorkbenchItems.filter(
                existing => existing.id !== item.id
            );
        } else {
            state.libraryWorkbenchItems = state.libraryWorkbenchItems.map(existing =>
                existing.id === item.id ? saved : existing
            );
        }

        if (moveNext || shouldRemoveFromImportedQueue) {
            const nextItem =
                state.libraryWorkbenchItems[currentIndex] ||
                state.libraryWorkbenchItems[currentIndex - 1] ||
                state.libraryWorkbenchItems[0] ||
                null;

            state.selectedLibraryWorkbenchItemId = nextItem?.id || null;
        }

        showToast("Library item saved.", "success");
        renderApp();
    } catch (error) {
        console.error(error);
        showToast("Failed to save library item.", "error");
    }
}

function createFilterSelect(value, options, onChange) {
    const select = document.createElement("select");
    select.className = "library-workbench-filter-select";

    options.forEach(([optionValue, label]) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = label;
        option.selected = optionValue === value;
        select.appendChild(option);
    });

    select.addEventListener("change", () => onChange(select.value));

    return select;
}

function createItemTypeSelect(item) {
    const select = document.createElement("select");
    select.className = "library-workbench-type-select";
    select.value = item.itemType || "";

    ITEM_TYPE_OPTIONS.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === (item.itemType || "");
        select.appendChild(option);
    });

    select.addEventListener("click", event => {
        event.stopPropagation();
    });

    select.addEventListener("change", () => {
        updateLocalItem(item.id, {
            itemType: select.value || null,
        });
    });

    return select;
}

function renderSummary(section) {
    const items = state.libraryWorkbenchItems || [];

    const summary = document.createElement("p");
    summary.className = "stats-line";
    summary.textContent = `${items.length} loaded · ${
        items.filter(item => !item.itemType).length
    } unknown · ${
        items.filter(item => item.itemType === "exercise").length
    } exercises · ${
        items.filter(item => item.itemType === "thang").length
    } thangs · ${
        dirtyItemIds.size
    } unsaved`;

    section.appendChild(summary);
}

function renderFilters(section) {
    const controls = document.createElement("div");
    controls.className = "library-workbench-toolbar";

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search library...";
    search.value = state.libraryWorkbenchSearch || "";

    search.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            if (!confirmDiscardUnsavedChanges()) return;
    
            dirtyItemIds.clear();
            state.libraryWorkbenchSearch = search.value;
            refreshLibraryWorkbenchItems();
        }
    });

    controls.appendChild(search);

    controls.appendChild(
        createFilterSelect(
            state.libraryWorkbenchStatusFilter || "imported",
            STATUS_OPTIONS,
            value => {
                if (!confirmDiscardUnsavedChanges()) return;
            
                dirtyItemIds.clear();
                state.libraryWorkbenchStatusFilter = value;
                refreshLibraryWorkbenchItems();
            }
        )
    );

    controls.appendChild(
        createFilterSelect(
            state.libraryWorkbenchTypeFilter || "all",
            TYPE_OPTIONS,
            value => {
                if (!confirmDiscardUnsavedChanges()) return;
            
                dirtyItemIds.clear();
                state.libraryWorkbenchTypeFilter = value;
                refreshLibraryWorkbenchItems();
            }
        )
    );

    const refreshButton = document.createElement("button");
    refreshButton.textContent = "Refresh";

    refreshButton.addEventListener("click", () => {
        if (!confirmDiscardUnsavedChanges()) return;
    
        dirtyItemIds.clear();
        refreshLibraryWorkbenchItems();
    });
    
    controls.appendChild(refreshButton);

    section.appendChild(controls);
}

function renderTable(section) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "library-workbench-table-wrap";

    const table = document.createElement("table");
    table.className = "library-workbench-table";

    const thead = document.createElement("thead");
    thead.innerHTML = `
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Tags</th>
            <th>Emphasis</th>
            <th>Equipment</th>
            <th>Status</th>
            <th>Source</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    state.libraryWorkbenchItems.forEach(item => {
        const row = document.createElement("tr");
        row.className =
            item.id === state.selectedLibraryWorkbenchItemId
                ? "library-workbench-row selected"
                : "library-workbench-row";

        if (dirtyItemIds.has(item.id)) {
            row.classList.add("dirty");
        }

        row.addEventListener("click", () => {
            state.selectedLibraryWorkbenchItemId = item.id;
            renderApp();
        });

        const nameCell = document.createElement("td");
        nameCell.className = "library-workbench-name-cell";
        nameCell.textContent = item.name;

        const typeCell = document.createElement("td");
        typeCell.appendChild(createItemTypeSelect(item));

        const tagsCell = document.createElement("td");
        tagsCell.textContent = formatList(item.tags);

        const emphasisCell = document.createElement("td");
        emphasisCell.textContent = formatList(item.emphasis);

        const equipmentCell = document.createElement("td");
        equipmentCell.textContent = formatList(item.equipment);

        const statusCell = document.createElement("td");
        statusCell.textContent = item.reviewStatus || "imported";

        const sourceCell = document.createElement("td");
        sourceCell.textContent = item.sourceType || "—";

        [
            nameCell,
            typeCell,
            tagsCell,
            emphasisCell,
            equipmentCell,
            statusCell,
            sourceCell,
        ].forEach(cell => row.appendChild(cell));

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    section.appendChild(tableWrap);
}

function createChipButton({ item, group, value }) {
    const selected = item[group]?.includes(value);

    const button = document.createElement("button");
    button.type = "button";
    button.className = selected
        ? "library-workbench-chip selected"
        : "library-workbench-chip";
    button.textContent = value;

    button.addEventListener("click", () => {
        updateLocalItem(item.id, {
            [group]: toggleValue(item[group] || [], value),
        });
    });

    return button;
}

function normalizeCustomValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function renderChipGroup(detail, label, item, group, options) {
    const groupLabel = document.createElement("p");
    groupLabel.className = "detail-label";
    groupLabel.textContent = label;
    detail.appendChild(groupLabel);

    const chips = document.createElement("div");
    chips.className = "library-workbench-chip-row";

    const selectedValues = item[group] || [];
    const allValues = [...new Set([...options, ...selectedValues])];

    allValues.forEach(value => {
        chips.appendChild(createChipButton({ item, group, value }));
    });

    detail.appendChild(chips);

    const customRow = document.createElement("div");
    customRow.className = "library-workbench-custom-chip-row";

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.placeholder = `Add custom ${label.toLowerCase()}...`;

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.classList.add("secondary-button");
    addButton.textContent = "Add";

    function addCustomValue() {
        const value = normalizeCustomValue(customInput.value);
    
        if (!value) return;
    
        const latestItem = state.libraryWorkbenchItems.find(
            existing => existing.id === item.id
        );
    
        if (!latestItem) return;
    
        const currentValues = latestItem[group] || [];
    
        if (currentValues.includes(value)) {
            customInput.value = "";
            return;
        }
    
        customInput.value = "";
        
        updateLocalItem(latestItem.id, {
            [group]: [...currentValues, value],
        });
    }

    customInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            addCustomValue();
        }
    });

    addButton.addEventListener("click", addCustomValue);

    customRow.append(customInput, addButton);
    detail.appendChild(customRow);
}

function renderDetail(section) {
    const item = getSelectedItem();

    const detail = document.createElement("aside");
    detail.className = "library-workbench-detail";

    if (!item) {
        detail.textContent = "No library item selected.";
        section.appendChild(detail);
        return;
    }

    const title = document.createElement("h2");
    title.textContent = item.name;
    detail.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "stats-line";
    meta.textContent = `${formatType(item.itemType)} · ${item.reviewStatus || "imported"} · ${item.sourceType || "unknown source"}`;
    detail.appendChild(meta);

    const typeLabel = document.createElement("p");
    typeLabel.className = "detail-label";
    typeLabel.textContent = "Classify As";
    detail.appendChild(typeLabel);

    const typeRow = document.createElement("div");
    typeRow.className = "library-workbench-type-row";

    [
        ["exercise", "Exercise"],
        ["thang", "Thang"],
        [null, "Unknown"],
    ].forEach(([value, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
            (item.itemType || null) === value
                ? "library-workbench-chip selected"
                : "library-workbench-chip";
        button.textContent = label;
        button.addEventListener("click", () => {
            updateLocalItem(item.id, { itemType: value });
        });
        typeRow.appendChild(button);
    });

    detail.appendChild(typeRow);

    renderChipGroup(
        detail,
        "Tags",
        item,
        "tags",
        mergeOptions(TAG_OPTIONS, state.libraryFilterOptions?.tags)
    );
    
    renderChipGroup(
        detail,
        "Equipment",
        item,
        "equipment",
        mergeOptions(EQUIPMENT_OPTIONS, state.libraryFilterOptions?.equipment)
    );
    
    renderChipGroup(
        detail,
        "Emphasis",
        item,
        "emphasis",
        mergeOptions(EMPHASIS_OPTIONS, state.libraryFilterOptions?.emphasis)
    );


    const descriptionLabel = document.createElement("p");
    descriptionLabel.className = "detail-label";
    descriptionLabel.textContent = "Description";
    detail.appendChild(descriptionLabel);

    const description = document.createElement("textarea");
    description.className = "library-workbench-description-input";
    description.rows = 8;
    description.placeholder = "Describe the exercise or thang...";
    description.value = item.description || "";

    description.addEventListener("input", event => {
        const nextDescription = event.target.value;
    
        state.libraryWorkbenchItems = state.libraryWorkbenchItems.map(existing =>
            existing.id === item.id
                ? { ...existing, description: nextDescription }
                : existing
        );
    
        dirtyItemIds.add(item.id);
    
        saveButton.textContent = "Save Changes";
    
        const selectedRow = document.querySelector(".library-workbench-row.selected");
        selectedRow?.classList.add("dirty");
    });

    detail.appendChild(description);

    const confidence = document.createElement("p");
    confidence.className = "stats-line";
    confidence.textContent = `Confidence: ${item.classificationConfidence ?? "—"}`;
    detail.appendChild(confidence);

    const reasons = item.sourceMeta?.classification_reasons || [];
    if (reasons.length) {
        const reasonsLabel = document.createElement("p");
        reasonsLabel.className = "detail-label";
        reasonsLabel.textContent = "Classification reasons";
        detail.appendChild(reasonsLabel);

        const reasonList = document.createElement("ul");
        reasons.forEach(reason => {
            const li = document.createElement("li");
            li.textContent = reason;
            reasonList.appendChild(li);
        });
        detail.appendChild(reasonList);
    }

    const actionRow = document.createElement("div");
    actionRow.className = "library-workbench-actions";

    const saveButton = document.createElement("button");
    saveButton.textContent = dirtyItemIds.has(item.id) ? "Save Changes" : "Mark Reviewed";
    saveButton.addEventListener("click", () => {
        const latestItem = getSelectedItem();
        saveLibraryItem(latestItem);
    });

    const saveNextButton = document.createElement("button");
    saveNextButton.className = "primary-button";
    saveNextButton.textContent = "Save + Next";
    saveNextButton.addEventListener("click", () => {
        const latestItem = getSelectedItem();
        saveLibraryItem(latestItem, { moveNext: true });
    });

    const deactivateButton = document.createElement("button");
    deactivateButton.type = "button";
    deactivateButton.classList.add("danger-button");
    deactivateButton.textContent = "Deactivate";

    deactivateButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
            `Deactivate "${item.name}"?\n\nThis will remove it from the library but preserve history and analytics.`
        );

        if (!confirmed) return;

        try {
            await deactivateLibraryItem(item.id);

            dirtyItemIds.delete(item.id);

            state.libraryItems = (state.libraryItems || []).filter(
                existing => existing.id !== item.id
            );

            const currentIndex = state.libraryWorkbenchItems.findIndex(
                existing => existing.id === item.id
            );

            state.libraryWorkbenchItems = state.libraryWorkbenchItems.filter(
                existing => existing.id !== item.id
            );

            const nextItem =
                state.libraryWorkbenchItems[currentIndex] ||
                state.libraryWorkbenchItems[currentIndex - 1] ||
                state.libraryWorkbenchItems[0] ||
                null;

            state.selectedLibraryWorkbenchItemId = nextItem?.id || null;

            showToast("Library item deactivated.", "success");
            renderApp();
        } catch (error) {
            console.error(error);
            showToast("Failed to deactivate library item.", "error");
        }
    });

    actionRow.appendChild(saveButton);
    actionRow.appendChild(saveNextButton);
    actionRow.appendChild(deactivateButton);

    detail.appendChild(actionRow);

    section.appendChild(detail);
}

export function renderLibraryWorkbenchView() {
    const app = document.getElementById("app");
    app.textContent = "";
    app.classList.add("library-workbench-view");

    registerViewCleanup(() => {
        app.classList.remove("library-workbench-view");
    });

    cleanupMainMenu();

    if (!hasPermission(PERMISSIONS.MANAGE_LIBRARY_WORKBENCH)) {
        showToast("You do not have access to Library Workbench.", "error");
        navigateTo("dashboard");
        return;
    }

    const header = createAppHeader({
        title: "Library Workbench",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
    });

    app.appendChild(header);

    const shell = document.createElement("section");
    shell.className = "library-workbench-shell";

    const title = document.createElement("h1");
    title.textContent = "Library Workbench";
    shell.appendChild(title);

    renderFilters(shell);
    renderSummary(shell);

    if (state.isLoadingLibraryWorkbenchItems) {
        const loading = document.createElement("p");
        loading.className = "stats-line";
        loading.textContent = "Loading library items...";
        shell.appendChild(loading);
        app.appendChild(shell);
        if (state.isMainMenuOpen) {
            document.body.appendChild(createMainMenu());
        }
        return;
    }

    if (!state.hasLoadedLibraryWorkbenchItems) {
        app.appendChild(shell);
        refreshLibraryWorkbenchItems();
        if (state.isMainMenuOpen) {
            document.body.appendChild(createMainMenu());
        }
        return;
    }

    if (!state.libraryWorkbenchItems.length) {
        const empty = document.createElement("p");
        empty.className = "stats-line";
        empty.textContent = "No matching library items.";
        shell.appendChild(empty);
        app.appendChild(shell);
        if (state.isMainMenuOpen) {
            document.body.appendChild(createMainMenu());
        }
        return;
    }

    const workbenchLayout = document.createElement("div");
    workbenchLayout.className = "library-workbench-layout";

    renderTable(workbenchLayout);
    renderDetail(workbenchLayout);

    shell.appendChild(workbenchLayout);
    app.appendChild(shell);
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}