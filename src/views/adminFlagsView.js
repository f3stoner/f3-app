import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate } from "../utils/date.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { updateAdminFlag, setMemberStatus, updateSession, updateMember } from "../services/appData.js";
import { showToast } from "../utils/toast.js";
import { getLastPostDate } from "../utils/memberStats.js";
import { ADMIN_FLAG_TYPES } from "../modules/adminFlags.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderAdminFlagsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
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

    app.append(header, title, subtitle, flagList);
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function createAdminFlagCard(flag) {

    if (flag.type === ADMIN_FLAG_TYPES.DUPLICATE_FNG_NAME) {
        return createDuplicateFngFlagCard(flag);
    }

    if (flag.type === ADMIN_FLAG_TYPES.UNRESOLVED_PAX ||
        flag.type === ADMIN_FLAG_TYPES.UNMATCHED_MEMBER_REFERENCE
    ) {
        return createUnresolvedPaxFlagCard(flag);
    }

    if (flag.type === ADMIN_FLAG_TYPES.AMBIGUOUS_MEMBER_REFERENCE) {
        return createAmbiguousMemberReferenceFlagCard(flag);
    }

    if (flag.type === ADMIN_FLAG_TYPES.MEMBER_NAME_COLLISION) {
        return createMemberNameCollisionFlagCard(flag);
    }

    return createGenericAdminFlagCard(flag);

}

function createDuplicateFngFlagCard(flag) {

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

    const resolveButton = createResolveFlagButton(flag);

    const severityDot = document.createElement("div");
    severityDot.classList.add("severity-dot", `severity-${flag.severity}`);
    card.appendChild(severityDot);

    actions.append(renameFngButton, resolveButton);

    card.append(type, message, proposedName,matchedToggle, matchedSection, meta, actions);

    return card;
}

function createUnresolvedPaxFlagCard(flag) {
    const card = document.createElement("div");
    card.classList.add("admin-flag-card");

    const severityDot = document.createElement("div");
    severityDot.classList.add("severity-dot", `severity-${flag.severity}`);

    const type = document.createElement("div");
    type.classList.add("detail-label");
    type.textContent = formatFlagType(flag.type);

    const message = document.createElement("div");
    message.classList.add("admin-flag-message");
    message.textContent = flag.message || "Imported PAX could not be matched to roster.";

    const proposedName = document.createElement("div");
    proposedName.classList.add("admin-flag-detail");
    proposedName.textContent = `Unresolved PAX: ${flag.proposedPaxName || "Unknown"}`;

    const session = state.sessions.find(s => s.id === flag.sessionId);

    const sessionDetail = document.createElement("div");
    sessionDetail.classList.add("admin-flag-detail");
    sessionDetail.textContent = session
        ? `${formatDate(session.date)} - ${session.aoName || "Unknown AO"}`
        : "Session not found.";

    const actions = document.createElement("div");
    actions.classList.add("admin-flag-actions");

    const viewSessionButton = document.createElement("button");
    viewSessionButton.type = "button";
    viewSessionButton.textContent = "View Session";

    viewSessionButton.addEventListener("click", () => {
        if (!session) return;
        state.selectedSessionId = session.id;
        navigateTo("sessionDetail");
    });

    const resolveButton = createResolveFlagButton(flag, "Manually resolved unresolved PAX flag.");

    actions.append(viewSessionButton, resolveButton);
    card.append(severityDot, type, message, proposedName, sessionDetail, actions);

    return card;
}

function createGenericAdminFlagCard(flag) {
    const card = document.createElement("div");
    card.classList.add("admin-flag-card");

    const severityDot = document.createElement("div");
    severityDot.classList.add("severity-dot", `severity-${flag.severity || "low"}`);

    const type = document.createElement("div");
    type.classList.add("detail-label");
    type.textContent = formatFlagType(flag.type);

    const message = document.createElement("div");
    message.classList.add("admin-flag-message");
    message.textContent = flag.message || "Admin review needed";

    const meta = document.createElement("div");
    meta.classList.add("admin-flag-detail");
    meta.textContent = `Created ${new Date(flag.createdAt).toLocaleString()}`;

    const actions = document.createElement("div");
    actions.classList.add("admin-flag-actions");

    actions.append(createResolveFlagButton(flag));

    card.append(severityDot, type, message, meta, actions);

    return card;
}

function createAmbiguousMemberReferenceFlagCard(flag) {
    let isExpanded = false;

    const card = document.createElement("div");
    card.classList.add("admin-flag-card");

    const severityDot = document.createElement("div");
    severityDot.classList.add("severity-dot", `severity-${flag.severity || "high"}`);

    const type = document.createElement("div");
    type.classList.add("detail-label");
    type.textContent = formatFlagType(flag.type);

    const message = document.createElement("div");
    message.classList.add("admin-flag-message");
    message.textContent = flag.message || "Could not safely assign imported PAX to a roster member.";

    const session = state.sessions.find(s => s.id === flag.sessionId);

    const sessionDetail = document.createElement("div");
    sessionDetail.classList.add("admin-flag-detail");
    sessionDetail.textContent = session
        ? `${formatDate(session.date)} - ${session.aoName || "Unknown AO"}`
        : "Session not found.";

    const matchingMembers = (flag.matchedMemberIds || [])
        .map(id => state.members.find(member => member.id === id))
        .filter(Boolean);

    const matchedToggle = document.createElement("div");
    matchedToggle.classList.add("admin-flag-toggle");
    matchedToggle.textContent = `Potential Matches (${matchingMembers.length}) ▾`;

    const matchedSection = document.createElement("div");
    matchedSection.classList.add("admin-flag-matches");
    matchedSection.style.display = "none";

    matchedToggle.addEventListener("click", () => {
        isExpanded = !isExpanded;

        matchedSection.style.display = isExpanded ? "flex" : "none";
        matchedToggle.textContent = isExpanded
            ? `Potential Matches (${matchingMembers.length}) ▴`
            : `Potential Matches (${matchingMembers.length}) ▾`;
    });

    if (matchingMembers.length > 0) {
        matchingMembers.forEach(member => {
            matchedSection.appendChild(createAmbiguousMemberMatchCard(flag, member));
        });
    } else {
        const noMatches = document.createElement("div");
        noMatches.classList.add("admin-flag-detail");
        noMatches.textContent = "No potential matches found.";
        matchedSection.appendChild(noMatches);
    }

    const actions = document.createElement("div");
    actions.classList.add("admin-flag-actions");

    const viewSessionButton = document.createElement("button");
    viewSessionButton.type = "button";
    viewSessionButton.textContent = "View Session";

    viewSessionButton.addEventListener("click", () => {
        if (!session) return;
        state.selectedSessionId = session.id;
        navigateTo("sessionDetail");
    });

    actions.append(viewSessionButton, createResolveFlagButton(flag));

    card.append(severityDot, type, message, sessionDetail, matchedToggle, matchedSection, actions);

    return card;

}

function createAmbiguousMemberMatchCard(flag, member) {
    const matchCard = document.createElement("div");
    matchCard.classList.add("admin-flag-match-card");

    const matchName = document.createElement("div");
    matchName.classList.add("admin-flag-match-name");
    matchName.textContent = member.paxName || "Unknown PAX";
    const lastPostDate = getLastPostDate(member, state.sessions);

    const details = document.createElement("div");
    details.classList.add("admin-flag-detail");

    const realNameRow = document.createElement("div");
    realNameRow.textContent = `Real name: ${member.realName || "unknown"}`;

    const statusRow = document.createElement("div");
    statusRow.textContent = `Status: ${member.status || "unknown"}`;

    const homeAoRow = document.createElement("div");
    homeAoRow.textContent = `Home AO: ${member.homeAo || "unknown"}`;

    const lastPostRow = document.createElement("div");
    lastPostRow.textContent = `Last post: ${lastPostDate ? formatDate(lastPostDate) : "none found"}`;

    details.append(realNameRow, statusRow, homeAoRow, lastPostRow);

    const viewProfileButton = document.createElement("button");
    viewProfileButton.type = "button";
    viewProfileButton.textContent = "View Profile";
    viewProfileButton.addEventListener("click", (event) => {
        event.stopPropagation();
        state.selectedMemberId = member.id;
        navigateTo("memberDetail");
    });

    const useMemberButton = document.createElement("button");
    useMemberButton.type = "button";
    useMemberButton.textContent = "Use This Member";
    useMemberButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await assignReferenceToMemberWithBulkOption(flag, member);
    });

    const mergeButton = document.createElement("button");
    mergeButton.type = "button";
    mergeButton.textContent = "Merge Members";
    mergeButton.classList.add("danger-button");

    mergeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        showToast("Next step: add guarded member merge flow.", "info");
    });

    matchCard.append(matchName, details, viewProfileButton, useMemberButton, mergeButton);

    return matchCard;
}

function createMemberNameCollisionFlagCard(flag) {
    return createAmbiguousMemberReferenceFlagCard(flag);
}

function createResolveFlagButton(flag, resolutionNotes = "Manually marked resolved.") {
    const resolveButton = document.createElement("button");
    resolveButton.textContent = "Mark Resolved";

    resolveButton.addEventListener("click", async () => {
        try {
            await updateAdminFlag(flag.id, {
                status: "resolved",
                resolvedAt: Date.now(),
                resolvedByUserId: state.currentUserId,
                resolutionNotes,
            });

            showToast("Flag resolved.", "success");
            renderApp();
        } catch(error) {
            console.error('Failed to resolve admin flag:', error);
            showToast("Failed to resolve flag.", "error");
        }
    });

    return resolveButton;
}

function formatFlagType(type) {
    if (type === "duplicate_fng_name") return "Duplicate FNG Name";
    if (type === "unresolved_pax") return "Unresolved PAX";
    if (type === "unmatched_member_reference") return "Unmatched Member";
    if (type === "ambiguous_member_reference") return "Ambiguous Member Match";
    if (type === "member_name_collision") return "Member Name Collision";
    
    return type
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function isQCode(code) {
    const normalizedCode = String(code || "").toUpperCase().replace(/[^A-Z]/g, "");
    return normalizedCode.includes("Q");
}

function unresolvedMatchesFlag(unresolved, flag) {
    return (
        String(unresolved.rawName || "").trim().toLowerCase() ===
            String(flag.proposedPaxName || "").trim().toLowerCase() &&
        unresolved.reason === flag.type &&
        (flag.matchedMemberIds || []).every(id =>
            (unresolved.candidateMemberIds || []).includes(id)
        )
    );
}

function namesMatchForBulkResolution(flagA, flagB) {
    return (
        String(flagA.proposedPaxName || "").trim().toLowerCase() ===
        String(flagB.proposedPaxName || "").trim().toLowerCase()
    );
}

function isMemberReferenceFlag(flag) {
    return (
        flag.type === ADMIN_FLAG_TYPES.AMBIGUOUS_MEMBER_REFERENCE ||
        flag.type === ADMIN_FLAG_TYPES.UNMATCHED_MEMBER_REFERENCE ||
        flag.type === ADMIN_FLAG_TYPES.UNRESOLVED_PAX
    );
}

function getMatchingOpenReferenceFlags(flag) {
    return (state.adminFlags || []).filter(existingFlag =>
        existingFlag.status === "open" &&
        existingFlag.id !== flag.id &&
        isMemberReferenceFlag(existingFlag) &&
        namesMatchForBulkResolution(existingFlag, flag)
    );
}

async function assignSingleReferenceToMember(flag, member, { shouldRender = true, skipConfirm = false } = {}) {
    const session = state.sessions.find(s => s.id === flag.sessionId);
    if (!session) {
        showToast("Session not found.", "error");
        return false;
    }

    const unresolvedPax = session.unresolvedPax || session.unresolved_pax || [];

    const unresolvedEntry = unresolvedPax.find(unresolved =>
        unresolvedMatchesFlag(unresolved, flag)
    );

    console.log("Assign ambiguous reference:", {
        flag,
        member,
        session,
        unresolvedEntry,
    });

    if (!unresolvedEntry) {
        showToast("Unresolved PAX entry not found on session.", "error");
        return false;
    }

    if (!skipConfirm) {
        const confirmed = confirm(`Assign ${flag.proposedPaxName} to ${member.paxName}?`);
        if (!confirmed) return false;
    }

    const rejectedCandidateIds = (unresolvedEntry.candidateMemberIds || [])
        .filter(id => id !== member.id);

    const updatedAttendeeIds = Array.from(new Set([
        ...(session.attendeeIds || []).filter(id => !rejectedCandidateIds.includes(id)),
        member.id,
    ]));

    const updatedQIds = isQCode(unresolvedEntry.code)
        ? Array.from(new Set(
            [...(session.qIds || []).filter(id => !rejectedCandidateIds.includes(id)),
            member.id]))
        : (session.qIds || []).filter(id => !rejectedCandidateIds.includes(id));

    const updatedUnresolvedPax = unresolvedPax.filter(unresolved =>
        !unresolvedMatchesFlag(unresolved, flag)
    );

    const updatedSession = {
        ...session,
        attendeeIds: updatedAttendeeIds,
        qIds: updatedQIds,
        unresolvedPax: updatedUnresolvedPax,
    };

    try {
        await updateSession(session.id, updatedSession);

        const resolvedFlag = {
            ...flag,
            status: "resolved",
            resolvedAt: Date.now(),
            resolvedByUserId: state.currentUserId,
            resolutionNotes: `Assigned "${flag.proposedPaxName}" to ${member.paxName}.`,
        };

        await updateAdminFlag(flag.id, resolvedFlag);

        state.sessions = (state.sessions || []).map(existingSession =>
            existingSession.id === session.id ? updatedSession : existingSession
        );

        state.adminFlags = (state.adminFlags || []).map(existingFlag =>
            existingFlag.id === flag.id ? resolvedFlag : existingFlag
        );

        if (shouldRender) {
            showToast(`${flag.proposedPaxName} assigned to ${member.paxName}.`, "success");
            renderApp();
        }

        return true;

    } catch (error) {
        console.error("Failed to assign ambiguous member reference:", error);
        showToast("Failed to assign member.", "error");
        return false;
    }
}

async function assignReferenceToMemberWithBulkOption(flag, member) {
    const matchingFlags = getMatchingOpenReferenceFlags(flag);
    const totalCount = matchingFlags.length + 1;

    let applyAll = false;

    if (matchingFlags.length > 0) {
        applyAll = confirm(
            `Assign "${flag.proposedPaxName}" to ${member.paxName}?\n\n` +
            `Found ${totalCount} open flags for "${flag.proposedPaxName}".\n\n` +
            `Press OK to apply to all ${totalCount} flags.\n` +
            `Press Cancel to apply only this one.`
        );
    }

    if (!applyAll) {
        await assignSingleReferenceToMember(flag, member);
        return;
    }

    const flagsToResolve = [flag, ...matchingFlags];
    let successCount = 0;
    let failCount = 0;

    for (const flagToResolve of flagsToResolve) {
        try {
            const wasAssigned = await assignSingleReferenceToMember(flagToResolve, member, {
                shouldRender: false, 
                skipConfirm: true,
            });
            
            if (wasAssigned) {
                successCount += 1;
            } else {
                failCount += 1;
            }

        } catch (error) {
            console.error("Bulk assignment failed for flag:", flagToResolve, error);
            failCount += 1;
        }
    }

    showToast(
        failCount
            ? `Assigned ${successCount}. ${failCount} failed.`
            : `Assigned ${successCount} flags for ${flag.proposedPaxName}.`,
        failCount ? "error" : "success"
    );

    renderApp();
}