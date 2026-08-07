import { state } from "../modules/state.js";
import { cleanupMainMenu } from "../components/mainMenu.js";
import { loadRegionFeedPage } from "../services/regionFeedService.js";
import { renderSessionCompletedCard } from "../components/regionFeed/sessionCompletedCard.js";
import { createGlobalNav } from "../components/globalNav.js";
import { renderMemberMilestoneRow } from "../components/regionFeed/memberMilestoneRow.js";
import { renderAnnouncementPublishedRow } from "../components/regionFeed/announcementPublishedRow.js";
import { createAppHeader } from "../components/appHeader.js";
import { renderFngWelcomedRow } from "../components/regionFeed/fngWelcomedRow.js";
import { renderVqEarnedRow } from "../components/regionFeed/vqEarnedRow.js";

let regionFeedRequestSequence = 0;

const eventRenderers = {
    session_completed: renderSessionCompletedCard,
    member_milestone: renderMemberMilestoneRow,
    announcement_published: renderAnnouncementPublishedRow,
    fng_welcomed: renderFngWelcomedRow,
    vq_earned: renderVqEarnedRow,
};

function resetRegionFeed(regionId) {
    state.regionFeed = {
        regionId,
        items: [],
        nextCursor: null,
        isLoading: false,
        hasLoaded: false,
        error: null,
        hasMore: true,
    };
}

function createLoadingState() {
    const loading =
        document.createElement("div");

    loading.className =
        "region-feed-state";

    loading.setAttribute(
        "aria-live",
        "polite"
    );

    const spinner =
        document.createElement("div");

    spinner.className =
        "region-feed-spinner";

    spinner.setAttribute(
        "aria-hidden",
        "true"
    );

    const text =
        document.createElement("div");

    text.className =
        "region-feed-state-copy";

    text.textContent =
        "Loading regional activity…";

    loading.append(
        spinner,
        text
    );

    return loading;
}

function createEmptyState() {
    const empty =
        document.createElement("section");

    empty.className =
        "region-feed-state region-feed-empty";

    const heading =
        document.createElement("h2");

    heading.textContent =
        "The feed is just getting started";

    const copy =
        document.createElement("p");

    copy.textContent =
        "Newly logged workouts will appear here.";

    empty.append(
        heading,
        copy
    );

    return empty;
}

function createErrorState(onRetry) {
    const errorState =
        document.createElement("section");

    errorState.className =
        "region-feed-state region-feed-error";

    const heading =
        document.createElement("h2");

    heading.textContent =
        "Unable to load activity";

    const copy =
        document.createElement("p");

    copy.textContent =
        navigator.onLine
            ? "Something interrupted the request."
            : "Reconnect to load regional activity.";

    const retry =
        document.createElement("button");

    retry.type = "button";
    retry.className =
        "region-feed-retry";

    retry.textContent =
        "Try Again";

    retry.addEventListener(
        "click",
        onRetry
    );

    errorState.append(
        heading,
        copy,
        retry
    );

    return errorState;
}

function createUnsupportedEvent(event) {
    const card =
        document.createElement("article");

    card.className =
        "region-feed-card region-feed-card-unsupported";

    card.textContent =
        `Unsupported event: ${event.eventType}`;

    return card;
}

function getLocalDateKey(timestamp) {
    if (!timestamp) return "unknown";

    const date = new Date(timestamp);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function getDateGroupLabel(timestamp) {
    if (!timestamp) return "Earlier";

    const eventDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();

    yesterday.setDate(today.getDate() - 1);

    if (getLocalDateKey(eventDate) === getLocalDateKey(today)) {
        return "Today";
    }

    if (getLocalDateKey(eventDate) === getLocalDateKey(yesterday)) {
        return "Yesterday";
    }

    return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
    }).format(eventDate);
}

function renderFeedItems(items) {
    const groups = new Map();

    items.forEach(event => {
        const key = getLocalDateKey(event.occurredAt);
        const group = groups.get(key) || {
            label: getDateGroupLabel(event.occurredAt),
            items: [],
        };

        group.items.push(event);
        groups.set(key, group);
    });

    const feed = document.createElement("div");
    feed.className = "region-feed-groups";

    groups.forEach(group => {
        const section = document.createElement("section");
        section.className = "region-feed-group";

        const heading = document.createElement("h2");
        heading.className = "region-feed-group-label";
        heading.textContent = group.label;

        const list = document.createElement("div");
        list.className = "region-feed-list";

        group.items.forEach(event => {
            const renderer = eventRenderers[event.eventType];

            list.appendChild(
                renderer
                    ? renderer(event)
                    : createUnsupportedEvent(event)
            );
        });

        section.append(heading, list);
        feed.appendChild(section);
    });

    return feed;
}

async function loadInitialFeed({
    regionId,
}) {
    const requestSequence = ++regionFeedRequestSequence;
    state.regionFeed.isLoading = true;
    state.regionFeed.error = null;

    try {
        const page =
            await loadRegionFeedPage({
                regionId,
            });

        if (
            requestSequence !==
                regionFeedRequestSequence ||
            state.currentView !==
                "regionFeed" ||
            state.currentRegionId !==
                regionId
        ) {
            return;
        }

        state.regionFeed.items =
            page.items;

        state.regionFeed.nextCursor =
            page.nextCursor;

        state.regionFeed.hasMore =
            page.hasMore;

        state.regionFeed.hasLoaded =
            true;
    } catch (error) {
        if (
            requestSequence !==
                regionFeedRequestSequence ||
            state.currentView !==
                "regionFeed" ||
            state.currentRegionId !==
                regionId
        ) {
            return;
        }

        state.regionFeed.error =
            error;
    } finally {
        if (
            requestSequence ===
                regionFeedRequestSequence &&
            state.currentView ===
                "regionFeed" &&
            state.currentRegionId ===
                regionId
        ) {
            state.regionFeed.isLoading =
                false;

            renderRegionFeedView();
        }
    }
}

async function loadMoreFeed({
    button,
    regionId,
}) {
    if (
        state.regionFeed.isLoading ||
        !state.regionFeed.hasMore ||
        !state.regionFeed.nextCursor
    ) {
        return;
    }

    state.regionFeed.isLoading = true;
    button.disabled = true;
    button.textContent = "Loading…";

    try {
        const page =
            await loadRegionFeedPage({
                regionId,
                cursor:
                    state.regionFeed
                        .nextCursor,
            });

        if (
            state.currentView !==
                "regionFeed" ||
            state.currentRegionId !==
                regionId
        ) {
            return;
        }

        const itemsById =
            new Map(
                state.regionFeed.items.map(
                    item => [
                        item.id,
                        item,
                    ]
                )
            );

        page.items.forEach(item => {
            itemsById.set(
                item.id,
                item
            );
        });

        state.regionFeed.items =
            [...itemsById.values()];

        state.regionFeed.nextCursor =
            page.nextCursor;

        state.regionFeed.hasMore =
            page.hasMore;

        renderRegionFeedView();
    } catch (error) {
        console.error(
            "Failed to load more feed items:",
            error
        );

        button.disabled = false;
        button.textContent =
            "Load More";
    } finally {
        state.regionFeed.isLoading =
            false;
    }
}

export function renderRegionFeedView() {
    const app = document.getElementById("app");

    const regionId = state.currentRegionId;

    app.textContent = "";
    app.className = "view-regionFeed";

    cleanupMainMenu();

    if (state.currentUserRole !== "superadmin") {
        app.textContent = "You do not have permission to view Activity.";
        return;
    }

    if (
        !state.regionFeed ||
        state.regionFeed.regionId !==
            regionId
    ) {
        resetRegionFeed(
            regionId
        );
    }

    const content = document.createElement("main");

    content.className = "region-feed-content";

    const header = createAppHeader({
        title: "Activity",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    app.append(
        header,
        content,
        createGlobalNav()
    );

    if (
        !state.regionFeed.hasLoaded &&
        !state.regionFeed.isLoading &&
        !state.regionFeed.error
    ) {
        content.appendChild(createLoadingState());
    
        void loadInitialFeed({
            regionId,
        });
    
        return;
    }

    if (
        state.regionFeed.isLoading &&
        state.regionFeed.items.length === 0
    ) {
        content.appendChild(
            createLoadingState()
        );
    
        return;
    }

    if (
        state.regionFeed.error &&
        state.regionFeed.items.length === 0
    ) {
        content.appendChild(
            createErrorState(
                () => {
                    resetRegionFeed(
                        regionId
                    );

                    renderRegionFeedView();
                }
            )
        );

        return;
    }

    if (
        state.regionFeed.hasLoaded &&
        state.regionFeed.items.length === 0
    ) {
        content.appendChild(
            createEmptyState()
        );
    
        return;
    }

    content.appendChild(
        renderFeedItems(
            state.regionFeed.items
        )
    );

    if (state.regionFeed.hasMore) {
        const loadMoreButton =
            document.createElement("button");

        loadMoreButton.type = "button";
        loadMoreButton.className =
            "region-feed-load-more";

        loadMoreButton.textContent =
            "Load More";

        loadMoreButton.addEventListener(
            "click",
            () => {
                void loadMoreFeed({
                    button:
                        loadMoreButton,
                    regionId,
                });
            }
        );

        content.appendChild(
            loadMoreButton
        );
    }
}