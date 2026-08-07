import { state } from "../../modules/state.js";
import { navigateTo } from "../../utils/navigation.js";
import { loadSessionsByIds } from "../../services/cloudData.js";
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

async function openSession(event) {
    if (!event.sessionId) return;

    let session = state.sessions.find(candidate => candidate.id === event.sessionId);

    if (!session && event.session) {
        session = event.session;
        state.sessions = [
            session,
            ...state.sessions.filter(candidate => candidate.id !== session.id),
        ];
    }

    if (!session) {
        const loadedSessions = await loadSessionsByIds([event.sessionId]);
        session = loadedSessions[0] || null;

        if (session) {
            state.sessions = [
                session,
                ...state.sessions.filter(candidate => candidate.id !== session.id),
            ];
        }
    }

    if (!session) {
        throw new Error("The VQ session could not be loaded.");
    }

    state.selectedSessionId = session.id;
    navigateTo("sessionDetail");
}

export function renderVqEarnedRow(event) {
    const session = event.session;
    const paxName = event.member?.paxName || event.member?.realName || "A PAX";
    const aoName = session?.aoName || event.payload?.aoName || "a workout";

    const row = document.createElement("article");
    row.className = "region-feed-card region-feed-vq-card";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-feed-vq-button";
    button.setAttribute("aria-label", `View ${paxName}'s VQ at ${aoName}`);

    const icon = document.createElement("div");
    icon.className = "region-feed-event-icon region-feed-vq-icon";
    icon.setAttribute("aria-hidden", "true");

    icon.appendChild(
        createIcon(
            "feedVqEarned",
            "region-feed-event-icon-svg",
            {
                size: 21,
                strokeWidth: 2.3,
            }
        )
    );

    const content = document.createElement("div");
    content.className = "region-feed-card-content";

    const eyebrow = document.createElement("div");
    eyebrow.className = "region-feed-card-eyebrow";
    eyebrow.textContent = "VQ Complete";

    const title = document.createElement("h2");
    title.className = "region-feed-card-title";
    title.textContent = `${paxName} led his first workout`;

    const subtitle = document.createElement("div");
    subtitle.className = "region-feed-card-subtitle";
    subtitle.textContent = `First Q · ${aoName}`;

    const meta = document.createElement("div");
    meta.className = "region-feed-card-meta";
    meta.textContent = formatEventTime(event.occurredAt);

    content.append(eyebrow, title, subtitle, meta);

    const visual = document.createElement("div");
    visual.className = "region-feed-vq-visual";
    visual.setAttribute("aria-hidden", "true");

    const visualMark = document.createElement("span");
    visualMark.className = "region-feed-vq-mark";
    visualMark.textContent = "VQ";

    visual.appendChild(visualMark);

    const action = document.createElement("span");
    action.className = "region-feed-card-action";
    action.textContent = "View Session →";

    const reactions = createRegionFeedReactions(event);

    button.addEventListener("click", async () => {
        button.disabled = true;

        try {
            await openSession(event);
        } catch (error) {
            console.error("Failed to open VQ session:", error);
            button.disabled = false;
        }
    });

    button.append(
        icon,
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