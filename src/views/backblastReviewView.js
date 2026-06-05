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
        const [report, existingLinks, reviewDecisions] = await Promise.all([
            loadBackblastReviewReport(),
            loadSessionBackblastLinks(),
            loadBackblastReviewDecisions(),
        ]);

        const linkedSessionIds = new Set(
            existingLinks.map(link => link.session_id || link.sessionId)
        );

        const linkedBandPostKeys = new Set(
            existingLinks.map(link => link.band_post_key || link.bandPostKey)
        );

        const ignoredBandPostKeys = new Set(
            reviewDecisions
                .filter(decision => decision.decision_type === "ignored")
                .map(decision => decision.band_post_key || decision.bandPostKey)
        );
        
        content.textContent = "";
        content.appendChild(createReviewSummary(report));
        content.appendChild(createAmbiguousReviewSection(
            report.ambiguousMatches || [],
            linkedSessionIds,
            linkedBandPostKeys,
            ignoredBandPostKeys
        ));
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
        finder.appendChild(createSessionFinder(match, linkedSessionIds, linkedBandPostKeys, card));
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

    finder.append(findButton, skipButton);

    card.append(title, meta, preview, candidates, finder);
    return card;
}

function createSessionFinder(match, linkedSessionIds,linkedBandPostKeys, card) {
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

    aoSelect.value = backblast.aoName || "";

    const searchButton = document.createElement("button");
    searchButton.textContent = "Search Open Sessions";

    const results = document.createElement("div");
    results.classList.add("section");

    searchButton.addEventListener("click", async () => {
        results.textContent = "";
    
        const matches = await searchOpenSessionsForBackblastReview({
            regionId: state.activeRegionId || state.currentRegionId,
            date: dateInput.value,
            aoName: aoSelect.value,
            linkedSessionIds: [...linkedSessionIds],
        });
    
        console.log("Review search results:", matches.length, matches);
    
        const openMatches = matches.filter(session =>
            !linkedSessionIds.has(session.id) &&
            !session.backblast_text &&
            !session.historical_backblast_text
        );

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
    });

    wrapper.append(dateInput, aoSelect, searchButton, results);
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