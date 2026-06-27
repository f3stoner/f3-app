import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { loadThirdFDiscussions } from "../services/thirdFData.js";
import { showToast } from "../utils/toast.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";

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
    card.classList.add("member-card", "third-f-discussion-card");

    if (featured) {
        card.classList.add("third-f-featured-card");
    }

    const meta = document.createElement("div");
    meta.classList.add("detail-label");
    meta.textContent = `${getTypeLabel(discussion.type)} • Week of ${formatWeek(discussion.weekStartDate)}`;

    const title = document.createElement("div");
    title.classList.add("member-name");
    title.textContent = discussion.title || "Third F Discussion";

    const summary = document.createElement("div");
    summary.classList.add("stats-line");
    summary.textContent = discussion.summary || "No summary provided.";

    const isExpanded = state.expandedThirdFDiscussionId === discussion.id;

    const body = document.createElement("div");
    body.classList.add("stats-line", "third-f-discussion-body");
    body.textContent = discussion.discussion || "";

    body.style.display = isExpanded ? "" : "none";

    const actions = document.createElement("div");
    actions.classList.add("button-row");

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
        linkButton.classList.add("secondary-button");
        linkButton.href = discussion.link;
        linkButton.target = "_blank";
        linkButton.rel = "noopener noreferrer";
        linkButton.textContent = "Open Link";

        actions.appendChild(linkButton);
    }

    card.append(meta, title, summary, body);

    if (actions.children.length > 0) {
        card.appendChild(actions);
    }

    return card;
}

export function renderThirdFView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (!state.hasLoadedThirdFDiscussions && !state.isLoadingThirdFDiscussions) {
        state.isLoadingThirdFDiscussions = true;

        loadThirdFDiscussions()
            .then(discussions => {
                state.thirdFDiscussions = discussions;
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

    const discussions = state.thirdFDiscussions || [];
    const currentDiscussion = discussions[0];
    const previousDiscussions = discussions.slice(1);

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
        archiveTitle.textContent = "Previous Discussions";

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