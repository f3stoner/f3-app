import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { generateBackblast } from "../modules/backblast.js";
import { createGlobalNav } from "../components/globalNav.js";
import { createPlannedWorkout } from "../modules/plannedWorkouts.js";
import { addMember, deleteSession, updateSession } from "../services/appData.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { getWorkoutFieldLabel } from "../utils/workoutLabels.js";
import { logActionFailure, logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { getBackblastLinkBySessionId } from "../services/cloudData.js";
import { getAffectedMemberIdsFromSession } from "../services/cloudData.js";
import {
    invalidateMemberStatsCache,
    invalidateRecentMemberActivityCache,
} from "../utils/memberStatsCache.js";
import { hasPermission, PERMISSIONS, canManageSession, canManageAoMembers } from "../utils/permissions.js";
import { getRegularPaxIds, getSessionDisplayCounts } from "../utils/sessionAttendance.js";
import { loadSessionVisitors } from "../services/sessionVisitorData.js";
import { getSessionAnnouncementText } from "../utils/announcements.js";
import { savePlannerDraft, createNewPlannerDraft } from "../services/plannerDraftRepository.js";
import { normalizeThangSections } from "../utils/thangs.js";
import {
    getMemberById,
} from "../utils/memberLookup.js";

export function renderSessionDetail() {
    const app = document.getElementById("app");

    app.className =
        "view-sessionDetail";

    app.textContent = "";
        cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const session = state.sessions.find(s => s.id === state.selectedSessionId);

    if (session && !Array.isArray(session.visitors)) {
        session.visitors = [];
        loadSessionVisitors(session.id)
            .then(visitors => {
                session.visitors = visitors || [];
                renderApp();
            })
            .catch(error => {
                console.error("Failed to load session visitors:", error);
            });
    }

    const canManageSessions = hasPermission(PERMISSIONS.MANAGE_SESSIONS);

    const canEditSession =
        session &&
        canManageSession(session);

        if (!session) {
            app.append(header);
        
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No Session Found";
        
            app.append(empty);
            return;
        
     } else {
    const formattedDate = formatDate(session.date);
    const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

    const qNames =
        effectiveQIds
            .map(qId =>
                getMemberById(qId)
            )
            .filter(Boolean)
            .map(member =>
                member.paxName ||
                member.realName ||
                "Unknown"
            );

    const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";

    const paxNamesArray =
        getRegularPaxIds(session)
            .map(id => {
                const member =
                    getMemberById(id);

                return (
                    member?.paxName ||
                    member?.realName ||
                    "Unknown"
                );
            });
    
    const paxNames = paxNamesArray.length > 0 
        ? paxNamesArray.join(", ") 
        : "-";

    const {
        totalAttendance,
        regularPaxCount,
        fngCount,
        visitorCount,
    } = getSessionDisplayCounts(session);

    const hasStructuredWorkout = Boolean(session.workout);
    const notesText = session.notes ? session.notes : "-";
    const shouldShowNotesSection = 
        hasStructuredWorkout && Boolean(session.notes && session.notes.trim());

    const hero =
        document.createElement("section");
    
    hero.classList.add(
        "session-detail-hero"
    );
    
    const heroTitle =
        document.createElement("h1");
    
    heroTitle.classList.add(
        "session-detail-hero-title"
    );
    
    heroTitle.textContent =
        "Session";
    
    const heroAo =
        document.createElement("div");
    
    heroAo.classList.add(
        "session-detail-ao"
    );
    
    heroAo.textContent =
        session.aoName ||
        "Unknown AO";
    
    const heroDate =
        document.createElement("div");
    
    heroDate.classList.add(
        "session-detail-date-line"
    );
    
    heroDate.textContent =
        `${formattedDate} • ` +
        `${totalAttendance} Attended`;
    
    const metaGrid =
        document.createElement("div");
    
    metaGrid.classList.add(
        "session-detail-meta-grid"
    );
    
    function createMetaItem(
        labelText,
        valueText,
        subvalueText = ""
    ) {
        const item =
            document.createElement("div");
    
        item.classList.add(
            "session-detail-meta-item"
        );
    
        const label =
            document.createElement("div");
    
        label.classList.add(
            "session-detail-meta-label"
        );
    
        label.textContent =
            labelText;
    
        const value =
            document.createElement("div");
    
        value.classList.add(
            "session-detail-meta-value"
        );
    
        value.textContent =
            valueText || "—";
    
        item.append(
            label,
            value
        );
    
        if (subvalueText) {
            const subvalue =
                document.createElement("div");
    
            subvalue.classList.add(
                "session-detail-meta-subvalue"
            );
    
            subvalue.textContent =
                subvalueText;
    
            item.appendChild(subvalue);
        }
    
        return item;
    }
    
    metaGrid.appendChild(
        createMetaItem(
            "Q",
            qLabel
        )
    );
    
    const sessionSite =
        state.sites?.find(
            site =>
                site.id === session.siteId
        ) || null;

    const siteName =
        sessionSite?.name ||
        session.siteName ||
        session.site?.name ||
        session.location ||
        "Site not recorded";
    
    metaGrid.appendChild(
        createMetaItem(
            "Site",
            siteName
        )
    );
    
    if (session.weatherSnapshot) {
        const weather =
            session.weatherSnapshot;
    
        const weatherValue =
            `${weather.temp}° • ` +
            `${weather.condition}`;
    
        const weatherDetails = [
            typeof weather.precipChance ===
            "number"
                ? `${weather.precipChance}% rain`
                : null,
            typeof weather.windMph ===
            "number"
                ? `${weather.windMph} mph wind`
                : null,
        ]
            .filter(Boolean)
            .join(" • ");
    
        metaGrid.appendChild(
            createMetaItem(
                "Conditions",
                weatherValue,
                weatherDetails
            )
        );
    } else {
        metaGrid.appendChild(
            createMetaItem(
                "Conditions",
                "Not recorded"
            )
        );
    }
    
    hero.append(
        heroTitle,
        heroAo,
        heroDate,
        metaGrid
    );

    function createDetailSection (labelText, valueText) {
        const section = document.createElement("div");
        section.classList.add("section");

        const label = document.createElement("div");
        label.textContent = labelText;
        label.classList.add("detail-label", "session-detail-label");

        const value = document.createElement("div");
        value.textContent = valueText;
        value.classList.add("detail-value", "session-detail-value");

        section.append(label, value);

        return section;
    }

    function createFngSection() {
        const fngs =
            Array.isArray(session.fngs)
                ? session.fngs
                : [];
    
        const panel =
            document.createElement("section");
    
        panel.classList.add(
            "session-detail-panel",
            "session-attendance-detail-panel"
        );
    
        const header =
            document.createElement("div");
    
        header.classList.add(
            "session-attendance-detail-header"
        );
    
        const headerIdentity =
            document.createElement("div");
    
        const label =
            document.createElement("div");
    
        label.classList.add(
            "session-detail-panel-label"
        );
    
        label.textContent =
            "FNGs";
    
        const title =
            document.createElement("div");
    
        title.classList.add(
            "session-detail-panel-title"
        );
    
        title.textContent =
            `${fngs.length} Recorded`;
    
        headerIdentity.append(
            label,
            title
        );
    
        const count =
            document.createElement("div");
    
        count.classList.add(
            "session-detail-count"
        );
    
        count.textContent =
            String(fngs.length);
    
        header.append(
            headerIdentity,
            count
        );
    
        const list =
            document.createElement("div");
    
        list.classList.add(
            "session-attendance-detail-list"
        );
    
        fngs.forEach(fng => {
            const row =
                document.createElement("div");
    
            row.classList.add(
                "session-attendance-detail-row"
            );
    
            const identity =
                document.createElement("div");
    
            identity.classList.add(
                "session-attendance-detail-identity"
            );
    
            const displayName =
                fng.paxName &&
                fng.realName &&
                fng.paxName !== fng.realName
                    ? `${fng.paxName} (${fng.realName})`
                    : (
                        fng.paxName ||
                        fng.realName ||
                        "Unknown FNG"
                    );
    
            const name =
                document.createElement("div");
    
            name.classList.add(
                "session-attendance-detail-name"
            );
    
            name.textContent =
                displayName;
    
            identity.appendChild(name);
    
            const inviterIds = [
                ...(
                    Array.isArray(fng.inviterIds)
                        ? fng.inviterIds
                        : []
                ),
                fng.invitedById,
                fng.invited_by_id,
            ].filter(Boolean);
    
            const uniqueInviterIds =
                [...new Set(inviterIds)];
    
            const inviterNames =
                uniqueInviterIds
                    .map(inviterId =>
                        getMemberById(inviterId)
                    )
                    .filter(Boolean)
                    .map(inviter =>
                        inviter.paxName ||
                        inviter.displayName ||
                        inviter.realName ||
                        "Unknown PAX"
                    );
    
            if (inviterNames.length > 0) {
                const context =
                    document.createElement("div");
    
                context.classList.add(
                    "session-attendance-detail-context"
                );
    
                context.textContent =
                    `Invited by ${inviterNames.join(", ")}`;
    
                identity.appendChild(context);
            }
    
            const existingMember =
                fng.memberId
                    ? getMemberById(fng.memberId)
                    : null;
    
            const alreadyOnRoster =
                Boolean(existingMember);
    
            const addButton =
                document.createElement("button");
    
            addButton.type = "button";
    
            addButton.classList.add(
                "session-attendance-roster-button"
            );
    
            addButton.textContent =
                alreadyOnRoster
                    ? "On Roster"
                    : "Add to Roster";
    
            addButton.disabled =
                alreadyOnRoster;
    
            if (alreadyOnRoster) {
                addButton.classList.add(
                    "is-complete"
                );
            }
    
            addButton.addEventListener(
                "click",
                async () => {
                    if (addButton.disabled) {
                        return;
                    }
    
                    addButton.disabled = true;
                    addButton.textContent =
                        "Adding…";
    
                    const cleanInviterIds =
                        [...new Set(inviterIds)];
    
                    const newMember = {
                        id: crypto.randomUUID(),
                        paxName:
                            fng.paxName ||
                            fng.realName,
                        realName:
                            fng.realName || "",
                        homeAo:
                            session.aoName,
                        inviterIds:
                            cleanInviterIds,
                        invitedById:
                            cleanInviterIds[0] ||
                            null,
                        firstPostDate:
                            session.date,
                        status:
                            "active",
                    };
    
                    try {
                        const savedMember =
                            await addMember(
                                newMember
                            );
    
                        const updatedFngs =
                            fngs.map(existingFng => {
                                const isTargetFng =
                                    existingFng === fng ||
                                    (
                                        existingFng.realName ===
                                            fng.realName &&
                                        existingFng.paxName ===
                                            fng.paxName
                                    );
    
                                if (!isTargetFng) {
                                    return existingFng;
                                }
    
                                return {
                                    ...existingFng,
                                    memberId:
                                        savedMember.id,
                                    inviterIds:
                                        savedMember.inviterIds ||
                                        cleanInviterIds,
                                    invitedById:
                                        savedMember.invitedById ||
                                        cleanInviterIds[0] ||
                                        null,
                                };
                            });
    
                        const updatedAttendeeIds = [
                            ...new Set([
                                ...(
                                    session.attendeeIds ||
                                    []
                                ),
                                savedMember.id,
                            ]),
                        ];
    
                        await updateSession(
                            session.id,
                            {
                                ...session,
                                attendeeIds:
                                    updatedAttendeeIds,
                                fngs:
                                    updatedFngs,
                            }
                        );
    
                        session.attendeeIds =
                            updatedAttendeeIds;
    
                        session.fngs =
                            updatedFngs;
    
                        addButton.textContent =
                            "On Roster";
    
                        addButton.classList.add(
                            "is-complete"
                        );
    
                        showToast(
                            "FNG added to roster.",
                            "success"
                        );
    
                        renderApp();
                    } catch (error) {
                        console.error(
                            "Failed to add member:",
                            error
                        );
    
                        addButton.disabled =
                            false;
    
                        addButton.textContent =
                            "Add to Roster";
    
                        showToast(
                            "Failed to add member to roster.",
                            "error"
                        );
                    }
                }
            );
    
            row.append(
                identity,
                addButton
            );
    
            list.appendChild(row);
        });
    
        panel.append(
            header,
            list
        );
    
        return panel;
    }

    function createVisitorSection() {
        const visitors =
            Array.isArray(session.visitors)
                ? session.visitors
                : [];
    
        const panel =
            document.createElement("section");
    
        panel.classList.add(
            "session-detail-panel",
            "session-attendance-detail-panel"
        );
    
        const header =
            document.createElement("div");
    
        header.classList.add(
            "session-attendance-detail-header"
        );
    
        const headerIdentity =
            document.createElement("div");
    
        const label =
            document.createElement("div");
    
        label.classList.add(
            "session-detail-panel-label"
        );
    
        label.textContent =
            "Visiting PAX";
    
        const title =
            document.createElement("div");
    
        title.classList.add(
            "session-detail-panel-title"
        );
    
        title.textContent =
            `${visitors.length} Recorded`;
    
        headerIdentity.append(
            label,
            title
        );
    
        const count =
            document.createElement("div");
    
        count.classList.add(
            "session-detail-count"
        );
    
        count.textContent =
            String(visitors.length);
    
        header.append(
            headerIdentity,
            count
        );
    
        const list =
            document.createElement("div");
    
        list.classList.add(
            "session-attendance-detail-list"
        );
    
        visitors.forEach(visitor => {
            const row =
                document.createElement("div");
    
            row.classList.add(
                "session-attendance-detail-row"
            );
    
            const identity =
                document.createElement("div");
    
            identity.classList.add(
                "session-attendance-detail-identity"
            );
    
            const name =
                document.createElement("div");
    
            name.classList.add(
                "session-attendance-detail-name"
            );
    
            name.textContent =
                visitor.f3Name ||
                visitor.paxName ||
                visitor.name ||
                "Unknown Visitor";
    
            identity.appendChild(name);
    
            const homeRegion =
                visitor.homeRegion ||
                visitor.home_region ||
                visitor.regionName ||
                visitor.region_name ||
                "";
    
            if (homeRegion) {
                const context =
                    document.createElement("div");
    
                context.classList.add(
                    "session-attendance-detail-context"
                );
    
                context.textContent =
                    `Home region: ${homeRegion}`;
    
                identity.appendChild(context);
            }
    
            const badge =
                document.createElement("span");
    
            badge.classList.add(
                "session-attendance-detail-badge"
            );
    
            badge.textContent =
                "Visitor";
    
            row.append(
                identity,
                badge
            );
    
            list.appendChild(row);
        });
    
        panel.append(
            header,
            list
        );
    
        return panel;
    }

    function formatMatchMethod(method) {
        switch (method) {
            case "date_ao_q":
                return "Date + AO + Q";
            case "nearby_date_ao_q":
                return "Nearby Date + AO + Q";
            case "date_ao_single_session":
                return "Date + AO";
            case "nearby_date_ao_single_session":
                return "Nearby Date + AO";
            default:
                return method || "Unknown";
        }
    }
    
    function getConfidenceLabel(score) {
        if (score >= 0.9) return "High";
        if (score >= 0.75) return "Medium";
        return "Low";
    }

    function createHistoricalBackblastSection(linkedBackblast) {
        const section = document.createElement("div");
        section.classList.add("section", "historical-backblast-card");
    
        const label = document.createElement("div");
        label.textContent = "Historical Band Backblast";
        label.classList.add("detail-label", "session-detail-label");
    
        const meta = document.createElement("div");
        meta.classList.add("stats-line");
        const methodLabel = formatMatchMethod(linkedBackblast.link_method);
        const confidenceLabel = getConfidenceLabel(Number(linkedBackblast.confidence_score));
        
        meta.textContent = `Imported from Band · Matched by ${methodLabel} · ${confidenceLabel} confidence`;    
        
        const details = document.createElement("details");
    
        const summary = document.createElement("summary");
        summary.textContent = "View imported backblast";
    
        const content = document.createElement("pre");
        content.classList.add("historical-backblast-text");
        content.textContent =
            linkedBackblast.cleaned_content ||
            linkedBackblast.raw_content ||
            "";
    
        details.append(summary, content);
        section.append(label, meta, details);
    
        return section;
    }

    function cleanAnnouncementText(text = "") {
        return String(text)
            .replace(/^announcements\s*:?\s*/i, "")
            .trim();
    }

    function createWorkoutSection() {
        const panel =
            document.createElement("section");
    
        panel.classList.add(
            "session-detail-panel",
            "session-workout-panel"
        );
    
        const workout =
            session.workout;
    
        const workoutTitle =
            workout?.title ||
            "Workout";
    
        const header =
            document.createElement("div");
    
        header.classList.add(
            "session-workout-header"
        );
    
        const identity =
            document.createElement("div");
    
        const label =
            document.createElement("div");
    
        label.classList.add(
            "session-detail-panel-label"
        );
    
        label.textContent =
            "Workout";
    
        const title =
            document.createElement("div");
    
        title.classList.add(
            "session-workout-title"
        );
    
        title.textContent =
            workoutTitle;
    
        identity.append(
            label,
            title
        );
    
        const toggle =
            document.createElement("button");
    
        toggle.type = "button";
    
        toggle.classList.add(
            "session-workout-toggle"
        );
    
        toggle.textContent =
            "Collapse ↑";
    
        toggle.addEventListener(
            "click",
            () => {
                const collapsed =
                    panel.classList.toggle(
                        "is-collapsed"
                    );
    
                toggle.textContent =
                    collapsed
                        ? "Expand ↓"
                        : "Collapse ↑";
    
                toggle.setAttribute(
                    "aria-expanded",
                    String(!collapsed)
                );
            }
        );
    
        toggle.setAttribute(
            "aria-expanded",
            "true"
        );
    
        header.append(
            identity,
            toggle
        );
    
        const content =
            document.createElement("div");
    
        content.classList.add(
            "session-workout-content"
        );
    
        function appendWorkoutBlock(
            headingText,
            contentText
        ) {
            const cleanText =
                String(
                    contentText || ""
                ).trim();
    
            if (!cleanText) return;
    
            const block =
                document.createElement("section");
    
            block.classList.add(
                "session-workout-block"
            );
    
            const blockHeading =
                document.createElement("div");
    
            blockHeading.classList.add(
                "session-workout-block-heading"
            );
    
            blockHeading.textContent =
                headingText;
    
            const blockContent =
                document.createElement("div");
    
            blockContent.classList.add(
                "session-workout-block-content"
            );
    
            blockContent.textContent =
                cleanText;
    
            block.append(
                blockHeading,
                blockContent
            );
    
            content.appendChild(block);
        }
    
        if (!workout) {
            appendWorkoutBlock(
                "Workout",
                session.notes ||
                "No workout logged"
            );
        } else {
            appendWorkoutBlock(
                getWorkoutFieldLabel(
                    state,
                    "warmorama"
                ),
                workout.warmorama
            );
    
            const thangSections =
                normalizeThangSections(
                    workout
                );
    
            thangSections.forEach(
                (
                    thangSection,
                    index
                ) => {
                    appendWorkoutBlock(
                        thangSection.title ||
                        `Thang ${index + 1}`,
                        thangSection.content
                    );
                }
            );
    
            appendWorkoutBlock(
                getWorkoutFieldLabel(
                    state,
                    "finisher"
                ),
                workout.finisher
            );
    
            appendWorkoutBlock(
                getWorkoutFieldLabel(
                    state,
                    "notes"
                ),
                workout.notes
            );
    
            const thirdFText =
                String(
                    workout.thirdFText || ""
                )
                    .replace(
                        /^THIRD F\s*:?\s*/i,
                        ""
                    )
                    .trim();
    
            appendWorkoutBlock(
                "Third F",
                thirdFText
            );
    
            const announcementText =
                cleanAnnouncementText(
                    getSessionAnnouncementText(
                        session
                    )
                );
    
            appendWorkoutBlock(
                "Announcements",
                announcementText
            );
    
            if (
                content.children.length === 0
            ) {
                appendWorkoutBlock(
                    "Workout",
                    "No workout details logged"
                );
            }
        }
    
        panel.append(
            header,
            content
        );
    
        return panel;
    }

    function createAttendancePanel() {
        const panel =
            document.createElement("section");

        panel.classList.add(
            "session-detail-panel",
            "session-attendance-panel"
        );

        const heading =
            document.createElement("div");

        heading.classList.add(
            "session-detail-panel-heading"
        );

        const headingText =
            document.createElement("div");

        const label =
            document.createElement("div");

        label.classList.add(
            "session-detail-panel-label"
        );

        label.textContent =
            "Attendance";

        const title =
            document.createElement("div");

        title.classList.add(
            "session-detail-panel-title"
        );

        title.textContent =
            `${totalAttendance} Attended`;

        headingText.append(
            label,
            title
        );

        const count =
            document.createElement("div");

        count.classList.add(
            "session-detail-count"
        );

        count.textContent =
            String(regularPaxCount);

        heading.append(
            headingText,
            count
        );

        const chips =
            document.createElement("div");

        chips.classList.add(
            "session-attendance-chips"
        );

        if (paxNamesArray.length === 0) {
            const empty =
                document.createElement("div");

            empty.classList.add(
                "session-attendance-empty"
            );

            empty.textContent =
                "No regular PAX recorded";

            chips.appendChild(empty);
        } else {
            paxNamesArray.forEach(name => {
                const chip =
                    document.createElement("span");

                chip.classList.add(
                    "session-attendance-chip"
                );

                chip.textContent = name;

                chips.appendChild(chip);
            });
        }

        const secondary =
            document.createElement("div");

        secondary.classList.add(
            "session-attendance-secondary"
        );

        function createSecondaryMetric(
            labelText,
            countValue,
            emptyText
        ) {
            const section =
                document.createElement("div");

            section.classList.add(
                "session-attendance-secondary-section"
            );

            const metricLabel =
                document.createElement("div");

            metricLabel.classList.add(
                "session-attendance-secondary-label"
            );

            metricLabel.textContent =
                labelText;

            const metricCount =
                document.createElement("div");

            metricCount.classList.add(
                "session-attendance-secondary-count"
            );

            metricCount.textContent =
                String(countValue);

            const metricCopy =
                document.createElement("div");

            metricCopy.classList.add(
                "session-attendance-secondary-copy"
            );

            metricCopy.textContent =
                countValue === 0
                    ? emptyText
                    : `${countValue} recorded`;

            section.append(
                metricLabel,
                metricCount,
                metricCopy
            );

            return section;
        }

        secondary.append(
            createSecondaryMetric(
                "Visitors",
                visitorCount,
                "No visiting PAX"
            ),
            createSecondaryMetric(
                "FNGs",
                fngCount,
                "No FNGs"
            )
        );

        panel.append(
            heading,
            chips,
            secondary
        );

        return panel;
    }

    const attendancePanel =
        createAttendancePanel();

    const fngSection = createFngSection();
    const visitorSection = createVisitorSection();

    const shouldShowVisitors =
        visitorCount > 0;

    const shouldShowFngs =
        fngCount > 0;

    const workoutSection = createWorkoutSection();
    workoutSection.classList.add("session-detail-workout-section");
    const notesSection = createDetailSection("Notes", notesText);

    const backblastButton = document.createElement("button");
    backblastButton.textContent = "Backblast";
    backblastButton.addEventListener("click", () => {
        const usedSavedBackblast = Boolean(session.backblastText);

        state.draftBackblastText =
            session.backblastText ||
            generateBackblast(session, state.members);

        state.draftBackblastMediaFiles = [];
        state.hasAddedBackblastWeather = false;
        navigateTo("backblast");

        try {
            logAppEvent({
                type: APP_EVENTS.BACKBLAST_GENERATED,
                metadata: {
                    sessionId: session.id,
                    sessionDate: session.date || null,
                    aoName: session.aoName || null,
                    paxCount: totalAttendance,
                    fngCount: session.fngs?.length || 0,
                    qCount: session.qIds?.length || 0,
                    sourcePlannedWorkoutId: session.sourcePlannedWorkoutId || null,
                    hasWorkout: Boolean(session.workout),
                    usedSavedBackblast,
                },
            });
        } catch (error) {
            console.error("Failed to log backblast generated:", error);
        }
    })

    const copyToPlanButton = document.createElement("button");
    copyToPlanButton.textContent = "Copy to Plan";

    copyToPlanButton.addEventListener("click", () => {
        const newWorkout = createPlannedWorkout(getTodayDate(), {
            aoId: session.aoId || null,
            aoName: session.aoName || "",
        });

        if (session.workout) {
            const copiedThangSections = normalizeThangSections(
                session.workout
            ).map((section, index) => ({
                ...section,
                id: crypto.randomUUID(),
                title: section.title || `Thang ${index + 1}`,
                content: section.content || "",
            }));
        
            newWorkout.title = session.workout.title || "";
            newWorkout.introduction =
                session.workout.introduction || "";
            newWorkout.warmorama =
                session.workout.warmorama || "";
            newWorkout.thangSections = copiedThangSections;
            newWorkout.thangs = copiedThangSections
                .map(section => `${section.title}\n${section.content}`)
                .join("\n\n");
            newWorkout.finisher =
                session.workout.finisher || "";
            newWorkout.notes =
                session.workout.notes || "";
        } else {
            newWorkout.notes = session.notes || "";
        }

        newWorkout.announcementMode = "auto";
        newWorkout.announcementText = "";
        newWorkout.announcementLegacyText = "";

        newWorkout.thirdFMode = "auto";
        newWorkout.thirdFText = "";
        newWorkout.thirdFLegacyText = "";

        newWorkout.id = crypto.randomUUID();
        newWorkout.createdByUserId = state.currentUserId;
        newWorkout.sourceSessionId = session.id;
        newWorkout.createdAt = Date.now();
        newWorkout.lastModifiedAt = Date.now();

        savePlannerDraft(
            createNewPlannerDraft(newWorkout)
        );
        
        state.selectedPlannedWorkoutId = null;
        state.pendingPlannerDate = null;
        state.pendingPlannerAoName = null;
        state.plannedWorkoutLaunchMode = "planning";
        
        navigateTo("workoutPlanner");
    });

    const editButton = document.createElement("button");
    editButton.textContent = "Edit Session";
    editButton.addEventListener("click", () => {
        if (!canEditSession) {
            alert("You do not have permission to edit this session.");
            return;
        }

        state.editingSessionId = session.id;
        navigateTo("session");
    });

    const actions =
        document.createElement("div");

    actions.classList.add(
        "session-detail-actions"
    );

    const nav = createGlobalNav();

    backblastButton.classList.add(
        "session-detail-action",
        "session-detail-action-primary"
    );
    
    editButton.classList.add(
        "session-detail-action",
        "session-detail-action-primary"
    );
    
    copyToPlanButton.classList.add(
        "session-detail-action",
        "session-detail-action-secondary"
    );

    if (canEditSession) {
        actions.appendChild(
            editButton
        );
    }
    
    actions.append(
        backblastButton,
        copyToPlanButton
    );

    if (canManageSessions) {
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete Session";
        deleteButton.classList.add(
            "session-detail-action",
            "session-detail-action-danger"
        );

        deleteButton.addEventListener("click", async () => {
            const confirmed = confirm("Are you sure you want to delete this session?");
            if (!confirmed) return;

            try {
                const affectedMemberIds = getAffectedMemberIdsFromSession(session);
            
                await deleteSession(session.id);
            
                state.sessions = state.sessions.filter(
                    existingSession => existingSession.id !== session.id
                );
            
                invalidateMemberStatsCache(affectedMemberIds);
                invalidateRecentMemberActivityCache(affectedMemberIds);
            
                state.selectedSessionId = null;
                navigateTo("dashboard");
            } catch (error) {
                console.error("Failed to delete session:", error);
                showToast("Failed to delete session", "error");
            }
        });

        actions.appendChild(
            deleteButton
        );
    }

    const historicalBackblastMount = document.createElement("div");

    app.append(
        header,
        hero,
        attendancePanel,
        ...(shouldShowVisitors
            ? [visitorSection]
            : []),
        ...(shouldShowFngs
            ? [fngSection]
            : []),
        workoutSection,
        historicalBackblastMount,
        ...(shouldShowNotesSection
            ? [notesSection]
            : []),
        actions,
        nav
    );

    getBackblastLinkBySessionId(session.id)
    .then(linkedBackblast => {
        if (!linkedBackblast) return;

        if (Number(linkedBackblast.confidence_score) < 0.75) {
            return;
        }
        
        historicalBackblastMount.appendChild(
            createHistoricalBackblastSection(linkedBackblast)
        );
    })
    .catch(error => {
        console.error("Failed to load historical backblast:", error);
    });

    }
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}