
function createMetricCard(label, value) {
    const card = document.createElement("div");
    card.classList.add("stat-tile");

    const valueEl = document.createElement("div");
    valueEl.classList.add("stat-value");
    valueEl.textContent = value ?? "-";

    const labelEl = document.createElement("div");
    labelEl.classList.add("stat-label");
    labelEl.textContent = label;

    card.append(valueEl, labelEl);

    return card;
}

function createSection(title, content) {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("insights-section-title");
    heading.textContent = title;

    section.append(heading, content);

    return section;
}

function createDetailRow({ title, subtitle, value }) {
    const row = document.createElement("div");
    row.classList.add("insights-row");

    const left = document.createElement("div");
    left.classList.add("insights-row-left");

    const titleEl = document.createElement("div");
    titleEl.classList.add("insights-row-title");
    titleEl.textContent = title;

    const subtitleEl = document.createElement("div");
    subtitleEl.classList.add("insights-row-subtitle");
    subtitleEl.textContent = subtitle;

    left.append(titleEl, subtitleEl);

    const valueEl = document.createElement("div");
    valueEl.classList.add("insights-row-value");
    valueEl.textContent = value ?? "-";

    row.append(left, valueEl);

    return row;
}

function formatAverage(value) {
    if (value === null || value === undefined) return "-";
    return value.toFixed ? value.toFixed(1).replace(".0", "") : value;
}

function formatPercent(value) {
    if (value === null || value === undefined) return "-";

    const rounded = Math.round(value);
    const direction = rounded > 0 ? "+" : "";

    return `${direction}${rounded}%`;
}

export {
    createMetricCard,
    createSection,
    createDetailRow,
    formatAverage,
    formatPercent,
};