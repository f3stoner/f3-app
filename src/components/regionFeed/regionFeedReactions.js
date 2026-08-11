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
import { createMemberAvatar } from "../memberAvatar.js";
import {
    resolveMediaUrl,
    resolveMediaUrls,
    reserveMediaAttachment,
    uploadMediaAsset,
    finalizeMediaAsset,
    loadCommentMediaAttachmentsByCommentIds,
} from "../../services/mediaService.js";
import { normalizeMediaImage } from "../../utils/imageProcessing.js";

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

const MAX_COMMENT_IMAGES = 3;

async function persistCommentImages(commentId, files = []) {
    const persisted = [];

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const blob = await normalizeMediaImage(file);

        const reservation = await reserveMediaAttachment({
            regionFeedCommentId: commentId,
            mediaKind: "image",
            mimeType: blob.type,
            fileSizeBytes: blob.size,
            displayOrder: index,
        });

        const asset = reservation?.asset;

        if (!asset?.id || !asset?.storage_path) {
            throw new Error("Comment media reservation did not return a valid asset.");
        }

        await uploadMediaAsset(asset.storage_path, blob);
        await finalizeMediaAsset(asset.id);

        persisted.push({
            id: reservation?.attachment?.id || null,
            displayOrder: index,
            asset: {
                id: asset.id,
                storagePath: asset.storage_path,
                mediaKind: "image",
                mimeType: blob.type,
                fileSizeBytes: blob.size,
                status: "ready",
            },
        });
    }

    return persisted;
}

async function hydrateCommentMedia(comments = []) {
    const commentIds = comments.map(comment => comment.id).filter(Boolean);

    if (commentIds.length === 0) return comments;

    const attachmentsByCommentId =
        await loadCommentMediaAttachmentsByCommentIds(commentIds);

    const storagePaths = [];

    attachmentsByCommentId.forEach(attachments => {
        attachments.forEach(attachment => {
            if (attachment.asset?.storagePath) {
                storagePaths.push(attachment.asset.storagePath);
            }
        });
    });

    const urls = await resolveMediaUrls(storagePaths);

    comments.forEach(comment => {
        const attachments = attachmentsByCommentId.get(comment.id) || [];

        comment.media = attachments
            .map(attachment => ({
                ...attachment,
                url: urls.get(attachment.asset?.storagePath) || null,
            }))
            .filter(item => item.url);
    });

    return comments;
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

function hydrateCommentAvatar(avatar, member) {
    const avatarPath = member?.avatarPath;

    if (!avatarPath) return;

    resolveMediaUrl(avatarPath)
        .then(signedUrl => {
            if (!signedUrl) return;

            const image = document.createElement("img");

            image.className = "member-avatar-image";
            image.alt = "";
            image.decoding = "async";
            image.src = signedUrl;

            image.addEventListener("load", () => {
                avatar.classList.add("member-avatar-loaded");
            });

            image.addEventListener("error", () => {
                image.remove();
            });

            avatar.appendChild(image);
        })
        .catch(error => {
            console.warn("Failed to resolve comment avatar:", error);
        });
}

function openCommentMediaLightbox(url) {
    if (!url) return;

    const overlay = document.createElement("div");
    overlay.className = "region-feed-media-lightbox";

    const image = document.createElement("img");
    image.className = "region-feed-media-lightbox-image";
    image.src = url;
    image.alt = "Comment attachment";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "region-feed-media-lightbox-close";
    closeButton.setAttribute("aria-label", "Close image");
    closeButton.textContent = "×";

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const close = () => {
        document.body.style.overflow = previousOverflow;
        document.removeEventListener("keydown", handleKeyDown);
        overlay.remove();
    };

    const handleKeyDown = event => {
        if (event.key === "Escape") close();
    };

    overlay.addEventListener("click", event => {
        if (event.target === overlay) close();
    });

    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", handleKeyDown);

    overlay.append(image, closeButton);
    document.body.appendChild(overlay);
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
    const row = document.createElement("div");

    row.className = "region-feed-comment";

    const avatar = createMemberAvatar(comment.member, {
        className: "region-feed-comment-avatar",
    });

    hydrateCommentAvatar(avatar, comment.member);

    const header = document.createElement("div");

    header.className =
        "region-feed-comment-header";

    const name = document.createElement("strong");

    name.className = "region-feed-comment-author";

    name.textContent = getCommentMemberName(comment);

    const time = document.createElement("span");

    time.className = "region-feed-comment-time";

    time.textContent = formatCommentTime(comment.createdAt);

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
        avatar,
        header
    );
    
    if (comment.body) {
        row.appendChild(body);
    }

    const commentMedia = Array.isArray(comment.media)
        ? comment.media
        : [];

    if (commentMedia.length > 0) {
        const media = document.createElement("div");
        media.className = "region-feed-comment-media";

        commentMedia.slice(0, MAX_COMMENT_IMAGES).forEach(item => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "region-feed-comment-media-button";
            button.setAttribute("aria-label", "View full image");

            const image = document.createElement("img");
            image.className = "region-feed-comment-media-image";
            image.src = item.url;
            image.alt = "Comment attachment";
            image.decoding = "async";

            button.addEventListener("click", event => {
                stopCardNavigation(event);
                openCommentMediaLightbox(item.url);
            });

            button.appendChild(image);
            media.appendChild(button);
        });

        row.appendChild(media);
    }

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

    const selectedImages = [];

    const mediaInput = document.createElement("input");
    mediaInput.type = "file";
    mediaInput.accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
    mediaInput.multiple = true;
    mediaInput.hidden = true;

    const mediaButton = document.createElement("button");
    mediaButton.type = "button";
    mediaButton.className = "region-feed-comment-media-add";
    mediaButton.setAttribute("aria-label", "Add photos");
    
    mediaButton.appendChild(
        createIcon(
            "feedCommentImage",
            "region-feed-comment-media-add-icon",
            {
                size: 18,
                strokeWidth: 2,
            }
        )
    );

    const preview = document.createElement("div");
    preview.className = "region-feed-comment-media-preview";
    preview.hidden = true;

    function renderSelectedImages() {
        preview.textContent = "";
        preview.hidden = selectedImages.length === 0;
        mediaButton.disabled = selectedImages.length >= MAX_COMMENT_IMAGES;

        selectedImages.forEach((file, index) => {
            const item = document.createElement("div");
            item.className = "region-feed-comment-media-preview-item";

            const image = document.createElement("img");
            image.className = "region-feed-comment-media-preview-image";
            image.alt = "Selected comment attachment";

            const objectUrl = URL.createObjectURL(file);
            image.src = objectUrl;

            image.addEventListener("load", () => {
                URL.revokeObjectURL(objectUrl);
            }, { once: true });

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "region-feed-comment-media-preview-remove";
            remove.setAttribute("aria-label", "Remove image");
            remove.textContent = "×";

            remove.addEventListener("click", event => {
                stopCardNavigation(event);
                selectedImages.splice(index, 1);
                renderSelectedImages();
            });

            item.append(image, remove);
            preview.appendChild(item);
        });
    }

    mediaButton.addEventListener("click", event => {
        stopCardNavigation(event);
        mediaInput.click();
    });

    mediaInput.addEventListener("change", event => {
        const files = Array.from(event.target.files || []);

        files.forEach(file => {
            if (selectedImages.length >= MAX_COMMENT_IMAGES) return;

            const duplicate = selectedImages.some(existing =>
                existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified
            );

            if (!duplicate) selectedImages.push(file);
        });

        mediaInput.value = "";
        renderSelectedImages();
    });

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

            const body = input.value.trim();

            if (!body && selectedImages.length === 0) return;

            input.disabled = true;
            mediaButton.disabled = true;
            submit.disabled = true;

            try {
                const created = await addComment({
                    feedEventId,
                    qSlotId,
                    body,
                });
                
                let persistedMedia = [];

                try {
                    if (selectedImages.length > 0) {
                        persistedMedia = await persistCommentImages(
                            created.id,
                            selectedImages
                        );
                
                        const paths = persistedMedia
                            .map(item => item.asset?.storagePath)
                            .filter(Boolean);
                
                        const urls = await resolveMediaUrls(paths);
                
                        persistedMedia = persistedMedia
                            .map(item => ({
                                ...item,
                                url: urls.get(item.asset?.storagePath) || null,
                            }))
                            .filter(item => item.url);
                    }
                } catch (error) {
                    if (!body) {
                        try {
                            await deleteRegionFeedComment(created.id);
                        } catch (cleanupError) {
                            console.error("Failed to clean up empty comment:", cleanupError);
                        }
                    }
                
                    throw error;
                }
                
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

                    media: persistedMedia,

                    member: state.currentUserMember
                        ? {
                            id: state.currentUserMember.id,
                            paxName: state.currentUserMember.paxName || "",
                            realName: state.currentUserMember.realName || "",
                            avatarPath: state.currentUserMember.avatarPath || null,
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
                mediaButton.disabled = false;
                submit.disabled = false;
            }
        }
    );

    const composerActions = document.createElement("div");
    composerActions.className = "region-feed-comment-composer-actions";
    
    composerActions.append(
        mediaButton,
        submit
    );
    
    form.append(
        input,
        mediaInput,
        preview,
        composerActions
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
                const comments = await loadComments({
                    feedEventId,
                    qSlotId,
                });
                
                await hydrateCommentMedia(comments);
                
                thread.dataset.loaded = "true";

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