import { state } from "../../modules/state.js";
import {
    setRegionFeedReaction,
    setWorkoutReaction,
    loadRegionFeedComments,
    loadWorkoutComments,
    addRegionFeedComment,
    addWorkoutComment,
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

function applyReactionResult(
    socialState,
    reactionType,
    result
) {
    const previousReaction =
        socialState.currentReaction;

    if (previousReaction) {
        socialState.reactionCounts[
            previousReaction
        ] = Math.max(
            (
                socialState.reactionCounts[
                    previousReaction
                ] || 0
            ) - 1,
            0
        );
    }

    if (result.action === "removed") {
        socialState.currentReaction =
            null;
    } else {
        socialState.currentReaction =
            reactionType;

        socialState.reactionCounts[
            reactionType
        ] =
            (
                socialState.reactionCounts[
                    reactionType
                ] || 0
            ) + 1;
    }

    socialState.reactionTotal =
        Object.values(
            socialState.reactionCounts
        ).reduce(
            (total, count) =>
                total + count,
            0
        );
}

async function setReaction({
    feedEventId,
    qSlotId,
    reactionType,
}) {
    if (qSlotId) {
        return setWorkoutReaction({
            qSlotId,
            reactionType,
        });
    }

    return setRegionFeedReaction({
        feedEventId,
        reactionType,
    });
}

async function loadComments({
    feedEventId,
    qSlotId,
}) {
    if (qSlotId) {
        return loadWorkoutComments(
            qSlotId
        );
    }

    return loadRegionFeedComments(
        feedEventId
    );
}

async function addComment({
    feedEventId,
    qSlotId,
    body,
}) {
    if (qSlotId) {
        return addWorkoutComment({
            qSlotId,
            body,
        });
    }

    return addRegionFeedComment({
        feedEventId,
        body,
    });
}

async function updateReaction({
    socialState,
    feedEventId,
    qSlotId,
    reactionType,
    reactions,
    picker,
    thread,
}) {
    reactions.classList.add(
        "is-updating"
    );

    try {
        const result =
            await setReaction({
                feedEventId,
                qSlotId,
                reactionType,
            });

        applyReactionResult(
            socialState,
            reactionType,
            result
        );

        renderReactionBar({
            socialState,
            feedEventId,
            qSlotId,
            reactions,
            picker,
            thread,
        });

        picker.hidden = true;
    } catch (error) {
        console.error(
            "Failed to update regional social reaction:",
            error
        );
    } finally {
        reactions.classList.remove(
            "is-updating"
        );
    }
}

function createReactionPill({
    socialState,
    feedEventId,
    qSlotId,
    reaction,
    count,
    reactions,
    picker,
    thread,
}) {
    const button =
        document.createElement("button");

    button.type = "button";
    button.className =
        "region-feed-reaction-pill";

    button.setAttribute(
        "aria-label",
        `${reaction.label}: ${count}`
    );

    button.setAttribute(
        "aria-pressed",
        socialState.currentReaction ===
            reaction.type
            ? "true"
            : "false"
    );

    if (
        socialState.currentReaction ===
        reaction.type
    ) {
        button.classList.add(
            "is-selected"
        );
    }

    const emoji =
        document.createElement("span");

    emoji.className =
        "region-feed-reaction-pill-emoji";

    emoji.textContent =
        reaction.emoji;

    const value =
        document.createElement("span");

    value.className =
        "region-feed-reaction-pill-count";

    value.textContent =
        count;

    button.append(
        emoji,
        value
    );

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
                socialState,
                feedEventId,
                qSlotId,
                reactionType:
                    reaction.type,
                reactions,
                picker,
                thread,
            });
        }
    );

    return button;
}

function createReactionTrigger({
    picker,
}) {
    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        "region-feed-reaction-add";

    button.setAttribute(
        "aria-label",
        "Add reaction"
    );

    button.setAttribute(
        "aria-expanded",
        "false"
    );

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

    button.addEventListener(
        "click",
        clickEvent => {
            stopCardNavigation(
                clickEvent
            );

            const shouldOpen =
                picker.hidden;

            picker.hidden =
                !shouldOpen;

            button.setAttribute(
                "aria-expanded",
                shouldOpen
                    ? "true"
                    : "false"
            );
        }
    );

    return button;
}

function getCommentMemberName(
    comment
) {
    return (
        comment.member?.paxName ||
        comment.member?.realName ||
        "PAX"
    );
}

function formatCommentTime(
    timestamp
) {
    if (!timestamp) return "";

    return new Intl.DateTimeFormat(
        undefined,
        {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }
    ).format(
        new Date(timestamp)
    );
}

function createCommentRow({
    socialState,
    feedEventId,
    qSlotId,
    comment,
    comments,
    thread,
    updateTriggerLabel,
}) {
    const row =
        document.createElement("div");

    row.className =
        "region-feed-comment";

    const header =
        document.createElement("div");

    header.className =
        "region-feed-comment-header";

    const name =
        document.createElement("strong");

    name.className =
        "region-feed-comment-author";

    name.textContent =
        getCommentMemberName(
            comment
        );

    const time =
        document.createElement("span");

    time.className =
        "region-feed-comment-time";

    time.textContent =
        formatCommentTime(
            comment.createdAt
        );

    header.append(
        name,
        time
    );

    const body =
        document.createElement("div");

    body.className =
        "region-feed-comment-body";

    body.textContent =
        comment.body;

    row.append(
        header,
        body
    );

    if (
        comment.memberId ===
        state.currentUserMemberId
    ) {
        const deleteButton =
            document.createElement("button");

        deleteButton.type =
            "button";

        deleteButton.className =
            "region-feed-comment-delete";

        deleteButton.textContent =
            "Delete";

        deleteButton.addEventListener(
            "click",
            async clickEvent => {
                stopCardNavigation(
                    clickEvent
                );

                deleteButton.disabled =
                    true;

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

                    if (
                        commentIndex >= 0
                    ) {
                        comments.splice(
                            commentIndex,
                            1
                        );
                    }

                    socialState.commentCount =
                        Math.max(
                            (
                                Number(
                                    socialState.commentCount
                                ) || 0
                            ) - 1,
                            0
                        );

                    updateTriggerLabel();

                    renderCommentsThread({
                        socialState,
                        feedEventId,
                        qSlotId,
                        comments,
                        thread,
                        updateTriggerLabel,
                    });
                } catch (error) {
                    console.error(
                        "Failed to delete comment:",
                        error
                    );

                    deleteButton.disabled =
                        false;
                }
            }
        );

        row.appendChild(
            deleteButton
        );
    }

    return row;
}

function renderCommentsThread({
    socialState,
    feedEventId,
    qSlotId,
    comments,
    thread,
    updateTriggerLabel,
}) {
    thread.textContent = "";

    thread.classList.remove(
        "has-error"
    );

    const list =
        document.createElement("div");

    list.className =
        "region-feed-comments-list";

    comments.forEach(comment => {
        list.appendChild(
            createCommentRow({
                socialState,
                feedEventId,
                qSlotId,
                comment,
                comments,
                thread,
                updateTriggerLabel,
            })
        );
    });

    const form =
        document.createElement("form");

    form.className =
        "region-feed-comment-form";

    const input =
        document.createElement(
            "textarea"
        );

    input.className =
        "region-feed-comment-input";

    input.rows = 1;
    input.maxLength = 1000;
    input.placeholder =
        "Add a comment…";

    input.setAttribute(
        "aria-label",
        "Add a comment"
    );

    const submit =
        document.createElement("button");

    submit.type = "submit";

    submit.className =
        "region-feed-comment-submit";

    submit.textContent =
        "Post";

    form.addEventListener(
        "click",
        stopCardNavigation
    );

    form.addEventListener(
        "keydown",
        stopCardNavigation
    );

    form.addEventListener(
        "submit",
        async submitEvent => {
            submitEvent.preventDefault();

            stopCardNavigation(
                submitEvent
            );

            const body =
                input.value.trim();

            if (!body) return;

            input.disabled = true;
            submit.disabled = true;

            try {
                const created =
                    await addComment({
                        feedEventId,
                        qSlotId,
                        body,
                    });

                const mappedComment = {
                    id:
                        created.id,

                    feedEventId:
                        created.feed_event_id ||
                        null,

                    qSlotId:
                        created.q_slot_id ||
                        null,

                    memberId:
                        created.member_id,

                    body:
                        created.body ||
                        body,

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
                                    state.currentUserMember.paxName ||
                                    "",

                                realName:
                                    state.currentUserMember.realName ||
                                    "",
                            }
                            : null,
                };

                comments.push(
                    mappedComment
                );

                socialState.commentCount =
                    (
                        Number(
                            socialState.commentCount
                        ) || 0
                    ) + 1;

                updateTriggerLabel();

                renderCommentsThread({
                    socialState,
                    feedEventId,
                    qSlotId,
                    comments,
                    thread,
                    updateTriggerLabel,
                });
            } catch (error) {
                console.error(
                    "Failed to add comment:",
                    error
                );

                input.disabled = false;
                submit.disabled = false;
            }
        }
    );

    form.append(
        input,
        submit
    );

    thread.append(
        list,
        form
    );
}

function createCommentsTrigger({
    socialState,
    feedEventId,
    qSlotId,
    thread,
}) {
    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        "region-feed-comments-trigger";

    button.setAttribute(
        "aria-expanded",
        "false"
    );

    function updateLabel() {
        const count =
            Number(
                socialState.commentCount
            ) || 0;

        button.textContent =
            count === 0
                ? "Add comment"
                : `${count} comment${
                    count === 1
                        ? ""
                        : "s"
                }`;
    }

    updateLabel();

    button.addEventListener(
        "click",
        async clickEvent => {
            stopCardNavigation(
                clickEvent
            );

            const shouldOpen =
                thread.hidden;

            if (!shouldOpen) {
                thread.hidden = true;

                button.setAttribute(
                    "aria-expanded",
                    "false"
                );

                return;
            }

            thread.hidden =
                false;

            button.setAttribute(
                "aria-expanded",
                "true"
            );

            if (
                thread.dataset.loaded ===
                "true"
            ) {
                return;
            }

            thread.classList.add(
                "is-loading"
            );

            try {
                const comments =
                    await loadComments({
                        feedEventId,
                        qSlotId,
                    });

                thread.dataset.loaded =
                    "true";

                renderCommentsThread({
                    socialState,
                    feedEventId,
                    qSlotId,
                    comments,
                    thread,
                    updateTriggerLabel:
                        updateLabel,
                });
            } catch (error) {
                console.error(
                    "Failed to load comments:",
                    error
                );

                thread.textContent =
                    "Comments could not be loaded.";

                thread.classList.add(
                    "has-error"
                );
            } finally {
                thread.classList.remove(
                    "is-loading"
                );
            }
        }
    );

    return button;
}

function renderReactionBar({
    socialState,
    feedEventId,
    qSlotId,
    reactions,
    picker,
    thread,
}) {
    const bar =
        reactions.querySelector(
            ".region-feed-reaction-bar"
        );

    bar.textContent = "";

    REACTIONS.forEach(reaction => {
        const count =
            socialState
                .reactionCounts?.[
                    reaction.type
                ] || 0;

        if (count === 0) {
            return;
        }

        bar.appendChild(
            createReactionPill({
                socialState,
                feedEventId,
                qSlotId,
                reaction,
                count,
                reactions,
                picker,
                thread,
            })
        );
    });

    bar.appendChild(
        createReactionTrigger({
            picker,
        })
    );

    bar.appendChild(
        createCommentsTrigger({
            socialState,
            feedEventId,
            qSlotId,
            thread,
        })
    );
}

function renderReactionPicker({
    socialState,
    feedEventId,
    qSlotId,
    reactions,
    picker,
    thread,
}) {
    picker.textContent = "";

    REACTIONS.forEach(reaction => {
        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.className =
            "region-feed-reaction-option";

        button.setAttribute(
            "aria-label",
            reaction.label
        );

        button.setAttribute(
            "aria-pressed",
            socialState.currentReaction ===
                reaction.type
                ? "true"
                : "false"
        );

        if (
            socialState.currentReaction ===
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
                    socialState,
                    feedEventId,
                    qSlotId,
                    reactionType:
                        reaction.type,
                    reactions,
                    picker,
                    thread,
                });
            }
        );

        picker.appendChild(
            button
        );
    });
}

export function createRegionalSocial({
    socialState,
    feedEventId = null,
    qSlotId = null,
}) {
    if (
        !socialState ||
        (!feedEventId && !qSlotId)
    ) {
        return document.createElement(
            "div"
        );
    }

    socialState.reactionCounts =
        socialState.reactionCounts || {
            like: 0,
            strong: 0,
            fire: 0,
            applause: 0,
            heart: 0,
        };

    socialState.reactionTotal =
        Number(
            socialState.reactionTotal
        ) || 0;

    socialState.commentCount =
        Number(
            socialState.commentCount
        ) || 0;

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
        socialState,
        feedEventId,
        qSlotId,
        reactions,
        picker,
        thread,
    });

    renderReactionPicker({
        socialState,
        feedEventId,
        qSlotId,
        reactions,
        picker,
        thread,
    });

    return reactions;
}


/*
 * Backward-compatible feed-event wrapper while existing
 * event renderers migrate to the generic social API.
 */
export function createRegionFeedReactions(
    feedEvent
) {
    return createRegionalSocial({
        socialState:
            feedEvent,
        feedEventId:
            feedEvent.id,
    });
}