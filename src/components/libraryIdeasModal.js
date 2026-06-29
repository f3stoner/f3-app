import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { searchLibraryIdeas } from "../services/libraryData.js";

function formatMeta(item) {
    return [
        item.itemType || "Library",
        ...(item.emphasis || []),
        ...(item.equipment || []),
        ...(item.tags || []),
    ]
        .filter(Boolean)
        .slice(0, 5)
        .join(" · ");
}

function getFilterOptions(items, key, defaults = []) {
    const values = (items || [])
        .flatMap(item => Array.isArray(item[key]) ? item[key] : [])
        .filter(Boolean);

    return [...new Set([...defaults, ...values])]
        .sort((a, b) => a.localeCompare(b));
}

function createChipButton({ value, selected, onClick }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = selected
        ? "library-workbench-chip selected"
        : "library-workbench-chip";
    button.textContent = value;
    button.addEventListener("click", onClick);
    return button;
}

function renderResultCard({ item, modalState, onInsert, renderResults }) {
    const card = document.createElement("div");
    card.classList.add("library-ideas-card");

    const isExpanded = modalState.expandedItemId === item.id;
    if (isExpanded) card.classList.add("expanded");

    const content = document.createElement("div");
    content.classList.add("library-ideas-result-content");

    const name = document.createElement("div");
    name.classList.add("member-name");
    name.textContent = item.name;

    const meta = document.createElement("div");
    meta.classList.add("stats-line");
    meta.textContent = formatMeta(item);

    content.append(name, meta);
    card.appendChild(content);

    if (!isExpanded) {
        const quickAddButton = document.createElement("button");
        quickAddButton.type = "button";
        quickAddButton.classList.add("library-ideas-quick-add");
        quickAddButton.textContent = "+";
        quickAddButton.title = "Insert name only";

        quickAddButton.addEventListener("click", event => {
            event.stopPropagation();
            onInsert(item, "name");
        });

        content.appendChild(quickAddButton);
    }

    card.addEventListener("click", () => {
        modalState.expandedItemId = isExpanded ? null : item.id;
        renderResults();
    });

    if (isExpanded) {
        const expanded = document.createElement("div");
        expanded.classList.add("library-ideas-expanded");

        const description = document.createElement("div");
        description.classList.add("library-ideas-description");
        description.textContent = item.description || "No description available.";

        const actionRow = document.createElement("div");
        actionRow.classList.add("button-row", "library-ideas-actions");

        const insertButton = document.createElement("button");
        insertButton.type = "button";
        insertButton.classList.add("primary-button");
        insertButton.textContent = item.description ? "Insert Details" : "Insert Name";

        insertButton.addEventListener("click", event => {
            event.stopPropagation();
            onInsert(item, item.description ? "details" : "name");
        });

        actionRow.appendChild(insertButton);
        expanded.append(description, actionRow);
        card.appendChild(expanded);
    }

    return card;
}

export function createLibraryIdeasModal({ onInsert }) {
    const modalState = state.libraryIdeasModal;
    if (!modalState) return document.createElement("div");

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal", "library-ideas-modal");

    const title = document.createElement("h2");
    title.textContent = `Ideas for ${modalState.targetLabel}`;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.classList.add("secondary-button");
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
        state.libraryIdeasModal = null;
        renderApp();
    });

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search ideas...";
    searchInput.value = modalState.search || "";

    const typeSelect = document.createElement("select");

    [
        ["all", "All"],
        ["exercise", "Exercises"],
        ["thang", "Thangs"],
    ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = modalState.type === value;
        typeSelect.appendChild(option);
    });

    const filtersWrap = document.createElement("div");
    filtersWrap.classList.add("library-ideas-filters");

    const resultsWrap = document.createElement("div");
    resultsWrap.classList.add("library-ideas-results");

    function toggleFilter(group, value) {
        modalState[group] = modalState[group]?.includes(value)
            ? modalState[group].filter(item => item !== value)
            : [...(modalState[group] || []), value];

        modalState.expandedItemId = null;
        renderFilters();
        renderResults();
    }

    function renderChipGroup({ label, group, options }) {
        const wrap = document.createElement("div");

        const groupLabel = document.createElement("div");
        groupLabel.classList.add("detail-label");
        groupLabel.textContent = label;

        const chips = document.createElement("div");
        chips.classList.add("checkbox-chip-grid");

        options.forEach(value => {
            chips.appendChild(
                createChipButton({
                    value,
                    selected: modalState[group]?.includes(value),
                    onClick: () => toggleFilter(group, value),
                })
            );
        });

        wrap.append(groupLabel, chips);
        return wrap;
    }

    function renderFilters() {
        filtersWrap.textContent = "";
    
        filtersWrap.append(
            renderChipGroup({
                label: "Emphasis",
                group: "emphasis",
                options: getFilterOptions(
                    state.libraryItems,
                    "emphasis",
                    ["upper", "lower", "core", "cardio", "heavy", "run", "ruck", "mobility"]
                ),
            }),
            renderChipGroup({
                label: "Equipment",
                group: "equipment",
                options: getFilterOptions(
                    state.libraryItems,
                    "equipment",
                    ["coupon", "ruck", "sandbag", "pull_up_bar", "stairs"]
                ),
            }),
            renderChipGroup({
                label: "Tags",
                group: "tags",
                options: getFilterOptions(
                    state.libraryItems,
                    "tags",
                    ["partner", "routine", "game", "competitive", "mary", "warmup", "finisher"]
                ),
            })
        );
    }
    
    function renderResults() {
        resultsWrap.textContent = "";

        const results = searchLibraryIdeas({
            items: state.libraryItems,
            text: modalState.search,
            type: modalState.type,
            emphasis: modalState.emphasis,
            equipment: modalState.equipment,
            tags: modalState.tags,
        });

        results.forEach(item => {
            resultsWrap.appendChild(
                renderResultCard({
                    item,
                    modalState,
                    onInsert,
                    renderResults,
                })
            );
        });

        if (!results.length) {
            const empty = document.createElement("p");
            empty.classList.add("stats-line");
            empty.textContent = "No matching ideas.";
            resultsWrap.appendChild(empty);
        }
    }

    searchInput.addEventListener("input", event => {
        modalState.search = event.target.value;
        modalState.expandedItemId = null;
        renderResults();
    });

    typeSelect.addEventListener("change", event => {
        modalState.type = event.target.value;
        modalState.expandedItemId = null;
        renderResults();
    });

    renderFilters();
    renderResults();

    modal.append(
        title,
        closeButton,
        searchInput,
        typeSelect,
        filtersWrap,
        resultsWrap
    );

    overlay.appendChild(modal);

    overlay.addEventListener("click", () => {
        state.libraryIdeasModal = null;
        renderApp();
    });

    modal.addEventListener("click", event => {
        event.stopPropagation();
    });

    return overlay;
}