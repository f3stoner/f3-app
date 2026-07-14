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

export function createLineChartSection({
    title,
    items,
    getLabel,
    getValue,
    getSubtitle,
    emptyMessage = "No trend data available.",
}) {
    const section = document.createElement("div");
    section.classList.add(
        "section",
        "insights-chart-section",
        "insights-line-chart-section"
    );

    const heading = document.createElement("div");
    heading.classList.add("insights-section-title");
    heading.textContent = title;

    const values = items.map(item => Number(getValue(item)) || 0);
    const hasData = values.some(value => value > 0);

    if (!items.length || !hasData) {
        const empty = document.createElement("div");
        empty.classList.add("empty-state");
        empty.textContent = emptyMessage;

        section.append(heading, empty);
        return section;
    }

    const chartWrap = document.createElement("div");
    chartWrap.classList.add("insights-line-chart-wrap");

    const svgNamespace = "http://www.w3.org/2000/svg";

    const width = 700;
    const height = 280;

    const padding = {
        top: 24,
        right: 20,
        bottom: 50,
        left: 42,
    };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values.filter(value => value > 0), 0);

    const paddedMax = Math.ceil(maxValue * 1.15);
    const range = Math.max(paddedMax - minValue, 1);

    const getX = index => {
        if (items.length === 1) {
            return padding.left + chartWidth / 2;
        }

        return (
            padding.left +
            (index / (items.length - 1)) * chartWidth
        );
    };

    const getY = value => {
        return (
            padding.top +
            chartHeight -
            ((value - minValue) / range) * chartHeight
        );
    };

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", title);
    svg.classList.add("insights-line-chart");

    const gridLineCount = 4;

    for (let index = 0; index <= gridLineCount; index += 1) {
        const ratio = index / gridLineCount;
        const y = padding.top + ratio * chartHeight;

        const line = document.createElementNS(
            svgNamespace,
            "line"
        );

        line.setAttribute("x1", padding.left);
        line.setAttribute("x2", width - padding.right);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.classList.add("insights-line-grid");

        svg.appendChild(line);

        const gridValue =
            paddedMax - ratio * range;

        const label = document.createElementNS(
            svgNamespace,
            "text"
        );

        label.setAttribute("x", padding.left - 8);
        label.setAttribute("y", y + 4);
        label.setAttribute("text-anchor", "end");
        label.classList.add("insights-line-axis-label");
        label.textContent = Number(gridValue.toFixed(1));

        svg.appendChild(label);
    }

    const validPoints = items
        .map((item, index) => ({
            item,
            index,
            value: Number(getValue(item)) || 0,
        }))
        .filter(point => point.value > 0);

    const pointString = validPoints
        .map(point => {
            return `${getX(point.index)},${getY(point.value)}`;
        })
        .join(" ");

    if (validPoints.length > 1) {
        const polyline = document.createElementNS(
            svgNamespace,
            "polyline"
        );

        polyline.setAttribute("points", pointString);
        polyline.setAttribute("fill", "none");
        polyline.classList.add("insights-line-path");

        svg.appendChild(polyline);
    }

    const selectedPointReadout = document.createElement("div");
    selectedPointReadout.classList.add("insights-line-selected-point");

    const selectedPointLabel = document.createElement("div");
    selectedPointLabel.classList.add("insights-line-selected-label");

    const selectedPointValue = document.createElement("div");
    selectedPointValue.classList.add("insights-line-selected-value");

    const selectedPointSubtitle = document.createElement("div");
    selectedPointSubtitle.classList.add("insights-line-selected-subtitle");

    selectedPointReadout.append(
        selectedPointLabel,
        selectedPointValue,
        selectedPointSubtitle
    );

    function selectPoint({ item, value, pointGroup }) {
        svg
            .querySelectorAll(".insights-line-point-group")
            .forEach(group => {
                group.classList.remove("selected");
            });

        pointGroup.classList.add("selected");

        selectedPointLabel.textContent = getLabel(item);
        selectedPointValue.textContent = value;

        selectedPointSubtitle.textContent =
            getSubtitle?.(item) || "";
    }

    items.forEach((item, index) => {
        const x = getX(index);
        const value = Number(getValue(item)) || 0;

        const xLabel = document.createElementNS(
            svgNamespace,
            "text"
        );

        xLabel.setAttribute("x", x);
        xLabel.setAttribute("y", height - 18);
        xLabel.setAttribute("text-anchor", "middle");
        xLabel.classList.add("insights-line-axis-label");
        xLabel.textContent = getLabel(item);

        svg.appendChild(xLabel);

        if (value <= 0) return;

        const y = getY(value);

        const pointGroup = document.createElementNS(
            svgNamespace,
            "g"
        );

        pointGroup.classList.add("insights-line-point-group");

        pointGroup.setAttribute("tabindex", "0");
        pointGroup.setAttribute("role", "button");
        pointGroup.setAttribute(
            "aria-label",
            `${getLabel(item)}: ${value}`
        );

        const hitArea = document.createElementNS(
            svgNamespace,
            "circle"
        );

        hitArea.setAttribute("cx", x);
        hitArea.setAttribute("cy", y);
        hitArea.setAttribute("r", 18);
        hitArea.classList.add("insights-line-hit-area");

        const point = document.createElementNS(
            svgNamespace,
            "circle"
        );

        point.setAttribute("cx", x);
        point.setAttribute("cy", y);
        point.setAttribute("r", 5);
        point.classList.add("insights-line-point");

        const titleElement = document.createElementNS(
            svgNamespace,
            "title"
        );

        const subtitle = getSubtitle?.(item);

        titleElement.textContent = subtitle
            ? `${getLabel(item)}: ${value}. ${subtitle}`
            : `${getLabel(item)}: ${value}`;

        pointGroup.append(hitArea, point, titleElement);
        pointGroup.addEventListener("click", () => {
            selectPoint({
                item,
                value,
                pointGroup,
            });
        });
        
        pointGroup.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
        
            event.preventDefault();
        
            selectPoint({
                item,
                value,
                pointGroup,
            });
        });

        svg.appendChild(pointGroup);
    });

    const selectablePoints = [...svg.querySelectorAll(
        ".insights-line-point-group"
    )];
    
    const latestSelectablePoint =
        selectablePoints[selectablePoints.length - 1];
    
    const latestItemWithValue = [...items]
        .reverse()
        .find(item => Number(getValue(item)) > 0);
    
    if (latestSelectablePoint && latestItemWithValue) {
        selectPoint({
            item: latestItemWithValue,
            value: Number(getValue(latestItemWithValue)),
            pointGroup: latestSelectablePoint,
        });
    }

    chartWrap.append(
        svg,
        selectedPointReadout
    );

    const nonZeroItems = items.filter(item => {
        return Number(getValue(item)) > 0;
    });

    const firstItem = nonZeroItems[0] || null;
    const latestItem =
        nonZeroItems[nonZeroItems.length - 1] || null;

    const highestItem = nonZeroItems.reduce(
        (highest, item) => {
            if (!highest) return item;

            return Number(getValue(item)) >
                Number(getValue(highest))
                ? item
                : highest;
        },
        null
    );

    const averageValue = nonZeroItems.length
        ? (
            nonZeroItems.reduce((sum, item) => {
                return sum + Number(getValue(item));
            }, 0) / nonZeroItems.length
        ).toFixed(1)
        : "0";

    const trendChange =
        firstItem &&
        latestItem &&
        Number(getValue(firstItem)) > 0
            ? Math.round(
                (
                    (
                        Number(getValue(latestItem)) -
                        Number(getValue(firstItem))
                    ) /
                    Number(getValue(firstItem))
                ) * 100
            )
            : null;

    const summary = document.createElement("div");
    summary.classList.add("insights-line-summary");

    const trendItem = document.createElement("div");
    trendItem.classList.add("insights-line-summary-item");

    const trendValue = document.createElement("div");
    trendValue.classList.add("insights-line-summary-value");

    trendValue.textContent =
        trendChange === null
            ? "—"
            : `${trendChange >= 0 ? "↑" : "↓"} ${Math.abs(trendChange)}%`;

    const trendLabel = document.createElement("div");
    trendLabel.classList.add("insights-line-summary-label");
    trendLabel.textContent = "Period Change";

    trendItem.append(trendValue, trendLabel);

    const highItem = document.createElement("div");
    highItem.classList.add("insights-line-summary-item");

    const highValue = document.createElement("div");
    highValue.classList.add("insights-line-summary-value");
    highValue.textContent = highestItem
        ? getValue(highestItem)
        : "—";

    const highLabel = document.createElement("div");
    highLabel.classList.add("insights-line-summary-label");
    highLabel.textContent = highestItem
        ? `High · ${getLabel(highestItem)}`
        : "High";

    highItem.append(highValue, highLabel);

    const averageItem = document.createElement("div");
    averageItem.classList.add("insights-line-summary-item");

    const averageValueElement = document.createElement("div");
    averageValueElement.classList.add(
        "insights-line-summary-value"
    );
    averageValueElement.textContent = averageValue;

    const averageLabel = document.createElement("div");
    averageLabel.classList.add("insights-line-summary-label");
    averageLabel.textContent = "Period Average";

    averageItem.append(
        averageValueElement,
        averageLabel
    );

    summary.append(
        trendItem,
        highItem,
        averageItem
    );

    section.append(
        heading,
        chartWrap,
        summary
    );

    return section;
}