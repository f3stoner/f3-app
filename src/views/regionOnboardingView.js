import { createAppHeader } from "../components/appHeader.js";
import {
    cleanupMainMenu,
    createMainMenu,
} from "../components/mainMenu.js";
import { state } from "../modules/state.js";
import {
    loadRegionImportProjects,
    loadRegionImportProjectSummary,
    loadRegionImportIdentityReview,
    loadRegionImportStructureReview,
    loadRegionImportSessionReview,
    resolveRegionImportIdentity,
    commitRegionImportIdentities,
    createRegionImportIdentityMergeDraft,
    reviewRegionImportStructure,
    commitRegionImportStructure,
    reviewRegionImportSessions,
    commitRegionImportSessions,
    resolveRegionImportSessionDuplicate,
} from "../services/regionImportData.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";

let projects = [];
let selectedProjectId = null;
let selectedSummary = null;

let isLoadingProjects = false;
let isLoadingSummary = false;
let loadError = null;

let identityReview = [];
let isLoadingIdentityReview = false;
let identityReviewError = null;
let editingIdentityId = null;

let structureReview = null;
let isLoadingStructureReview = false;
let structureReviewError = null;

let sessionReview = null;
let isLoadingSessionReview = false;
let sessionReviewError = null;

export function renderRegionOnboardingView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (state.currentUserRole !== "superadmin") {
        showToast(
            "You do not have access to Region Onboarding.",
            "error"
        );

        navigateTo("dashboard");
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
    });

    const titleRow = document.createElement("div");
    titleRow.classList.add("operations-title-row");

    const titleContent = document.createElement("div");

    const title = document.createElement("h1");
    title.textContent = "Region Onboarding";

    const subtitle = document.createElement("div");
    subtitle.classList.add("detail-label");
    subtitle.textContent =
        "Import, review, provision, and activate new regions.";

    titleContent.append(title, subtitle);

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.textContent = "Refresh";

    refreshButton.addEventListener("click", () => {
        loadProjects({
            force: true,
        });
    });

    titleRow.append(
        titleContent,
        refreshButton
    );

    const content = document.createElement("div");
    content.classList.add(
        "operations-center-content"
    );

    app.append(
        header,
        titleRow,
        content
    );

    renderContent(content);

    if (state.isMainMenuOpen) {
        document.body.appendChild(
            createMainMenu()
        );
    }
}

function renderContent(content) {
    content.textContent = "";

    if (isLoadingProjects) {
        const loading = document.createElement("p");
        loading.className = "stats-line";
        loading.textContent =
            "Loading onboarding projects…";

        content.appendChild(loading);
        return;
    }

    if (loadError) {
        const error = document.createElement("p");
        error.className = "admin-flag-message";
        error.textContent = loadError;

        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Retry";

        retry.addEventListener("click", () => {
            loadProjects({
                force: true,
            });
        });

        content.append(
            error,
            retry
        );

        return;
    }

    if (!projects.length) {
        if (!isLoadingProjects) {
            loadProjects();
        }

        const empty = document.createElement("p");
        empty.className = "stats-line";
        empty.textContent =
            "No onboarding projects.";

        content.appendChild(empty);
        return;
    }

    renderProjectList(content);

    if (selectedProjectId) {
        renderProjectSummary(content);
    }

    if (
        isLoadingIdentityReview ||
        identityReviewError ||
        identityReview.length
    ) {
        renderIdentityReview(content);
    }

    if (
        isLoadingStructureReview ||
        structureReviewError ||
        structureReview
    ) {
        renderStructureReview(content);
    }

    if (
        isLoadingSessionReview ||
        sessionReviewError ||
        sessionReview
    ) {
        renderSessionReview(content);
    }
}

async function reviewStructure() {
    if (!selectedProjectId) return;

    try {
        await reviewRegionImportStructure(selectedProjectId);

        const [nextStructure, nextSummary] = await Promise.all([
            loadRegionImportStructureReview(selectedProjectId),
            loadRegionImportProjectSummary(selectedProjectId),
        ]);

        structureReview = nextStructure;
        selectedSummary = nextSummary;

        showToast("Structure review completed.", "success");
        renderRegionOnboardingView();
    } catch (error) {
        console.error("Failed to review import structure:", error);

        showToast(
            error?.message || "Failed to review structure.",
            "error"
        );
    }
}

async function commitStructure() {
    if (!selectedProjectId) return;

    const confirmed = window.confirm(
        "Commit this reviewed region structure?\n\nThis may create Sites, AOs, and recurring schedules."
    );

    if (!confirmed) return;

    try {
        await commitRegionImportStructure(selectedProjectId);

        const [nextStructure, nextSummary] = await Promise.all([
            loadRegionImportStructureReview(selectedProjectId),
            loadRegionImportProjectSummary(selectedProjectId),
        ]);

        structureReview = nextStructure;
        selectedSummary = nextSummary;

        showToast("Region structure committed.", "success");
        renderRegionOnboardingView();
    } catch (error) {
        console.error("Failed to commit import structure:", error);

        showToast(
            error?.message || "Failed to commit structure.",
            "error"
        );
    }
}

async function openSessionReview() {
    if (!selectedProjectId || isLoadingSessionReview) return;

    isLoadingSessionReview = true;
    sessionReviewError = null;

    renderRegionOnboardingView();

    try {
        sessionReview = await loadRegionImportSessionReview(selectedProjectId);
    } catch (error) {
        console.error("Failed to load session review:", error);

        sessionReviewError =
            error?.message ||
            "Failed to load historical sessions.";
    } finally {
        isLoadingSessionReview = false;
        renderRegionOnboardingView();

        requestAnimationFrame(() => {
            document
                .querySelector(".region-onboarding-session-review")
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
        });
    }
}

async function openStructureReview() {
    if (!selectedProjectId || isLoadingStructureReview) return;

    isLoadingStructureReview = true;
    structureReviewError = null;

    renderRegionOnboardingView();

    try {
        structureReview = await loadRegionImportStructureReview(selectedProjectId);
    } catch (error) {
        console.error("Failed to load structure review:", error);

        structureReviewError =
            error?.message ||
            "Failed to load structure review.";
    } finally {
        isLoadingStructureReview = false;
        renderRegionOnboardingView();

        requestAnimationFrame(() => {
            document
                .querySelector(".region-onboarding-structure-review")
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
        });
    }
}

function renderSessionReview(content) {
    const section = document.createElement("section");
    section.classList.add(
        "operations-section",
        "region-onboarding-session-review"
    );

    const heading = document.createElement("h2");
    heading.textContent = "Historical Session Review";

    section.appendChild(heading);

    if (isLoadingSessionReview) {
        const loading = document.createElement("p");
        loading.className = "stats-line";
        loading.textContent = "Loading historical sessions…";

        section.appendChild(loading);
        content.appendChild(section);
        return;
    }

    if (sessionReviewError) {
        const error = document.createElement("p");
        error.className = "admin-flag-message";
        error.textContent = sessionReviewError;

        section.appendChild(error);
        content.appendChild(section);
        return;
    }

    const sessions = sessionReview?.sessions || [];

    if (!sessions.length) {
        const empty = document.createElement("p");
        empty.className = "stats-line";
        empty.textContent = "No historical sessions staged.";

        section.appendChild(empty);
        content.appendChild(section);
        return;
    }

    sessions.forEach(session => {
        section.appendChild(createSessionReviewCard(session));
    });

    section.appendChild(createSessionReviewActions(sessions));

    content.appendChild(section);
}

function createSessionReviewCard(session) {
    const card = document.createElement("div");
    card.classList.add("operations-list-row");

    const body = document.createElement("div");
    body.classList.add("operations-list-text");

    const title = document.createElement("strong");
    title.textContent =
        `${session.sessionDate} · ` +
        `${formatTime(session.startTime)} · ` +
        `${session.aoSourceKey}`;

    const status = document.createElement("div");
    status.className = "stats-line";
    status.textContent =
        `${formatStatus(session.validationStatus)} · ` +
        `${formatSessionDuplicateStatus(session.duplicateStatus)}`;

    body.append(title, status);

    const participants = session.participants || [];

    if (participants.length) {
        const participantList = document.createElement("div");

        participants.forEach(participant => {
            const row = document.createElement("div");
            row.className = "stats-line";

            const role = formatParticipantRole(
                participant.participantRole
            );

            const resolvedName =
                participant.canonicalPaxName ||
                participant.displayName ||
                "Unknown";

            row.textContent =
                `${role}: ${participant.displayName || "Unknown"} → ` +
                `${resolvedName} · ` +
                `${formatStatus(participant.resolutionStatus)}`;

            participantList.appendChild(row);
        });

        body.appendChild(participantList);
    }

    if (
        session.validationStatus === "reviewed" &&
        session.duplicateStatus === "exact_existing_match"
    ) {
        const actions = document.createElement("div");
        actions.classList.add("button-row");
    
        const useExistingButton = document.createElement("button");
        useExistingButton.type = "button";
        useExistingButton.textContent = "Use Existing Session";
    
        useExistingButton.addEventListener("click", () => {
            resolveSessionDuplicate(session, "use_existing");
        });
    
        const ignoreButton = document.createElement("button");
        ignoreButton.type = "button";
        ignoreButton.classList.add("secondary-button");
        ignoreButton.textContent = "Ignore Imported Session";
    
        ignoreButton.addEventListener("click", () => {
            const confirmed = window.confirm(
                `Ignore imported session "${session.sourceSessionKey}"?\n\nNo production session will be created from this import row.`
            );
    
            if (!confirmed) return;
    
            resolveSessionDuplicate(session, "ignore");
        });
    
        actions.append(useExistingButton, ignoreButton);
        body.appendChild(actions);
    }

    card.appendChild(body);

    return card;
}

async function resolveSessionDuplicate(session, resolutionType) {
    try {
        await resolveRegionImportSessionDuplicate(
            session.id,
            resolutionType
        );

        const [nextSessions, nextSummary] = await Promise.all([
            loadRegionImportSessionReview(selectedProjectId),
            loadRegionImportProjectSummary(selectedProjectId),
        ]);

        sessionReview = nextSessions;
        selectedSummary = nextSummary;

        showToast(
            resolutionType === "use_existing"
                ? "Existing production session linked."
                : "Imported session ignored.",
            "success"
        );

        renderRegionOnboardingView();
    } catch (error) {
        console.error(
            "Failed to resolve imported session duplicate:",
            error
        );

        showToast(
            error?.message ||
            "Failed to resolve session duplicate.",
            "error"
        );
    }
}

function formatSessionDuplicateStatus(status) {
    if (status === "new") return "New Session";
    if (status === "exact_existing_match") return "Existing Session Match";
    if (status === "probable_duplicate") return "Possible Duplicate";
    if (status === "conflicting_existing_session") return "Session Conflict";
    if (status === "unchecked") return "Duplicate Check Pending";

    return formatStatus(status);
}

function formatParticipantRole(role) {
    if (role === "q") return "Q";
    if (role === "coq") return "Co-Q";
    if (role === "attendee") return "Attendee";

    return formatStatus(role);
}

function createSessionReviewActions(sessions) {
    const actions = document.createElement("div");
    actions.classList.add("button-row");

    const hasStaged = sessions.some(
        session => session.validationStatus === "staged"
    );

    const hasReviewed = sessions.some(
        session => session.validationStatus === "reviewed"
    );

    const hasDuplicateReview = sessions.some(session =>
        session.validationStatus !== "ignored" &&
        !session.createdSessionId &&
        [
            "exact_existing_match",
            "probable_duplicate",
            "conflicting_existing_session",
            "unchecked",
        ].includes(session.duplicateStatus)
    );

    if (hasStaged) {
        const reviewButton = document.createElement("button");
        reviewButton.type = "button";
        reviewButton.textContent = "Review Sessions";

        reviewButton.addEventListener("click", () => {
            reviewSessions();
        });

        actions.appendChild(reviewButton);
    }

    if (hasReviewed) {
        const commitButton = document.createElement("button");
        commitButton.type = "button";

        if (hasDuplicateReview) {
            commitButton.disabled = true;
            commitButton.textContent = "Commit Sessions — Duplicate Review Required";
        } else {
            commitButton.textContent = "Commit Sessions";

            commitButton.addEventListener("click", () => {
                commitSessions();
            });
        }

        actions.appendChild(commitButton);
    }

    if (!hasStaged && !hasReviewed) {
        const complete = document.createElement("div");
        complete.className = "stats-line";
        complete.textContent = "Historical sessions are committed.";

        actions.appendChild(complete);
    }

    return actions;
}

async function reviewSessions() {
    if (!selectedProjectId) return;

    try {
        await reviewRegionImportSessions(selectedProjectId);

        const [nextSessions, nextSummary] = await Promise.all([
            loadRegionImportSessionReview(selectedProjectId),
            loadRegionImportProjectSummary(selectedProjectId),
        ]);

        sessionReview = nextSessions;
        selectedSummary = nextSummary;

        showToast("Historical session review completed.", "success");
        renderRegionOnboardingView();
    } catch (error) {
        console.error("Failed to review historical sessions:", error);

        showToast(
            error?.message || "Failed to review historical sessions.",
            "error"
        );
    }
}

async function commitSessions() {
    if (!selectedProjectId) return;

    const confirmed = window.confirm(
        "Commit these reviewed historical sessions?\n\nThis will create production session history."
    );

    if (!confirmed) return;

    try {
        await commitRegionImportSessions(selectedProjectId);

        const [nextSessions, nextSummary] = await Promise.all([
            loadRegionImportSessionReview(selectedProjectId),
            loadRegionImportProjectSummary(selectedProjectId),
        ]);

        sessionReview = nextSessions;
        selectedSummary = nextSummary;

        showToast("Historical sessions committed.", "success");
        renderRegionOnboardingView();
    } catch (error) {
        console.error("Failed to commit historical sessions:", error);

        showToast(
            error?.message || "Failed to commit historical sessions.",
            "error"
        );
    }
}

function renderStructureReview(content) {
    const section = document.createElement("section");
    section.classList.add(
        "operations-section",
        "region-onboarding-structure-review"
    );

    const heading = document.createElement("h2");
    heading.textContent = "Structure Review";

    section.appendChild(heading);

    if (isLoadingStructureReview) {
        const loading = document.createElement("p");
        loading.className = "stats-line";
        loading.textContent = "Loading structure…";

        section.appendChild(loading);
        content.appendChild(section);
        return;
    }

    if (structureReviewError) {
        const error = document.createElement("p");
        error.className = "admin-flag-message";
        error.textContent = structureReviewError;

        section.appendChild(error);
        content.appendChild(section);
        return;
    }

    if (!structureReview) {
        content.appendChild(section);
        return;
    }

    section.appendChild(
        createStructureGroup(
            "Sites",
            structureReview.sites || [],
            item => `${item.name} · ${formatStatus(item.status)}`
        )
    );

    section.appendChild(
        createStructureGroup(
            "AOs",
            structureReview.aos || [],
            item => `${item.name} · ${formatStatus(item.status)}`
        )
    );

    section.appendChild(
        createStructureGroup(
            "Schedules",
            structureReview.schedules || [],
            item =>
                `${item.aoSourceKey} · ${formatWeekday(item.weekday)} · ` +
                `${formatTime(item.startTime)} · ${formatStatus(item.status)}`
        )
    );

    const allItems = [
        ...(structureReview.sites || []),
        ...(structureReview.aos || []),
        ...(structureReview.schedules || []),
    ];
    
    const hasStaged = allItems.some(item => item.status === "staged");
    const hasReviewed = allItems.some(item => item.status === "reviewed");
    const hasCommitted = allItems.some(item => item.status === "committed");
    
    const actions = document.createElement("div");
    actions.classList.add("button-row");
    
    if (hasStaged) {
        const reviewButton = document.createElement("button");
        reviewButton.type = "button";
        reviewButton.textContent = "Review Structure";
    
        reviewButton.addEventListener("click", () => {
            reviewStructure();
        });
    
        actions.appendChild(reviewButton);
    }
    
    if (hasReviewed) {
        const commitButton = document.createElement("button");
        commitButton.type = "button";
        commitButton.textContent = "Commit Structure";
    
        commitButton.addEventListener("click", () => {
            commitStructure();
        });
    
        actions.appendChild(commitButton);
    }
    
    if (hasCommitted && !hasStaged && !hasReviewed) {
        const complete = document.createElement("div");
        complete.className = "stats-line";
        complete.textContent = "Structure is committed.";
    
        actions.appendChild(complete);
    }
    
    section.appendChild(actions);

    content.appendChild(section);
}

function createStructureGroup(titleText, items, getDetail) {
    const group = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = titleText;

    group.appendChild(title);

    if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "stats-line";
        empty.textContent = `No ${titleText.toLowerCase()} staged.`;

        group.appendChild(empty);
        return group;
    }

    items.forEach(item => {
        const row = document.createElement("div");
        row.classList.add("operations-list-row");

        const text = document.createElement("div");
        text.classList.add("operations-list-text");
        text.textContent = getDetail(item);

        row.appendChild(text);
        group.appendChild(row);
    });

    return group;
}

function formatWeekday(weekday) {
    return [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ][Number(weekday)] || "Unknown Day";
}

function formatTime(value) {
    return String(value || "").slice(0, 5);
}

function renderProjectList(content) {
    const section = document.createElement("section");
    section.classList.add("operations-section");

    const heading = document.createElement("h2");
    heading.textContent = "Import Projects";

    section.appendChild(heading);

    projects.forEach(project => {
        const row = document.createElement("button");
        row.type = "button";
        row.classList.add(
            "operations-list-row"
        );

        if (
            project.id ===
            selectedProjectId
        ) {
            row.classList.add("active");
        }

        const text = document.createElement("div");
        text.classList.add(
            "operations-list-text"
        );

        const name = document.createElement("strong");
        name.textContent =
            project.name;

        const detail = document.createElement("div");
        detail.className = "stats-line";
        detail.textContent =
            `${project.regionName} · ${formatStatus(project.status)}`;

        text.append(
            name,
            detail
        );

        row.appendChild(text);

        row.addEventListener("click", () => {
            selectProject(project.id);
        });

        section.appendChild(row);
    });

    content.appendChild(section);
}

function renderProjectSummary(content) {
    const section = document.createElement("section");
    section.classList.add("operations-section");

    const heading = document.createElement("h2");
    heading.textContent = "Project Status";

    section.appendChild(heading);

    if (isLoadingSummary) {
        const loading = document.createElement("p");
        loading.className = "stats-line";
        loading.textContent =
            "Loading project status…";

        section.appendChild(loading);
        content.appendChild(section);
        return;
    }

    if (!selectedSummary) {
        content.appendChild(section);
        return;
    }

    const summary = selectedSummary;

    const identityComplete =
        summary.identities.needsReview === 0;

    const structureComplete =
        summary.structure.sites ===
            summary.structure.sitesCommitted &&
        summary.structure.aos ===
            summary.structure.aosCommitted &&
        summary.structure.schedules ===
            summary.structure.schedulesCommitted;

    const sessionsComplete =
        summary.sessions.staged === 0 &&
        summary.sessions.reviewed === 0 &&
        summary.sessions.duplicateReview === 0 &&
        summary.sessions.participantsUnresolved === 0;

    section.append(
        createStageCard({
            title: "Source Data",
            complete:
                summary.batches.total > 0,
            detail:
                `${summary.batches.total} batches · ${summary.batches.rows} rows`,
        }),

        createStageCard({
            title: "Identity Resolution",
            complete: identityComplete,
            detail:
                `${summary.identities.total} identities · ` +
                `${summary.identities.matchedExisting} existing · ` +
                `${summary.identities.membersCreated} created · ` +
                `${summary.identities.ignored} ignored · ` +
                `${summary.identities.needsReview} need review`,
            actionLabel: "Review",
            onAction: openIdentityReview,
        }),

        createStageCard({
            title: "Region Structure",
            complete: structureComplete,
            detail:
                `${summary.structure.sitesCommitted}/${summary.structure.sites} sites · ` +
                `${summary.structure.aosCommitted}/${summary.structure.aos} AOs · ` +
                `${summary.structure.schedulesCommitted}/${summary.structure.schedules} schedules`,
            actionLabel: "Review",
            onAction: openStructureReview,
        }),

        createStageCard({
            title: "Historical Sessions",
            complete: sessionsComplete,
            detail:
                `${summary.sessions.committed}/${summary.sessions.total} committed · ` +
                `${summary.sessions.duplicateReview} duplicates · ` +
                `${summary.sessions.participantsUnresolved} unresolved participants`,
            actionLabel: "Review",
            onAction: openSessionReview,
        }),

        createStageCard({
            title: "Activation",
            complete:
                Boolean(
                    summary.project.activatedAt
                ),
            detail:
                summary.project.activatedAt
                    ? `Activated ${new Date(
                        summary.project.activatedAt
                    ).toLocaleString()}`
                    : "Region has not been activated.",
        })
    );

    content.appendChild(section);
}

function renderIdentityReview(content) {
    const section = document.createElement("section");
    section.classList.add(
        "operations-section",
        "region-onboarding-identity-review"
    );

    const heading = document.createElement("h2");
    heading.textContent = "Identity Review";

    section.appendChild(heading);

    if (isLoadingIdentityReview) {
        const loading = document.createElement("p");
        loading.className = "stats-line";
        loading.textContent =
            "Loading identities…";

        section.appendChild(loading);
        content.appendChild(section);
        return;
    }

    if (identityReviewError) {
        const error = document.createElement("p");
        error.className = "admin-flag-message";
        error.textContent =
            identityReviewError;

        section.appendChild(error);
        content.appendChild(section);
        return;
    }

    identityReview.forEach(identity => {
        section.appendChild(
            createIdentityReviewCard(identity)
        );
    });

    content.appendChild(section);
}

function createIdentityReviewCard(identity) {
    const card = document.createElement("div");
    card.classList.add(
        "operations-list-row"
    );

    const content = document.createElement("div");
    content.classList.add(
        "operations-list-text"
    );

    const name = document.createElement("strong");
    name.textContent =
        identity.displayName ||
        "Unnamed Identity";

    const source = document.createElement("div");
    source.className = "stats-line";

    source.textContent = [
        identity.sourceRealName,
        identity.sourceEmail,
        identity.sourceHomeRegion,
    ]
        .filter(Boolean)
        .join(" · ") ||
        "No additional source identity data";

    content.append(
        name,
        source
    );

    const resolutionLocked = identity.resolution?.isLocked === true;

    if (
        identity.resolution &&
        (
            editingIdentityId !== identity.id ||
            resolutionLocked
        )
    ) {
        content.appendChild(createResolvedIdentitySummary(identity));
    } else {
        content.appendChild(createIdentityCandidateControls(identity));
    }

    card.appendChild(content);

    return card;
}

function createChangeResolutionButton(identity) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("secondary-button");

    if (identity.resolution?.isLocked) {
        button.disabled = true;
        button.textContent = "Resolution Locked";

        if (identity.resolution.lockReason) {
            button.title = identity.resolution.lockReason;
        }

        return button;
    }

    button.textContent = "Change Resolution";

    button.addEventListener("click", () => {
        editingIdentityId = identity.id;
        renderRegionOnboardingView();
    });

    return button;
}

function createResolvedIdentitySummary(identity) {
    const summary = document.createElement("div");
    summary.className = "stats-line";

    if (
        identity.resolution.type ===
        "match_existing"
    ) {
        const candidate =
            identity.candidates.find(
                item =>
                    item.memberId ===
                    identity.resolution
                        .canonicalMemberId
            );

        summary.textContent =
            candidate
                ? `Matched to ${candidate.paxName} · ${candidate.homeRegion || "Unknown Region"}`
                : "Matched to existing member";
        
        const wrapper = document.createElement("div");
        wrapper.append(summary, createChangeResolutionButton(identity));
        
        return wrapper;
    }

    if (identity.resolution.type === "create_new") {
        summary.textContent =
            identity.resolution.createdMemberId
                ? "New canonical member created"
                : "Approved to create new member";
    
        const wrapper = document.createElement("div");
        wrapper.append(summary, createChangeResolutionButton(identity));
    
        return wrapper;
    }

    if (identity.resolution.type === "create_new_then_merge") {
        const wrapper = document.createElement("div");
    
        const status = document.createElement("div");
        status.className = "stats-line";
    
        if (!identity.resolution.createdMemberId) {
            status.textContent = "Imported identity selected as canonical survivor.";
        
            const continueButton = document.createElement("button");
            continueButton.type = "button";
            continueButton.textContent = "Continue Merge Setup";
        
            continueButton.addEventListener("click", () => {
                continueImportedIdentityMerge(identity);
            });
        
            wrapper.append(
                status,
                continueButton,
                createChangeResolutionButton(identity)
            );

            return wrapper;
        }
    
        if (!identity.resolution.mergeId) {
            status.textContent = "Imported member created · Merge draft not created.";

            wrapper.append(
                status,
                createChangeResolutionButton(identity)
            );

            return wrapper;
        }
    
        status.textContent =
            `Canonical merge required · ${formatStatus(identity.resolution.mergeStatus || "draft")}`;
    
        const reviewButton = document.createElement("button");
        reviewButton.type = "button";
        reviewButton.textContent = "Review Merge";
    
        reviewButton.addEventListener("click", () => {
            navigateTo("memberMergeDetail", {
                mergeId: identity.resolution.mergeId,
            });
        });
    
        wrapper.append(
            status,
            reviewButton,
            createChangeResolutionButton(identity)
        );
        
        return wrapper;
    }

    if (identity.resolution.type === "ignored") {
        summary.textContent = "Ignored";
    
        const wrapper = document.createElement("div");
        wrapper.append(summary, createChangeResolutionButton(identity));
    
        return wrapper;
    }

    summary.textContent =
        formatStatus(
            identity.resolution.type
        );

    return summary;
}

function createIdentityCandidateControls(identity) {
    const wrapper = document.createElement("div");

    if (identity.candidates.length) {
        identity.candidates.forEach(candidate => {
            const row = document.createElement("div");
            row.classList.add("stats-line");

            const description =
                document.createElement("span");

            description.textContent =
                `${candidate.paxName}` +
                `${candidate.realName ? ` · ${candidate.realName}` : ""}` +
                `${candidate.homeRegion ? ` · ${candidate.homeRegion}` : ""}` +
                ` · ${candidate.classification}`;

            const matchButton =
                document.createElement("button");

            matchButton.type = "button";
            matchButton.textContent =
                "Match Existing";

            matchButton.addEventListener(
                "click",
                () => {
                    resolveIdentity(
                        identity,
                        "match_existing",
                        candidate.memberId
                    );
                }
            );

            const useImportedButton = document.createElement("button");
            useImportedButton.type = "button";
            useImportedButton.classList.add("secondary-button");
            useImportedButton.textContent = "Use Imported Identity";

            useImportedButton.addEventListener("click", () => {
                useImportedIdentity(identity, candidate);
            });

            row.append(description, matchButton, useImportedButton);

            wrapper.appendChild(row);
        });
    } else {
        const none = document.createElement("p");
        none.className = "stats-line";
        none.textContent =
            "No existing canonical match found.";

        wrapper.appendChild(none);
    }

    const actions = document.createElement("div");
    actions.className = "button-row";

    const createButton =
        document.createElement("button");

    createButton.type = "button";
    createButton.textContent =
        "Create New";

    createButton.addEventListener(
        "click",
        () => {
            resolveIdentity(
                identity,
                "create_new"
            );
        }
    );

    const ignoreButton = document.createElement("button");
    ignoreButton.type = "button";
    ignoreButton.classList.add("secondary-button");
    ignoreButton.textContent = "Ignore";

    ignoreButton.addEventListener("click", () => {
        const confirmed = window.confirm(
            `Ignore "${identity.displayName}"?\n\nThis identity will not create or match a canonical member.`
        );
    
        if (!confirmed) return;
    
        resolveIdentity(identity, "ignored");
    });

    actions.append(createButton, ignoreButton);

    if (editingIdentityId === identity.id) {
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.classList.add("secondary-button");
        cancelButton.textContent = "Cancel";
    
        cancelButton.addEventListener("click", () => {
            editingIdentityId = null;
            renderRegionOnboardingView();
        });
    
        actions.appendChild(cancelButton);
    }
    
    wrapper.appendChild(actions);
    
    return wrapper;
}

async function openIdentityReview() {
    if (!selectedProjectId || isLoadingIdentityReview) {
        return;
    }

    isLoadingIdentityReview = true;
    identityReviewError = null;

    renderRegionOnboardingView();

    try {
        identityReview =
            await loadRegionImportIdentityReview(
                selectedProjectId
            );
    } catch (error) {
        console.error(
            "Failed to load identity review:",
            error
        );

        identityReviewError =
            error?.message ||
            "Failed to load identity review.";
    } finally {
        isLoadingIdentityReview = false;
        renderRegionOnboardingView();

        requestAnimationFrame(() => {
            document
                .querySelector(
                    ".region-onboarding-identity-review"
                )
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
        });
    }
}

async function resolveIdentity(
    identity,
    resolutionType,
    canonicalMemberId = null
) {
    try {
        await resolveRegionImportIdentity({
            sourceIdentityId:
                identity.id,
            resolutionType,
            canonicalMemberId,
        });

        showToast(
            "Identity resolution saved.",
            "success"
        );

        const [
            nextReview,
            nextSummary,
        ] = await Promise.all([
            loadRegionImportIdentityReview(
                selectedProjectId
            ),
            loadRegionImportProjectSummary(
                selectedProjectId
            ),
        ]);

        identityReview = nextReview;
        selectedSummary = nextSummary;
        editingIdentityId = null;
        
        renderRegionOnboardingView();
    } catch (error) {
        console.error(
            "Failed to resolve import identity:",
            error
        );

        showToast(
            error?.message ||
            "Failed to save identity resolution.",
            "error"
        );
    }
}

async function continueImportedIdentityMerge(identity) {
    try {
        await commitRegionImportIdentities(selectedProjectId);

        const merge = await createRegionImportIdentityMergeDraft(identity.id);

        const [nextReview, nextSummary] = await Promise.all([
            loadRegionImportIdentityReview(selectedProjectId),
            loadRegionImportProjectSummary(selectedProjectId),
        ]);

        identityReview = nextReview;
        selectedSummary = nextSummary;
        editingIdentityId = null;
        
        showToast("Imported member created. Merge review required.", "success");

        renderRegionOnboardingView();

        if (merge?.id) {
            navigateTo("memberMergeDetail", {
                mergeId: merge.id,
            });
        }
    } catch (error) {
        console.error("Failed to continue imported identity merge:", error);

        showToast(
            error?.message || "Failed to continue merge setup.",
            "error"
        );
    }
}

async function useImportedIdentity(identity, candidate) {
    const confirmed = window.confirm(
        [
            `Use imported "${identity.displayName}" as the canonical identity?`,
            "",
            `Existing member: ${candidate.paxName}`,
            candidate.homeRegion ? `Home region: ${candidate.homeRegion}` : "",
            "",
            "The existing member will be queued for member-merge review.",
        ].filter(Boolean).join("\n")
    );

    if (!confirmed) return;

    try {
        await resolveRegionImportIdentity({
            sourceIdentityId: identity.id,
            resolutionType: "create_new_then_merge",
            canonicalMemberId: candidate.memberId,
            notes: "Imported identity selected as canonical survivor.",
        });

        await commitRegionImportIdentities(selectedProjectId);

        const merge = await createRegionImportIdentityMergeDraft(identity.id);

        const [nextReview, nextSummary] = await Promise.all([
            loadRegionImportIdentityReview(selectedProjectId),
            loadRegionImportProjectSummary(selectedProjectId),
        ]);

        identityReview = nextReview;
        selectedSummary = nextSummary;
        editingIdentityId = null;
        
        showToast("Imported identity created. Merge review required.", "success");

        renderRegionOnboardingView();

        if (merge?.id) {
            navigateTo("memberMergeDetail", {
                mergeId: merge.id,
            });
        }
    } catch (error) {
        console.error("Failed to use imported identity:", error);

        showToast(
            error?.message || "Failed to create the imported canonical identity.",
            "error"
        );
    }
}

function createStageCard({
    title,
    complete,
    detail,
    actionLabel = null,
    onAction = null,
}) {
    const row = document.createElement("div");
    row.classList.add("operations-list-row");

    const text = document.createElement("div");
    text.classList.add("operations-list-text");

    const heading = document.createElement("strong");
    heading.textContent = title;

    const detailText = document.createElement("div");
    detailText.className = "stats-line";
    detailText.textContent = detail;

    text.append(
        heading,
        detailText
    );

    const right = document.createElement("div");

    const status = document.createElement("strong");
    status.textContent =
        complete
            ? "Ready"
            : "Needs Work";

    right.appendChild(status);

    if (actionLabel && onAction) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = actionLabel;

        button.addEventListener("click", event => {
            event.stopPropagation();
            onAction();
        });

        right.appendChild(button);
    }

    row.append(
        text,
        right
    );

    return row;
}

function formatStatus(status) {
    return String(status || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, character =>
            character.toUpperCase()
        );
}

async function loadProjects({
    force = false,
} = {}) {
    if (
        isLoadingProjects ||
        (
            projects.length &&
            !force
        )
    ) {
        return;
    }

    isLoadingProjects = true;
    loadError = null;

    renderRegionOnboardingView();

    try {
        projects =
            await loadRegionImportProjects();

        if (
            !selectedProjectId &&
            projects.length
        ) {
            selectedProjectId =
                projects[0].id;
        }

        if (selectedProjectId) {
            selectedSummary =
                await loadRegionImportProjectSummary(
                    selectedProjectId
                );
        }
    } catch (error) {
        console.error(
            "Failed to load Region Onboarding:",
            error
        );

        loadError =
            error?.message ||
            "Failed to load onboarding projects.";
    } finally {
        isLoadingProjects = false;
        renderRegionOnboardingView();
    }
}

async function selectProject(projectId) {
    if (
        !projectId ||
        projectId === selectedProjectId
    ) {
        return;
    }

    selectedProjectId = projectId;
    selectedSummary = null;
    isLoadingSummary = true;

    renderRegionOnboardingView();

    try {
        selectedSummary =
            await loadRegionImportProjectSummary(
                projectId
            );
    } catch (error) {
        console.error(
            "Failed to load onboarding project:",
            error
        );

        showToast(
            "Failed to load onboarding project.",
            "error"
        );
    } finally {
        isLoadingSummary = false;
        renderRegionOnboardingView();
    }
}