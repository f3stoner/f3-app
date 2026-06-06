import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createAppHeader } from "../components/appHeader.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { goBack } from "../utils/navigation.js";
import { 
    loadSessionBackblastLinks,
    loadBackblastReviewDecisions,
    insertSessionBackblastLink,
    insertBackblastReviewDecision,
    searchOpenSessionsForBackblastReview,
    insertSessionFromBackblastReview,
    loadAttendanceReviewSessions,
    updateSessionAttendanceReviewStatus,
    updateSessionInCloud,
 } from "../services/cloudData.js";

export async function renderBackblastReview() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "Backblast Review",
        showBack: true,
        showMenu: true,
        onBack: () => goBack("dashboard"),
    });

    const title = document.createElement("h1");
    title.textContent = "Backblast Review";

    const intro = document.createElement("div");
    intro.classList.add("detail-value");
    intro.textContent = "Review ambiguous and unmatched Band backblasts, then link them to the correct session.";

    app.append(header, title, intro);

    const content = document.createElement("div");
    content.classList.add("section");

    const loading = document.createElement("div");
    loading.classList.add("detail-value");
    loading.textContent = "Loading backblast review report...";

    content.appendChild(loading);
    app.appendChild(content);

    try {
        const [
            report,
            existingLinks,
            reviewDecisions,
            attendanceReviewSessions,
        ] = await Promise.all([
            loadBackblastReviewReport(),
            loadSessionBackblastLinks(),
            loadBackblastReviewDecisions(),
            loadAttendanceReviewSessions(state.activeRegionId || state.currentRegionId),
        ]);

        const linkedSessionIds = new Set(
            existingLinks.map(link => link.session_id || link.sessionId)
        );

        const linkedBandPostKeys = new Set(
            existingLinks.map(link => link.band_post_key || link.bandPostKey)
        );

        const latestReviewDecisions =
            getLatestReviewDecisionsByPostKey(reviewDecisions);

        const ignoredBandPostKeys = new Set(
            latestReviewDecisions
                .filter(decision => decision.decision_type === "ignored")
                .map(decision => decision.band_post_key || decision.bandPostKey)
        );

        const needsReviewBandPostKeys = new Set(
            latestReviewDecisions
                .filter(decision => decision.decision_type === "needs_review")
                .map(decision => decision.band_post_key || decision.bandPostKey)
        );

        const needsReviewDecisions = latestReviewDecisions.filter(
            decision => decision.decision_type === "needs_review"
        );

        const reportBackblastsByPostKey = buildReportBackblastsByPostKey(report);
        
        content.textContent = "";
        content.appendChild(createReviewSummary(report));
        content.appendChild(createAmbiguousReviewSection(
            report.ambiguousMatches || [],
            linkedSessionIds,
            linkedBandPostKeys,
            ignoredBandPostKeys,
        ));
        content.appendChild(createUnmatchedReviewSection(
            report.unmatched || [],
            linkedSessionIds,
            linkedBandPostKeys,
            ignoredBandPostKeys,
            needsReviewBandPostKeys
        ));
        content.appendChild(createNeedsReviewSection(
            needsReviewDecisions,
            reportBackblastsByPostKey,
            linkedSessionIds,
            linkedBandPostKeys
        ));
        content.appendChild(createAttendanceReviewSection(attendanceReviewSessions));
    
    } catch (error) {
        console.error("Failed to load backblast review report:", error);

        content.textContent = "";

        const errorMessage = document.createElement("div");
        errorMessage.classList.add("detail-value");
        errorMessage.textContent = "Unable to load backblast review report.";

        content.appendChild(errorMessage);
    }

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

async function loadBackblastReviewReport() {
    const response = await fetch("./import/output/backblast_session_match_report.json");

    if (!response.ok) {
        throw new Error("Failed to load backblast review report");
    }

    return response.json();
}

function createReviewSummary(report) {
    const summary = report.summary || {};

    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = "Import Review Summary";

    const value = document.createElement("div");
    value.classList.add("detail-value");
    value.textContent = [
        `${summary.ambiguousMatches || 0} ambiguous`,
        `${summary.unmatched || 0} unmatched`,
        `${summary.exactMatches || 0} exact`,
        `${summary.probableMatches || 0} probable`,
    ].join(" • ");

    section.append(heading, value);
    return section;
}

function getLatestReviewDecisionsByPostKey(reviewDecisions = []) {
    const map = new Map();

    reviewDecisions.forEach(decision => {
        const postKey = decision.band_post_key || decision.bandPostKey;
        if (!postKey) return;

        const existing = map.get(postKey);

        const existingTime =
            existing?.created_at ||
            existing?.createdAt ||
            0;

        const currentTime =
            decision.created_at ||
            decision.createdAt ||
            0;

        if (!existing || currentTime >= existingTime) {
            map.set(postKey, decision);
        }
    });

    return [...map.values()];
}

function buildReportBackblastsByPostKey(report) {
    const map = new Map();

    (report.unmatched || []).forEach(item => {
        const backblast = item.backblast;
        if (backblast?.postKey) {
            map.set(backblast.postKey, backblast);
        }
    });

    (report.ambiguousMatches || []).forEach(match => {
        const backblast = match.backblast;
        if (backblast?.postKey) {
            map.set(backblast.postKey, backblast);
        }
    });

    return map;
}

function createAmbiguousReviewSection(ambiguousMatches, linkedSessionIds, linkedBandPostKeys, ignoredBandPostKeys) {
    const section = document.createElement("div");
    section.classList.add("section");

    const unresolvedMatches = ambiguousMatches.filter(match => {
        const postKey = match.backblast?.postKey;
    
        if (linkedBandPostKeys.has(postKey)) return false;
        if (ignoredBandPostKeys.has(postKey)) return false;
    
        return true;
    });

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = `Ambiguous Backblasts (${unresolvedMatches.length})`;

    section.appendChild(heading);

    if (unresolvedMatches.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No ambiguous backblasts to review.";
        section.appendChild(empty);
        return section;
    }

    unresolvedMatches.slice(0, 25).forEach(match => {
        section.appendChild(createAmbiguousMatchCard(match, linkedSessionIds, linkedBandPostKeys, ignoredBandPostKeys));
    });

    return section;
}

function createNeedsReviewSection(
    decisions = [],
    reportBackblastsByPostKey,
    linkedSessionIds,
    linkedBandPostKeys
) {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = `Needs Manual Review (${decisions.length})`;

    section.appendChild(heading);

    if (decisions.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No backblasts need manual review.";
        section.appendChild(empty);
        return section;
    }

    decisions.slice(0, 50).forEach(decision => {
        section.appendChild(createNeedsReviewCard(
            decision,
            reportBackblastsByPostKey,
            linkedSessionIds,
            linkedBandPostKeys
        ));
    });

    return section;
}

function createNeedsReviewCard(
    decision,
    reportBackblastsByPostKey,
    linkedSessionIds,
    linkedBandPostKeys
) {
    const card = document.createElement("div");
    card.classList.add("admin-card");

    const notes = decision.notes || "";
    const postKey = decision.band_post_key || decision.bandPostKey;
    const backblast = reportBackblastsByPostKey.get(postKey);

    const reviewType = notes.includes("NEEDS_DATE_REVIEW")
        ? "Needs Date Review"
        : notes.includes("NEEDS_AO_REVIEW")
            ? "Needs AO Review"
            : "Needs Review";

    const title = document.createElement("div");
    title.classList.add("detail-label");
    title.textContent = reviewType;

    const meta = document.createElement("div");
    meta.classList.add("detail-value");
    meta.textContent = [
        backblast?.date ? `Parsed date: ${backblast.date}` : null,
        backblast?.aoName ? `Parsed AO: ${backblast.aoName}` : null,
        backblast?.qNames?.length ? `Q guess: ${backblast.qNames.join(", ")}` : null,
        postKey ? `Post: ${postKey}` : null,
    ].filter(Boolean).join(" • ");

    const preview = document.createElement("pre");
    preview.classList.add("detail-value");
    preview.style.whiteSpace = "pre-wrap";
    preview.style.maxHeight = "220px";
    preview.style.overflow = "auto";
    preview.textContent = backblast
        ? (backblast.cleanedContent || backblast.rawContent || "No backblast text found.").slice(0, 1200)
        : notes || "Backblast was not found in report JSON.";

    const buttonRow = document.createElement("div");
    buttonRow.classList.add("button-row");

    if (backblast) {
        const reviewButton = document.createElement("button");
        reviewButton.textContent = "Review / Create Session";

        reviewButton.addEventListener("click", () => {
            openCreateSessionFromBackblastModal({
                match: {
                    method: reviewType,
                    backblast,
                    candidates: [],
                },
                linkedSessionIds,
                linkedBandPostKeys,
                card,
            });
        });

        buttonRow.appendChild(reviewButton);
    }

    const findButton = document.createElement("button");
    findButton.textContent = "Find Existing Session";

    findButton.addEventListener("click", () => {
        const finder = document.createElement("div");
        finder.classList.add("section");

        finder.appendChild(createSessionFinder(
            {
                method: reviewType,
                backblast,
                candidates: [],
            },
            linkedSessionIds,
            linkedBandPostKeys,
            card
        ));

        card.appendChild(finder);
    });

    buttonRow.appendChild(findButton);

    const ignoreButton = document.createElement("button");
    ignoreButton.classList.add("secondary-button");
    ignoreButton.textContent = "Ignore";

    ignoreButton.addEventListener("click", async () => {
        const confirmed = confirm("Ignore this review item?");
        if (!confirmed) return;

        ignoreButton.disabled = true;
        ignoreButton.textContent = "Ignoring...";

        try {
            await insertBackblastReviewDecision({
                region_id: state.activeRegionId || state.currentRegionId,
                band_post_key: postKey,
                session_id: null,
                decision_type: "ignored",
                decided_by_user_id: state.currentUserId || null,
                notes: "Manually ignored from needs-review queue.",
            });

            card.remove();
        } catch (error) {
            console.error("Failed to ignore review item:", error);
            alert("Failed to ignore review item.");
            ignoreButton.disabled = false;
            ignoreButton.textContent = "Ignore";
        }
    });

    buttonRow.appendChild(ignoreButton);

    card.append(title, meta, preview, buttonRow);
    return card;
}

function createAttendanceReviewSection(sessions = []) {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = `Attendance Review Required (${sessions.length})`;

    section.appendChild(heading);

    if (sessions.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No sessions need attendance review.";
        section.appendChild(empty);
        return section;
    }

    sessions.slice(0, 25).forEach(session => {
        section.appendChild(createAttendanceReviewCard(session));
    });

    return section;
}

function createAttendanceReviewCard(session) {
    const card = document.createElement("div");
    card.classList.add("admin-card");

    const title = document.createElement("div");
    title.classList.add("detail-label");
    title.textContent = `${session.date || "No date"} • ${session.aoName || "No AO"}`;

    const meta = document.createElement("div");
    meta.classList.add("detail-value");
    meta.textContent = [
        session.startTime ? `Time: ${session.startTime}` : null,
        getSessionQNames(session).length ? `Q: ${getSessionQNames(session).join(", ")}` : null,
        `Current PAX: ${(session.attendeeIds || []).length}`,
        session.attendanceReviewNotes ? `Review: ${session.attendanceReviewNotes}` : null,
    ].filter(Boolean).join(" • ");

    const backblastHeading = document.createElement("div");
    backblastHeading.classList.add("detail-label");
    backblastHeading.textContent = "Backblast Text";

    const backblastText = document.createElement("pre");
    backblastText.classList.add("detail-value");
    backblastText.style.whiteSpace = "pre-wrap";
    backblastText.style.maxHeight = "260px";
    backblastText.style.overflow = "auto";
    backblastText.textContent = session.backblastText || "No backblast text found.";

    const attendeeHeading = document.createElement("div");
    attendeeHeading.classList.add("detail-label");
    attendeeHeading.textContent = "Current Attendees";

    const attendeeList = document.createElement("div");
    attendeeList.classList.add("detail-value");
    attendeeList.textContent = getSessionAttendeeNames(session).join(", ") || "None";

    const buttonRow = document.createElement("div");
    buttonRow.classList.add("button-row");

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Attendance";

    editButton.addEventListener("click", () => {
        openAttendanceReviewModal(session, card);
    });

    const markReviewedButton = document.createElement("button");
    markReviewedButton.textContent = "Mark Reviewed";

    markReviewedButton.addEventListener("click", async () => {
        const confirmed = confirm("Mark this session attendance as reviewed?");
        if (!confirmed) return;

        markReviewedButton.disabled = true;
        markReviewedButton.textContent = "Saving...";

        try {
            await updateSessionAttendanceReviewStatus(
                state.activeRegionId || state.currentRegionId,
                session.id,
                "reviewed",
                "Attendance reviewed from backblast review."
            );

            card.remove();
        } catch (error) {
            console.error("Failed to mark attendance reviewed:", error);
            alert("Failed to mark attendance reviewed.");
            markReviewedButton.disabled = false;
            markReviewedButton.textContent = "Mark Reviewed";
        }
    });

    buttonRow.append(editButton, markReviewedButton);

    card.append(
        title,
        meta,
        backblastHeading,
        backblastText,
        attendeeHeading,
        attendeeList,
        buttonRow
    );

    return card;
}

function openAttendanceReviewModal(session, card) {
    const selectedAttendeeIds = new Set(session.attendeeIds || []);

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const heading = document.createElement("h2");
    heading.textContent = `Review Attendance`;

    const sessionMeta = document.createElement("div");
    sessionMeta.classList.add("detail-value");
    sessionMeta.textContent = `${session.date || "No date"} • ${session.aoName || "No AO"}`;

    const backblastText = document.createElement("pre");
    backblastText.classList.add("detail-value");
    backblastText.style.whiteSpace = "pre-wrap";
    backblastText.style.maxHeight = "260px";
    backblastText.style.overflow = "auto";
    backblastText.textContent = session.backblastText || "No backblast text found.";

    const selectedSummary = document.createElement("div");
    selectedSummary.classList.add("detail-value");

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search PAX...";

    const memberResults = document.createElement("div");
    memberResults.classList.add("section");

    function renderSelectedSummary() {
        const attendeeNames = [...selectedAttendeeIds]
            .map(id => state.members.find(member => member.id === id))
            .filter(Boolean)
            .map(member => member.paxName)
            .sort((a, b) => a.localeCompare(b));

        selectedSummary.textContent = attendeeNames.length
            ? `Selected PAX (${attendeeNames.length}): ${attendeeNames.join(", ")}`
            : "Selected PAX: None";
    }

    function renderMemberResults() {
        memberResults.textContent = "";

        const term = searchInput.value.trim().toLowerCase();

        const members = [...state.members]
            .filter(member => member.status !== "inactive")
            .filter(member => {
                if (!term) return true;

                return (
                    (member.paxName || "").toLowerCase().includes(term) ||
                    (member.realName || "").toLowerCase().includes(term)
                );
            })
            .sort((a, b) => a.paxName.localeCompare(b.paxName))
            .slice(0, 60);

        members.forEach(member => {
            const row = document.createElement("div");
            row.classList.add("selected-summary-row");

            const label = document.createElement("span");
            label.textContent = member.paxName;

            const toggleButton = document.createElement("button");
            toggleButton.textContent = selectedAttendeeIds.has(member.id)
                ? "PAX ✓"
                : "PAX";

            toggleButton.addEventListener("click", () => {
                if (selectedAttendeeIds.has(member.id)) {
                    selectedAttendeeIds.delete(member.id);
                } else {
                    selectedAttendeeIds.add(member.id);
                }

                renderSelectedSummary();
                renderMemberResults();
            });

            row.append(label, toggleButton);
            memberResults.appendChild(row);
        });
    }

    searchInput.addEventListener("input", renderMemberResults);

    const buttonRow = document.createElement("div");
    buttonRow.classList.add("button-row");

    const cancelButton = document.createElement("button");
    cancelButton.classList.add("secondary-button");
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => overlay.remove());

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Attendance";

    saveButton.addEventListener("click", async () => {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            const updatedSession = {
                ...session,
                attendeeIds: [...selectedAttendeeIds],
                attendanceReviewStatus: "reviewed",
                attendanceReviewNotes: "Attendance reviewed from backblast review.",
            };

            await updateSessionInCloud(
                state.activeRegionId || state.currentRegionId,
                updatedSession
            );

            const index = state.sessions.findIndex(s => s.id === session.id);
            if (index !== -1) {
                state.sessions[index] = updatedSession;
            }

            overlay.remove();
            card.remove();
        } catch (error) {
            console.error("Failed to save attendance review:", error);
            alert("Failed to save attendance review.");
            saveButton.disabled = false;
            saveButton.textContent = "Save Attendance";
        }
    });

    buttonRow.append(cancelButton, saveButton);

    renderSelectedSummary();
    renderMemberResults();

    modal.append(
        heading,
        sessionMeta,
        backblastText,
        selectedSummary,
        searchInput,
        memberResults,
        buttonRow
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function createUnmatchedReviewSection(unmatchedItems, linkedSessionIds, linkedBandPostKeys, ignoredBandPostKeys, needsReviewBandPostKeys) {
    const section = document.createElement("div");
    section.classList.add("section");

    const unresolvedItems = unmatchedItems.filter(item => {
        const postKey = item.backblast?.postKey;

        if (linkedBandPostKeys.has(postKey)) return false;
        if (ignoredBandPostKeys.has(postKey)) return false;
        if (needsReviewBandPostKeys.has(postKey)) return false;

        return true;
    });

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = `Unmatched Backblasts (${unresolvedItems.length})`;

    section.appendChild(heading);

    if (unresolvedItems.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No unmatched backblasts to review.";
        section.appendChild(empty);
        return section;
    }

    unresolvedItems.slice(0, 25).forEach(item => {
        section.appendChild(createUnmatchedMatchCard(item, linkedSessionIds, linkedBandPostKeys, ignoredBandPostKeys));
    });

    return section;
}

function createAmbiguousMatchCard(match, linkedSessionIds, linkedBandPostKeys, ignoredBandPostKeys) {
    const card = document.createElement("div");
    card.classList.add("admin-card");

    const backblast = match.backblast || {};

    const title = document.createElement("div");
    title.classList.add("detail-label");
    title.textContent = `${backblast.date || "No date"} • ${backblast.aoName || "No AO"}`;

    const meta = document.createElement("div");
    meta.classList.add("detail-value");
    meta.textContent = [
        backblast.authorName ? `Author: ${backblast.authorName}` : null,
        backblast.qNames?.length ? `Q guess: ${backblast.qNames.join(", ")}` : null,
        match.method ? `Method: ${match.method}` : null,
    ].filter(Boolean).join(" • ");

    const preview = document.createElement("div");
    preview.classList.add("detail-value");
    preview.textContent = (backblast.cleanedContent || backblast.rawContent || "")
        .slice(0, 300);

    const candidates = document.createElement("div");
    candidates.classList.add("section");

    const candidateHeading = document.createElement("div");
    candidateHeading.classList.add("detail-label");
    candidateHeading.textContent = "Candidate Sessions";

    candidates.appendChild(candidateHeading);

    const availableCandidates = (match.candidates || []).filter(candidate => {
        const session = candidate.session || candidate;
    
        if (linkedSessionIds.has(session.id)) return false;
        if (sessionAlreadyHasBackblast(session.id)) return false;
    
        return true;
    });

    if (availableCandidates.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No open candidate sessions. Suggested sessions may already have backblasts.";

        candidates.appendChild(empty);
    } else {
        availableCandidates.forEach(candidate => {
            candidates.appendChild(createCandidateSessionRow(match, candidate, linkedSessionIds,linkedBandPostKeys, card));
        });
    }

    const finder = document.createElement("div");
    finder.classList.add("section");

    const findButton = document.createElement("button");
    findButton.textContent = "Find Different Session";

    findButton.addEventListener("click", () => {
        finder.textContent = "";
    
        const cancelSearchButton = document.createElement("button");
        cancelSearchButton.classList.add("secondary-button");
        cancelSearchButton.textContent = "Back to Actions";
    
        cancelSearchButton.addEventListener("click", () => {
            finder.textContent = "";
            finder.append(findButton, createSessionButton, skipButton);
        });
    
        finder.append(
            createSessionFinder(match, linkedSessionIds, linkedBandPostKeys, card),
            cancelSearchButton
        );
    });

    const createSessionButton = document.createElement("button");
    createSessionButton.textContent = "Create Session From Backblast";
    createSessionButton.addEventListener("click", () => {
        openCreateSessionFromBackblastModal({
            match,
            linkedSessionIds,
            linkedBandPostKeys,
            card,
        });
    });

    const skipButton = document.createElement("button");
    skipButton.textContent = "Skip / Ignore";

    skipButton.addEventListener("click", async () => {
        const confirmed = confirm("Skip this backblast from review?");
        if (!confirmed) return;

        skipButton.disabled = true;
        skipButton.textContent = "Skipping...";

        try {
            await insertBackblastReviewDecision({
                region_id: state.activeRegionId || state.currentRegionId,
                band_post_key: match.backblast?.postKey,
                session_id: null,
                decision_type: "ignored",
                decided_by_user_id: state.currentUserId || null,
                notes: "Manually ignored from backblast review.",
            });

            ignoredBandPostKeys.add(match.backblast?.postKey);
            card.remove();
        } catch (error) {
            console.error("Failed to skip backblast:", error);
            alert("Failed to skip backblast.");
            skipButton.disabled = false;
            skipButton.textContent = "Skip / Ignore";
        }
    });

    finder.append(findButton, createSessionButton, skipButton);

    card.append(title, meta, preview, candidates, finder);
    return card;
}

function createUnmatchedMatchCard(item, linkedSessionIds, linkedBandPostKeys, ignoredBandPostKeys) {
    const match = {
        method: item.reason || "unmatched",
        backblast: item.backblast,
        candidates: [],
    };

    return createAmbiguousMatchCard(
        match,
        linkedSessionIds,
        linkedBandPostKeys,
        ignoredBandPostKeys
    );
}

function createSessionFinder(match, linkedSessionIds, linkedBandPostKeys, card) {
    const backblast = match.backblast || {};

    const wrapper = document.createElement("div");
    wrapper.classList.add("section");

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = backblast.date || "";

    const aoSelect = document.createElement("select");

    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Any AO";
    aoSelect.appendChild(blankOption);

    [...new Set(state.aos.map(ao => ao.name).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .forEach(aoName => {
            const option = document.createElement("option");
            option.value = aoName;
            option.textContent = aoName;
            aoSelect.appendChild(option);
        });

    aoSelect.value = "";

    const searchButton = document.createElement("button");
    searchButton.textContent = "Search Open Sessions";

    const results = document.createElement("div");
    results.classList.add("section");

    async function runSearch() {
        results.textContent = "";

        const loading = document.createElement("div");
        loading.classList.add("detail-value");
        loading.textContent = "Searching open sessions...";
        results.appendChild(loading);

        try {
            const matches = await searchOpenSessionsForBackblastReview({
                regionId: state.activeRegionId || state.currentRegionId,
                date: dateInput.value,
                aoName: aoSelect.value,
                linkedSessionIds: [...linkedSessionIds],
            });

            results.textContent = "";

            const openMatches = matches.filter(session => {
                const hasLinkedBackblast = linkedSessionIds.has(session.id);

                const hasAppBackblast = Boolean(
                    String(session.backblast_text || session.backblastText || "").trim()
                );

                const hasHistoricalBackblast = Boolean(
                    String(session.historical_backblast_text || session.historicalBackblastText || "").trim()
                );

                return !hasLinkedBackblast && !hasAppBackblast && !hasHistoricalBackblast;
            });

            if (openMatches.length === 0) {
                const empty = document.createElement("div");
                empty.classList.add("detail-value");
                empty.textContent = "No open sessions found for that search.";
                results.appendChild(empty);
                return;
            }

            openMatches.slice(0, 25).forEach(session => {
                results.appendChild(
                    createManualSessionResultRow(
                        match,
                        session,
                        linkedSessionIds,
                        linkedBandPostKeys,
                        card
                    )
                );
            });
        } catch (error) {
            console.error("Failed to search open sessions:", error);

            results.textContent = "";

            const errorMessage = document.createElement("div");
            errorMessage.classList.add("detail-value");
            errorMessage.textContent = "Failed to search open sessions.";
            results.appendChild(errorMessage);
        }
    }

    searchButton.addEventListener("click", runSearch);

    wrapper.append(dateInput, aoSelect, searchButton, results);

    runSearch();

    return wrapper;
}

function findOpenSessionsForReview({ date, aoName, linkedSessionIds }) {
    return state.sessions
        .filter(session => {
            if (linkedSessionIds.has(session.id)) return false;
            if (sessionAlreadyHasBackblast(session.id)) return false;
            if (date && session.date !== date) return false;
            if (aoName && session.aoName !== aoName) return false;

            return true;
        })
        .sort((a, b) => {
            const dateCompare = (a.date || "").localeCompare(b.date || "");
            if (dateCompare !== 0) return dateCompare;

            return (a.startTime || "").localeCompare(b.startTime || "");
        });
}

function createCandidateSessionRow(match, candidate, linkedSessionIds, linkedBandPostKeys, card) {
    const row = document.createElement("div");
    row.classList.add("selected-summary-row");

    const session = candidate.session || candidate;

    const label = document.createElement("span");
    label.style.cursor = "pointer";

    const sessionAoName = session.aoName || session.ao_name || "No AO";
    const startTime = session.startTime || session.start_time || null;
    const qNames = session.qNames || getSessionQNames(session);
    
    label.textContent = [
        session.date || "No date",
        startTime ? startTime : null,
        sessionAoName,
        qNames.length ? `Q: ${qNames.join(", ")}` : null,
        candidate.dateOffset ? `Offset: ${candidate.dateOffset}` : null,
    ].filter(Boolean).join(" • ");

    label.addEventListener("click", () => {
        console.log("Candidate session clicked:", {
            candidateSession: session,
            candidateSessionId: session.id,
            stateSessionCount: state.sessions.length,
            foundInState: Boolean(getSessionById(session.id)),
            matchingByDateAo: state.sessions.filter(s =>
                s.date === session.date && s.aoName === session.aoName
            ),
        });
    
        openSessionPreviewModal(session.id, session);
    });

    const button = document.createElement("button");
    button.textContent = "Link";

    button.addEventListener("click", async () => {
        const confirmed = confirm(
            `Link this backblast to ${session.date} • ${sessionAoName}?`
        );
    
        if (!confirmed) return;
    
        button.disabled = true;
        button.textContent = "Linking...";
    
        try {
            await linkBackblastToSession({
                match,
                candidate,
                session,
            });
    
            linkedSessionIds.add(session.id);
            linkedBandPostKeys.add(match.backblast?.postKey);
            card.remove();
        } catch (error) {
            console.error("Failed to link backblast:", error);
            alert("Failed to link backblast.");
            button.disabled = false;
            button.textContent = "Link";
        }
    });

    row.append(label, button);
    return row;
}

function createManualSessionResultRow(match, session, linkedSessionIds, linkedBandPostKeys, card) {
    const row = document.createElement("div");
    row.classList.add("selected-summary-row");

    const sessionAoName = session.aoName || session.ao_name || "No AO";
    const attendeeIds = session.attendeeIds || session.attendee_ids || [];
    const startTime = session.startTime || session.start_time || null;
    const qNames = getSessionQNames(session);

    const label = document.createElement("span");
    label.style.cursor = "pointer";
    label.textContent = [
        session.date || "No date",
        startTime ? startTime : null,
        sessionAoName,
        qNames.length ? `Q: ${qNames.join(", ")}` : null,
        `PAX: ${attendeeIds.length}`,
    ].filter(Boolean).join(" • ");

    label.addEventListener("click", () => {
        openSessionPreviewModal(session.id, session);
    });

    const button = document.createElement("button");
    button.textContent = "Link";

    button.addEventListener("click", async () => {
        const confirmed = confirm(
            `Link this backblast to ${session.date} • ${sessionAoName}?`
        );

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "Linking...";

        try {
            await linkBackblastToSession({
                match,
                candidate: { session },
                session,
            });

            linkedSessionIds.add(session.id);
            linkedBandPostKeys.add(match.backblast?.postKey);
            card.remove();
        } catch (error) {
            console.error("Failed to link backblast:", error);
            alert("Failed to link backblast.");
            button.disabled = false;
            button.textContent = "Link";
        }
    });

    row.append(label, button);
    return row;
}

function sessionAlreadyHasBackblast(sessionId) {
    const session = state.sessions.find(session => session.id === sessionId);

    return Boolean(
        session?.backblastText ||
        session?.backblast_text ||
        session?.historicalBackblastText ||
        session?.historical_backblast_text
    );
}

function getSessionById(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();

    return state.sessions.find(session =>
        String(session.id || "").trim() === normalizedSessionId
    );
}

function openSessionPreviewModal(sessionId, fallbackSession = null) {
    const session = getSessionById(sessionId) || fallbackSession;

    if (!session) {
        alert("Session not found.");
        return;
    }

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const heading = document.createElement("h2");

    const sessionAoName =
        session.aoName ||
        session.ao_name ||
        "No AO";
    
    heading.textContent =
        `${session.date || "No date"} • ${sessionAoName}`;

    const attendeeIds =
        session.attendeeIds ||
        session.attendee_ids ||
        [];

    const fngs =
        session.fngs ||
        [];

    const startTime =
        session.startTime ||
        session.start_time;

    const meta = document.createElement("div");
    meta.classList.add("detail-value");

    meta.textContent = [
        startTime ? `Time: ${startTime}` : null,
        getSessionQNames(session).length
            ? `Q: ${getSessionQNames(session).join(", ")}`
            : null,
        `PAX: ${attendeeIds.length}`,
        fngs.length
            ? `FNGs: ${fngs.length}`
            : null,
    ].filter(Boolean).join(" • ");

    const attendeesHeading = document.createElement("div");
    attendeesHeading.classList.add("detail-label");
    attendeesHeading.textContent = "Attendees";

    const attendees = document.createElement("div");
    attendees.classList.add("detail-value");
    attendees.textContent = getSessionAttendeeNames(session).join(", ") || "None";

    const notesHeading = document.createElement("div");
    notesHeading.classList.add("detail-label");
    notesHeading.textContent = "Notes / Backblast Status";

    const notes = document.createElement("div");
    notes.classList.add("detail-value");
    notes.textContent = [
        session.notes ? `Notes: ${session.notes}` : null,
        session.backblastText || session.backblast_text ? "Has app backblast" : null,
        session.historicalBackblastText || session.historical_backblast_text ? "Has historical backblast" : null,
    ].filter(Boolean).join(" • ") || "No notes/backblast visible on session object.";

    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
        overlay.remove();
    });

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });

    modal.append(
        heading,
        meta,
        attendeesHeading,
        attendees,
        notesHeading,
        notes,
        closeButton
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function getSessionQNames(session) {
    const qIds = session.qIds || session.q_ids || (session.qId || session.q_id ? [session.qId || session.q_id] : []);

    return qIds
        .map(id => state.members.find(member => member.id === id))
        .filter(Boolean)
        .map(member => member.paxName || member.pax_name || member.realName || member.real_name)
        .filter(Boolean);
}

function getSessionAttendeeNames(session) {
    return (session.attendeeIds || session.attendee_ids || [])
        .map(id => state.members.find(member => member.id === id))
        .filter(Boolean)
        .map(member => member.paxName || member.pax_name || member.realName || member.real_name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function openCreateSessionFromBackblastModal({
    match,
    linkedSessionIds,
    linkedBandPostKeys,
    card,
}) {
    const backblast = match.backblast || {};
    const qIds = findMemberIdsByPaxNames(backblast.qNames || []);

    const selectedQIds = new Set(qIds);
    const selectedAttendeeIds = new Set(qIds);

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const heading = document.createElement("h2");
    heading.textContent = "Create Session From Backblast";

    const meta = document.createElement("div");
    meta.classList.add("detail-value");
    meta.textContent = [
        backblast.date || "No date",
        backblast.aoName || "No AO",
        backblast.qNames?.length ? `Q guess: ${backblast.qNames.join(", ")}` : null,
    ].filter(Boolean).join(" • ");

    const backblastHeading = document.createElement("div");
    backblastHeading.classList.add("detail-label");
    backblastHeading.textContent = "Backblast Text";

    const backblastText = document.createElement("pre");
    backblastText.classList.add("detail-value");
    backblastText.style.whiteSpace = "pre-wrap";
    backblastText.style.maxHeight = "260px";
    backblastText.style.overflow = "auto";
    backblastText.textContent =
        backblast.cleanedContent ||
        backblast.rawContent ||
        "No backblast text found.";

    const aoLabel = document.createElement("div");
    aoLabel.classList.add("detail-label");
    aoLabel.textContent = "AO";

    const aoSelect = document.createElement("select");

    [...state.aos]
        .filter(ao => ao.isActive)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(ao => {
            const option = document.createElement("option");
            option.value = ao.name;
            option.textContent = ao.name;
            aoSelect.appendChild(option);
        });

    aoSelect.value = backblast.aoName || "";

    if (![...aoSelect.options].some(option => option.value === aoSelect.value)) {
        aoSelect.value = "";
    }

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search PAX...";

    const selectedSummary = document.createElement("div");
    selectedSummary.classList.add("detail-value");

    const memberResults = document.createElement("div");
    memberResults.classList.add("section");

    function renderSelectedSummary() {
        const qNames = [...selectedQIds]
            .map(id => state.members.find(member => member.id === id))
            .filter(Boolean)
            .map(member => member.paxName);

        const attendeeNames = [...selectedAttendeeIds]
            .map(id => state.members.find(member => member.id === id))
            .filter(Boolean)
            .map(member => member.paxName);

        selectedSummary.textContent = [
            qNames.length ? `Q: ${qNames.join(", ")}` : "Q: None selected",
            attendeeNames.length ? `PAX: ${attendeeNames.join(", ")}` : "PAX: None selected",
        ].join("\n");
    }

    function renderMemberResults() {
        memberResults.textContent = "";

        const term = searchInput.value.trim().toLowerCase();

        const members = [...state.members]
            .filter(member => member.status !== "inactive")
            .filter(member => {
                if (!term) return true;

                return (
                    (member.paxName || "").toLowerCase().includes(term) ||
                    (member.realName || "").toLowerCase().includes(term)
                );
            })
            .sort((a, b) => a.paxName.localeCompare(b.paxName))
            .slice(0, 40);

        members.forEach(member => {
            const row = document.createElement("div");
            row.classList.add("selected-summary-row");

            const label = document.createElement("span");
            label.textContent = member.paxName;

            const actions = document.createElement("div");

            const qButton = document.createElement("button");
            qButton.textContent = selectedQIds.has(member.id) ? "Q ✓" : "Q";

            qButton.addEventListener("click", () => {
                if (selectedQIds.has(member.id)) {
                    selectedQIds.delete(member.id);
                } else {
                    selectedQIds.add(member.id);
                    selectedAttendeeIds.add(member.id);
                    searchInput.value = "";
                }
            
                renderSelectedSummary();
                renderMemberResults();
            });

            const paxButton = document.createElement("button");
            paxButton.textContent = selectedAttendeeIds.has(member.id) ? "PAX ✓" : "PAX";

            paxButton.addEventListener("click", () => {
                if (selectedAttendeeIds.has(member.id)) {
                    selectedAttendeeIds.delete(member.id);
                    selectedQIds.delete(member.id);
                } else {
                    selectedAttendeeIds.add(member.id);
                    searchInput.value = "";
                }
            
                renderSelectedSummary();
                renderMemberResults();
            });

            actions.append(qButton, paxButton);
            row.append(label, actions);
            memberResults.appendChild(row);
        });
    }

    searchInput.addEventListener("input", renderMemberResults);

    const buttonRow = document.createElement("div");
    buttonRow.classList.add("button-row");

    const cancelButton = document.createElement("button");
    cancelButton.classList.add("secondary-button");
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => overlay.remove());

    const createButton = document.createElement("button");
    createButton.textContent = "Create + Link";

    createButton.addEventListener("click", async () => {
        if (!aoSelect.value) {
            alert("Please select an AO.");
            return;
        }

        if (selectedQIds.size === 0) {
            alert("Please select at least one Q.");
            return;
        }

        if (selectedAttendeeIds.size === 0) {
            alert("Please select at least one attendee.");
            return;
        }

        createButton.disabled = true;
        createButton.textContent = "Creating...";

        try {
            const session = await createSessionFromBackblast(match, {
                aoName: aoSelect.value,
                qIds: [...selectedQIds],
                attendeeIds: [...selectedAttendeeIds],
            });
            linkedSessionIds.add(session.id);
            linkedBandPostKeys.add(backblast.postKey);

            overlay.remove();
            card.remove();
        } catch (error) {
            console.error("Failed to create session from backblast:", error);
            alert("Failed to create session from backblast.");
            createButton.disabled = false;
            createButton.textContent = "Create + Link";
        }
    });

    buttonRow.append(cancelButton, createButton);

    renderSelectedSummary();
    renderMemberResults();

    modal.append(
        heading,
        meta,
        backblastHeading,
        backblastText,
        aoLabel,
        aoSelect,
        searchInput,
        selectedSummary,
        memberResults,
        buttonRow
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

async function createSessionFromBackblast(
    match,
    { aoName = null, qIds = [], attendeeIds = [] } = {}
) {
    const backblast = match.backblast || {};
    const activeRegionId = state.activeRegionId || state.currentRegionId;

    if (!activeRegionId) {
        throw new Error("No active region id.");
    }

    if (!backblast.postKey) {
        throw new Error("Missing backblast post key.");
    }

    if (!backblast.date) {
        throw new Error("Missing backblast date.");
    }

    const selectedAoName = aoName || backblast.aoName;

    if (!selectedAoName) {
        throw new Error("Missing selected AO.");
    }

    const session = {
        id: crypto.randomUUID(),
        date: backblast.date,
        aoName: selectedAoName,
        qIds,
        attendeeIds: [...new Set([...attendeeIds, ...qIds])],
        fngs: [],
        notes: "Created from historical Band backblast review.",
        attendanceReviewStatus: "reviewed",
        attendanceReviewNotes: "Session created manually from backblast review.",
        backblastText: backblast.cleanedContent || backblast.rawContent || "",
        startTime: findDefaultStartTimeForAo(selectedAoName),
        createdByUserId: state.currentUserId || null,
        createdAt: Date.now(),
    };

    const savedSession = await insertSessionFromBackblastReview(activeRegionId, session);

    const normalizedSavedSession = {
        ...session,
        id: savedSession.id,
        aoName: savedSession.ao_name || session.aoName,
        startTime: savedSession.start_time || session.startTime,
    };

    await linkBackblastToSession({
        match,
        candidate: { session: normalizedSavedSession },
        session: normalizedSavedSession,
    });

    state.sessions.push(normalizedSavedSession);

    return normalizedSavedSession;
}

function normalizeName(value = "") {
    return String(value)
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

function findMemberIdsByPaxNames(names = []) {
    const normalizedNames = new Set(names.map(normalizeName).filter(Boolean));

    return state.members
        .filter(member => normalizedNames.has(normalizeName(member.paxName || member.pax_name)))
        .map(member => member.id);
}

function findDefaultStartTimeForAo(aoName) {
    const ao = state.aos.find(ao => ao.name === aoName);

    return ao?.time || null;
}

async function linkBackblastToSession({ match, candidate, session }) {
    const backblast = match.backblast || {};

    if (!backblast.postKey || !session.id) {
        throw new Error("Missing backblast post key or session id.");
    }

    await insertSessionBackblastLink({
        session_id: session.id,
        band_post_key: backblast.postKey,

        link_method: `manual_${match.method || "review"}`,
        confidence_score: 1,

        backblast_date: backblast.date || null,
        backblast_ao_name: backblast.aoName || null,
        backblast_q_names: backblast.qNames || [],
        author_name: backblast.authorName || null,

        raw_content: backblast.rawContent || null,
        cleaned_content: backblast.cleanedContent || null,

        parsed_backblast: backblast,
    });

    await insertBackblastReviewDecision({
        region_id: state.activeRegionId || state.currentRegionId,
        band_post_key: backblast.postKey,
        session_id: session.id,
        decision_type: "linked",
        decided_by_user_id: state.currentUserId || null,
        notes: `Manual link from backblast review. Candidate method: ${match.method || "unknown"}`,
    });
}

