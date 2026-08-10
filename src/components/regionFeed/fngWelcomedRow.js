import { state } from "../../modules/state.js";
import { navigateTo } from "../../utils/navigation.js";
import { createIcon } from "../../utils/icons.js";
import { createRegionFeedReactions } from "./regionFeedReactions.js";
import { createMemberAvatar } from "../memberAvatar.js";

function formatEventTime(timestamp) {
    if (!timestamp) return "";

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

export function renderFngWelcomedRow(
    event,
    {
        avatarUrls = new Map(),
    } = {}
) {
    const session = event.session;
    const paxName = event.member?.paxName || "";
    const realName = event.member?.realName || "";
    const displayName = paxName || realName || "New PAX";
    const aoName = session?.aoName || "the region";
    const avatarUrl = event.member?.avatarPath
        ? avatarUrls.get(event.member.avatarPath) || null
        : null;

    const row = document.createElement("article");
    row.className = "region-feed-card region-feed-fng-card";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-feed-card-button region-feed-fng-button";
    button.setAttribute("aria-label", `View ${displayName}'s profile`);

    const avatar = createMemberAvatar(event.member, {
        signedUrl: avatarUrl,
        className: "region-feed-member-avatar",
    });

    const content = document.createElement("div");
    content.className = "region-feed-card-content";

    const eyebrow = document.createElement("div");
    eyebrow.className = "region-feed-card-eyebrow";
    eyebrow.textContent = "FNG Welcome!";

    const regionName = state.regionName
        ?.replace(/^F3\s+/i, "")
        .trim() || "the region";

    const title = document.createElement("h2");
    title.className = "region-feed-card-title";
    title.textContent = `${displayName} joined ${regionName}`;

    const subtitle = document.createElement("div");
    subtitle.className = "region-feed-card-subtitle";
    subtitle.textContent = `First post at ${aoName}`;

    const meta = document.createElement("div");
    meta.className = "region-feed-card-meta";
    meta.textContent = formatEventTime(event.occurredAt);

    content.append(eyebrow, title, subtitle, meta);

    const visual = document.createElement("div");
    visual.className = "region-feed-card-visual region-feed-fng-visual";
    visual.setAttribute("aria-hidden", "true");

    const visualMark = document.createElement("span");
    visualMark.className = "region-feed-fng-mark";
    visualMark.textContent = "1st";

    const visualLabel = document.createElement("span");
    visualLabel.className = "region-feed-fng-label";
    visualLabel.textContent = "Post";

    visual.append(visualMark, visualLabel);

    const action = document.createElement("span");
    action.className = "region-feed-card-action";
    action.textContent = "View Profile →";

    const reactions = createRegionFeedReactions(event);

    button.addEventListener("click", () => {
        if (!event.memberId) return;

        state.selectedMemberId = event.memberId;
        navigateTo("memberDetail");
    });

    button.append(
        avatar,
        content,
        visual,
        action
    );
    
    row.append(
        button,
        reactions
    );

    return row;
}