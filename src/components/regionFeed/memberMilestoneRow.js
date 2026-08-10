import { state } from "../../modules/state.js";
import { navigateTo } from "../../utils/navigation.js";
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

export function renderMemberMilestoneRow(
    event,
    {
        avatarUrls = new Map(),
    } = {}
) {
    const milestone = Number(event.payload?.milestone) || 0;
    const paxName = event.member?.paxName || event.member?.realName || "A PAX";
    const avatarUrl = event.member?.avatarPath
        ? avatarUrls.get(event.member.avatarPath) || null
        : null;

    const row = document.createElement("article");
    row.className = "region-feed-card region-feed-milestone-card";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-feed-card-button region-feed-milestone-button";
    button.setAttribute("aria-label", `View ${paxName}'s profile`);

    const avatar = createMemberAvatar(
        event.member,
        {
            signedUrl: avatarUrl,
            className: "region-feed-member-avatar",
        }
    );

    const content = document.createElement("div");
    content.className = "region-feed-card-content";

    const eyebrow = document.createElement("div");
    eyebrow.className = "region-feed-card-eyebrow";
    eyebrow.textContent = "Milestone";

    const title = document.createElement("h2");
    title.className = "region-feed-card-title";
    title.textContent = paxName;

    const subtitle = document.createElement("div");
    subtitle.className = "region-feed-card-subtitle";
    subtitle.textContent = "Reached a regional post milestone";

    const meta = document.createElement("div");
    meta.className = "region-feed-card-meta";
    meta.textContent = formatEventTime(event.occurredAt);

    content.append(eyebrow, title, subtitle, meta);

    const visual = document.createElement("div");
    visual.className = "region-feed-card-visual region-feed-milestone-visual";

    const milestoneValue = document.createElement("strong");
    milestoneValue.className = "region-feed-milestone-value";
    milestoneValue.textContent = milestone;

    const milestoneLabel = document.createElement("span");
    milestoneLabel.className = "region-feed-milestone-label";
    milestoneLabel.textContent = "Posts";

    visual.append(milestoneValue, milestoneLabel);

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