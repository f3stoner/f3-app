import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { goBack } from "../utils/navigation.js";

export function renderAdminFlagsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const backButton = document.createElement("button");
    backButton.textContent = "← Back";
    backButton.classList.add("secondary-button");

    backButton.addEventListener("click", () => {
        goBack("dashboard");
    });

    const title = document.createElement("h1");
    title.textContent = "Admin Flags";

    const subtitle = document.createElement("div");
    subtitle.classList.add("detail-label");
    subtitle.textContent = "Items that may need roster or session review.";

    const openFlags = (state.adminFlags || [])
        .filter(flag => flag.status === "open")
        .sort((a, b) => b.createdAt - a.createdAt);

    const flagList = document.createElement("div");
    flagList.classList.add("admin-flag-list");

    if (openFlags.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "No open admin flags.";
        flagList.appendChild(empty);
    } else {
        openFlags.forEach(flag => {
            flagList.appendChild(createAdminFlagCard(flag));
        });
    }

    app.append(backButton, title, subtitle, flagList);

}

function createAdminFlagCard(flag) {
    const card = document.createElement("div");
    card.classList.add("admin-flag-card");

    const type = document.createElement("div");
    type.classList.add("detail-label");
    type.textContent = formatFlagType(flag.type);

    const message = document.createElement("div");
    message.classList.add("admin-flag-message");
    message.textContent = flag.message || "Admin review needed.";

    const meta = document.createElement("div");
    meta.classList.add("admin-flag-detail");
    meta.textContent = `Created ${new Date(flag.createdAt).toLocaleString()}`;

    const proposedName = document.createElement("div");
    proposedName.classList.add("admin-flag-detail");
    proposedName.textContent = `Proposed name: ${flag.proposedPaxName || "Unknown"}`;

    const matchingMembers = (flag.matchedMemberIds || [])
        .map(id => state.members.find(member => member.id === id))
        .filter(Boolean);

    const matches = document.createElement("div");
    matches.classList.add("admin-flag-detail");

    if (matchingMembers.length > 0) {
        matches.textContent = `Matches: ${matchingMembers
            .map(member => member.paxName)
            .join(", ")}`;
    } else {
        matches.textContent = "Matches: none found in current roster";
    }

    const actions = document.createElement("div");
    actions.classList.add("admin-flag-actions");

    const resolveButton = document.createElement("button");
    resolveButton.textContent = "Mark Resolved";

    resolveButton.addEventListener("click", () => {
        flag.status = "resolved";
        renderApp();
    });

    const severityDot = document.createElement("div");
    severityDot.classList.add("severity-dot", `severity-${flag.severity}`);
    card.appendChild(severityDot);

    actions.appendChild(resolveButton);

    card.append(type, message, proposedName, matches, meta, actions);

    return card;
}

function formatFlagType(type) {
    if (type ==="duplicate_fng_name") return "Duplicate FNG Name";
    return type;
}