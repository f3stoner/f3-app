import { createAppHeader } from "../components/appHeader.js";
import {
    cleanupMainMenu,
    createMainMenu,
} from "../components/mainMenu.js";
import { state } from "../modules/state.js";
import {
    loadMemberMerges,
    loadOperationsOverview,
} from "../services/cloudData.js";
import {
    hasPermission,
    PERMISSIONS,
} from "../utils/permissions.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";

const ALL_REGIONS_SCOPE = "all";

function getSelectedOperationsScope() {
    return (
        state.operationsOverviewScope ||
        ALL_REGIONS_SCOPE
    );
}

function getScopeRegionId(scope) {
    return scope === ALL_REGIONS_SCOPE
        ? null
        : scope;
}

function getScopeLabel(scope) {
    if (scope === ALL_REGIONS_SCOPE) {
        return "All Regions";
    }

    return (
        state.availableRegions.find(
            region => region.id === scope
        )?.name || "Unknown Region"
    );
}

export function renderOperationsCenterView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (
        !hasPermission(
            PERMISSIONS.ACCESS_OPERATIONS_CENTER
        )
    ) {
        showToast(
            "You do not have access to the Operations Center.",
            "error"
        );
        navigateTo("dashboard");
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
    });

    const titleRow = document.createElement("div");
    titleRow.classList.add("operations-title-row");

    const titleContent = document.createElement("div");

    const title = document.createElement("h1");
    title.textContent = "Operations Center";

    const subtitle = document.createElement("div");
    subtitle.classList.add("detail-label");
    subtitle.textContent =
        "System health, platform analytics, and operational monitoring.";

    titleContent.append(title, subtitle);

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.textContent = "Refresh";

    const content = document.createElement("div");
    content.classList.add("operations-center-content");

    refreshButton.addEventListener("click", () => {
        loadAndRenderOperationsOverview(
            content,
            {
                scope:
                    getSelectedOperationsScope(),
                force: true,
            }
        );
    });

    titleRow.append(titleContent, refreshButton);

    const scopeSelector =
        createOperationsScopeSelector(content);

    app.append(
        header,
        titleRow,
        scopeSelector,
        content
    );

    renderOperationsContent(content);

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function createOperationsScopeSelector(content) {
    const selector =
        document.createElement("div");

    selector.classList.add(
        "operations-scope-selector"
    );

    const scopes = [
        {
            id: ALL_REGIONS_SCOPE,
            name: "All",
        },
        ...(state.availableRegions || [])
            .filter(region =>
                String(region.name || "")
                    .trim()
                    .toLowerCase() !== "sandbox"
            )
            .map(region => ({
                id: region.id,
                name: region.name.replace(/^F3\s+/i, ""),
            })),
    ];

    scopes.forEach(scope => {
        const button =
            document.createElement("button");

        button.type = "button";
        button.textContent = scope.name;

        if (
            scope.id ===
            getSelectedOperationsScope()
        ) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            if (
                scope.id ===
                getSelectedOperationsScope()
            ) {
                return;
            }

            state.operationsOverviewScope =
                scope.id;

            selector
                .querySelectorAll("button")
                .forEach(existingButton => {
                    existingButton.classList.remove(
                        "active"
                    );
                });

            button.classList.add("active");

            renderOperationsContent(content);
        });

        selector.appendChild(button);
    });

    return selector;
}

function renderOperationsContent(content) {
    content.textContent = "";

    const scope =
        getSelectedOperationsScope();

    const overview =
        state.operationsOverviewByScope?.[
            scope
        ] || null;

    const isLoading =
        state.operationsOverviewLoadingScope ===
        scope;

    const loadError =
        state.operationsOverviewErrorsByScope?.[
            scope
        ] || null;

    if (isLoading) {
        const loading =
            document.createElement("div");

        loading.textContent =
            `Loading ${getScopeLabel(scope)}…`;

        content.appendChild(loading);
        return;
    }

    if (loadError) {
        const errorMessage =
            document.createElement("div");

        errorMessage.classList.add(
            "admin-flag-message"
        );

        errorMessage.textContent = loadError;

        const retryButton =
            document.createElement("button");

        retryButton.type = "button";
        retryButton.textContent = "Retry";

        retryButton.addEventListener(
            "click",
            () => {
                loadAndRenderOperationsOverview(
                    content,
                    {
                        scope,
                        force: true,
                    }
                );
            }
        );

        content.append(
            errorMessage,
            retryButton
        );

        return;
    }

    if (!overview) {
        loadAndRenderOperationsOverview(
            content,
            {
                scope,
            }
        );

        return;
    }

    renderOverview(content, overview, scope);
}

async function loadAndRenderOperationsOverview(
    content,
    {
        scope = getSelectedOperationsScope(),
        force = false,
    } = {}
) {
    if (
        state.operationsOverviewLoadingScope ===
        scope
    ) {
        return;
    }

    const cachedOverview =
        state.operationsOverviewByScope?.[
            scope
        ];

    if (cachedOverview && !force) {
        if (
            scope ===
            getSelectedOperationsScope()
        ) {
            renderOperationsContent(content);
        }

        return;
    }

    state.operationsOverviewLoadingScope =
        scope;

    state.operationsOverviewErrorsByScope = {
        ...(state.operationsOverviewErrorsByScope ||
            {}),
        [scope]: null,
    };

    if (
        scope ===
            getSelectedOperationsScope() &&
        content.isConnected
    ) {
        renderOperationsContent(content);
    }

    try {
        const [
            overview,
            memberMerges,
        ] = await Promise.all([
            loadOperationsOverview(
                getScopeRegionId(scope)
            ),
            loadMemberMerges(),
        ]);
        
        state.operationsOverviewByScope = {
            ...(state.operationsOverviewByScope ||
                {}),
            [scope]: {
                ...overview,
                memberMerges,
            },
        };
    } catch (error) {
        console.error(
            "Failed to load Operations Center:",
            error
        );

        state.operationsOverviewErrorsByScope = {
            ...(state.operationsOverviewErrorsByScope ||
                {}),
            [scope]:
                error?.message ||
                "Failed to load the Operations Center.",
        };
    } finally {
        if (
            state.operationsOverviewLoadingScope ===
            scope
        ) {
            state.operationsOverviewLoadingScope =
                null;
        }
    }

    if (
        state.currentView ===
            "operationsCenter" &&
        scope ===
            getSelectedOperationsScope() &&
        content.isConnected
    ) {
        renderOperationsContent(content);
    }
}

function renderOverview(content, overview, scope) {
    if (!overview) {
        const empty =
            document.createElement("div");

        empty.textContent =
            "No Operations Center data is available.";

        content.appendChild(empty);
        return;
    }

    const adoptionSection = createSection(
        "Community",
        [
            createMetricCard(
                "Total Users",
                overview.users.total,
                "Home region members"
            ),
            createMetricCard(
                "New Users",
                overview.users.new7d,
                "Last 7 days"
            ),
            createMetricCard(
                "Active Users",
                overview.activity.active7d,
                "Last 7 days"
            ),
            createMetricCard(
                "30-Day Active",
                overview.activity.active30d,
                "Last 30 days"
            ),
        ]
    );

    const usageSection = createSection(
        "Usage",
        [
            createMetricCard(
                "App Opens Today",
                overview.activity.appOpensToday,
                "Today"
            ),
            createMetricCard(
                "Sessions Logged",
                overview.usage7d.sessionsLogged,
                "Last 7 days"
            ),
            createMetricCard(
                "Workouts Created",
                overview.usage7d.workoutsCreated,
                "Last 7 days"
            ),
            createMetricCard(
                "Executions Started",
                overview.usage7d.executionsStarted,
                "Last 7 days"
            ),
            createMetricCard(
                "Backblasts Generated",
                overview.usage7d.backblastsGenerated,
                "Last 7 days"
            ),
        ]
    );

    const healthSection = createSection(
        "System Health",
        [
            createMetricCard(
                "Audit Status",
                "Not configured",
                "The modern audit engine comes next"
            ),
        ]
    );

    const generated =
        document.createElement("div");

    generated.classList.add("stats-line");

    generated.textContent =
        overview.generatedAt
            ? `Updated ${new Date(
                overview.generatedAt
            ).toLocaleString()}`
            : "Update time unavailable";

    const memberMergeSection =
        createMemberMergeSection(
            overview.memberMerges || []
        );
    
    content.append(
        adoptionSection,
        usageSection,
        healthSection,
        memberMergeSection,
        generated
    );
}

function createSection(titleText, cards) {
    const section =
        document.createElement("section");

    section.classList.add(
        "operations-section"
    );

    const title =
        document.createElement("h2");

    title.textContent = titleText;

    const grid =
        document.createElement("div");

    grid.classList.add("operations-metric-grid");
    grid.append(...cards);

    section.append(title, grid);

    return section;
}

function createMemberMergeSection(
    merges
) {
    const section =
        document.createElement("section");

    section.classList.add(
        "operations-section"
    );

    const title =
        document.createElement("h2");

    title.textContent =
        "Member Merges";

    section.appendChild(title);

    if (merges.length === 0) {
        const empty =
            document.createElement("div");

        empty.classList.add("stats-line");

        empty.textContent =
            "No pending member merges.";

        section.appendChild(empty);

        return section;
    }

    merges.forEach(merge => {
        const row =
            document.createElement("div");

        row.classList.add(
            "operations-list-row"
        );

        const text =
            document.createElement("div");

        text.classList.add(
            "operations-list-text"
        );

        text.textContent =
            `${merge.duplicate_pax_name} → ${merge.canonical_pax_name}`;

        const button =
            document.createElement("button");

        button.type = "button";
        button.textContent = "Review";

        button.addEventListener(
            "click",
            () => {
                navigateTo(
                    "memberMergeDetail",
                    {
                        mergeId:
                            merge.merge_id,
                    }
                );
            }
        );

        row.append(
            text,
            button
        );

        section.appendChild(row);
    });

    return section;
}

function createMetricCard(
    labelText,
    valueText,
    detailText
) {
    const card =
        document.createElement("div");

    card.classList.add("operations-metric-card");

    const label =
        document.createElement("div");

    label.classList.add("detail-label");
    label.textContent = labelText;

    const value =
        document.createElement("div");

    value.classList.add(
        "operations-metric-value"
    );

    value.textContent = String(valueText);

    const detail =
        document.createElement("div");

    detail.classList.add("stats-line");
    detail.textContent = detailText;

    card.append(label, value, detail);

    return card;
}