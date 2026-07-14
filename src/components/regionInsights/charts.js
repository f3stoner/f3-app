export function createHorizontalBarChartSection({
    title,
    items,
    getLabel,
    getValue,
    getSubtitle,
    onItemClick,
    initialCount = null,
}) {
    const section = document.createElement("div");
    section.classList.add("section", "insights-chart-section");

    const heading = document.createElement("div");
    heading.classList.add("insights-section-title");
    heading.textContent = title;

    const chart = document.createElement("div");
    chart.classList.add("insights-bar-chart");

    let expanded = false;

    const values = items.map(item => Number(getValue(item)) || 0);
    const maxValue = Math.max(...values, 0);

    if (!items.length || maxValue === 0) {
        const empty = document.createElement("div");
        empty.classList.add("empty-state");
        empty.textContent = "No chart data available for this month.";

        section.append(heading, empty);
        return section;
    }

    function renderChart() {
        chart.textContent = "";
    
        const visibleItems =
            initialCount && !expanded
                ? items.slice(0, initialCount)
                : items;
    
        visibleItems.forEach(item => {
            const value = Number(getValue(item)) || 0;
    
            const row = document.createElement(
                onItemClick ? "button" : "div"
            );
    
            row.classList.add("insights-bar-row");
    
            if (onItemClick) {
                row.type = "button";
                row.addEventListener("click", () => {
                    onItemClick(item);
                });
            }
    
            const header = document.createElement("div");
            header.classList.add("insights-bar-header");
    
            const labelWrap = document.createElement("div");
            labelWrap.classList.add("insights-bar-label-wrap");
    
            const label = document.createElement("div");
            label.classList.add("insights-bar-label");
            label.textContent = getLabel(item);
    
            labelWrap.appendChild(label);
    
            const subtitleText = getSubtitle?.(item);
    
            if (subtitleText) {
                const subtitle = document.createElement("div");
                subtitle.classList.add("insights-bar-subtitle");
                subtitle.textContent = subtitleText;
                labelWrap.appendChild(subtitle);
            }
    
            const valueEl = document.createElement("div");
            valueEl.classList.add("insights-bar-value");
            valueEl.textContent = value;
    
            header.append(labelWrap, valueEl);
    
            const track = document.createElement("div");
            track.classList.add("insights-bar-track");
    
            const fill = document.createElement("div");
            fill.classList.add("insights-bar-fill");
    
            const widthPercent =
                maxValue > 0
                    ? Math.max((value / maxValue) * 100, value > 0 ? 3 : 0)
                    : 0;
    
            fill.style.width = `${widthPercent}%`;
    
            track.appendChild(fill);
            row.append(header, track);
            chart.appendChild(row);
        });
    }

    renderChart();

    if (initialCount && items.length > initialCount) {
        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.classList.add(
            "secondary-button",
            "insights-chart-toggle"
        );

        toggleButton.textContent = `Show All (${items.length})`;

        toggleButton.addEventListener("click", () => {
            expanded = !expanded;

            toggleButton.textContent = expanded
                ? "Show Less"
                : `Show All (${items.length})`;

            renderChart();
        });

        section.append(heading, chart, toggleButton);
        return section;
    }

    section.append(heading, chart);

    return section;
}
