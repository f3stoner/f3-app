import { createRegionalSocial } from "./regionFeedReactions.js";

function openPreblastMediaLightbox(item) {
    if (!item?.url) return;

    const overlay = document.createElement("div");
    overlay.className = "region-feed-media-lightbox";

    const image = document.createElement("img");
    image.className = "region-feed-media-lightbox-image";
    image.src = item.url;
    image.alt = "Preblast attachment";

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

function formatTime(value) {
    if (!value) return "";

    const [hourString, minuteString] =
        value.split(":");

    let hour = Number(hourString);
    const minute =
        Number(minuteString || 0);

    if (
        Number.isNaN(hour) ||
        Number.isNaN(minute)
    ) {
        return value;
    }

    const period =
        hour >= 12
            ? "PM"
            : "AM";

    hour =
        hour % 12 || 12;

    return (
        `${hour}:` +
        `${String(minute).padStart(2, "0")} ` +
        period
    );
}

function getDateLabel(dateKey) {
    if (!dateKey) return "Upcoming";

    const now = new Date();

    const today = [
        now.getFullYear(),
        String(
            now.getMonth() + 1
        ).padStart(2, "0"),
        String(
            now.getDate()
        ).padStart(2, "0"),
    ].join("-");

    if (dateKey === today) {
        return "Today";
    }

    const tomorrow =
        new Date(now);

    tomorrow.setDate(
        tomorrow.getDate() + 1
    );

    const tomorrowKey = [
        tomorrow.getFullYear(),
        String(
            tomorrow.getMonth() + 1
        ).padStart(2, "0"),
        String(
            tomorrow.getDate()
        ).padStart(2, "0"),
    ].join("-");

    if (dateKey === tomorrowKey) {
        return "Tomorrow";
    }

    return "Upcoming";
}

function getCommitmentName(
    commitment
) {
    return (
        commitment.paxName ||
        commitment.realName ||
        commitment.memberName ||
        "PAX"
    );
}

function createCommitmentGroup(
    label,
    commitments,
    commitmentType
) {
    const matching =
        commitments
            .filter(
                commitment =>
                    commitment
                        .commitmentType ===
                    commitmentType
            )
            .sort(
                (a, b) =>
                    getCommitmentName(a)
                        .localeCompare(
                            getCommitmentName(b)
                        )
            );

    const group =
        document.createElement("div");

    group.className =
        "region-feed-upcoming-commitment-group";

    const heading =
        document.createElement("div");

    heading.className =
        "region-feed-upcoming-commitment-group-label";

    heading.textContent =
        `${label} · ${matching.length}`;

    const names =
        document.createElement("div");

    names.className =
        "region-feed-upcoming-commitment-names";

    names.textContent =
        matching.length > 0
            ? matching
                .map(
                    getCommitmentName
                )
                .join(" · ")
            : "None";

    group.append(
        heading,
        names
    );

    return group;
}

export function renderUpcomingWorkoutCard({
    workout,
    isExpanded = false,
    commitments = null,
    detailsLoading = false,
    detailsError = false,
    isUpdating = false,
    onToggle,
    onCommitment,
    onRetryDetails,
}) {
    const card =
        document.createElement("article");

    card.className =
        "region-feed-upcoming-card";

    if (isExpanded) {
        card.classList.add("expanded");
    }

    const summary =
        document.createElement("div");

    summary.className =
        "region-feed-upcoming-summary";

    const identityButton =
        document.createElement("button");

    identityButton.type = "button";

    identityButton.className =
        "region-feed-upcoming-identity";

    identityButton.setAttribute(
        "aria-expanded",
        String(isExpanded)
    );

    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "region-feed-upcoming-eyebrow";

    const dateLabel =
        getDateLabel(
            workout.date
        );
    
    eyebrow.textContent =
        workout.displayTime
            ? `${dateLabel} · ${formatTime(workout.displayTime)}`
            : dateLabel;

    const title =
        document.createElement("h3");

    title.className =
        "region-feed-upcoming-title";

    title.textContent =
        workout.aoName;

    const meta =
        document.createElement("div");

    meta.className =
        "region-feed-upcoming-meta";

    meta.textContent =
        `Q: ${workout.qName}`;

    identityButton.append(
        eyebrow,
        title,
        meta
    );

    const controls =
        document.createElement("div");

    controls.className =
        "region-feed-upcoming-commitments";

    const hc =
        document.createElement("button");

    hc.type = "button";

    hc.className =
        "region-feed-upcoming-commitment region-feed-upcoming-hc";

    hc.textContent =
        `HC ${workout.hcCount}`;

    hc.disabled =
        isUpdating;

    hc.setAttribute(
        "aria-pressed",
        String(
            workout.currentCommitment ===
                "hc"
        )
    );

    if (
        workout.currentCommitment ===
        "hc"
    ) {
        hc.classList.add("selected");
    }

    hc.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            onCommitment?.("hc");
        }
    );

    const sc =
        document.createElement("button");

    sc.type = "button";

    sc.className =
        "region-feed-upcoming-commitment region-feed-upcoming-sc";

    sc.textContent =
        `SC ${workout.scCount}`;

    sc.disabled =
        isUpdating;

    sc.setAttribute(
        "aria-pressed",
        String(
            workout.currentCommitment ===
                "sc"
        )
    );

    if (
        workout.currentCommitment ===
        "sc"
    ) {
        sc.classList.add("selected");
    }

    sc.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            onCommitment?.("sc");
        }
    );

    controls.append(
        hc,
        sc
    );

    const statusButton =
        document.createElement("button");

    statusButton.type = "button";

    statusButton.className =
        "region-feed-upcoming-status";

    statusButton.setAttribute(
        "aria-expanded",
        String(isExpanded)
    );

    const preblastStatus =
        document.createElement("span");

    preblastStatus.className =
        workout.hasPreblast
            ? "region-feed-upcoming-preblast-status is-posted"
            : "region-feed-upcoming-preblast-status is-pending";
    
    preblastStatus.textContent =
        workout.hasPreblast
            ? "✓ Preblast Ready"
            : "● Preblast Pending";

    const chevron =
        document.createElement("span");

    chevron.className =
        "region-feed-upcoming-chevron";

    chevron.setAttribute(
        "aria-hidden",
        "true"
    );

    chevron.textContent =
        isExpanded ? "⌃" : "⌄";

    statusButton.append(
        preblastStatus,
        chevron
    );

    const toggle =
        () => {
            onToggle?.();
        };

    identityButton.addEventListener(
        "click",
        toggle
    );

    statusButton.addEventListener(
        "click",
        toggle
    );

    summary.append(
        identityButton,
        controls,
        statusButton
    );

    card.appendChild(summary);

    if (!isExpanded) {
        return card;
    }

    const expanded =
        document.createElement("div");

    expanded.className =
        "region-feed-upcoming-expanded";

    if (workout.siteName) {
        const locationSection =
            document.createElement("section");

        locationSection.className =
            "region-feed-upcoming-detail-section";

        const locationLabel =
            document.createElement("div");

        locationLabel.className =
            "region-feed-upcoming-detail-label";

        locationLabel.textContent =
            "Location";

        const location =
            document.createElement("div");

        location.className =
            "region-feed-upcoming-detail-copy";

        location.textContent =
            workout.siteName;

        locationSection.append(
            locationLabel,
            location
        );

        expanded.appendChild(
            locationSection
        );
    }

    const preblastSection =
        document.createElement("section");

    preblastSection.className =
        "region-feed-upcoming-detail-section";

    const preblastLabel =
        document.createElement("div");

    preblastLabel.className =
        "region-feed-upcoming-detail-label";

    preblastLabel.textContent =
        "Preblast";

    const preblastBody =
        document.createElement("div");

    preblastBody.className =
        "region-feed-upcoming-preblast";

    preblastBody.textContent =
        workout.preblastText;

    preblastSection.appendChild(
        preblastLabel
    );
    
    if (workout.preblastText) {
        preblastSection.appendChild(
            preblastBody
        );
    }

    const preblastMedia = Array.isArray(workout.preblastMedia)
        ? workout.preblastMedia
        : [];

    const displayMedia = preblastMedia
        .filter(item => item.mediaKind === "image")
        .slice(0, 4);

    if (displayMedia.length > 0) {
        const media = document.createElement("div");
        media.className = "region-feed-upcoming-preblast-media";

        if (displayMedia.length === 1) {
            media.classList.add("single");
        } else if (displayMedia.length === 2) {
            media.classList.add("double");
        } else {
            media.classList.add("gallery");
        }

        displayMedia.forEach(item => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "region-feed-upcoming-preblast-image-button";
            button.setAttribute("aria-label", "View full image");

            const image = document.createElement("img");
            image.className = "region-feed-upcoming-preblast-image";
            image.src = item.url;
            image.alt = "Preblast attachment";
            image.loading = "lazy";
            image.decoding = "async";

            button.addEventListener("click", () => {
                openPreblastMediaLightbox(item);
            });

            button.appendChild(image);
            media.appendChild(button);
        });

        if (displayMedia.length === 3) {
            media.classList.add("is-ordering");
        
            const buttons = [...media.children];
            let loadedCount = 0;
        
            const finishImageLoad = () => {
                loadedCount += 1;
        
                if (loadedCount < 3) return;
        
                const candidates = buttons
                    .map((button, index) => {
                        const image = button.querySelector("img");
        
                        return {
                            button,
                            index,
                            ratio: image?.naturalWidth && image?.naturalHeight
                                ? image.naturalWidth / image.naturalHeight
                                : null,
                        };
                    })
                    .filter(candidate => candidate.ratio);
        
                const portraitCandidates = candidates
                    .filter(candidate => candidate.ratio < 0.95)
                    .sort((a, b) => a.ratio - b.ratio);
        
                if (portraitCandidates.length > 0) {
                    const dominant = portraitCandidates[0];
        
                    if (dominant.index !== 0) {
                        media.prepend(dominant.button);
                    }
                }
        
                media.classList.remove("is-ordering");
            };
        
            buttons.forEach(button => {
                const image = button.querySelector("img");
        
                if (image.complete) {
                    finishImageLoad();
                } else {
                    image.addEventListener("load", finishImageLoad, { once: true });
                    image.addEventListener("error", finishImageLoad, { once: true });
                }
            });
        }

        preblastSection.appendChild(media);
    }

    expanded.appendChild(
        preblastSection
    );

    const commitmentSection =
        document.createElement("section");

    commitmentSection.className =
        "region-feed-upcoming-detail-section";

    const commitmentLabel =
        document.createElement("div");

    commitmentLabel.className =
        "region-feed-upcoming-detail-label";

    commitmentLabel.textContent =
        "Who's In";

    commitmentSection.appendChild(
        commitmentLabel
    );

    if (detailsLoading) {
        const loading =
            document.createElement("div");

        loading.className =
            "region-feed-upcoming-detail-copy";

        loading.textContent =
            "Loading commitments…";

        commitmentSection.appendChild(
            loading
        );
    } else if (detailsError) {
        const error =
            document.createElement("div");

        error.className =
            "region-feed-upcoming-detail-copy";

        error.textContent =
            "Commitments could not be loaded.";

        const retry =
            document.createElement("button");

        retry.type = "button";

        retry.className =
            "region-feed-upcoming-retry";

        retry.textContent =
            "Retry";

        retry.addEventListener(
            "click",
            event => {
                event.stopPropagation();

                onRetryDetails?.();
            }
        );

        commitmentSection.append(
            error,
            retry
        );
    } else if (
        Array.isArray(commitments)
    ) {
        commitmentSection.append(
            createCommitmentGroup(
                "HC",
                commitments,
                "hc"
            ),
            createCommitmentGroup(
                "SC",
                commitments,
                "sc"
            )
        );
    }

    expanded.appendChild(
        commitmentSection
    );

    const socialSection =
        document.createElement("section");

    socialSection.className =
        "region-feed-upcoming-detail-section region-feed-upcoming-social-section";

    const socialLabel =
        document.createElement("div");

    socialLabel.className =
        "region-feed-upcoming-detail-label";

    socialLabel.textContent =
        "Discussion";

    const social =
        createRegionalSocial({
            socialState:
                workout.socialState,
            qSlotId:
                workout.slotId,
        })

    socialSection.append(
        socialLabel,
        social
    );

    expanded.appendChild(
        socialSection
    );

    card.appendChild(
        expanded
    );

    return card;
}