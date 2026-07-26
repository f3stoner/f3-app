import { state } from "../modules/state.js";
import {
    createAppHeader,
} from "../components/appHeader.js";
import {
    createMainMenu,
    cleanupMainMenu,
} from "../components/mainMenu.js";
import {
    loadRegionLeadershipDirectory,
} from "../services/cloudData.js";
import {
    getLeadershipPositionLabel,
} from "../utils/leadership.js";
import {
    navigateToPaxProfile,
} from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";

export async function renderLeadershipView() {
    cleanupMainMenu();

    const app = document.getElementById("app");
    app.replaceChildren();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Leadership";

    const content = document.createElement("div");
    content.textContent = "Loading leadership...";

    app.append(header, title, content);

    try {
        const requestedRegionId =
            state.currentRegionId;

        const rows =
            await loadRegionLeadershipDirectory(
                requestedRegionId
            );

        /*
         * Ignore a response from a workspace the user
         * has already left.
         */
        if (
            state.currentRegionId !==
            requestedRegionId
        ) {
            return;
        }

        content.replaceChildren();

        if (!rows.length) {
            content.appendChild(
                createEmptyState(
                    "No leadership assignments found.",
                    "Leadership roles have not been assigned for this region."
                )
            );

            appendMainMenuIfOpen();
            return;
        }

        const regionalRows = rows
            .filter(row => row.scope === "region")
            .sort(compareLeadershipRows);

        const aoRows = rows
            .filter(row => row.scope === "ao")
            .sort(compareAoLeadershipRows);

        content.appendChild(
            createRegionalLeadershipSection(
                regionalRows
            )
        );

        if (aoRows.length) {
            content.appendChild(
                createAoLeadershipSection(
                    aoRows
                )
            );
        }
    } catch (error) {
        console.error(
            "Failed to load leadership directory",
            error
        );

        showToast(
            "Failed to load leadership.",
            "error"
        );

        content.replaceChildren(
            createEmptyState(
                "Could not load leadership.",
                navigator.onLine
                    ? "Check the console for the Supabase error."
                    : "Leadership information is unavailable while offline."
            )
        );
    }

    appendMainMenuIfOpen();
}

function createRegionalLeadershipSection(rows) {
    const section =
        createSection(
            "Regional Shared Leadership Team"
        );

    if (!rows.length) {
        section.appendChild(
            createEmptyState(
                "No regional assignments found.",
                "Regional leadership roles have not been assigned."
            )
        );

        return section;
    }

    const groupedRows =
        groupRowsByPosition(rows);

    groupedRows.forEach(group => {
        section.appendChild(
            createPositionGroup(
                group.positionKey,
                group.rows
            )
        );
    });

    return section;
}

function createAoLeadershipSection(rows) {
    const container =
        document.createElement("div");

    container.classList.add(
        "leadership-ao-directory"
    );

    const heading =
        document.createElement("h2");

    heading.textContent = "AO Leadership";

    container.appendChild(heading);

    const aoGroups =
        groupRowsByAo(rows);

    let openAoSection = null;

    function closeAoSection(section) {
        const toggle =
            section.querySelector(
                ".leadership-ao-toggle"
            );

        const panel =
            section.querySelector(
                ".leadership-ao-panel"
            );

        if (!toggle || !panel) {
            return;
        }

        toggle.setAttribute(
            "aria-expanded",
            "false"
        );

        section.classList.remove("open");

        panel.style.maxHeight =
            `${panel.scrollHeight}px`;

        requestAnimationFrame(() => {
            panel.style.maxHeight = "0px";
            panel.style.opacity = "0";
        });

        if (openAoSection === section) {
            openAoSection = null;
        }
    }

    function openAoSectionPanel(section) {
        const toggle =
            section.querySelector(
                ".leadership-ao-toggle"
            );

        const panel =
            section.querySelector(
                ".leadership-ao-panel"
            );

        if (!toggle || !panel) {
            return;
        }

        if (
            openAoSection &&
            openAoSection !== section
        ) {
            closeAoSection(
                openAoSection
            );
        }

        toggle.setAttribute(
            "aria-expanded",
            "true"
        );

        section.classList.add("open");

        panel.style.maxHeight =
            `${panel.scrollHeight}px`;

        panel.style.opacity = "1";

        openAoSection = section;
    }

    aoGroups.forEach((group, index) => {
        const section =
            createAoAccordionSection({
                group,
                index,
            });

        const toggle =
            section.querySelector(
                ".leadership-ao-toggle"
            );

        const panel =
            section.querySelector(
                ".leadership-ao-panel"
            );

        toggle.addEventListener(
            "click",
            () => {
                const isOpen =
                    toggle.getAttribute(
                        "aria-expanded"
                    ) === "true";

                if (isOpen) {
                    closeAoSection(section);
                    return;
                }

                openAoSectionPanel(section);
            }
        );

        panel.addEventListener(
            "transitionend",
            event => {
                if (
                    event.propertyName !==
                    "max-height"
                ) {
                    return;
                }

                const isOpen =
                    toggle.getAttribute(
                        "aria-expanded"
                    ) === "true";

                if (isOpen) {
                    panel.style.maxHeight =
                        "none";
                }
            }
        );

        container.appendChild(section);
    });

    return container;
}

function createAoAccordionSection({
    group,
    index,
}) {
    const section =
        document.createElement("section");

    section.classList.add(
        "section",
        "leadership-section",
        "leadership-ao-section"
    );

    const panelId =
        `leadership-ao-panel-${index}`;

    const toggle =
        document.createElement("button");

    toggle.type = "button";

    toggle.classList.add(
        "leadership-ao-toggle"
    );

    toggle.setAttribute(
        "aria-expanded",
        "false"
    );

    toggle.setAttribute(
        "aria-controls",
        panelId
    );

    const label =
        document.createElement("span");

    label.textContent = group.aoName;

    const chevron =
        document.createElement("span");

    chevron.classList.add(
        "leadership-ao-chevron"
    );

    chevron.textContent = "›";

    chevron.setAttribute(
        "aria-hidden",
        "true"
    );

    toggle.append(
        label,
        chevron
    );

    const panel =
        document.createElement("div");

    panel.id = panelId;

    panel.classList.add(
        "leadership-ao-panel"
    );

    panel.setAttribute(
        "role",
        "region"
    );

    panel.style.maxHeight = "0px";
    panel.style.opacity = "0";

    const panelInner =
        document.createElement("div");

    panelInner.classList.add(
        "leadership-ao-panel-inner"
    );

    const positionGroups =
        groupRowsByPosition(
            group.rows
        );

    positionGroups.forEach(
        positionGroup => {
            panelInner.appendChild(
                createPositionGroup(
                    positionGroup.positionKey,
                    positionGroup.rows
                )
            );
        }
    );

    panel.appendChild(panelInner);

    section.append(
        toggle,
        panel
    );

    return section;
}

function createSection(label) {
    const section =
        document.createElement("section");

    section.classList.add(
        "section",
        "leadership-section"
    );

    const heading =
        document.createElement("div");

    heading.classList.add(
        "detail-label",
        "leadership-section-title"
    );

    heading.textContent = label;

    section.appendChild(heading);

    return section;
}

function createPositionGroup(
    positionKey,
    rows
) {
    const group =
        document.createElement("div");

    group.classList.add(
        "leadership-position-group"
    );

    const label =
        document.createElement("div");

    label.classList.add(
        "detail-label",
        "leadership-position-label"
    );

    label.textContent =
        getLeadershipPositionLabel(
            positionKey
        );

    const leaders =
        document.createElement("div");

    leaders.classList.add(
        "leadership-member-list"
    );

    rows
        .slice()
        .sort((a, b) =>
            a.paxName.localeCompare(
                b.paxName
            )
        )
        .forEach(row => {
            leaders.appendChild(
                createLeaderButton(row)
            );
        });

    group.append(label, leaders);

    return group;
}

function createLeaderButton(row) {
    const button =
        document.createElement("button");

    button.type = "button";

    button.classList.add(
        "leadership-member-button"
    );

    button.textContent = row.paxName;

    button.addEventListener(
        "click",
        () => {
            navigateToPaxProfile(
                row.memberId
            );
        }
    );

    return button;
}

function createEmptyState(
    titleText,
    detailText
) {
    const emptyState =
        document.createElement("div");

    emptyState.classList.add(
        "empty-state"
    );

    const title =
        document.createElement("p");

    title.textContent = titleText;

    const detail =
        document.createElement("p");

    detail.classList.add(
        "detail-value"
    );

    detail.textContent = detailText;

    emptyState.append(title, detail);

    return emptyState;
}

function groupRowsByPosition(rows) {
    const groups = new Map();

    rows.forEach(row => {
        const existing =
            groups.get(
                row.positionKey
            );

        if (existing) {
            existing.rows.push(row);
            return;
        }

        groups.set(
            row.positionKey,
            {
                positionKey:
                    row.positionKey,

                displayOrder:
                    row.displayOrder ??
                    999,

                rows: [row],
            }
        );
    });

    return Array.from(
        groups.values()
    ).sort((a, b) => {
        const orderDifference =
            a.displayOrder -
            b.displayOrder;

        if (orderDifference !== 0) {
            return orderDifference;
        }

        return getLeadershipPositionLabel(
            a.positionKey
        ).localeCompare(
            getLeadershipPositionLabel(
                b.positionKey
            )
        );
    });
}

function groupRowsByAo(rows) {
    const groups = new Map();

    rows.forEach(row => {
        const key =
            row.aoId ||
            row.aoName;

        const existing =
            groups.get(key);

        if (existing) {
            existing.rows.push(row);
            return;
        }

        groups.set(key, {
            aoId: row.aoId,
            aoName:
                row.aoName ||
                "Unnamed AO",
            rows: [row],
        });
    });

    return Array.from(
        groups.values()
    ).sort((a, b) =>
        a.aoName.localeCompare(
            b.aoName
        )
    );
}

function compareLeadershipRows(a, b) {
    const orderDifference =
        (a.displayOrder ?? 999) -
        (b.displayOrder ?? 999);

    if (orderDifference !== 0) {
        return orderDifference;
    }

    return a.paxName.localeCompare(
        b.paxName
    );
}

function compareAoLeadershipRows(a, b) {
    const aoDifference =
        (a.aoName || "")
            .localeCompare(
                b.aoName || ""
            );

    if (aoDifference !== 0) {
        return aoDifference;
    }

    return compareLeadershipRows(
        a,
        b
    );
}

function appendMainMenuIfOpen() {
    if (state.isMainMenuOpen) {
        document.body.appendChild(
            createMainMenu()
        );
    }
}