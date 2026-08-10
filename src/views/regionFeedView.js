import { state } from "../modules/state.js";
import { cleanupMainMenu } from "../components/mainMenu.js";
import {
    loadRegionFeedPage,
    loadWorkoutSocialSummaries,
} from "../services/regionFeedService.js";
import { renderSessionCompletedCard } from "../components/regionFeed/sessionCompletedCard.js";
import { createGlobalNav } from "../components/globalNav.js";
import { renderMemberMilestoneRow } from "../components/regionFeed/memberMilestoneRow.js";
import { renderAnnouncementPublishedRow } from "../components/regionFeed/announcementPublishedRow.js";
import { createAppHeader } from "../components/appHeader.js";
import { renderFngWelcomedRow } from "../components/regionFeed/fngWelcomedRow.js";
import { renderVqEarnedRow } from "../components/regionFeed/vqEarnedRow.js";
import {
    loadQSlotCommitmentSummaries,
    loadQSlotCommitments,
    setQSlotCommitment,
} from "../services/cloudData.js";
import { createUpcomingWorkoutCardViewModel } from "../utils/upcomingWorkoutViewModel.js";
import { renderUpcomingWorkoutCard } from "../components/regionFeed/upcomingWorkoutCard.js";
import { resolveMediaUrls } from "../services/mediaService.js";

let regionFeedRequestSequence = 0;
let upcomingWorkoutSummaryRequestKey = null;
let upcomingWorkoutSocialRequestKey = null;

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

        avatarUrls: new Map(),
        avatarUrlsLoading: false,

        expandedUpcomingSlotId: null,

        upcomingCommitmentsBySlotId: {},
        upcomingCommitmentDetailsLoadingBySlotId: {},
        upcomingCommitmentDetailsErrorBySlotId: {},
        upcomingCommitmentUpdatingBySlotId: {},
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

function loadRegionFeedAvatarUrls() {
    if (state.regionFeed.avatarUrlsLoading) return;

    const members = [
        ...(state.participants || []),
        ...(state.members || []),
        ...state.regionFeed.items
            .map(item => item.member)
            .filter(Boolean),
    ];
    
    const avatarPaths = [
        ...new Set(
            members
                .map(member => member.avatarPath)
                .filter(Boolean)
        ),
    ];
    
    if (avatarPaths.length === 0) {
        return;
    }

    const unresolvedPaths =
        avatarPaths.filter(
            path =>
                !state.regionFeed.avatarUrls.has(
                    path
                )
        );

    if (unresolvedPaths.length === 0) {
        return;
    }

    const workspaceGeneration =
        state.workspaceGeneration;

    state.regionFeed.avatarUrlsLoading = true;

    resolveMediaUrls(unresolvedPaths)
        .then(urls => {
            if (
                workspaceGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }

            urls.forEach((url, path) => {
                state.regionFeed.avatarUrls.set(
                    path,
                    url
                );
            });

            if (
                state.currentView ===
                "regionFeed"
            ) {
                renderRegionFeedView();
            }
        })
        .catch(error => {
            console.warn(
                "Failed to resolve feed avatars:",
                error
            );
        })
        .finally(() => {
            if (
                workspaceGeneration ===
                state.workspaceGeneration
            ) {
                state.regionFeed.avatarUrlsLoading = false;
            }
        });
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

/*
 * Upcoming rolls forward at 06:00 rather than midnight.
 *
 * Before 06:00, today's calendar date is still treated as
 * the upcoming workout date. At 06:00 and later, Upcoming
 * advances to tomorrow.
 */
function getUpcomingWorkoutDateKey() {
    const now = new Date();

    const targetDate =
        new Date(now);

    if (now.getHours() >= 6) {
        targetDate.setDate(
            targetDate.getDate() + 1
        );
    }

    return [
        targetDate.getFullYear(),
        String(
            targetDate.getMonth() + 1
        ).padStart(2, "0"),
        String(
            targetDate.getDate()
        ).padStart(2, "0"),
    ].join("-");
}

function getUpcomingQSlots() {
    const upcomingDate =
        getUpcomingWorkoutDateKey();

    return (
        state.qSlots || []
    )
        .filter(slot => {
            return (
                slot.date === upcomingDate &&
                Boolean(slot.qUserId)
            );
        });
}

function loadUpcomingWorkoutSummaries(
    slots
) {
    const slotIds =
        slots
            .map(slot => slot.id)
            .filter(Boolean);

    if (slotIds.length === 0) {
        return;
    }

    const requestKey = [
        state.currentRegionId,
        state.workspaceGeneration,
        ...slotIds,
    ].join("__");

    if (
        upcomingWorkoutSummaryRequestKey ===
        requestKey
    ) {
        return;
    }

    upcomingWorkoutSummaryRequestKey =
        requestKey;

    const workspaceGeneration =
        state.workspaceGeneration;

    loadQSlotCommitmentSummaries(
        slotIds
    )
        .then(summaries => {
            if (
                workspaceGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }

            const bySlotId = {};

            slotIds.forEach(slotId => {
                bySlotId[slotId] = {
                    qSlotId: slotId,
                    hcCount: 0,
                    scCount: 0,
                    myCommitment: null,
                };
            });

            summaries.forEach(summary => {
                bySlotId[
                    summary.qSlotId
                ] = summary;
            });

            state.regionFeedUpcomingCommitmentSummaries =
                bySlotId;

            if (
                state.currentView ===
                "regionFeed"
            ) {
                renderRegionFeedView();
            }
        })
        .catch(error => {
            console.error(
                "Failed to load upcoming workout commitments:",
                error
            );

            upcomingWorkoutSummaryRequestKey =
                null;
        });
}

function loadUpcomingWorkoutSocialSummaries(
    slots
) {
    const slotIds =
        slots
            .map(slot => slot.id)
            .filter(Boolean);

    if (slotIds.length === 0) {
        return;
    }

    const requestKey = [
        state.currentRegionId,
        state.workspaceGeneration,
        ...slotIds,
    ].join("__");

    if (
        upcomingWorkoutSocialRequestKey ===
        requestKey
    ) {
        return;
    }

    upcomingWorkoutSocialRequestKey =
        requestKey;

    const workspaceGeneration =
        state.workspaceGeneration;

    loadWorkoutSocialSummaries(
        slotIds
    )
        .then(summariesBySlotId => {
            if (
                workspaceGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }

            state.regionFeedWorkoutSocialBySlotId =
                Object.fromEntries(
                    summariesBySlotId
                );

            if (
                state.currentView ===
                "regionFeed"
            ) {
                renderRegionFeedView();
            }
        })
        .catch(error => {
            console.error(
                "Failed to hydrate upcoming workout social:",
                error
            );

            upcomingWorkoutSocialRequestKey =
                null;
        });
}

async function loadUpcomingCommitmentDetails(
    qSlotId
) {
    if (!qSlotId) return;

    const alreadyLoaded =
        Object.prototype.hasOwnProperty.call(
            state.regionFeed
                .upcomingCommitmentsBySlotId,
            qSlotId
        );

    const isLoading =
        Boolean(
            state.regionFeed
                .upcomingCommitmentDetailsLoadingBySlotId?.[
                    qSlotId
                ]
        );

    if (alreadyLoaded || isLoading) {
        return;
    }

    const workspaceGeneration =
        state.workspaceGeneration;

    state.regionFeed
        .upcomingCommitmentDetailsLoadingBySlotId[
            qSlotId
        ] = true;

    state.regionFeed
        .upcomingCommitmentDetailsErrorBySlotId[
            qSlotId
        ] = false;

    renderRegionFeedView();

    try {
        const commitments =
            await loadQSlotCommitments(
                qSlotId
            );

        if (
            workspaceGeneration !==
            state.workspaceGeneration
        ) {
            return;
        }

        state.regionFeed
            .upcomingCommitmentsBySlotId[
                qSlotId
            ] =
                Array.isArray(commitments)
                    ? commitments
                    : [];
    } catch (error) {
        if (
            workspaceGeneration !==
            state.workspaceGeneration
        ) {
            return;
        }

        console.error(
            "Failed to load upcoming workout commitments:",
            {
                qSlotId,
                error,
            }
        );

        state.regionFeed
            .upcomingCommitmentDetailsErrorBySlotId[
                qSlotId
            ] = true;
    } finally {
        if (
            workspaceGeneration !==
            state.workspaceGeneration
        ) {
            return;
        }

        state.regionFeed
            .upcomingCommitmentDetailsLoadingBySlotId[
                qSlotId
            ] = false;

        if (
            state.currentView ===
            "regionFeed"
        ) {
            renderRegionFeedView();
        }
    }
}

async function updateUpcomingCommitment(
    workout,
    commitmentType
) {
    const qSlotId =
        workout?.slotId;

    const memberId =
        state.currentUserMemberId;

    if (!qSlotId || !memberId) {
        return;
    }

    if (
        state.regionFeed
            .upcomingCommitmentUpdatingBySlotId?.[
                qSlotId
            ]
    ) {
        return;
    }

    const currentSummary =
        state
            .regionFeedUpcomingCommitmentSummaries?.[
                qSlotId
            ] || {
                qSlotId,
                hcCount: 0,
                scCount: 0,
                myCommitment: null,
            };

    const previousCommitment =
        currentSummary.myCommitment ||
        null;

    const nextCommitment =
        previousCommitment ===
            commitmentType
            ? null
            : commitmentType;

    state.regionFeed
        .upcomingCommitmentUpdatingBySlotId[
            qSlotId
        ] = true;

    try {
        await setQSlotCommitment({
            qSlotId,
            memberId,
            commitmentType:
                nextCommitment,
        });

        let hcCount =
            Number(
                currentSummary.hcCount
            ) || 0;

        let scCount =
            Number(
                currentSummary.scCount
            ) || 0;

        if (
            previousCommitment === "hc"
        ) {
            hcCount =
                Math.max(
                    hcCount - 1,
                    0
                );
        }

        if (
            previousCommitment === "sc"
        ) {
            scCount =
                Math.max(
                    scCount - 1,
                    0
                );
        }

        if (
            nextCommitment === "hc"
        ) {
            hcCount += 1;
        }

        if (
            nextCommitment === "sc"
        ) {
            scCount += 1;
        }

        state
            .regionFeedUpcomingCommitmentSummaries = {
                ...(
                    state
                        .regionFeedUpcomingCommitmentSummaries ||
                    {}
                ),

                [qSlotId]: {
                    ...currentSummary,
                    qSlotId,
                    hcCount,
                    scCount,
                    myCommitment:
                        nextCommitment,
                },
            };

        /*
         * Force a fresh detail read next time the expanded
         * card needs the actual member list.
         */
        delete state.regionFeed
            .upcomingCommitmentsBySlotId[
                qSlotId
            ];

        if (
            state.regionFeed
                .expandedUpcomingSlotId ===
            qSlotId
        ) {
            void loadUpcomingCommitmentDetails(
                qSlotId
            );
        }
    } catch (error) {
        console.error(
            "Failed to update upcoming workout commitment:",
            {
                qSlotId,
                commitmentType:
                    nextCommitment,
                error,
            }
        );
    } finally {
        state.regionFeed
            .upcomingCommitmentUpdatingBySlotId[
                qSlotId
            ] = false;

        if (
            state.currentView ===
            "regionFeed"
        ) {
            renderRegionFeedView();
        }
    }
}

function renderUpcomingWorkouts() {
    const slots =
        getUpcomingQSlots();

    if (slots.length === 0) {
        return null;
    }

    loadUpcomingWorkoutSummaries(
        slots
    );

    loadUpcomingWorkoutSocialSummaries(
        slots
    );

    const workouts =
        slots.map(slot => {
            const commitmentSummary =
                state
                    .regionFeedUpcomingCommitmentSummaries?.[
                        slot.id
                    ] || null;

            const defaultSocialState = {
                reactionCounts: {
                    like: 0,
                    strong: 0,
                    fire: 0,
                    applause: 0,
                    heart: 0,
                },
                reactionTotal: 0,
                currentReaction: null,
                commentCount: 0,
            };
            
            if (
                !state.regionFeedWorkoutSocialBySlotId?.[
                    slot.id
                ]
            ) {
                state.regionFeedWorkoutSocialBySlotId = {
                    ...(
                        state.regionFeedWorkoutSocialBySlotId ||
                        {}
                    ),
            
                    [slot.id]: {
                        ...defaultSocialState,
                        reactionCounts: {
                            ...defaultSocialState.reactionCounts,
                        },
                    },
                };
            }
            
            const socialState =
                state.regionFeedWorkoutSocialBySlotId[
                    slot.id
                ];

            const workout =
                createUpcomingWorkoutCardViewModel({
                    slot,
                    workouts:
                        state.plannedWorkouts || [],
                    aos:
                        state.aos || [],
                    sessions:
                        state.sessions || [],
                    commitmentSummary,
                    memberDirectory:
                        state.regionParticipants ||
                        state.members ||
                        [],
                });
            
            if (!workout) {
                return null;
            }
            
            workout.socialState =
                socialState;
            
            return workout;
        })
        .filter(Boolean)
        .sort((a, b) => {
            return (
                (a.displayTime || "")
                    .localeCompare(
                        b.displayTime || ""
                    ) ||
                a.aoName.localeCompare(
                    b.aoName
                )
            );
        });

    const section =
        document.createElement("section");

    section.className =
        "region-feed-upcoming";

    const header =
        document.createElement("div");

    header.className =
        "region-feed-upcoming-header";

    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "region-feed-group-label";

    eyebrow.textContent =
        "Upcoming";

    header.append(
        eyebrow,
    );

    const list =
        document.createElement("div");

    list.className =
        "region-feed-upcoming-list";

    workouts.forEach(workout => {
        const isExpanded =
            state.regionFeed
                .expandedUpcomingSlotId ===
            workout.slotId;
    
        const commitments =
            state.regionFeed
                .upcomingCommitmentsBySlotId?.[
                    workout.slotId
                ];
    
        const detailsLoading =
            Boolean(
                state.regionFeed
                    .upcomingCommitmentDetailsLoadingBySlotId?.[
                        workout.slotId
                    ]
            );
    
        const detailsError =
            Boolean(
                state.regionFeed
                    .upcomingCommitmentDetailsErrorBySlotId?.[
                        workout.slotId
                    ]
            );
    
        const isUpdating =
            Boolean(
                state.regionFeed
                    .upcomingCommitmentUpdatingBySlotId?.[
                        workout.slotId
                    ]
            );
    
        list.appendChild(
            renderUpcomingWorkoutCard({
                workout,
                isExpanded,
                commitments,
                detailsLoading,
                detailsError,
                isUpdating,
    
                onCommitment:
                    commitmentType => {
                        void updateUpcomingCommitment(
                            workout,
                            commitmentType
                        );
                    },
    
                onRetryDetails:
                    () => {
                        delete state.regionFeed
                            .upcomingCommitmentsBySlotId[
                                workout.slotId
                            ];
    
                        void loadUpcomingCommitmentDetails(
                            workout.slotId
                        );
                    },
    
                onToggle: () => {
                    const willExpand =
                        !isExpanded;
    
                    state.regionFeed
                        .expandedUpcomingSlotId =
                            willExpand
                                ? workout.slotId
                                : null;
    
                    renderRegionFeedView();
    
                    if (willExpand) {
                        void loadUpcomingCommitmentDetails(
                            workout.slotId
                        );
                    }
                },
            })
        );
    });

    section.append(
        header,
        list
    );

    return section;
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
                    ? renderer(event, {
                        avatarUrls:
                            state.regionFeed.avatarUrls,
                    })
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

    loadRegionFeedAvatarUrls();

    const upcomingWorkouts =
        renderUpcomingWorkouts();

    if (upcomingWorkouts) {
        content.appendChild(
            upcomingWorkouts
        );
    }

    const activityHeading =
        document.createElement("div");

    activityHeading.className =
        "region-feed-activity-heading";

    activityHeading.textContent =
        "Regional Activity";

    content.appendChild(
        activityHeading
    );

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