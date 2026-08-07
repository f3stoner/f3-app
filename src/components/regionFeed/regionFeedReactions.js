import { state } from "../../modules/state.js";
import {
    setRegionFeedReaction,
    loadRegionFeedComments,
    addRegionFeedComment,
    deleteRegionFeedComment,
} from "../../services/regionFeedService.js";
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

function createCommentsTrigger({
    feedEvent,
    thread,
    reactions,
}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-feed-comments-trigger";
    button.setAttribute(
        "aria-expanded",
        "false"
    );

    function updateLabel() {
        const count = Number(feedEvent.commentCount) || 0;

        button.textContent =
            count === 0
                ? "Add comment"
                : `${count} comment${count === 1 ? "" : "s"}`;
    }

    updateLabel();

    button.addEventListener("click", async clickEvent => {
        stopCardNavigation(clickEvent);

        const shouldOpen = thread.hidden;

        if (!shouldOpen) {
            thread.hidden = true;
            button.setAttribute(
                "aria-expanded",
                "false"
            );
            return;
        }

        thread.hidden = false;
        button.setAttribute(
            "aria-expanded",
            "true"
        );

        if (thread.dataset.loaded === "true") {
            return;
        }

        thread.classList.add("is-loading");

        try {
            const comments =
                await loadRegionFeedComments(
                    feedEvent.id
                );

            thread.dataset.loaded = "true";

            renderCommentsThread({
                feedEvent,
                comments,
                thread,
                reactions,
                updateTriggerLabel: updateLabel,
            });
        } catch (error) {
            console.error(
                "Failed to load feed comments:",
                error
            );

            thread.textContent =
                "Comments could not be loaded.";
            thread.classList.add("has-error");
        } finally {
            thread.classList.remove("is-loading");
        }
    });

    return button;
}

function getCommentMemberName(comment) {
    return (
        comment.member?.paxName ||
        comment.member?.realName ||
        "PAX"
    );
}

function formatCommentTime(timestamp) {
    if (!timestamp) return "";

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

function createCommentRow({
    feedEvent,
    comment,
    comments,
    thread,
    reactions,
    updateTriggerLabel,
}) {
    const row = document.createElement("div");
    row.className = "region-feed-comment";

    const header = document.createElement("div");
    header.className = "region-feed-comment-header";

    const name = document.createElement("strong");
    name.className = "region-feed-comment-author";
    name.textContent = getCommentMemberName(comment);

    const time = document.createElement("span");
    time.className = "region-feed-comment-time";
    time.textContent = formatCommentTime(
        comment.createdAt
    );

    header.append(name, time);

    const body = document.createElement("div");
    body.className = "region-feed-comment-body";
    body.textContent = comment.body;

    row.append(header, body);

    if (
        comment.memberId ===
        state.currentUserMemberId
    ) {
        const deleteButton =
            document.createElement("button");

        deleteButton.type = "button";
        deleteButton.className =
            "region-feed-comment-delete";

        deleteButton.textContent = "Delete";

        deleteButton.addEventListener(
            "click",
            async clickEvent => {
                stopCardNavigation(clickEvent);

                deleteButton.disabled = true;

                try {
                    await deleteRegionFeedComment(
                        comment.id
                    );

                    const commentIndex =
                        comments.findIndex(
                            candidate =>
                                candidate.id ===
                                comment.id
                        );

                    if (commentIndex >= 0) {
                        comments.splice(
                            commentIndex,
                            1
                        );
                    }

                    feedEvent.commentCount =
                        Math.max(
                            (Number(
                                feedEvent.commentCount
                            ) || 0) - 1,
                            0
                        );

                    updateTriggerLabel();

                    renderCommentsThread({
                        feedEvent,
                        comments,
                        thread,
                        reactions,
                        updateTriggerLabel,
                    });
                } catch (error) {
                    console.error(
                        "Failed to delete feed comment:",
                        error
                    );

                    deleteButton.disabled = false;
                }
            }
        );

        row.appendChild(deleteButton);
    }

    return row;
}

function renderCommentsThread({
    feedEvent,
    comments,
    thread,
    reactions,
    updateTriggerLabel,
}) {
    thread.textContent = "";
    thread.classList.remove("has-error");

    const list = document.createElement("div");
    list.className = "region-feed-comments-list";

    comments.forEach(comment => {
        list.appendChild(
            createCommentRow({
                feedEvent,
                comment,
                comments,
                thread,
                reactions,
                updateTriggerLabel,
            })
        );
    });

    const form = document.createElement("form");
    form.className = "region-feed-comment-form";

    const input = document.createElement("textarea");
    input.className = "region-feed-comment-input";
    input.rows = 1;
    input.maxLength = 1000;
    input.placeholder = "Add a comment…";
    input.setAttribute(
        "aria-label",
        "Add a comment"
    );

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "region-feed-comment-submit";
    submit.textContent = "Post";

    form.addEventListener(
        "click",
        stopCardNavigation
    );

    form.addEventListener(
        "submit",
        async submitEvent => {
            submitEvent.preventDefault();
            stopCardNavigation(submitEvent);

            const body =
                input.value.trim();

            if (!body) return;

            input.disabled = true;
            submit.disabled = true;

            try {
                const created =
                    await addRegionFeedComment({
                        feedEventId:
                            feedEvent.id,
                        body,
                    });

                /*
                 * RPC returns the comment row but not the joined
                 * member object, so attach the authenticated member
                 * for immediate rendering.
                 */
                const mappedComment = {
                    id: created.id,
                    feedEventId:
                        created.feed_event_id,
                    memberId:
                        created.member_id,
                    body:
                        created.body || body,
                    createdAt:
                        created.created_at,
                    updatedAt:
                        created.updated_at,
                    member:
                        state.currentUserMember
                            ? {
                                id:
                                    state.currentUserMember.id,
                                paxName:
                                    state.currentUserMember.paxName || "",
                                realName:
                                    state.currentUserMember.realName || "",
                            }
                            : null,
                };

                comments.push(mappedComment);

                feedEvent.commentCount =
                    (Number(
                        feedEvent.commentCount
                    ) || 0) + 1;

                updateTriggerLabel();

                renderCommentsThread({
                    feedEvent,
                    comments,
                    thread,
                    reactions,
                    updateTriggerLabel,
                });
            } catch (error) {
                console.error(
                    "Failed to add feed comment:",
                    error
                );

                input.disabled = false;
                submit.disabled = false;
            }
        }
    );

    form.append(input, submit);
    thread.append(list, form);
}

function renderReactionBar({
    feedEvent,
    reactions,
    picker,
    thread,
}) {
    const bar = reactions.querySelector(
        ".region-feed-reaction-bar"
    );

    bar.textContent = "";

    REACTIONS.forEach(reaction => {
        const count =
            feedEvent.reactionCounts?.[
                reaction.type
            ] || 0;

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

    /*
     * Reaction picker stays visually grouped with
     * the existing reaction pills.
     */
    bar.appendChild(
        createReactionTrigger({
            feedEvent,
            reactions,
            picker,
        })
    );

    /*
     * Discussion lives on the opposite side of
     * the social footer.
     */
    bar.appendChild(
        createCommentsTrigger({
            feedEvent,
            thread,
            reactions,
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
        button.setAttribute(
            "aria-label",
            reaction.label
        );
        button.setAttribute(
            "aria-pressed",
            feedEvent.currentReaction ===
                reaction.type
                ? "true"
                : "false"
        );

        if (
            feedEvent.currentReaction ===
            reaction.type
        ) {
            button.classList.add(
                "is-selected"
            );
        }

        button.textContent =
            reaction.emoji;

        button.addEventListener(
            "click",
            clickEvent => {
                stopCardNavigation(
                    clickEvent
                );

                if (
                    reactions.classList.contains(
                        "is-updating"
                    )
                ) {
                    return;
                }

                void updateReaction({
                    feedEvent,
                    reactionType:
                        reaction.type,
                    reactions,
                    picker,
                });
            }
        );

        picker.appendChild(button);
    });
}

export function createRegionFeedReactions(
    feedEvent
) {
    const reactions =
        document.createElement("div");

    reactions.className =
        "region-feed-reactions";

    reactions.addEventListener(
        "click",
        stopCardNavigation
    );

    const bar =
        document.createElement("div");

    bar.className =
        "region-feed-reaction-bar";

    const picker =
        document.createElement("div");

    picker.className =
        "region-feed-reaction-picker";
    picker.hidden = true;

    const thread =
        document.createElement("div");

    thread.className =
        "region-feed-comments-thread";
    thread.hidden = true;

    reactions.append(
        bar,
        picker,
        thread
    );

    renderReactionBar({
        feedEvent,
        reactions,
        picker,
        thread,
    });

    renderReactionPicker({
        feedEvent,
        reactions,
        picker,
    });

    return reactions;
}