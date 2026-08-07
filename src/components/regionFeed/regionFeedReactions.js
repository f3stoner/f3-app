import { setRegionFeedReaction } from "../../services/regionFeedService.js";
import { createIcon } from "../../utils/icons.js";

const REACTIONS = [
    {
        type: "like",
        emoji: "👍",
        label: "Like",
    },
    {
        type: "strong",
        emoji: "💪",
        label: "Strong",
    },
    {
        type: "fire",
        emoji: "🔥",
        label: "Fire",
    },
    {
        type: "applause",
        emoji: "👏",
        label: "Applause",
    },
    {
        type: "heart",
        emoji: "❤️",
        label: "Heart",
    },
];

function stopCardNavigation(event) {
    event.preventDefault();
    event.stopPropagation();
}

function applyReactionResult(feedEvent, reactionType, result) {
    const previousReaction = feedEvent.currentReaction;

    if (previousReaction) {
        feedEvent.reactionCounts[previousReaction] = Math.max(
            (feedEvent.reactionCounts[previousReaction] || 0) - 1,
            0
        );
    }

    if (result.action === "removed") {
        feedEvent.currentReaction = null;
    } else {
        feedEvent.currentReaction = reactionType;
        feedEvent.reactionCounts[reactionType] =
            (feedEvent.reactionCounts[reactionType] || 0) + 1;
    }

    feedEvent.reactionTotal = Object.values(
        feedEvent.reactionCounts
    ).reduce(
        (total, count) => total + count,
        0
    );
}

async function updateReaction({
    feedEvent,
    reactionType,
    reactions,
    picker,
}) {
    reactions.classList.add("is-updating");

    try {
        const result = await setRegionFeedReaction({
            feedEventId: feedEvent.id,
            reactionType,
        });

        applyReactionResult(
            feedEvent,
            reactionType,
            result
        );

        renderReactionBar({
            feedEvent,
            reactions,
            picker,
        });

        picker.hidden = true;
    } catch (error) {
        console.error(
            "Failed to update feed reaction:",
            error
        );
    } finally {
        reactions.classList.remove("is-updating");
    }
}

function createReactionPill({
    feedEvent,
    reaction,
    count,
    reactions,
    picker,
}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-feed-reaction-pill";
    button.setAttribute(
        "aria-label",
        `${reaction.label}: ${count}`
    );
    button.setAttribute(
        "aria-pressed",
        feedEvent.currentReaction === reaction.type
            ? "true"
            : "false"
    );

    if (feedEvent.currentReaction === reaction.type) {
        button.classList.add("is-selected");
    }

    const emoji = document.createElement("span");
    emoji.className = "region-feed-reaction-pill-emoji";
    emoji.textContent = reaction.emoji;
    
    const value = document.createElement("span");
    value.className = "region-feed-reaction-pill-count";
    value.textContent = count;
    
    button.append(emoji, value);

    button.addEventListener("click", clickEvent => {
        stopCardNavigation(clickEvent);

        if (reactions.classList.contains("is-updating")) return;

        void updateReaction({
            feedEvent,
            reactionType: reaction.type,
            reactions,
            picker,
        });
    });

    return button;
}

function createReactionTrigger({
    feedEvent,
    reactions,
    picker,
}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-feed-reaction-add";
    button.setAttribute("aria-label", "Add reaction");
    button.setAttribute("aria-expanded", "false");

    button.appendChild(
        createIcon(
            "feedReactionAdd",
            "region-feed-reaction-add-icon",
            {
                size: 17,
                strokeWidth: 2,
            }
        )
    );

    button.addEventListener("click", clickEvent => {
        stopCardNavigation(clickEvent);

        const shouldOpen = picker.hidden;

        picker.hidden = !shouldOpen;
        button.setAttribute(
            "aria-expanded",
            shouldOpen ? "true" : "false"
        );
    });

    return button;
}

function renderReactionBar({
    feedEvent,
    reactions,
    picker,
}) {
    const bar = reactions.querySelector(
        ".region-feed-reaction-bar"
    );

    bar.textContent = "";

    REACTIONS.forEach(reaction => {
        const count =
            feedEvent.reactionCounts?.[reaction.type] || 0;

        if (count === 0) return;

        bar.appendChild(
            createReactionPill({
                feedEvent,
                reaction,
                count,
                reactions,
                picker,
            })
        );
    });

    bar.appendChild(
        createReactionTrigger({
            feedEvent,
            reactions,
            picker,
        })
    );
}

function renderReactionPicker({
    feedEvent,
    reactions,
    picker,
}) {
    picker.textContent = "";

    REACTIONS.forEach(reaction => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "region-feed-reaction-option";
        button.setAttribute("aria-label", reaction.label);
        button.setAttribute(
            "aria-pressed",
            feedEvent.currentReaction === reaction.type
                ? "true"
                : "false"
        );

        if (feedEvent.currentReaction === reaction.type) {
            button.classList.add("is-selected");
        }

        button.textContent = reaction.emoji;

        button.addEventListener("click", clickEvent => {
            stopCardNavigation(clickEvent);

            if (
                reactions.classList.contains(
                    "is-updating"
                )
            ) {
                return;
            }

            void updateReaction({
                feedEvent,
                reactionType: reaction.type,
                reactions,
                picker,
            });
        });

        picker.appendChild(button);
    });
}

export function createRegionFeedReactions(feedEvent) {
    const reactions = document.createElement("div");
    reactions.className = "region-feed-reactions";

    reactions.addEventListener(
        "click",
        stopCardNavigation
    );

    const bar = document.createElement("div");
    bar.className = "region-feed-reaction-bar";

    const picker = document.createElement("div");
    picker.className = "region-feed-reaction-picker";
    picker.hidden = true;

    reactions.append(bar, picker);

    renderReactionBar({
        feedEvent,
        reactions,
        picker,
    });

    renderReactionPicker({
        feedEvent,
        reactions,
        picker,
    });

    return reactions;
}