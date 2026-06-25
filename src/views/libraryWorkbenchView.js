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

function formatType(itemType) {
    if (!itemType) return "Unknown";
    if (itemType === "exercise") return "Exercise";
    if (itemType === "thang") return "Thang";
    return itemType;
}

function formatList(values = []) {
    return values?.length ? values.join(", ") : "—";
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
                state.libraryWorkbenchTypeFilter = value;
                refreshLibraryWorkbenchItems();
            }
        )
    );

    const refreshButton = document.createElement("button");
    refreshButton.textContent = "Refresh";
    refreshButton.addEventListener("click", refreshLibraryWorkbenchItems);
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

function renderChipGroup(detail, label, item, group, options) {
    const groupLabel = document.createElement("p");
    groupLabel.className = "detail-label";
    groupLabel.textContent = label;
    detail.appendChild(groupLabel);

    const chips = document.createElement("div");
    chips.className = "library-workbench-chip-row";

    options.forEach(value => {
        chips.appendChild(createChipButton({ item, group, value }));
    });

    detail.appendChild(chips);
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

    renderChipGroup(detail, "Tags", item, "tags", TAG_OPTIONS);
    renderChipGroup(detail, "Equipment", item, "equipment", EQUIPMENT_OPTIONS);
    renderChipGroup(detail, "Emphasis", item, "emphasis", EMPHASIS_OPTIONS);

    const descriptionLabel = document.createElement("p");
    descriptionLabel.className = "detail-label";
    descriptionLabel.textContent = "Description";
    detail.appendChild(descriptionLabel);

    const description = document.createElement("div");
    description.className = "library-workbench-description";
    description.textContent = item.description || "No description.";
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
        saveLibraryItem(item);
    });

    const saveNextButton = document.createElement("button");
    saveNextButton.className = "primary-button";
    saveNextButton.textContent = "Save + Next";
    saveNextButton.addEventListener("click", () => {
        saveLibraryItem(item, { moveNext: true });
    });

    actionRow.appendChild(saveButton);
    actionRow.appendChild(saveNextButton);
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
    createMainMenu();

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
        return;
    }

    if (!state.hasLoadedLibraryWorkbenchItems) {
        app.appendChild(shell);
        refreshLibraryWorkbenchItems();
        return;
    }

    if (!state.libraryWorkbenchItems.length) {
        const empty = document.createElement("p");
        empty.className = "stats-line";
        empty.textContent = "No matching library items.";
        shell.appendChild(empty);
        app.appendChild(shell);
        return;
    }

    const workbenchLayout = document.createElement("div");
    workbenchLayout.className = "library-workbench-layout";

    renderTable(workbenchLayout);
    renderDetail(workbenchLayout);

    shell.appendChild(workbenchLayout);
    app.appendChild(shell);
}