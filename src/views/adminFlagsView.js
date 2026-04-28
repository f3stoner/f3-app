import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { updateAdminFlag, setMemberStatus, updateSession, updateMember } from "../services/appData.js";
import { showToast } from "../utils/toast.js";
import { getLastPostDate } from "../utils/memberStats.js";

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
    let isExpanded = false;

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

    const matchedToggle = document.createElement("div");
    matchedToggle.classList.add("admin-flag-toggle");

    const matchCount = matchingMembers.length;
    matchedToggle.textContent = `Matched PAX (${matchCount}) ▾`;

    const matchedSection = document.createElement("div");
    matchedSection.classList.add("admin-flag-matches");
    matchedSection.style.display = "none";

    matchedToggle.addEventListener("click", () => {
        isExpanded = !isExpanded;
        matchedSection.style.display = isExpanded ? "flex" : "none";
        matchedToggle.textContent = isExpanded
            ? `Matched PAX (${matchCount}) ▴`
            : `Matched PAX (${matchCount}) ▾`;
    });


    if (matchingMembers.length > 0) {
        matchingMembers.forEach(member => {
            const matchCard = document.createElement("div");
            matchCard.classList.add("admin-flag-match-card");

            const matchName = document.createElement("div");
            matchName.classList.add("admin-flag-match-name");
            matchName.textContent = member.paxName || "Unknown PAX";

            const lastPostDate = getLastPostDate(member, state.sessions);

            const matchDetails = document.createElement("div");
            matchDetails.classList.add("admin-flag-detail");

            const statusRow = document.createElement("div");
            statusRow.textContent = `Status: ${member.status || "unknown"}`;

            const homeAoRow = document.createElement("div");
            homeAoRow.textContent = `Home AO: ${member.homeAo || "unknown"}`;

            const lastPostRow = document.createElement("div");
            lastPostRow.textContent = `Last post: ${lastPostDate ? formatDate(lastPostDate) : "none found"}`;

            matchDetails.append(statusRow, homeAoRow, lastPostRow);

            const viewProfileButton = document.createElement("button");
            viewProfileButton.type = "button";
            viewProfileButton.textContent = "View Profile";
            
            viewProfileButton.addEventListener("click", (event) => {
                event.stopPropagation();

                state.selectedMemberId = member.id;
                navigateTo("memberDetail");
            });

            const makeInactiveButton = document.createElement("button");
            makeInactiveButton.textContent = "Make Inactive";
            makeInactiveButton.classList.add("danger-button");

            makeInactiveButton.addEventListener("click", async (event) => {
                event.stopPropagation();

                const confirmed = confirm(`Mark ${member.paxName} as inactive?`);
                if (!confirmed) return;

                try {
                    await setMemberStatus(member.id, "inactive");

                    await updateAdminFlag(flag.id, {
                        status: "resolved",
                        resolvedAt: Date.now(),
                        resolvedByUserId: state.currentUserId,
                        resolutionNotes: `Marked ${member.paxName} inactive`,
                    });

                    showToast(`${member.paxName} marked inactive. Flag resolved.`, "success");
                    renderApp();
                } catch (error) {
                    console.error("Failed to mark inactive:", error);
                    showToast("failed to update member.", "error");
                }
            });

            matchCard.append(matchName, matchDetails, viewProfileButton, makeInactiveButton);
            matchedSection.appendChild(matchCard);
        });
    } else {
        const noMatches = document.createElement("div");
        noMatches.classList.add("admin-flag-detail");
        noMatches.textContent = "No matching roster members found.";
        matchedSection.appendChild(noMatches);
    }

    const actions = document.createElement("div");
    actions.classList.add("admin-flag-actions");

    const renameFngButton = document.createElement("button");
        renameFngButton.textContent = "Rename FNG";

        renameFngButton.addEventListener("click", async (event) => {
            event.stopPropagation();

            const currentName = flag.proposedPaxName || "";
            const newName = prompt("Enter new FNG name:", currentName);

            if (!newName || newName.trim() === currentName) return;

            try {
                const session = state.sessions.find(s => s.id === flag.sessionId);
                if (!session) throw new Error("session not found");

                let linkedMemberId = null;

                const updatedFngs = (session.fngs || []).map(fng => {
                    if ((fng.paxName || "").trim().toLowerCase() === currentName.trim().toLowerCase()) {
                        linkedMemberId = fng.memberId || null;
                        return { ...fng, paxName: newName.trim() };
                    }
                    return fng;
                });

                console.log("Rename FNG debug:", {
                    currentName,
                    newName: newName.trim(),
                    linkedMemberId,
                    updatedFngs,
                    sessionFngs: session.fngs,
                });

                const updatedSession = {
                    ...session,
                    fngs: updatedFngs,
                };

                await updateSession(session.id, updatedSession);

                if (linkedMemberId) {
                    const linkedMember = state.members.find(member => member.id === linkedMemberId);

                    if (linkedMember) {
                        await updateMember(linkedMemberId, {
                            ...linkedMember,
                            paxName: newName.trim(),
                        });
                    }
                } else {
                    console.warn("No linked memberId found for renamed FNG.");
                }

                await updateAdminFlag(flag.id, {
                    status: "resolved",
                    resolvedAt: Date.now(),
                    resolvedByUserId: state.currentUserId,
                    resolutionNotes: `Renamed FNG from "${currentName}" to "${newName}"`,
                });

                showToast("FNG renamed. Flag resolved.", "success");
                renderApp();
            } catch (error) {
                console.error("Failed to rename FNG:", error);
                showToast("Failed to rename FNG.", "error");
            }
        });

    const resolveButton = document.createElement("button");
    resolveButton.textContent = "Mark Resolved";

    resolveButton.addEventListener("click", async () => {
        try {
            await updateAdminFlag(flag.id, {
                status: "resolved",
                resolvedAt: Date.now(),
                resolvedByUserId: state.currentUserId,
                resolutionNotes: "Manually marked resolved.",
            });

            showToast("Flag resolved.", "success");
            renderApp();
        } catch(error) {
            console.error('Failed to resolve admin flag:', error);
            showToast("Failed to resolve flag.", "error");
        }
    });

    const severityDot = document.createElement("div");
    severityDot.classList.add("severity-dot", `severity-${flag.severity}`);
    card.appendChild(severityDot);

    actions.append(renameFngButton, resolveButton);

    card.append(type, message, proposedName,matchedToggle, matchedSection, meta, actions);

    return card;
}

function formatFlagType(type) {
    if (type ==="duplicate_fng_name") return "Duplicate FNG Name";
    return type;
}