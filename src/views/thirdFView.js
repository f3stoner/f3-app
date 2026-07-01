import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { loadThirdFDiscussions } from "../services/thirdFData.js";
import { showToast } from "../utils/toast.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { filterDateAwareContent } from "../utils/dateAwareContent.js";

function getTypeLabel(type) {
    const labels = {
        q_source: "Q Source",
        discussion: "Discussion",
        leadership: "Leadership",
        devotional: "Devotional",
        service: "Service",
        service_project: "Service Project",
        event: "Event",
        resource: "Resource",
        custom: "Custom",
    };

    return labels[type] || "Discussion";
}

function formatWeek(dateString) {
    if (!dateString) return "No week set";

    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function renderDiscussionCard(discussion, { featured = false } = {}) {
    const card = document.createElement("div");
    card.classList.add("third-f-discussion-card");

    if (featured) {
        card.classList.add("third-f-featured-card");
    }

    const isExpanded = state.expandedThirdFDiscussionId === discussion.id;

    const meta = document.createElement("div");
    meta.classList.add("third-f-discussion-meta");
    meta.textContent = `${getTypeLabel(discussion.type)} • Week of ${formatWeek(discussion.weekStartDate)}`;

    const title = document.createElement("div");
    title.classList.add("third-f-discussion-title");
    title.textContent = discussion.title || "Third F Discussion";

    const summary = document.createElement("div");
    summary.classList.add("third-f-discussion-summary");
    summary.textContent = discussion.summary || "No summary provided.";

    const body = document.createElement("div");
    body.classList.add("third-f-discussion-body");
    body.textContent = discussion.discussion || "";
    body.style.display = isExpanded ? "" : "none";

    const actions = document.createElement("div");
    actions.classList.add("third-f-discussion-actions");

    if (discussion.discussion) {
        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.classList.add("secondary-button");
        toggleButton.textContent = isExpanded ? "Hide Discussion" : "Show Discussion";

        toggleButton.addEventListener("click", () => {
            state.expandedThirdFDiscussionId = isExpanded ? null : discussion.id;
            renderApp();
        });

        actions.appendChild(toggleButton);
    }

    if (discussion.link) {
        const linkButton = document.createElement("a");
        linkButton.classList.add("secondary-button", "third-f-link-button");
        linkButton.href = discussion.link;
        linkButton.target = "_blank";
        linkButton.rel = "noopener noreferrer";
        linkButton.textContent = "Open Link";

        actions.appendChild(linkButton);
    }

    card.append(meta, title, summary);

    if (isExpanded && discussion.discussion) {
        const divider = document.createElement("div");
        divider.classList.add("third-f-discussion-divider");

        card.append(divider, body);
    }

    if (actions.children.length > 0) {
        card.appendChild(actions);
    }

    return card;
}

export function renderThirdFView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (state.thirdFDiscussionsRegionId !== state.currentRegionId) {
        state.thirdFDiscussions = [];
        state.hasLoadedThirdFDiscussions = false;
        state.expandedThirdFDiscussionId = null;
    }

    if (!state.hasLoadedThirdFDiscussions && !state.isLoadingThirdFDiscussions) {
        state.isLoadingThirdFDiscussions = true;

        loadThirdFDiscussions(state.currentRegionId)
            .then(discussions => {
                state.thirdFDiscussions = discussions;
                state.thirdFDiscussionsRegionId = state.currentRegionId;
                state.hasLoadedThirdFDiscussions = true;
            })
            .catch(error => {
                console.error("Failed to load Third F discussions:", error);
                showToast("Failed to load Third F discussions.", "error");
            })
            .finally(() => {
                state.isLoadingThirdFDiscussions = false;

                if (state.currentView === "thirdF") {
                    renderApp();
                }
            });
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Third F";

    const intro = document.createElement("div");
    intro.classList.add("section");

    const introLabel = document.createElement("div");
    introLabel.classList.add("detail-label");
    introLabel.textContent = "Faith · Fellowship · Impact";

    const introText = document.createElement("div");
    introText.classList.add("detail-value");
    introText.textContent =
        "The Third F is where the region shares weekly discussion topics, leadership prompts, service opportunities, and other resources that help PAX grow beyond the workout.";

    intro.append(introLabel, introText);

    const content = document.createElement("div");
    content.classList.add("section");

    if (state.isLoadingThirdFDiscussions) {
        const loading = document.createElement("div");
        loading.classList.add("detail-value");
        loading.textContent = "Loading Third F discussions...";
        content.appendChild(loading);

        app.append(header, title, intro, content, createGlobalNav());
        if (state.isMainMenuOpen) {
            document.body.appendChild(createMainMenu());
        }
        return;
    }

    const discussions = filterDateAwareContent(state.thirdFDiscussions || [])
    .sort((a, b) => {
        const dateA = a.weekStartDate ? new Date(`${a.weekStartDate}T00:00:00`) : new Date(0);
        const dateB = b.weekStartDate ? new Date(`${b.weekStartDate}T00:00:00`) : new Date(0);

        return dateA - dateB;
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentDiscussion =
        discussions.find(discussion => {
            if (!discussion.weekStartDate) return false;
    
            const weekDate = new Date(`${discussion.weekStartDate}T00:00:00`);
            return weekDate >= today;
        }) || discussions[discussions.length - 1];
    
    const previousDiscussions = discussions.filter(
        discussion => discussion.id !== currentDiscussion?.id
    );

    if (!currentDiscussion) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No Third F discussions have been published yet.";
        content.appendChild(empty);

        app.append(header, title, intro, content, createGlobalNav());
        if (state.isMainMenuOpen) {
            document.body.appendChild(createMainMenu());
        }
        return;
    }

    const currentLabel = document.createElement("h2");
    currentLabel.textContent = "This Week";

    content.append(currentLabel, renderDiscussionCard(currentDiscussion, { featured: true }));

    if (previousDiscussions.length > 0) {
        const archive = document.createElement("div");
        archive.classList.add("section");

        const archiveTitle = document.createElement("h2");
        archiveTitle.textContent = "All Discussions";

        archive.appendChild(archiveTitle);

        previousDiscussions.forEach(discussion => {
            archive.appendChild(renderDiscussionCard(discussion));
        });

        app.append(header, title, intro, content, archive, createGlobalNav());
        if (state.isMainMenuOpen) {
            document.body.appendChild(createMainMenu());
        }
        return;
    }

    app.append(header, title, intro, content, createGlobalNav());

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}