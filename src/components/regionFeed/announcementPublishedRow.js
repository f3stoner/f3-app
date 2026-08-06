import { createIcon } from "../../utils/icons.js";
import { createRegionFeedReactions } from "./regionFeedReactions.js";

function formatEventTime(timestamp) {
    if (!timestamp) return "";

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

function truncateBody(value, limit = 140) {
    const text = String(value || "").trim();

    if (text.length <= limit) return text;

    return `${text.slice(0, limit).trimEnd()}…`;
}

export function renderAnnouncementPublishedRow(event) {
    const announcement = event.announcement;

    const row = document.createElement("article");
    row.className = "region-feed-card region-feed-announcement-card";

    const icon = document.createElement("div");
    icon.className = "region-feed-event-icon region-feed-announcement-icon";
    icon.setAttribute("aria-hidden", "true");

    icon.appendChild(
        createIcon(
            "feedAnnouncement",
            "region-feed-event-icon-svg",
            {
                size: 21,
                strokeWidth: 2.3,
            }
        )
    );

    const content = document.createElement("div");
    content.className = "region-feed-announcement-content";

    const eyebrow = document.createElement("div");
    eyebrow.className = "region-feed-card-eyebrow";
    eyebrow.textContent = "Announcement";

    const title = document.createElement("h2");
    title.className = "region-feed-card-title";
    title.textContent = announcement?.title || "Regional Announcement";

    const subtitle = document.createElement("div");
    subtitle.className = "region-feed-card-subtitle";
    subtitle.textContent = truncateBody(announcement?.body);

    const meta = document.createElement("div");
    meta.className = "region-feed-card-meta";
    meta.textContent = formatEventTime(event.occurredAt);

    content.append(eyebrow, title, subtitle, meta);

    row.append(icon, content);

    if (announcement?.linkUrl) {
        const action = document.createElement("a");
        action.className = "region-feed-announcement-action";
        action.href = announcement.linkUrl;
        action.target = "_blank";
        action.rel = "noopener noreferrer";
        action.setAttribute(
            "aria-label",
            announcement.linkLabel || `Open ${title.textContent}`
        );

        const actionIcon = createIcon(
            "externalLink",
            "region-feed-announcement-action-icon",
            {
                size: 18,
                strokeWidth: 2.3,
            }
        );

        action.appendChild(actionIcon);
        row.appendChild(action);
    }

    const reactions = createRegionFeedReactions(event);
    row.appendChild(reactions);

    return row;
}