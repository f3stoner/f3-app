import { state } from "../../modules/state.js";
import { navigateTo } from "../../utils/navigation.js";
import { loadSessionsByIds } from "../../services/cloudData.js";
import { createIcon } from "../../utils/icons.js";

function getMemberName(memberId) {
    const member =
        state.participants.find(
            candidate =>
                candidate.id === memberId
        ) ||
        state.members.find(
            candidate =>
                candidate.id === memberId
        );

    return (
        member?.paxName ||
        member?.realName ||
        "Unknown Q"
    );
}

function formatQNames(qIds = []) {
    const names = [
        ...new Set(
            qIds
                .filter(Boolean)
                .map(getMemberName)
        ),
    ];

    if (names.length === 0) {
        return "The Q";
    }

    if (names.length === 1) {
        return names[0];
    }

    if (names.length === 2) {
        return `${names[0]} and ${names[1]}`;
    }

    return (
        `${names.slice(0, -1).join(", ")}, ` +
        `and ${names[names.length - 1]}`
    );
}

function formatSessionDate(dateString) {
    if (!dateString) {
        return "";
    }

    const date = new Date(
        `${dateString}T00:00:00`
    );

    return new Intl.DateTimeFormat(
        undefined,
        {
            weekday: "short",
            month: "short",
            day: "numeric",
        }
    ).format(date);
}

function formatEventTime(timestamp) {
    if (!timestamp) {
        return "";
    }

    const date = new Date(timestamp);

    return new Intl.DateTimeFormat(
        undefined,
        {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }
    ).format(date);
}

async function openSession(event) {
    if (!event.sessionId) {
        return;
    }

    let session =
        state.sessions.find(
            candidate =>
                candidate.id ===
                event.sessionId
        );

    if (!session && event.session) {
        session = event.session;

        state.sessions = [
            session,
            ...state.sessions.filter(
                candidate =>
                    candidate.id !==
                    session.id
            ),
        ];
    }

    if (!session) {
        const loadedSessions =
            await loadSessionsByIds([
                event.sessionId,
            ]);

        session =
            loadedSessions[0] || null;

        if (session) {
            state.sessions = [
                session,
                ...state.sessions.filter(
                    candidate =>
                        candidate.id !==
                        session.id
                ),
            ];
        }
    }

    if (!session) {
        throw new Error(
            "The session could not be loaded."
        );
    }

    state.selectedSessionId =
        session.id;

    navigateTo("sessionDetail");
}

export function renderSessionCompletedCard(event) {
    const session = event.session;
    const aoName = session?.aoName || "Workout";
    const qNames = formatQNames(session?.qIds);
    const sessionDate = formatSessionDate(session?.date);
    const attendanceCount = session?.attendeeIds?.length || 0;
    const fngCount = session?.fngs?.length || 0;

    const card = document.createElement("article");
    card.className = "region-feed-card region-feed-session-card";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-feed-card-button region-feed-session-button";
    button.setAttribute("aria-label", `View session at ${aoName}`);

    const icon = document.createElement("div");
    icon.className = "region-feed-event-icon region-feed-session-icon";
    icon.setAttribute("aria-hidden", "true");

    icon.appendChild(
        createIcon(
            "feedWorkoutComplete",
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
    eyebrow.textContent = "Workout Complete";

    const title = document.createElement("h2");
    title.className = "region-feed-card-title";
    title.textContent = aoName;

    const subtitle = document.createElement("div");
    subtitle.className = "region-feed-card-subtitle";
    subtitle.textContent = `Led by ${qNames}`;

    const stats = document.createElement("div");
    stats.className = "region-feed-card-meta region-feed-session-meta";

    const statsParts = [
        sessionDate,
        `${attendanceCount} PAX`,
    ];

    if (fngCount > 0) {
        statsParts.push(`${fngCount} FNG${fngCount === 1 ? "" : "s"}`);
    }

    stats.textContent = statsParts.filter(Boolean).join(" · ");

    const eventTime = document.createElement("div");
    eventTime.className = "region-feed-card-time";
    eventTime.textContent = formatEventTime(event.occurredAt);

    content.append(eyebrow, title, subtitle, stats, eventTime);

    const visual = document.createElement("div");
    visual.className = "region-feed-card-visual region-feed-session-visual";
    visual.setAttribute("aria-hidden", "true");

    const visualLabel = document.createElement("span");
    visualLabel.className = "region-feed-session-visual-label";
    visualLabel.textContent = attendanceCount;

    const visualUnit = document.createElement("span");
    visualUnit.className = "region-feed-session-visual-unit";
    visualUnit.textContent = "PAX";

    visual.append(visualLabel, visualUnit);

    const action = document.createElement("span");
    action.className = "region-feed-card-action";
    action.textContent = "View Session →";

    button.addEventListener("click", async () => {
        button.disabled = true;

        try {
            await openSession(event);
        } catch (error) {
            console.error("Failed to open feed session:", error);
            button.disabled = false;
        }
    });

    button.append(icon, content, visual, action);
    card.appendChild(button);

    return card;
}