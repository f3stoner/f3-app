import { state } from "../modules/state.js";
import { renderApp, saveCurrentOfflineBootSnapshot } from "../index.js";
import { formatShortDate, formatDate, getTodayDate, formatMonthDayYear } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import {
    loadMemberDashboardStats,
    loadMemberSessionByDate,
    loadMemberSessions,
    loadRecentMemberActivity,
    loadQSlotCommitmentSummaries,
    loadQSlotCommitments,
    setQSlotCommitment,
} from "../services/cloudData.js";
import { updateSession } from "../services/appData.js";
import { navigateTo } from "../utils/navigation.js";
import { generatePreblast } from "../modules/generatePreblast.js";
import { showToast } from "../utils/toast.js";
import { unclaimQSlot } from "../services/qSlots.js";
import { createIcon, createWeatherIcon } from "../utils/icons.js";
import { getSiteWeather } from "../services/weather.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import {
    hasPermission,
    managesQSlot,
    PERMISSIONS,
} from "../utils/permissions.js";
import { logAppEvent } from "../services/appEvents.js";
import { createWorkoutEmphasisBadge } from "../components/workoutEmphasisBadge.js";
import { releaseWakeLock } from "../utils/wakelock.js";
import { getSessionDisplayCounts } from "../utils/sessionAttendance.js";
import { getDashboardLeadershipBadge } from "../utils/leadership.js";
import { findWorkoutForQSlot } from "../utils/qSlotMatching.js";
import { createAppHeader } from "../components/appHeader.js";
import { clearPlannerDraft, savePlannerDraft, createNewPlannerDraft, createExistingPlannerDraft } from "../services/plannerDraftRepository.js";
import { switchWorkspace } from "../services/workspaceService.js";
import { resolveSiteForQSlot } from "../utils/siteResolution.js";

function createBlankWorkout({
    date = getTodayDate(),
    aoId = null,
    aoName = "",
    siteId = null,
    qSlotId = null,
} = {}) {
    return {
        id: crypto.randomUUID(),
        date,
        aoId,
        aoName,
        siteId,
        title: "",
        introduction: "",
        warmorama: "",
        thangs: "",
        thangSections: [
            {
                id: crypto.randomUUID(),
                title: "Thang 1",
                content: "",
            },
        ],
        finisher: "",
        notes: "",
        sourceWorkoutId: null,
        sourceSessionId: null,
        sourceQSlotId: qSlotId,
        createdAt: Date.now(),
        lastModifiedAt: null,
        createdByUserId: state.currentUserId,
        isShared: false,
        isFinalized: false,
        timers: [],
    };
}

export function renderDashboard() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (!state.isMainMenuOpen) {
        document.body.classList.remove("menu-open");
    }

    document.querySelectorAll(".main-menu-overlay").forEach(menu => menu.remove());

    async function activateWorkspace(regionId) {
        const isAlreadyCommitted =
            regionId ===
                state.activeRegionId &&
            !state.pendingRegionId;
    
        if (!regionId || isAlreadyCommitted) {
            state.isWorkspaceMenuOpen = false;
            renderApp();
            return;
        }
    
        state.isWorkspaceMenuOpen = false;
    
        try {
            const workspaceResult =
                await switchWorkspace(
                    regionId,
                    {
                        onAccessDenied:
                            deniedRegionId => {
                                state.pendingRegionId =
                                    deniedRegionId;
    
                                state.currentView =
                                    "regionGate";
    
                                renderApp();
                            },
                    }
                );
    
            if (
                workspaceResult !== "loaded"
            ) {
                return;
            }
    
            clearPlannerDraft();
    
            state.selectedPlannedWorkoutId =
                null;
    
            state.draftSession = null;
            state.editingSessionId = null;
            state.selectedSessionId = null;
    
            state.plannedWorkoutLaunchMode =
                null;
    
            state.qSignupAoFilter = null;
    
            state.hasInitializedQSignupFilter =
                false;

            try {
                await saveCurrentOfflineBootSnapshot();
            } catch (error) {
                console.warn(
                    "Workspace switched, but the offline snapshot could not be updated:",
                    error
                );
            }

            renderApp();
        } catch (error) {
            console.error(
                "Failed to switch workspace:",
                error
            );
    
            showToast(
                "Unable to switch regions. Your previous region is still active.",
                "error"
            );
    
            /*
             * Re-render the still-committed workspace so the
             * selector and title cannot remain visually stale.
             */
            if (
                state.currentView ===
                "dashboard"
            ) {
                renderApp();
            }
        }
    }
    
    function createWorkspaceMenu() {
        const menu = document.createElement("div");
        menu.classList.add("workspace-menu");
    
        const label = document.createElement("div");
        label.classList.add(
            "detail-label",
            "workspace-menu-label"
        );
        label.textContent = "My Regions";
    
        menu.appendChild(label);
    
        state.accessibleRegions.forEach(region => {
            const isActive =
                region.id === state.activeRegionId;
    
            const isHome =
                region.id === state.homeRegionId;
    
            const option = document.createElement("button");
            option.type = "button";
            option.classList.add("workspace-menu-option");
    
            if (isActive) {
                option.classList.add("active");
            }
    
            const check = document.createElement("span");
            check.classList.add("workspace-menu-check");
            check.setAttribute("aria-hidden", "true");
            check.textContent = isActive ? "✓" : "";
    
            const name = document.createElement("span");
            name.classList.add("workspace-menu-name");
            name.textContent = region.name;
    
            option.append(check, name);
    
            if (isHome) {
                const homeBadge =
                    document.createElement("span");
    
                homeBadge.classList.add(
                    "workspace-home-badge"
                );
    
                homeBadge.textContent = "Home";
    
                option.appendChild(homeBadge);
            }
    
            option.setAttribute(
                "aria-current",
                isActive ? "true" : "false"
            );
    
            option.addEventListener("click", async event => {
                event.stopPropagation();
    
                await activateWorkspace(region.id);
            });
    
            menu.appendChild(option);
        });
    
        return menu;
    }
    
    const dashboardHeader =
        document.createElement("div");
    
    dashboardHeader.classList.add("dashboard-header");
    
    const workspaceTitleContainer =
        document.createElement("div");
    
    workspaceTitleContainer.classList.add(
        "workspace-title-container"
    );
    
    const hasMultipleWorkspaces =
        state.accessibleRegions?.length > 1;
    
    if (hasMultipleWorkspaces) {
        const workspaceButton =
            document.createElement("button");
    
        workspaceButton.type = "button";
    
        workspaceButton.classList.add(
            "workspace-title-button"
        );
    
        workspaceButton.setAttribute(
            "aria-expanded",
            String(Boolean(state.isWorkspaceMenuOpen))
        );
    
        workspaceButton.setAttribute(
            "aria-label",
            "Switch region"
        );
    
        const title =
            document.createElement("h1");
    
        title.textContent =
            state.regionName || "F3 App";
    
        const chevron =
            document.createElement("span");
    
        chevron.classList.add(
            "workspace-title-chevron"
        );
    
        chevron.setAttribute(
            "aria-hidden",
            "true"
        );
    
        chevron.textContent =
            state.isWorkspaceMenuOpen
                ? "⌃"
                : "⌄";
    
        workspaceButton.append(
            title,
            chevron
        );
    
        workspaceButton.addEventListener(
            "click",
            event => {
                event.stopPropagation();
    
                state.isWorkspaceMenuOpen =
                    !state.isWorkspaceMenuOpen;
    
                renderApp();
            }
        );
    
        workspaceTitleContainer.appendChild(
            workspaceButton
        );
    
        if (state.isWorkspaceMenuOpen) {
            workspaceTitleContainer.appendChild(
                createWorkspaceMenu()
            );
        }
    } else {
        const title =
            document.createElement("h1");
    
        title.textContent =
            state.regionName || "F3 App";
    
        workspaceTitleContainer.appendChild(title);
    }
    
    const menuButton =
        document.createElement("button");
    
    menuButton.type = "button";
    menuButton.classList.add("hamburger-button");
    menuButton.setAttribute(
        "aria-label",
        "Open menu"
    );
    menuButton.textContent = "☰";
    
    menuButton.addEventListener("click", () => {
        state.isWorkspaceMenuOpen = false;
        state.isMainMenuOpen = true;
    
        document.body.classList.add(
            "menu-open"
        );
    
        renderApp();
    });
    
    dashboardHeader.append(
        workspaceTitleContainer,
        menuButton
    );

    const userRow = document.createElement("div");

    userRow.classList.add(
        "user-row",
        "dashboard-welcome-row"
    );

    const linkedMember = state.members.find(
        member =>
            member.id ===
            state.currentUserMemberId
    );

    const displayName =
        linkedMember?.paxName ||
        state.currentUserDisplayName ||
        "PAX";

    const welcomeContent =
        document.createElement("div");

    welcomeContent.classList.add(
        "dashboard-welcome-content"
    );

    const greeting =
        document.createElement("div");

    greeting.classList.add(
        "dashboard-greeting"
    );

    const currentHour =
        new Date().getHours();

    const greetingText =
        currentHour < 12
            ? "Good morning"
            : currentHour < 17
                ? "Good afternoon"
                : "Good evening";

    const greetingPrefix =
        document.createElement("span");

    greetingPrefix.textContent =
        `${greetingText}, `;

    const profileLink =
        document.createElement("button");

    profileLink.type = "button";

    profileLink.classList.add(
        "dashboard-greeting-profile-link"
    );

    profileLink.setAttribute(
        "aria-label",
        "View my profile"
    );

    const profileName =
        document.createElement("span");

    profileName.textContent =
        displayName;

    const profileChevron =
        document.createElement("span");

    profileChevron.classList.add(
        "dashboard-profile-chevron"
    );

    profileChevron.setAttribute(
        "aria-hidden",
        "true"
    );

    profileChevron.textContent = "›";

    profileLink.append(
        profileName,
        profileChevron
    );

    profileLink.addEventListener(
        "click",
        () => {
            if (!linkedMember) return;

            state.selectedPaxId =
                linkedMember.id;

            navigateTo("paxProfile");
        }
    );

    greeting.append(
        greetingPrefix,
        profileLink
    );

    const welcomeSubtitle =
        document.createElement("div");

    welcomeSubtitle.classList.add(
        "dashboard-welcome-subtitle"
    );

    welcomeSubtitle.textContent =
        "Let’s get better.";

    welcomeContent.append(
        greeting,
        welcomeSubtitle
    );

    const roleBadge =
        document.createElement("span");

    roleBadge.classList.add(
        "role-badge",
        "dashboard-role-badge"
    );

    const role =
        state.currentUserRole || "pax";

    roleBadge.dataset.role = role;

    roleBadge.textContent =
        getDashboardLeadershipBadge();

    userRow.append(
        welcomeContent,
        roleBadge
    );

    function getWorkoutReadinessLabel(workout) {
        if (!workout) return "No Workout Planned";
        return workout.isFinalized ? "Ready to Lead" : "Workout Draft";
    }

    function getWorkoutReadinessClass(workout) {
        if (!workout) return "status-needs";
        return workout.isFinalized ? "status-ready" : "status-draft";
    }

    function findMatchingPlannedWorkoutForSlot(slot) {
        return findWorkoutForQSlot(
            slot,
            state.plannedWorkouts,
            state.currentUserId,
            state.aos
        );
    }

    function markQSlotLoggedElsewhere(slot) {
        slot.workflowStatus = "logged_elsewhere";
        showToast("Q marked as logged elsewhere.", "success");
        renderApp();
    }

    function createPrimaryActionsRow() {
        const section =
            document.createElement("section");
    
        section.classList.add(
            "section",
            "dashboard-quick-access-section"
        );
    
        const header =
            document.createElement("div");
    
        header.classList.add(
            "dashboard-section-header"
        );
    
        const heading =
            document.createElement("div");
    
        heading.classList.add("detail-label");
        heading.textContent = "Quick Access";
    
        header.appendChild(heading);
    
        const deck =
            document.createElement("div");
    
        deck.classList.add(
            "dashboard-card-deck",
            "dashboard-quick-access-deck"
        );
    
        const actions = [
            {
                icon: "qSignup",
                title: "Q Signup",
                subtitle: "Claim a future Q",
                className: "dashboard-action-green",
                destination: "qSignup",
            },
            {
                icon: "weeklySchedule",
                title: "Weekly Schedule",
                subtitle: "View the full week",
                className: "dashboard-action-blue",
                destination: "weeklyQCalendar",
            },
            {
                icon: "planner",
                title: "Workout Planner",
                subtitle: "Build your beatdown",
                className: "dashboard-action-purple",
                destination: "myPlanner",
            },
            {
                icon: "history",
                title: "History",
                subtitle: "Review past BDs",
                className: "dashboard-action-amber",
                destination: "sessionHistory",
            },
        ];
    
        actions.forEach(action => {
            const button =
                document.createElement("button");
    
            button.type = "button";
    
            button.classList.add(
                "dashboard-deck-card",
                "dashboard-quick-access-card",
                action.className
            );
    
            const icon =
                createIcon(
                    action.icon,
                    "dashboard-action-icon"
                );

            icon.setAttribute(
                "aria-hidden",
                "true"
            );
    
            const text =
                document.createElement("span");
    
            text.classList.add(
                "dashboard-action-text"
            );
    
            const title =
                document.createElement("span");
    
            title.classList.add(
                "dashboard-action-title"
            );
    
            title.textContent =
                action.title;
    
            const subtitle =
                document.createElement("span");
    
            subtitle.classList.add(
                "dashboard-action-subtitle"
            );
    
            subtitle.textContent =
                action.subtitle;
    
            text.append(
                title,
                subtitle
            );
    
            const arrow =
                createIcon(
                    "chevronRight",
                    "dashboard-action-arrow"
                );

            arrow.setAttribute(
                "aria-hidden",
                "true"
            );
    
            button.append(
                icon,
                text,
                arrow
            );
    
            button.addEventListener(
                "click",
                () => {
                    navigateTo(
                        action.destination
                    );
                }
            );
    
            deck.appendChild(button);
        });
    
        section.append(
            header,
            deck
        );
    
        return section;
    }

    function getActiveWorkoutExecution() {
        try {
            const activeExecution = JSON.parse(
                localStorage.getItem("activeWorkoutExecution") || "null"
            );
    
            if (!activeExecution?.plannedWorkoutId) {
                return null;
            }
    
            const lastUpdatedAt = activeExecution.lastUpdatedAt
                ? new Date(activeExecution.lastUpdatedAt).getTime()
                : null;
    
            const isStale =
                lastUpdatedAt &&
                Date.now() - lastUpdatedAt > 8 * 60 * 60 * 1000;
    
            if (isStale) {
                localStorage.removeItem("activeWorkoutExecution");
                return null;
            }
    
            return activeExecution;
        } catch (error) {
            console.warn("Invalid active workout execution state:", error);
            localStorage.removeItem("activeWorkoutExecution");
            return null;
        }
    }
    
    function clearActiveWorkoutExecution() {
        localStorage.removeItem("activeWorkoutExecution");
    }
    
    function renderResumeWorkoutSection(activeExecution) {
        if (!activeExecution?.plannedWorkoutId) return null;
    
        const workout = state.plannedWorkouts.find(
            workout => workout.id === activeExecution.plannedWorkoutId
        );
    
        if (!workout) {
            clearActiveWorkoutExecution();
            return null;
        }
    
        const section = document.createElement("div");
        section.classList.add(
            "section",
            "dashboard-hero-section",
            "dashboard-resume-hero"
        );
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = "Workout In Progress";
    
        const card = document.createElement("div");
        card.classList.add(
            "member-card",
            "dashboard-next-q-card",
            "dashboard-hero-card"
        );
    
        const content = document.createElement("div");
    
        const title = document.createElement("div");
        title.classList.add("member-name");
        title.textContent = workout.title || "Untitled Workout";
    
        const subtitle = document.createElement("div");
        subtitle.classList.add("stats-line");
        subtitle.textContent = `${formatDate(workout.date)} • ${workout.aoName || "Unknown AO"}`;
    
        const preview = document.createElement("div");
        preview.classList.add("stats-line");
        preview.textContent = "Reopen your running workout.";
    
        const actions = document.createElement("div");
        actions.classList.add("q-slot-actions");
    
        const resumeButton = document.createElement("button");
        resumeButton.classList.add("primary-button");
        resumeButton.textContent = "Resume Workout";
    
        resumeButton.addEventListener("click", event => {
            event.stopPropagation();
    
            state.selectedPlannedWorkoutId = workout.id;
            state.plannedWorkoutLaunchMode = "execution";
    
            navigateTo("plannedWorkoutDetail");
        });
    
        const clearButton = document.createElement("button");
        clearButton.classList.add("secondary-button");
        clearButton.textContent = "Clear";
    
        clearButton.addEventListener("click", event => {
            event.stopPropagation();
    
            clearActiveWorkoutExecution();
            releaseWakeLock();
            showToast("Workout cleared.", "success");
            renderApp();
        });
    
        card.addEventListener("click", () => {
            state.selectedPlannedWorkoutId = workout.id;
            state.plannedWorkoutLaunchMode = "execution";
    
            navigateTo("plannedWorkoutDetail");
        });
    
        content.append(title, subtitle, preview);
        actions.append(resumeButton, clearButton);
        card.append(content, actions);
        section.append(heading, card);
    
        return section;
    }

    function findLoggedSessionForSlot(slot) {
        const ao = state.aos.find(a => a.id === slot.aoId);

        return state.sessions.find(session => {
            const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

            return (
                session.date === slot.date &&
                (
                    session.aoId === slot.aoId ||
                    (
                        !session.aoId &&
                        session.aoName === ao?.name
                    )
                ) &&
                effectiveQIds.includes(state.currentUserMemberId)
            );
        });
    }

    function getRecentDateCutoff(daysBack) {
        const date = new Date();
        date.setDate(date.getDate() - daysBack);
    
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function isTodayQPastWorkoutTime(slot) {
        if (slot.date !== getTodayDate()) return false;
    
        const ao = state.aos.find(a => a.id === slot.aoId);
        const displayTime = getSlotDisplayTime(slot, ao);
        
        if (!displayTime) return false;
        
        const [hourString, minuteString] = displayTime.split(":");
        const hour = Number(hourString);
        const minute = Number(minuteString || 0);
    
        if (Number.isNaN(hour) || Number.isNaN(minute)) return false;
    
        const workoutStart = new Date();
        workoutStart.setHours(hour, minute, 0, 0);
    
        return new Date() > workoutStart;
    }

    function getNextQTargetDateTime(slot, ao) {
        const displayTime = getSlotDisplayTime(slot, ao);
    
        if (!slot || !ao || !displayTime) {
            return null;
        }
    
        return `${slot.date}T${displayTime}:00`;
    }

    function getWeatherCacheKey(slot, ao) {
        const targetDateTime = getNextQTargetDateTime(slot, ao);
        const site = resolveSiteForQSlot(slot, ao);
    
        if (!site?.id || !targetDateTime) {
            return null;
        }
    
        return `${site.id}__${targetDateTime}`;
    }

    async function loadNextQWeather(slot, ao) {
        const workspaceGeneration =
            state.workspaceGeneration;
    
        const targetDateTime = getNextQTargetDateTime(slot, ao);
        const cacheKey = getWeatherCacheKey(slot, ao);
        const site = resolveSiteForQSlot(slot, ao);
    
        if (!site?.id || !targetDateTime || !cacheKey) {
            return;
        }

        if (state.weatherBySiteDate?.[cacheKey]) {
            return;
        }

        state.weatherBySiteDate = state.weatherBySiteDate || {};
        state.weatherBySiteDate[cacheKey] = {
            isLoading: true,
        };

        patchNextQWeather(cacheKey);

        try {
            const weather = await getSiteWeather(site.id, targetDateTime);

            if (
                workspaceGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }

            state.weatherBySiteDate[cacheKey] = weather;
        } catch (error) {
            if (
                workspaceGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }

            console.error("Failed to load next Q weather:", error);

            state.weatherBySiteDate[cacheKey] = {
                weatherUnavailable: true,
            };
        }

        if (
            workspaceGeneration ===
                state.workspaceGeneration &&
            state.currentView === "dashboard"
        ) {
            patchNextQWeather(cacheKey);
        }
    }

    function renderNextQWeatherLine(weatherLine, weather) {
        weatherLine.textContent = "";

        if (!weather) {
            weatherLine.textContent = "Loading weather...";
            return;
        }

        if (weather.isLoading) {
            weatherLine.textContent = "Loading weather...";
            return;
        }

        if (weather.weatherUnavailable) {
            weatherLine.textContent = "Weather unavailable";
            return;
        }

        const tempLabel =
            typeof weather.temp === "number"
                ? `${weather.temp}°`
                : "Temp unavailable";

        const humidityLabel =
            typeof weather.humidity === "number"
                ? `${weather.humidity}% humidity`
                : "humidity unavailable";

        const rainLabel =
            typeof weather.precipChance === "number"
                ? `${weather.precipChance}% rain`
                : "rain unavailable";

        const windLabel =
            typeof weather.windMph === "number"
                ? `${weather.windMph} mph wind`
                : "wind unavailable";

        const feelsLikeLabel =
            typeof weather.feelsLike === "number"
                ? `Feels like ${weather.feelsLike}°`
                : null;
        
        weatherLine.textContent = [
            tempLabel,
            feelsLikeLabel,
            humidityLabel,
            rainLabel,
            windLabel,
        ].filter(Boolean).join(" · ");
    }

    function patchNextQWeather(cacheKey) {
        const weatherLine = document.querySelector(
            `[data-next-q-weather-key="${cacheKey}"]`
        );

        if (!weatherLine) return;

        renderNextQWeatherLine(
            weatherLine,
            state.weatherBySiteDate?.[cacheKey]
        );
    }

    function saveActiveWorkoutExecution(workout, launchSource = "dashboard_next_q") {
        localStorage.setItem("activeWorkoutExecution", JSON.stringify({
            plannedWorkoutId: workout.id,
            launchSource,
            workoutDate: workout.date || null,
            aoId: workout.aoId || null,
            aoName: workout.aoName || null,
            title: workout.title || null,
            startedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
        }));
    }

    function getMyUpcomingQSlots() {
        const today = getTodayDate();

        return state.qSlots
            .filter(slot => {
                if (slot.workflowStatus === "logged_elsewhere") {
                    return false;
                }

                if (slot.qUserId !== state.currentUserMemberId) {
                    return false;
                }

                if (slot.date < today) {
                    return false;
                }

                const loggedSession = findLoggedSessionForSlot(slot);

                if (loggedSession) {
                    return false;
                }

                return true;
            })
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    function getDayOfWeekFromDateKey(dateKey) {
        const [year, month, day] = dateKey.split("-").map(Number);
        return new Date(year, month - 1, day).getDay();
    }
    
    function getSlotDisplayTime(slot, ao) {
        if (!slot || !ao) return "";
    
        const workout = findMatchingPlannedWorkoutForSlot(slot);
    
        const dayKey = String(getDayOfWeekFromDateKey(slot.date));
    
        return (
            workout?.startTime ||
            slot.overrideTime ||
            slot.startTime ||
            ao.timeSchedule?.[dayKey] ||
            ao.time ||
            ""
        );
    }

    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);

    const tomorrow = [
        tomorrowDate.getFullYear(),
        String(tomorrowDate.getMonth() + 1).padStart(2, "0"),
        String(tomorrowDate.getDate()).padStart(2, "0"),
    ].join("-");

    const today = getTodayDate();
    const myUpcomingQSlots = getMyUpcomingQSlots();
    const nextQSlot = myUpcomingQSlots[0] || null;

    const tomorrowQSlots = state.qSlots
    .filter(slot => {
        return (
            slot.date === tomorrow &&
            Boolean(slot.qUserId)
        );
    })
    .sort((a, b) => {
        const aoA = state.aos.find(
            ao => ao.id === a.aoId
        );

        const aoB = state.aos.find(
            ao => ao.id === b.aoId
        );

        const timeA =
            getSlotDisplayTime(a, aoA) || "";

        const timeB =
            getSlotDisplayTime(b, aoB) || "";

        return (
            timeA.localeCompare(timeB) ||
            (aoA?.name || "").localeCompare(
                aoB?.name || ""
            )
        );
    });

    function loadTomorrowCommitmentSummaries() {
        const qSlotIds = tomorrowQSlots
            .map(slot => slot.id)
            .filter(Boolean);
    
        if (qSlotIds.length === 0) {
            return;
        }
    
        const requestKey = [
            state.currentRegionId,
            state.workspaceGeneration,
            ...qSlotIds,
        ].join("__");
    
        if (
            state.qSlotCommitmentSummaryRequestKey ===
            requestKey
        ) {
            return;
        }
    
        state.qSlotCommitmentSummaryRequestKey =
            requestKey;
    
        const requestGeneration =
            state.workspaceGeneration;
    
        loadQSlotCommitmentSummaries(qSlotIds)
            .then(summaries => {
                if (
                    requestGeneration !==
                    state.workspaceGeneration
                ) {
                    return;
                }
    
                const nextBySlotId = {};
    
                qSlotIds.forEach(qSlotId => {
                    nextBySlotId[qSlotId] = {
                        qSlotId,
                        hcCount: 0,
                        scCount: 0,
                        myCommitment: null,
                    };
                });
    
                summaries.forEach(summary => {
                    nextBySlotId[summary.qSlotId] =
                        summary;
                });
    
                state.qSlotCommitmentSummariesBySlotId =
                    nextBySlotId;
    
                if (
                    state.currentView ===
                    "dashboard"
                ) {
                    renderApp();
                }
            })
            .catch(error => {
                console.error(
                    "Failed to hydrate tomorrow commitments:",
                    error
                );
    
                if (
                    requestGeneration ===
                    state.workspaceGeneration
                ) {
                    state.qSlotCommitmentSummaryRequestKey =
                        null;
                }
            });
    }

    async function loadCommitmentDetailsForSlot(qSlotId) {
        if (!qSlotId) return;
    
        const alreadyLoaded =
            Object.prototype.hasOwnProperty.call(
                state.qSlotCommitmentsBySlotId || {},
                qSlotId
            );
    
        const isLoading =
            Boolean(
                state.qSlotCommitmentDetailsLoadingBySlotId?.[
                    qSlotId
                ]
            );
    
        if (alreadyLoaded || isLoading) {
            return;
        }
    
        const requestGeneration =
            state.workspaceGeneration;
    
        state.qSlotCommitmentDetailsLoadingBySlotId = {
            ...(state.qSlotCommitmentDetailsLoadingBySlotId || {}),
            [qSlotId]: true,
        };
    
        state.qSlotCommitmentDetailsErrorBySlotId = {
            ...(state.qSlotCommitmentDetailsErrorBySlotId || {}),
            [qSlotId]: false,
        };
    
        if (state.currentView === "dashboard") {
            renderApp();
        }
    
        try {
            const commitments =
                await loadQSlotCommitments(qSlotId);
    
            if (
                requestGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }
    
            state.qSlotCommitmentsBySlotId = {
                ...(state.qSlotCommitmentsBySlotId || {}),
                [qSlotId]:
                    Array.isArray(commitments)
                        ? commitments
                        : [],
            };
        } catch (error) {
            if (
                requestGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }
    
            console.error(
                "Failed to load Q-slot commitment details:",
                {
                    qSlotId,
                    error,
                }
            );
    
            state.qSlotCommitmentDetailsErrorBySlotId = {
                ...(state.qSlotCommitmentDetailsErrorBySlotId || {}),
                [qSlotId]: true,
            };
        } finally {
            if (
                requestGeneration !==
                state.workspaceGeneration
            ) {
                return;
            }
    
            state.qSlotCommitmentDetailsLoadingBySlotId = {
                ...(state.qSlotCommitmentDetailsLoadingBySlotId || {}),
                [qSlotId]: false,
            };
    
            if (state.currentView === "dashboard") {
                renderApp();
            }
        }
    }

    function getCommitmentMemberName(commitment) {
        const member = state.members.find(
            candidate =>
                candidate.id === commitment.memberId
        );
    
        return (
            member?.paxName ||
            member?.realName ||
            commitment.paxName ||
            commitment.realName ||
            commitment.memberName ||
            "Unknown PAX"
        );
    }

    function canManageCommitmentsForSlot(slot) {
        if (!slot) return false;
    
        const isAssignedQ =
            slot.qUserId === state.currentUserMemberId;
    
        return (
            isAssignedQ ||
            managesQSlot(slot)
        );
    }
    
    function getCommitmentParticipantDirectory() {
        const participants =
            Array.isArray(state.regionParticipants)
                ? state.regionParticipants
                : state.members;
    
        return Array.isArray(participants)
            ? participants
            : [];
    }
    
    function getCommitmentEditorState() {
        return (
            state.dashboardCommitmentEditor || {
                slotId: null,
                memberId: null,
                searchTerm: "",
                selectedMemberId: null,
            }
        );
    }
    
    function setCommitmentEditorState(nextState) {
        state.dashboardCommitmentEditor = {
            slotId: null,
            memberId: null,
            searchTerm: "",
            selectedMemberId: null,
            ...nextState,
        };
    }
    
    function clearCommitmentEditor() {
        setCommitmentEditorState({});
    }
    
    function createCommitmentNameGroup(
        label,
        commitments,
        commitmentType,
        slot
    ) {
        const group = document.createElement("div");
    
        group.classList.add(
            "dashboard-commitment-name-group"
        );
    
        const matchingCommitments = commitments
            .filter(
                commitment =>
                    commitment.commitmentType ===
                    commitmentType
            )
            .sort((a, b) =>
                getCommitmentMemberName(a).localeCompare(
                    getCommitmentMemberName(b)
                )
            );
    
        const heading = document.createElement("div");
    
        heading.classList.add(
            "dashboard-commitment-name-heading"
        );
    
        heading.textContent =
            `${label} (${matchingCommitments.length})`;
    
        group.appendChild(heading);
    
        if (matchingCommitments.length === 0) {
            const empty = document.createElement("div");
    
            empty.classList.add(
                "stats-line",
                "dashboard-commitment-name-empty"
            );
    
            empty.textContent = "None";
    
            group.appendChild(empty);
            return group;
        }
    
        const canManage =
            canManageCommitmentsForSlot(slot);
    
        const editorState =
            getCommitmentEditorState();
    
        matchingCommitments.forEach(commitment => {
            const row = document.createElement("div");
    
            row.classList.add(
                "dashboard-commitment-name-row"
            );
    
            const badge = document.createElement("span");
    
            badge.classList.add(
                "session-commitment-badge",
                `session-commitment-badge-${commitmentType}`
            );
    
            badge.textContent =
                commitmentType.toUpperCase();
    
            const name = document.createElement("span");
    
            name.classList.add(
                "dashboard-commitment-member-name"
            );
    
            name.textContent =
                getCommitmentMemberName(commitment);
    
            row.append(badge, name);
    
            const isEditing =
                canManage &&
                editorState.slotId === slot.id &&
                editorState.memberId ===
                    commitment.memberId;
    
            if (canManage) {
                const editButton =
                    document.createElement("button");
    
                editButton.type = "button";
    
                editButton.classList.add(
                    "secondary-button",
                    "dashboard-commitment-member-edit"
                );
    
                editButton.textContent =
                    isEditing ? "Done" : "Edit";
    
                editButton.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();
    
                        if (isEditing) {
                            clearCommitmentEditor();
                        } else {
                            setCommitmentEditorState({
                                slotId: slot.id,
                                memberId:
                                    commitment.memberId,
                            });
                        }
    
                        renderApp();
                    }
                );
    
                row.appendChild(editButton);
            }
    
            group.appendChild(row);
    
            if (isEditing) {
                const actions =
                    document.createElement("div");
    
                actions.classList.add(
                    "dashboard-commitment-member-actions"
                );
    
                const hcButton =
                    document.createElement("button");
    
                hcButton.type = "button";
                hcButton.textContent = "HC";
    
                hcButton.classList.add(
                    "dashboard-commitment-editor-choice"
                );
    
                if (
                    commitment.commitmentType ===
                    "hc"
                ) {
                    hcButton.classList.add("selected");
                }
    
                const scButton =
                    document.createElement("button");
    
                scButton.type = "button";
                scButton.textContent = "SC";
    
                scButton.classList.add(
                    "dashboard-commitment-editor-choice"
                );
    
                if (
                    commitment.commitmentType ===
                    "sc"
                ) {
                    scButton.classList.add("selected");
                }
    
                const removeButton =
                    document.createElement("button");
    
                removeButton.type = "button";
                removeButton.textContent = "Remove";
    
                removeButton.classList.add(
                    "secondary-button",
                    "dashboard-commitment-editor-remove"
                );
    
                const isUpdating =
                    Boolean(
                        state
                            .qSlotCommitmentLoadingBySlotId?.[
                                slot.id
                            ]
                    );
    
                hcButton.disabled = isUpdating;
                scButton.disabled = isUpdating;
                removeButton.disabled = isUpdating;
    
                hcButton.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();
    
                        const succeeded =
                            await updateQSlotCommitment({
                                qSlotId: slot.id,
                                memberId:
                                    commitment.memberId,
                                commitmentType: "hc",
                            });
    
                        if (succeeded) {
                            clearCommitmentEditor();
                        
                            if (state.currentView === "dashboard") {
                                renderApp();
                            }
                        }
                    }
                );
    
                scButton.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();
    
                        const succeeded =
                            await updateQSlotCommitment({
                                qSlotId: slot.id,
                                memberId:
                                    commitment.memberId,
                                commitmentType: "sc",
                            });
    
                        if (succeeded) {
                            clearCommitmentEditor();
                        
                            if (state.currentView === "dashboard") {
                                renderApp();
                            }
                        }
                    }
                );
    
                removeButton.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();
    
                        const succeeded =
                            await updateQSlotCommitment({
                                qSlotId: slot.id,
                                memberId:
                                    commitment.memberId,
                                commitmentType: null,
                            });
    
                        if (succeeded) {
                            clearCommitmentEditor();
                        
                            if (state.currentView === "dashboard") {
                                renderApp();
                            }
                        }
                    }
                );
    
                actions.append(
                    hcButton,
                    scButton,
                    removeButton
                );
    
                group.appendChild(actions);
            }
        });
    
        return group;
    }

    function createManagedCommitmentAdder(
        slot,
        commitments
    ) {
        const container =
            document.createElement("div");
    
        container.classList.add(
            "dashboard-commitment-add"
        );
    
        const editorState =
            getCommitmentEditorState();
    
        const isAdding =
            editorState.slotId === slot.id &&
            editorState.memberId === null;
    
        if (!isAdding) {
            const addButton =
                document.createElement("button");
    
            addButton.type = "button";
    
            addButton.classList.add(
                "secondary-button",
                "dashboard-commitment-add-button"
            );
    
            addButton.textContent = "+ Add PAX";
    
            addButton.addEventListener(
                "click",
                event => {
                    event.stopPropagation();
    
                    setCommitmentEditorState({
                        slotId: slot.id,
                        memberId: null,
                        searchTerm: "",
                        selectedMemberId: null,
                    });
    
                    renderApp();
                }
            );
    
            container.appendChild(addButton);
    
            return container;
        }
    
        const participantDirectory =
            getCommitmentParticipantDirectory();
    
        const selectedMember =
            participantDirectory.find(
                member =>
                    member.id ===
                    editorState.selectedMemberId
            );
    
        /*
         * Once a member is selected, hide the search field and
         * search results entirely. Show one compact selection row.
         */
        if (selectedMember) {
            const selectedRow =
                document.createElement("div");
    
            selectedRow.classList.add(
                "dashboard-commitment-add-selected"
            );
    
            const selectedName =
                document.createElement("div");
    
            selectedName.classList.add(
                "dashboard-commitment-selected-name"
            );
    
            selectedName.textContent =
                selectedMember.paxName ||
                selectedMember.realName ||
                "Selected PAX";
    
            const actions =
                document.createElement("div");
    
            actions.classList.add(
                "dashboard-commitment-add-actions"
            );
    
            const hcButton =
                document.createElement("button");
    
            hcButton.type = "button";
            hcButton.textContent = "HC";
    
            hcButton.classList.add(
                "dashboard-commitment-editor-choice"
            );
    
            const scButton =
                document.createElement("button");
    
            scButton.type = "button";
            scButton.textContent = "SC";
    
            scButton.classList.add(
                "dashboard-commitment-editor-choice"
            );
    
            const isUpdating =
                Boolean(
                    state
                        .qSlotCommitmentLoadingBySlotId?.[
                            slot.id
                        ]
                );
    
            hcButton.disabled = isUpdating;
            scButton.disabled = isUpdating;
    
            hcButton.addEventListener(
                "click",
                async event => {
                    event.stopPropagation();
    
                    const succeeded =
                        await updateQSlotCommitment({
                            qSlotId: slot.id,
                            memberId:
                                selectedMember.id,
                            commitmentType: "hc",
                        });
    
                    if (succeeded) {
                        clearCommitmentEditor();
    
                        if (
                            state.currentView ===
                            "dashboard"
                        ) {
                            renderApp();
                        }
                    }
                }
            );
    
            scButton.addEventListener(
                "click",
                async event => {
                    event.stopPropagation();
    
                    const succeeded =
                        await updateQSlotCommitment({
                            qSlotId: slot.id,
                            memberId:
                                selectedMember.id,
                            commitmentType: "sc",
                        });
    
                    if (succeeded) {
                        clearCommitmentEditor();
    
                        if (
                            state.currentView ===
                            "dashboard"
                        ) {
                            renderApp();
                        }
                    }
                }
            );
    
            actions.append(
                hcButton,
                scButton
            );
    
            selectedRow.append(
                selectedName,
                actions
            );
    
            const changeButton =
                document.createElement("button");
    
            changeButton.type = "button";
    
            changeButton.classList.add(
                "secondary-button",
                "dashboard-commitment-change-selection"
            );
    
            changeButton.textContent =
                "Change selection";
    
            changeButton.addEventListener(
                "click",
                event => {
                    event.stopPropagation();
    
                    setCommitmentEditorState({
                        slotId: slot.id,
                        memberId: null,
                        searchTerm: "",
                        selectedMemberId: null,
                    });
    
                    renderApp();
                }
            );
    
            const cancelButton =
                document.createElement("button");
    
            cancelButton.type = "button";
    
            cancelButton.classList.add(
                "secondary-button",
                "dashboard-commitment-add-cancel"
            );
    
            cancelButton.textContent = "Cancel";
    
            cancelButton.addEventListener(
                "click",
                event => {
                    event.stopPropagation();
    
                    clearCommitmentEditor();
                    renderApp();
                }
            );
    
            container.append(
                selectedRow,
                changeButton,
                cancelButton
            );
    
            return container;
        }
    
        /*
         * Search mode
         */
    
        const search =
            document.createElement("input");
    
        search.type = "search";
        search.placeholder = "Search PAX...";
        search.autocomplete = "off";
    
        search.classList.add(
            "dashboard-commitment-search"
        );
    
        search.value =
            editorState.searchTerm || "";
    
        const committedMemberIds =
            new Set(
                commitments.map(
                    commitment =>
                        commitment.memberId
                )
            );
    
        const normalizedSearch =
            search.value
                .trim()
                .toLowerCase();
    
        const searchResults =
            participantDirectory
                .filter(member => {
                    if (!member?.id) {
                        return false;
                    }
    
                    if (
                        committedMemberIds.has(
                            member.id
                        )
                    ) {
                        return false;
                    }
    
                    if (!normalizedSearch) {
                        return false;
                    }
    
                    const searchableText = [
                        member.paxName,
                        member.realName,
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
    
                    return searchableText.includes(
                        normalizedSearch
                    );
                })
                .sort((a, b) =>
                    (
                        a.paxName ||
                        a.realName ||
                        ""
                    ).localeCompare(
                        b.paxName ||
                        b.realName ||
                        ""
                    )
                )
                .slice(0, 8);
    
        search.addEventListener(
            "input",
            event => {
                setCommitmentEditorState({
                    slotId: slot.id,
                    memberId: null,
                    searchTerm:
                        event.target.value,
                    selectedMemberId: null,
                });
    
                renderApp();
            }
        );
    
        const results =
            document.createElement("div");
    
        results.classList.add(
            "dashboard-commitment-search-results"
        );
    
        if (
            normalizedSearch &&
            searchResults.length === 0
        ) {
            const empty =
                document.createElement("div");
    
            empty.classList.add(
                "stats-line",
                "dashboard-commitment-search-empty"
            );
    
            empty.textContent =
                "No matching PAX found.";
    
            results.appendChild(empty);
        }
    
        searchResults.forEach(member => {
            const resultButton =
                document.createElement("button");
    
            resultButton.type = "button";
    
            resultButton.classList.add(
                "dashboard-commitment-search-result"
            );
    
            const memberName =
                member.paxName ||
                member.realName ||
                "Unknown PAX";
    
            resultButton.textContent =
                memberName;
    
            resultButton.addEventListener(
                "click",
                event => {
                    event.stopPropagation();
    
                    setCommitmentEditorState({
                        slotId: slot.id,
                        memberId: null,
                        searchTerm: "",
                        selectedMemberId:
                            member.id,
                    });
    
                    renderApp();
                }
            );
    
            results.appendChild(resultButton);
        });
    
        const cancelButton =
            document.createElement("button");
    
        cancelButton.type = "button";
    
        cancelButton.classList.add(
            "secondary-button",
            "dashboard-commitment-add-cancel"
        );
    
        cancelButton.textContent = "Cancel";
    
        cancelButton.addEventListener(
            "click",
            event => {
                event.stopPropagation();
    
                clearCommitmentEditor();
                renderApp();
            }
        );
    
        container.append(
            search,
            results,
            cancelButton
        );
    
        queueMicrotask(() => {
            const activeEditor =
                getCommitmentEditorState();
    
            if (
                activeEditor.slotId === slot.id &&
                activeEditor.memberId === null &&
                !activeEditor.selectedMemberId
            ) {
                search.focus();
    
                const valueLength =
                    search.value.length;
    
                search.setSelectionRange(
                    valueLength,
                    valueLength
                );
            }
        });
    
        return container;
    }

    async function updateQSlotCommitment({
        qSlotId,
        memberId,
        commitmentType,
        toggleCurrent = false,
    }) {
        if (!qSlotId || !memberId) {
            showToast(
                "A Q slot and PAX are required.",
                "error"
            );
    
            return false;
        }

        if (
            state.qSlotCommitmentLoadingBySlotId?.[
                qSlotId
            ]
        ) {
            return false;
        }
    
        const currentSummary =
            state.qSlotCommitmentSummariesBySlotId?.[
                qSlotId
            ] || {
                qSlotId,
                hcCount: 0,
                scCount: 0,
                myCommitment: null,
            };
    
        const loadedCommitments =
            state.qSlotCommitmentsBySlotId?.[
                qSlotId
            ];
    
        const existingCommitment =
            Array.isArray(loadedCommitments)
                ? loadedCommitments.find(
                    commitment =>
                        commitment.memberId === memberId
                )
                : null;
    
        const previousCommitment =
            memberId === state.currentUserMemberId
                ? (
                    existingCommitment
                        ?.commitmentType ||
                    currentSummary.myCommitment ||
                    null
                )
                : (
                    existingCommitment
                        ?.commitmentType ||
                    null
                );
    
        const nextCommitment =
            toggleCurrent &&
            previousCommitment === commitmentType
                ? null
                : commitmentType;
    
        state.qSlotCommitmentLoadingBySlotId = {
            ...(state.qSlotCommitmentLoadingBySlotId || {}),
            [qSlotId]: true,
        };
        
        if (
            state.currentView ===
            "dashboard"
        ) {
            renderApp();
        }
        
        try {
            await setQSlotCommitment({
                qSlotId,
                memberId,
                commitmentType: nextCommitment,
            });
    
            let hcCount =
                Number(currentSummary.hcCount || 0);
    
            let scCount =
                Number(currentSummary.scCount || 0);
    
            if (previousCommitment === "hc") {
                hcCount = Math.max(0, hcCount - 1);
            }
    
            if (previousCommitment === "sc") {
                scCount = Math.max(0, scCount - 1);
            }
    
            if (nextCommitment === "hc") {
                hcCount += 1;
            }
    
            if (nextCommitment === "sc") {
                scCount += 1;
            }
    
            const isCurrentUser =
                memberId === state.currentUserMemberId;
    
            state.qSlotCommitmentSummariesBySlotId = {
                ...(state.qSlotCommitmentSummariesBySlotId || {}),
    
                [qSlotId]: {
                    ...currentSummary,
                    qSlotId,
                    hcCount,
                    scCount,
                    myCommitment:
                        isCurrentUser
                            ? nextCommitment
                            : currentSummary.myCommitment,
                },
            };
    
            if (Array.isArray(loadedCommitments)) {
                const commitmentsWithoutMember =
                    loadedCommitments.filter(
                        commitment =>
                            commitment.memberId !== memberId
                    );
    
                state.qSlotCommitmentsBySlotId = {
                    ...(state.qSlotCommitmentsBySlotId || {}),
    
                    [qSlotId]:
                        nextCommitment
                            ? [
                                ...commitmentsWithoutMember,
                                {
                                    qSlotId,
                                    memberId,
                                    commitmentType:
                                        nextCommitment,
                                    source:
                                        isCurrentUser
                                            ? "self"
                                            : "leader",
                                },
                            ]
                            : commitmentsWithoutMember,
                };
            }
    
            const member =
                getCommitmentParticipantDirectory().find(
                    candidate =>
                        candidate.id === memberId
                );
    
            const memberName =
                member?.paxName ||
                member?.realName ||
                "PAX";
    
            showToast(
                nextCommitment === "hc"
                    ? `${memberName} added as a Hard Commit.`
                    : nextCommitment === "sc"
                        ? `${memberName} added as a Soft Commit.`
                        : `${memberName}'s commitment cleared.`,
                "success"
            );
    
            return true;
        } catch (error) {
            console.error(
                "Unable to update commitment:",
                {
                    qSlotId,
                    memberId,
                    commitmentType:
                        nextCommitment,
                    error,
                }
            );
    
            showToast(
                "Unable to update commitment.",
                "error"
            );
    
            return false;
        } finally {
            state.qSlotCommitmentLoadingBySlotId = {
                ...(state.qSlotCommitmentLoadingBySlotId || {}),
                [qSlotId]: false,
            };
    
            if (
                state.currentView ===
                "dashboard"
            ) {
                renderApp();
            }
        }
    }
    
    async function updateMyQSlotCommitment(
        qSlotId,
        commitmentType
    ) {
        if (!state.currentUserMemberId) {
            showToast(
                "Your account is not linked to a PAX record.",
                "error"
            );
    
            return;
        }
    
        await updateQSlotCommitment({
            qSlotId,
            memberId:
                state.currentUserMemberId,
            commitmentType,
            toggleCurrent: true,
        });
    }

    const activeExecution = getActiveWorkoutExecution();
    const resumeWorkoutSection = renderResumeWorkoutSection(activeExecution);

    let dashboardCtaSection = renderNoUpcomingQSection();

    if (nextQSlot) {
        const ao = state.aos.find(a => a.id === nextQSlot.aoId);
    
        const nextQSite = resolveSiteForQSlot(
            nextQSlot,
            ao
        );

        const debugDisplayTime =
    getSlotDisplayTime(
        nextQSlot,
        ao
    );

const debugTargetDateTime =
    getNextQTargetDateTime(
        nextQSlot,
        ao
    );

const debugWeatherCacheKey =
    getWeatherCacheKey(
        nextQSlot,
        ao
    );

console.log(
    "DASHBOARD WEATHER DEBUG",
    {
        nextQSlot,
        ao,
        nextQSite,

        stateSites:
            state.sites,

        sitesCount:
            state.sites?.length || 0,

        slotSiteId:
            nextQSlot?.siteId || null,

        aoDefaultSiteId:
            ao?.defaultSiteId || null,

        displayTime:
            debugDisplayTime,

        targetDateTime:
            debugTargetDateTime,

        weatherCacheKey:
            debugWeatherCacheKey,

        cachedWeather:
            debugWeatherCacheKey
                ? state.weatherByAoDate?.[
                    debugWeatherCacheKey
                ]
                : null,

        activeWorkoutExecution:
            localStorage.getItem(
                "activeWorkoutExecution"
            ),
    }
);
    
        const displayTime = getSlotDisplayTime(nextQSlot, ao);
        const weatherCacheKey = getWeatherCacheKey(nextQSlot, ao);
        const nextQWeather = weatherCacheKey
            ? state.weatherBySiteDate?.[weatherCacheKey]
            : null;
        const matchingWorkout = findMatchingPlannedWorkoutForSlot(nextQSlot);
        const hasPlannedWorkout = Boolean(matchingWorkout);
        const isTodayQ = nextQSlot.date === today;
        const isTomorrowQ = nextQSlot.date === tomorrow;
        const loggedSession = findLoggedSessionForSlot(nextQSlot);
        const isPastTodayWorkout = isTodayQPastWorkoutTime(nextQSlot);

        dashboardCtaSection = document.createElement("div");
        dashboardCtaSection.classList.add(
            "section",
            "dashboard-hero-section"
        );

        const nextQHeading = document.createElement("div");
        nextQHeading.classList.add("detail-label");
        nextQHeading.textContent = "My Next Q";

        const nextQCard = document.createElement("div");
        nextQCard.classList.add(
            "member-card",
            "dashboard-next-q-card",
            "dashboard-hero-card"
        );

        const nextQCardContent = document.createElement("div");

        const nextQActions = document.createElement("div");
        nextQActions.classList.add("q-slot-actions");

        const nextQTitle = document.createElement("div");
        nextQTitle.classList.add("member-name");
        nextQTitle.textContent = isTodayQ
            ? `Today's Q: ${ao?.name || "Unknown AO"}`
            : `Upcoming Q: ${ao?.name || "Unknown AO"}`;

        const nextQSubtitle = document.createElement("div");
        nextQSubtitle.classList.add("stats-line");

        nextQSubtitle.textContent = isTodayQ
            ? (displayTime ? `Today • ${displayTime}` : "Today")
            : (displayTime
                ? `${formatShortDate(nextQSlot.date)} • ${displayTime}`
                : formatShortDate(nextQSlot.date));

        const nextQPreview = document.createElement("div");
        nextQPreview.classList.add("stats-line");
        nextQPreview.textContent =
            isTodayQ && isPastTodayWorkout && !loggedSession
                ? "Workout Time Has Passed"
                : getWorkoutReadinessLabel(matchingWorkout);

        const nextQWeatherLine = document.createElement("div");
        nextQWeatherLine.classList.add("stats-line", "next-q-weather-line");

        if (weatherCacheKey) {
            nextQWeatherLine.dataset.nextQWeatherKey = weatherCacheKey;
        }

        const emphasisBadge = createWorkoutEmphasisBadge(nextQSlot, ao);

        renderNextQWeatherLine(nextQWeatherLine, nextQWeather);

        nextQCardContent.append(
            nextQTitle, 
        );
        if (emphasisBadge) {
            nextQCardContent.appendChild(emphasisBadge);
        };
        nextQCardContent.append(
            nextQSubtitle, 
            nextQPreview
        );

        if (weatherCacheKey) {
            nextQCardContent.appendChild(nextQWeatherLine);
        }

        const actionButton = document.createElement("button");
        actionButton.classList.add("primary-button");

        const allowLateWorkoutStart = hasPermission(PERMISSIONS.ACCESS_DEBUG_TOOLS);

        if (isTodayQ && isPastTodayWorkout && !loggedSession) {
            actionButton.textContent = "Log Session";
        
            actionButton.addEventListener("click", event => {
                event.stopPropagation();
        
                state.draftSession = {
                    id: crypto.randomUUID(),
                    date: nextQSlot.date,
                    aoId: ao?.id || nextQSlot.aoId || null,
                    siteId:
                        matchingWorkout?.siteId ||
                        nextQSite?.id ||
                        null,
                    startTime:
                        matchingWorkout?.startTime ||
                        nextQSlot.overrideTime ||
                        nextQSlot.startTime ||
                        null,
                    aoName: ao?.name || "",
                    qIds: state.currentUserMemberId ? [state.currentUserMemberId] : [],
                    attendeeIds: state.currentUserMemberId ? [state.currentUserMemberId] : [],
                    fngs: [],
                    notes: "",
                    workout: matchingWorkout || null,
                    sourcePlannedWorkoutId: matchingWorkout?.id || null,
                    sourceQSlotId:
                        matchingWorkout?.sourceQSlotId ||
                        nextQSlot.id,
                    createdByUserId: state.currentUserId,
                    createdAt: Date.now(),
                    backblastText: "",
                };
        
                state.editingSessionId = null;
                navigateTo("session");
            });
        
            const alreadyLoggedButton = document.createElement("button");
            alreadyLoggedButton.classList.add("secondary-button");
            alreadyLoggedButton.textContent = "Already Logged";
        
            alreadyLoggedButton.addEventListener("click", event => {
                event.stopPropagation();
                markQSlotLoggedElsewhere(nextQSlot);
            });
        
            nextQActions.appendChild(alreadyLoggedButton);
        
        } else if (!hasPlannedWorkout) {
            actionButton.textContent = "Plan Workout";
        
            actionButton.addEventListener("click", event => {
                event.stopPropagation();
        
                const newWorkout = createBlankWorkout({
                    date: nextQSlot.date,
                    aoId: ao?.id || nextQSlot.aoId || null,
                    aoName: ao?.name || "",
                    siteId: nextQSite?.id || null,
                    qSlotId: nextQSlot.id,
                });
                
                savePlannerDraft(
                    createNewPlannerDraft(newWorkout)
                );
                
                state.selectedPlannedWorkoutId = null;
                state.returnToViewAfterPlanner = "dashboard";
                state.returnToLaunchModeAfterPlanner = null;
                
                navigateTo("workoutPlanner");
            });
        
        } else if (matchingWorkout && !matchingWorkout.isFinalized) {
            actionButton.textContent = "Continue Planning";
        
            actionButton.addEventListener("click", event => {
                event.stopPropagation();
        
                savePlannerDraft(
                    createExistingPlannerDraft(matchingWorkout)
                );
                
                state.selectedPlannedWorkoutId = null;
                state.returnToViewAfterPlanner = "dashboard";
                state.returnToLaunchModeAfterPlanner = null;
                
                navigateTo("workoutPlanner");
            });
        
        } else if (isTodayQ) {
            actionButton.textContent = "Start Today's Workout";
        
            actionButton.addEventListener("click", event => {
                event.stopPropagation();
        
                saveActiveWorkoutExecution(matchingWorkout, "dashboard_next_q");
                        
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = isTodayQ ? "execution" : null;
                navigateTo("plannedWorkoutDetail");

                logAppEvent({
                    type: APP_EVENTS.EXECUTION_STARTED,
                    metadata: {
                        plannedWorkoutId: matchingWorkout.id,
                        source: "dashboard_next_q",
                        aoName: matchingWorkout.aoName || null,
                        workoutDate: matchingWorkout.date || null,
                    },
                });
            });
        
        } else {
            actionButton.textContent = "View Workout";
        
            actionButton.addEventListener("click", event => {
                event.stopPropagation();
        
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = null;
                navigateTo("plannedWorkoutDetail");
            });
        }
        
        if (isTomorrowQ) {
            const preblastButton = document.createElement("button");
            preblastButton.textContent = "Post Preblast";

            preblastButton.addEventListener("click", (event) => {
                event.stopPropagation();

                const fallbackWorkout = {
                    date: nextQSlot.date,
                    aoId: ao?.id || nextQSlot.aoId || null,
                    aoName: ao?.name || "",
                    siteId: nextQSite?.id || null,
                    startTime:
                        nextQSlot.overrideTime ||
                        nextQSlot.startTime ||
                        null,
                };

                state.selectedPreblastQSlotId = nextQSlot.id;
                state.selectedPreblastWorkoutId = matchingWorkout?.id || null;

                state.draftPreblastText =
                    nextQSlot.preblastText ||
                    generatePreblast(matchingWorkout || fallbackWorkout, state.aos, state.sites);

                state.hasAddedPreblastForecast = false;
                navigateTo("preblast");
            });

            nextQActions.appendChild(preblastButton);
        }

        const unclaimButton = document.createElement("button");
        unclaimButton.classList.add("secondary-button");
        unclaimButton.textContent = "Unclaim Q";

        unclaimButton.addEventListener("click", async (event) => {
            event.stopPropagation();

            const result = await unclaimQSlot(nextQSlot);

            if (result?.success) {
                renderApp();
            }
        });

        nextQActions.appendChild(unclaimButton);

        nextQCard.addEventListener("click", () => {
            if (!hasPlannedWorkout) {
                const newWorkout = createBlankWorkout({
                    date: nextQSlot.date,
                    aoId: ao?.id || nextQSlot.aoId || null,
                    aoName: ao?.name || "",
                    siteId: nextQSite?.id || null,
                    qSlotId: nextQSlot.id,
                });
                
                savePlannerDraft(
                    createNewPlannerDraft(newWorkout)
                );
                
                state.selectedPlannedWorkoutId = null;
                state.returnToViewAfterPlanner = "dashboard";
                state.returnToLaunchModeAfterPlanner = null;
                
                navigateTo("workoutPlanner");
            } else {
                if (matchingWorkout && isTodayQ && isPastTodayWorkout && !loggedSession) {
                    state.draftSession = {
                        id: crypto.randomUUID(),
                        date: nextQSlot.date,
                        aoId: ao?.id || nextQSlot.aoId || null,
                        siteId:
                            matchingWorkout?.siteId ||
                            nextQSite?.id ||
                            null,
                        startTime:
                            matchingWorkout?.startTime ||
                            nextQSlot.overrideTime ||
                            nextQSlot.startTime ||
                            null,
                        aoName: ao?.name || "",
                        qIds: state.currentUserMemberId ? [state.currentUserMemberId] : [],
                        attendeeIds: state.currentUserMemberId ? [state.currentUserMemberId] : [],
                        fngs: [],
                        notes: "",
                        workout: matchingWorkout || null,
                        sourcePlannedWorkoutId: matchingWorkout?.id || null,
                        sourceQSlotId:
                            matchingWorkout?.sourceQSlotId ||
                            nextQSlot.id,
                        createdByUserId: state.currentUserId,
                        createdAt: Date.now(),
                        backblastText: "",
                    };
            
                    state.editingSessionId = null;
                    navigateTo("session");
                    return;
                }
            
                if (isTodayQ) {
                    saveActiveWorkoutExecution(matchingWorkout, "dashboard_next_q_card");
                }
            
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = isTodayQ ? "execution" : null;
                navigateTo("plannedWorkoutDetail");
            }
        });

        nextQActions.prepend(actionButton);
        nextQCard.append(nextQCardContent, nextQActions);
        dashboardCtaSection.append(nextQHeading, nextQCard);
        loadNextQWeather(nextQSlot, ao);
    }

    function renderNoUpcomingQSection() {
        const section = document.createElement("div");
        section.classList.add(
            "section",
            "dashboard-hero-section",
            "dashboard-empty-hero"
        );
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = "Next Action";
    
        const card = document.createElement("div");
        card.classList.add(
            "member-card",
            "dashboard-next-q-card",
            "dashboard-hero-card"
        );
    
        const content = document.createElement("div");
    
        const title = document.createElement("div");
        title.classList.add("member-name");
        title.textContent = "No Upcoming Qs";
    
        const subtitle = document.createElement("div");
        subtitle.classList.add("stats-line");
        subtitle.textContent = "Grab a spot on the schedule and start planning.";
    
        const actions = document.createElement("div");
        actions.classList.add("q-slot-actions");
    
        const claimButton = document.createElement("button");
        claimButton.classList.add("primary-button");
        claimButton.textContent = "Claim a Q Slot";
    
        claimButton.addEventListener("click", event => {
            event.stopPropagation();
            navigateTo("qSignup");
        });
    
        const scheduleButton = document.createElement("button");
        scheduleButton.classList.add("secondary-button");
        scheduleButton.textContent = "View Schedule";
    
        scheduleButton.addEventListener("click", event => {
            event.stopPropagation();
            navigateTo("weeklyQCalendar");
        });
    
        card.addEventListener("click", () => {
            navigateTo("qSignup");
        });
    
        content.append(title, subtitle);
        actions.append(claimButton, scheduleButton);
        card.append(content, actions);
        section.append(heading, card);
    
        return section;
    }

    function renderTomorrowCommitmentsSection() {
        if (tomorrowQSlots.length === 0) {
            return null;
        }

        const isSectionExpanded =
            Boolean(
                state.dashboardTomorrowCommitmentsExpanded
    );
    
        const section =
            document.createElement("div");
    
        section.classList.add(
            "section",
            "dashboard-commitments-section"
        );
    
        const headingButton =
            document.createElement("button");

        headingButton.type = "button";

        headingButton.classList.add(
            "dashboard-commitments-heading"
        );

        headingButton.setAttribute(
            "aria-expanded",
            String(isSectionExpanded)
        );

        if (isSectionExpanded) {
            headingButton.classList.add("expanded");
        }

        const headingText =
            document.createElement("div");

        headingText.classList.add(
            "dashboard-commitments-heading-text"
        );

        const eyebrow =
            document.createElement("div");

        eyebrow.classList.add(
            "detail-label",
            "dashboard-commitments-eyebrow"
        );

        eyebrow.textContent = "Tomorrow";

        const summary =
            document.createElement("div");

        summary.classList.add(
            "dashboard-commitments-summary"
        );

        summary.textContent =
            `${tomorrowQSlots.length} ${
                tomorrowQSlots.length === 1
                    ? "beatdown"
                    : "beatdowns"
            } available`;

        const helper =
            document.createElement("div");

        helper.classList.add(
            "dashboard-commitments-helper"
        );

        helper.textContent =
            isSectionExpanded
                ? "Choose an AO and set your commitment."
                : "Choose where you're posting";

        const sectionChevron =
            document.createElement("span");

        sectionChevron.classList.add(
            "dashboard-commitments-section-chevron"
        );

        sectionChevron.setAttribute(
            "aria-hidden",
            "true"
        );

        sectionChevron.textContent =
            isSectionExpanded ? "⌃" : "›";

        headingText.append(
            eyebrow,
            summary,
            helper
        );

        headingButton.append(
            headingText,
            sectionChevron
        );

        headingButton.addEventListener(
            "click",
            () => {
                state.dashboardTomorrowCommitmentsExpanded =
                    !state.dashboardTomorrowCommitmentsExpanded;

                if (
                    !state.dashboardTomorrowCommitmentsExpanded
                ) {
                    state.dashboardExpandedCommitmentSlotId =
                        null;

                    clearCommitmentEditor();
                }

                renderApp();
            }
        );
    
        const list =
            document.createElement("div");
    
        list.classList.add(
            "dashboard-commitment-list"
        );
    
        section.appendChild(
            headingButton
        );
        
        if (!isSectionExpanded) {
            return section;
        }
        
        section.appendChild(list);
    
        tomorrowQSlots.forEach(slot => {
            const ao = state.aos.find(
                candidate =>
                    candidate.id === slot.aoId
            );
    
            const q = state.members.find(
                member =>
                    member.id === slot.qUserId
            );
    
            const summary =
                state
                    .qSlotCommitmentSummariesBySlotId?.[
                        slot.id
                    ];
    
            const isUpdating =
                Boolean(
                    state
                        .qSlotCommitmentLoadingBySlotId?.[
                            slot.id
                        ]
                );
    
            const isExpanded =
                state.dashboardExpandedCommitmentSlotId ===
                slot.id;
    
            const detailsAreLoading =
                Boolean(
                    state
                        .qSlotCommitmentDetailsLoadingBySlotId?.[
                            slot.id
                        ]
                );
    
            const detailsFailed =
                Boolean(
                    state
                        .qSlotCommitmentDetailsErrorBySlotId?.[
                            slot.id
                        ]
                );
    
            const commitments =
                state.qSlotCommitmentsBySlotId?.[
                    slot.id
                ];
    
            const row =
                document.createElement("div");
    
            row.classList.add(
                "dashboard-commitment-row"
            );
    
            if (isExpanded) {
                row.classList.add("expanded");
            }
    
            const summaryRow =
                document.createElement("div");
    
            summaryRow.classList.add(
                "dashboard-commitment-summary-row"
            );
    
            const identity =
                document.createElement("button");
    
            identity.type = "button";
    
            identity.classList.add(
                "dashboard-commitment-identity"
            );
    
            identity.setAttribute(
                "aria-expanded",
                String(isExpanded)
            );
    
            const title =
                document.createElement("div");
    
            title.classList.add(
                "dashboard-commitment-ao"
            );
    
            title.textContent =
                ao?.name || "Unknown AO";
    
            const displayTime =
                getSlotDisplayTime(slot, ao);
    
            const meta =
                document.createElement("div");
    
            meta.classList.add(
                "dashboard-commitment-meta"
            );
    
            meta.textContent = [
                displayTime || null,
                q?.paxName ||
                    q?.realName ||
                    "Q Assigned",
            ]
                .filter(Boolean)
                .join(" · ");
    
            identity.append(
                title,
                meta
            );
    
            const controls =
                document.createElement("div");
    
            controls.classList.add(
                "dashboard-commitment-inline-controls"
            );
    
            const hcButton =
                document.createElement("button");
    
            hcButton.type = "button";
    
            hcButton.classList.add(
                "dashboard-commitment-choice",
                "dashboard-commitment-choice-hc"
            );
    
            hcButton.textContent =
                summary
                    ? `HC ${summary.hcCount}`
                    : "HC —";
    
            if (summary?.myCommitment === "hc") {
                hcButton.classList.add("selected");
            }
    
            hcButton.disabled =
                isUpdating || !summary;
    
            hcButton.setAttribute(
                "aria-pressed",
                String(
                    summary?.myCommitment === "hc"
                )
            );
    
            hcButton.addEventListener(
                "click",
                async event => {
                    event.stopPropagation();
    
                    await updateMyQSlotCommitment(
                        slot.id,
                        "hc"
                    );
                }
            );
    
            const scButton =
                document.createElement("button");
    
            scButton.type = "button";
    
            scButton.classList.add(
                "dashboard-commitment-choice",
                "dashboard-commitment-choice-sc"
            );
    
            scButton.textContent =
                summary
                    ? `SC ${summary.scCount}`
                    : "SC —";
    
            if (summary?.myCommitment === "sc") {
                scButton.classList.add("selected");
            }
    
            scButton.disabled =
                isUpdating || !summary;
    
            scButton.setAttribute(
                "aria-pressed",
                String(
                    summary?.myCommitment === "sc"
                )
            );
    
            scButton.addEventListener(
                "click",
                async event => {
                    event.stopPropagation();
    
                    await updateMyQSlotCommitment(
                        slot.id,
                        "sc"
                    );
                }
            );
    
            const expandButton =
                document.createElement("button");
    
            expandButton.type = "button";
    
            expandButton.classList.add(
                "dashboard-commitment-expand-button"
            );
    
            expandButton.setAttribute(
                "aria-expanded",
                String(isExpanded)
            );
    
            expandButton.setAttribute(
                "aria-label",
                isExpanded
                    ? `Hide commitments for ${ao?.name || "this AO"}`
                    : `Show commitments for ${ao?.name || "this AO"}`
            );
    
            expandButton.textContent =
                isExpanded ? "⌃" : "›";
    
            const toggleExpanded =
                async () => {
                    const willExpand =
                        state
                            .dashboardExpandedCommitmentSlotId !==
                        slot.id;
    
                    state.dashboardExpandedCommitmentSlotId =
                        willExpand
                            ? slot.id
                            : null;

                    clearCommitmentEditor();
    
                    renderApp();
    
                    if (willExpand) {
                        const nextCommitments = {
                            ...(
                                state.qSlotCommitmentsBySlotId ||
                                {}
                            ),
                        };
                    
                        delete nextCommitments[slot.id];
                    
                        state.qSlotCommitmentsBySlotId =
                            nextCommitments;
                    
                        await loadCommitmentDetailsForSlot(
                            slot.id
                        );
                    }
                };
    
            identity.addEventListener(
                "click",
                toggleExpanded
            );
    
            expandButton.addEventListener(
                "click",
                event => {
                    event.stopPropagation();
                    toggleExpanded();
                }
            );
    
            controls.append(
                hcButton,
                scButton,
                expandButton
            );
    
            summaryRow.append(
                identity,
                controls
            );
    
            row.appendChild(summaryRow);
    
            if (isExpanded) {
                const expandedDetails =
                    document.createElement("div");
    
                expandedDetails.classList.add(
                    "dashboard-commitment-expanded"
                );
    
                if (detailsAreLoading) {
                    const loading =
                        document.createElement("div");
    
                    loading.classList.add("stats-line");
                    loading.textContent =
                        "Loading commitments...";
    
                    expandedDetails.appendChild(loading);
                } else if (detailsFailed) {
                    const failed =
                        document.createElement("div");
    
                    failed.classList.add("stats-line");
                    failed.textContent =
                        "Commitments could not be loaded.";
    
                    const retryButton =
                        document.createElement("button");
    
                    retryButton.type = "button";
    
                    retryButton.classList.add(
                        "secondary-button",
                        "small-action-button"
                    );
    
                    retryButton.textContent = "Retry";
    
                    retryButton.addEventListener(
                        "click",
                        async event => {
                            event.stopPropagation();
    
                            const nextDetails = {
                                ...(
                                    state
                                        .qSlotCommitmentsBySlotId ||
                                    {}
                                ),
                            };
    
                            delete nextDetails[slot.id];
    
                            state.qSlotCommitmentsBySlotId =
                                nextDetails;
    
                            await loadCommitmentDetailsForSlot(
                                slot.id
                            );
                        }
                    );
    
                    expandedDetails.append(
                        failed,
                        retryButton
                    );
                } else if (
                    Array.isArray(commitments) &&
                    commitments.length === 0
                ) {
                    const empty =
                        document.createElement("div");
                
                    empty.classList.add(
                        "stats-line",
                        "dashboard-commitment-empty"
                    );
                
                    empty.textContent =
                        "No commitments yet.";
                
                    expandedDetails.appendChild(empty);
                
                    if (
                        canManageCommitmentsForSlot(slot)
                    ) {
                        expandedDetails.appendChild(
                            createManagedCommitmentAdder(
                                slot,
                                commitments
                            )
                        );
                    }
                } else if (
                    Array.isArray(commitments)
                ) {
                    const hardCommits =
                        commitments.filter(
                            commitment =>
                                commitment.commitmentType ===
                                "hc"
                        );
    
                    const softCommits =
                        commitments.filter(
                            commitment =>
                                commitment.commitmentType ===
                                "sc"
                        );
    
                    if (hardCommits.length > 0) {
                        expandedDetails.appendChild(
                            createCommitmentNameGroup(
                                "Hard Commits",
                                commitments,
                                "hc",
                                slot
                            )
                        );
                    }
    
                    if (softCommits.length > 0) {
                        expandedDetails.appendChild(
                            createCommitmentNameGroup(
                                "Soft Commits",
                                commitments,
                                "sc",
                                slot
                            )
                        );
                    }

                    if (
                        canManageCommitmentsForSlot(slot)
                    ) {
                        expandedDetails.appendChild(
                            createManagedCommitmentAdder(
                                slot,
                                commitments
                            )
                        );
                    }
                }
    
                row.appendChild(expandedDetails);
            }
    
            list.appendChild(row);
        });
    
        return section;
    }

    function renderAnnouncementsSection() {
        const announcements =
            state.announcements || [];
    
        if (announcements.length === 0) {
            return null;
        }
    
        const section =
            document.createElement("section");
    
        section.classList.add(
            "section",
            "dashboard-announcements-section"
        );
    
        const header =
            document.createElement("div");
    
        header.classList.add(
            "dashboard-section-header"
        );
    
        const heading =
            document.createElement("div");
    
        heading.classList.add("detail-label");
        heading.textContent = "Announcements";
    
        const count =
            document.createElement("div");
    
        count.classList.add(
            "dashboard-section-count"
        );
    
        count.textContent =
            String(announcements.length);
    
        header.append(
            heading,
            count
        );
    
        const deck =
            document.createElement("div");
    
        deck.classList.add(
            "dashboard-card-deck",
            "dashboard-announcements-deck"
        );
    
        announcements.forEach(
            announcement => {
                const isExpanded =
                    state
                        .expandedDashboardAnnouncementId ===
                    announcement.id;
    
                const card =
                    document.createElement("article");
    
                card.classList.add(
                    "dashboard-deck-card",
                    "dashboard-announcement-v2-card"
                );
    
                if (isExpanded) {
                    card.classList.add("expanded");
                }
    
                const cardButton =
                    document.createElement("button");
    
                cardButton.type = "button";
    
                cardButton.classList.add(
                    "dashboard-announcement-v2-toggle"
                );
    
                cardButton.setAttribute(
                    "aria-expanded",
                    String(isExpanded)
                );
    
                const titleRow =
                    document.createElement("div");

                titleRow.classList.add(
                    "dashboard-announcement-v2-title-row"
                );

                const title =
                    document.createElement("div");

                title.classList.add(
                    "dashboard-announcement-v2-title"
                );

                title.textContent =
                    announcement.title ||
                    "Announcement";

                const arrow =
                    createIcon(
                        isExpanded
                            ? "chevronUp"
                            : "chevronRight",
                        "dashboard-announcement-v2-arrow"
                    );

                arrow.setAttribute(
                    "aria-hidden",
                    "true"
                );

                titleRow.append(
                    title,
                    arrow
                );
    
                const preview =
                    document.createElement("div");
    
                preview.classList.add(
                    "dashboard-announcement-v2-preview"
                );
    
                preview.textContent =
                    announcement.body ||
                    "Tap to read more.";
    
                const actionLabel =
                    document.createElement("div");
    
                actionLabel.classList.add(
                    "dashboard-announcement-v2-action"
                );
    
                actionLabel.textContent =
                    isExpanded
                        ? "Hide details"
                        : "Read announcement";
    
                cardButton.append(
                    titleRow,
                    preview,
                    actionLabel
                );
    
                cardButton.addEventListener("click", () => {
                    const previousScroll =
                        deck.scrollLeft;
                
                    state.expandedDashboardAnnouncementId =
                        isExpanded
                            ? null
                            : announcement.id;
                
                    renderApp();
                
                    requestAnimationFrame(() => {
                        const nextDeck =
                            document.querySelector(
                                ".dashboard-announcements-deck"
                            );
                
                        if (nextDeck) {
                            nextDeck.scrollLeft =
                                previousScroll;
                        }
                    });
                });
    
                card.appendChild(cardButton);
    
                if (isExpanded) {
                    const expanded =
                        document.createElement("div");
    
                    expanded.classList.add(
                        "dashboard-announcement-v2-expanded"
                    );
    
                    const body =
                        document.createElement("div");
    
                    body.classList.add(
                        "dashboard-announcement-v2-body"
                    );
    
                    body.textContent =
                        announcement.body || "";
    
                    expanded.appendChild(body);
    
                    if (announcement.linkUrl) {
                        const link =
                            document.createElement("a");
    
                        link.href =
                            announcement.linkUrl;
    
                        link.target = "_blank";
    
                        link.rel =
                            "noopener noreferrer";
    
                        link.textContent =
                            announcement.linkLabel ||
                            "Open Link";
    
                        link.classList.add(
                            "dashboard-announcement-v2-link"
                        );
    
                        expanded.appendChild(link);
                    }
    
                    card.appendChild(expanded);
                }
    
                deck.appendChild(card);
            }
        );
    
        section.append(
            header,
            deck
        );
    
        return section;
    }

    function renderMyUpcomingQs() {
        const mySlots =
            myUpcomingQSlots.slice(1);
    
        const section =
            document.createElement("section");
    
        section.classList.add(
            "section",
            "dashboard-upcoming-qs-section"
        );
    
        const header =
            document.createElement("div");
    
        header.classList.add(
            "dashboard-section-header"
        );
    
        const heading =
            document.createElement("div");
    
        heading.classList.add("detail-label");
        heading.textContent = "Upcoming Qs";
    
        header.appendChild(heading);
    
        section.appendChild(header);
    
        if (mySlots.length === 0) {
            const empty =
                document.createElement("div");
    
            empty.classList.add(
                "dashboard-upcoming-q-empty"
            );
    
            const emptyTitle =
                document.createElement("div");
    
            emptyTitle.classList.add(
                "dashboard-upcoming-q-empty-title"
            );
    
            emptyTitle.textContent =
                "No other upcoming Qs";
    
            const emptyCopy =
                document.createElement("div");
    
            emptyCopy.classList.add(
                "stats-line"
            );
    
            emptyCopy.textContent =
                "Claim another spot when you're ready.";
    
            const claimButton =
                document.createElement("button");
    
            claimButton.type = "button";
    
            claimButton.classList.add(
                "secondary-button",
                "dashboard-upcoming-q-empty-action"
            );
    
            claimButton.textContent =
                "View Q Signup";
    
            claimButton.addEventListener(
                "click",
                () => {
                    navigateTo("qSignup");
                }
            );
    
            empty.append(
                emptyTitle,
                emptyCopy,
                claimButton
            );
    
            section.appendChild(empty);
    
            return section;
        }
    
        const deck =
            document.createElement("div");
    
        deck.classList.add(
            "dashboard-card-deck",
            "dashboard-upcoming-q-deck"
        );
    
        mySlots.forEach(slot => {
            const ao =
                state.aos.find(
                    candidate =>
                        candidate.id === slot.aoId
                );
        
            const site = resolveSiteForQSlot(
                slot,
                ao
            );
        
            const matchingWorkout =
                findMatchingPlannedWorkoutForSlot(
                    slot
                );
    
            const hasPlannedWorkout =
                Boolean(matchingWorkout);
    
            const dateParts =
                slot.date
                    .split("-")
                    .map(Number);
    
            const slotDate =
                new Date(
                    dateParts[0],
                    dateParts[1] - 1,
                    dateParts[2]
                );
    
            const card =
                document.createElement("article");
    
            card.classList.add(
                "dashboard-deck-card",
                "dashboard-upcoming-q-card"
            );
    
            card.tabIndex = 0;
    
            card.setAttribute(
                "role",
                "button"
            );
    
            const openSlot =
                () => {
                    if (!matchingWorkout) {
                        const newWorkout =
                            createBlankWorkout({
                                date: slot.date,
                                aoId:
                                    ao?.id ||
                                    slot.aoId ||
                                    null,
    
                                aoName:
                                    ao?.name ||
                                    "",
    
                                siteId:
                                    site?.id ||
                                    null,
    
                                qSlotId:
                                    slot.id,
                            });
    
                        savePlannerDraft(
                            createNewPlannerDraft(
                                newWorkout
                            )
                        );
    
                        state.selectedPlannedWorkoutId =
                            null;
    
                        state.returnToViewAfterPlanner =
                            "dashboard";
    
                        state.returnToLaunchModeAfterPlanner =
                            null;
    
                        navigateTo(
                            "workoutPlanner"
                        );
    
                        return;
                    }
    
                    if (!matchingWorkout.isFinalized) {
                        savePlannerDraft(
                            createExistingPlannerDraft(
                                matchingWorkout
                            )
                        );
    
                        state.selectedPlannedWorkoutId =
                            null;
    
                        state.returnToViewAfterPlanner =
                            "dashboard";
    
                        state.returnToLaunchModeAfterPlanner =
                            null;
    
                        navigateTo(
                            "workoutPlanner"
                        );
    
                        return;
                    }
    
                    state.selectedPlannedWorkoutId =
                        matchingWorkout.id;
    
                    state.plannedWorkoutLaunchMode =
                        slot.date === today
                            ? "execution"
                            : null;
    
                    navigateTo(
                        "plannedWorkoutDetail"
                    );
                };
    
            card.addEventListener(
                "click",
                openSlot
            );
    
            card.addEventListener(
                "keydown",
                event => {
                    if (
                        event.key !== "Enter" &&
                        event.key !== " "
                    ) {
                        return;
                    }
    
                    event.preventDefault();
                    openSlot();
                }
            );
    
            const topRow =
                document.createElement("div");
    
            topRow.classList.add(
                "dashboard-upcoming-q-top-row"
            );
    
            const dateBlock =
                document.createElement("div");
    
            dateBlock.classList.add(
                "dashboard-upcoming-q-date"
            );
    
            const month =
                document.createElement("div");
    
            month.classList.add(
                "dashboard-upcoming-q-month"
            );
    
            month.textContent =
                slotDate
                    .toLocaleDateString(
                        undefined,
                        {
                            month: "short",
                        }
                    )
                    .toUpperCase();
    
            const day =
                document.createElement("div");
    
            day.classList.add(
                "dashboard-upcoming-q-day"
            );
    
            day.textContent =
                String(
                    slotDate.getDate()
                );
    
            dateBlock.append(
                month,
                day
            );
    
            const arrow =
                document.createElement("span");
    
            arrow.classList.add(
                "dashboard-upcoming-q-arrow"
            );
    
            arrow.setAttribute(
                "aria-hidden",
                "true"
            );
    
            arrow.textContent = "›";
    
            topRow.append(
                dateBlock,
                arrow
            );
    
            const weekday =
                document.createElement("div");
    
            weekday.classList.add(
                "dashboard-upcoming-q-weekday"
            );
    
            weekday.textContent =
                slotDate.toLocaleDateString(
                    undefined,
                    {
                        weekday: "long",
                    }
                );
    
            const aoName =
                document.createElement("div");
    
            aoName.classList.add(
                "dashboard-upcoming-q-ao"
            );
    
            aoName.textContent =
                ao?.name ||
                "Unknown AO";
    
            const displayTime =
                getSlotDisplayTime(
                    slot,
                    ao
                );
    
            const meta =
                document.createElement("div");
    
            meta.classList.add(
                "dashboard-upcoming-q-meta"
            );
    
            meta.textContent =
                displayTime ||
                "Time not set";
    
            const emphasisBadge =
                createWorkoutEmphasisBadge(
                    slot,
                    ao
                );
    
            if (emphasisBadge) {
                emphasisBadge.classList.add(
                    "dashboard-upcoming-q-emphasis"
                );
            }
    
            const status =
                document.createElement("div");
    
            status.classList.add(
                "dashboard-status-pill",
                getWorkoutReadinessClass(
                    matchingWorkout
                )
            );
    
            status.textContent =
                hasPlannedWorkout
                    ? getWorkoutReadinessLabel(
                        matchingWorkout
                    )
                    : "Needs BD";
    
            const footer =
                document.createElement("div");
    
            footer.classList.add(
                "dashboard-upcoming-q-footer"
            );
    
            const actionLabel =
                document.createElement("span");
    
            actionLabel.classList.add(
                "dashboard-upcoming-q-action-label"
            );
    
            actionLabel.textContent =
                !matchingWorkout
                    ? "Start planning"
                    : !matchingWorkout.isFinalized
                        ? "Continue planning"
                        : "View workout";
    
            const unclaimButton =
                document.createElement("button");
    
            unclaimButton.type = "button";
    
            unclaimButton.classList.add(
                "secondary-button",
                "dashboard-upcoming-q-unclaim"
            );
    
            unclaimButton.textContent =
                "Unclaim";
    
            unclaimButton.addEventListener(
                "click",
                async event => {
                    event.stopPropagation();
    
                    const result =
                        await unclaimQSlot(slot);
    
                    if (result?.success) {
                        renderApp();
                    }
                }
            );
    
            footer.append(
                actionLabel,
                unclaimButton
            );
    
            card.append(
                topRow,
                weekday,
                aoName,
                meta
            );
    
            if (emphasisBadge) {
                card.appendChild(
                    emphasisBadge
                );
            }
    
            card.append(
                status,
                footer
            );
    
            deck.appendChild(card);
        });
    
        section.appendChild(deck);
    
        return section;
    }

    const tomorrowCommitmentsSection =
        renderTomorrowCommitmentsSection();

    const myUpcomingQsSection =
        renderMyUpcomingQs();

    const announcementsSection =
        renderAnnouncementsSection();

    loadTomorrowCommitmentSummaries();

    function renderMyStatsSection() {
        const memberId =
            state.currentUserMemberId;
    
        if (!memberId) {
            return null;
        }
    
        const memberStatsKey =
            `${state.currentRegionId}__${memberId}`;
    
        const stats =
            state
                .memberDashboardStatsByMemberId?.[
                    memberStatsKey
                ] || null;
    
        if (!stats) {
            const workspaceGeneration =
                state.workspaceGeneration;
    
            loadMemberDashboardStats(
                state.currentRegionId,
                memberId
            )
                .then(loadedStats => {
                    if (
                        workspaceGeneration !==
                        state.workspaceGeneration
                    ) {
                        return;
                    }
    
                    state.memberDashboardStatsByMemberId = {
                        ...(
                            state
                                .memberDashboardStatsByMemberId ||
                            {}
                        ),
    
                        [memberStatsKey]:
                            loadedStats,
                    };
    
                    if (
                        state.currentView ===
                        "dashboard"
                    ) {
                        renderApp();
                    }
                })
                .catch(error => {
                    console.error(
                        "Failed to load member dashboard stats:",
                        error
                    );
                });
        }
    
        const section =
            document.createElement("section");
    
        section.classList.add(
            "section",
            "dashboard-stats-section"
        );
    
        const header =
            document.createElement("div");
    
        header.classList.add(
            "dashboard-section-header"
        );
    
        const heading =
            document.createElement("div");
    
        heading.classList.add(
            "detail-label"
        );
    
        heading.textContent =
            "My Stats";
    
        const profileButton =
            document.createElement("button");
    
        profileButton.type =
            "button";
    
        profileButton.classList.add(
            "dashboard-stats-profile-link"
        );
    
        profileButton.textContent =
            "View profile ›";
    
        profileButton.addEventListener(
            "click",
            () => {
                if (!linkedMember) {
                    return;
                }
    
                state.selectedPaxId =
                    linkedMember.id;
    
                navigateTo(
                    "paxProfile"
                );
            }
        );
    
        header.append(
            heading,
            profileButton
        );
    
        const card =
            document.createElement("div");
    
        card.classList.add(
            "dashboard-stats-summary-card"
        );
    
        const metricRow =
            document.createElement("div");
    
        metricRow.classList.add(
            "dashboard-stats-metric-row"
        );
    
        const metrics = [
            {
                label: "Posts",
                value:
                    stats?.posts ??
                    "—",
                action: "posts",
            },
            {
                label: "Qs Led",
                value:
                    stats?.qs ??
                    "—",
                action: "qs",
            },
            {
                label: "FNGs EH’d",
                value:
                    stats?.fngsEh ??
                    "—",
                action: null,
            },
        ];
    
        async function openMemberHistory(
            mode
        ) {
            const cacheKey =
                `${state.currentRegionId}__${memberId}__${mode}`;
    
            if (
                !state
                    .memberSessionsLoadedByMode?.[
                        cacheKey
                    ]
            ) {
                showToast(
                    "Loading full history...",
                    "info"
                );
            }
    
            const requestRegionId =
                state.currentRegionId;
    
            const requestGeneration =
                state.workspaceGeneration;
    
            const sessions =
                await loadMemberSessions(
                    requestRegionId,
                    memberId,
                    mode
                );
    
            const isCurrent =
                requestGeneration ===
                    state.workspaceGeneration &&
                requestRegionId ===
                    state.currentRegionId;
    
            if (!isCurrent) {
                return;
            }
    
            const existingIds =
                new Set(
                    state.sessions.map(
                        session =>
                            session.id
                    )
                );
    
            const newSessions =
                sessions.filter(
                    session =>
                        !existingIds.has(
                            session.id
                        )
                );
    
            state.sessions = [
                ...state.sessions,
                ...newSessions,
            ];
    
            state.memberSessionsLoadedByMode = {
                ...(
                    state
                        .memberSessionsLoadedByMode ||
                    {}
                ),
    
                [cacheKey]: true,
            };
    
            state.sessionHistoryFilterType =
                mode;
    
            state.sessionHistoryAoFilter =
                "";
    
            state.sessionHistorySearchTerm =
                "";
    
            navigateTo(
                "sessionHistory"
            );
        }
    
        metrics.forEach(metric => {
            const metricElement =
                metric.action
                    ? document.createElement(
                        "button"
                    )
                    : document.createElement(
                        "div"
                    );
    
            if (metric.action) {
                metricElement.type =
                    "button";
            }
    
            metricElement.classList.add(
                "dashboard-stats-metric"
            );
    
            const value =
                document.createElement("div");
    
            value.classList.add(
                "dashboard-stats-metric-value"
            );
    
            value.textContent =
                metric.value;
    
            const label =
                document.createElement("div");
    
            label.classList.add(
                "dashboard-stats-metric-label"
            );
    
            label.textContent =
                metric.label;
    
            metricElement.append(
                value,
                label
            );
    
            if (
                metric.action ===
                "posts"
            ) {
                metricElement.addEventListener(
                    "click",
                    () => {
                        openMemberHistory(
                            "attended"
                        );
                    }
                );
            }
    
            if (
                metric.action ===
                "qs"
            ) {
                metricElement.addEventListener(
                    "click",
                    () => {
                        openMemberHistory(
                            "q"
                        );
                    }
                );
            }
    
            metricRow.appendChild(
                metricElement
            );
        });
    
        const lastPostRow =
            document.createElement("button");
    
        lastPostRow.type =
            "button";
    
        lastPostRow.classList.add(
            "dashboard-stats-last-post"
        );
    
        const lastPostLabel =
            document.createElement("span");
    
        lastPostLabel.classList.add(
            "dashboard-stats-last-post-label"
        );
    
        lastPostLabel.textContent =
            "Last post";
    
        const lastPostValue =
            document.createElement("span");
    
        lastPostValue.classList.add(
            "dashboard-stats-last-post-value"
        );
    
        lastPostValue.textContent =
            stats?.lastPostDate
                ? formatMonthDayYear(
                    stats.lastPostDate
                )
                : "No posts yet";
    
        const lastPostArrow =
            document.createElement("span");
    
        lastPostArrow.classList.add(
            "dashboard-stats-last-post-arrow"
        );
    
        lastPostArrow.setAttribute(
            "aria-hidden",
            "true"
        );
    
        lastPostArrow.textContent =
            "›";
    
        lastPostRow.append(
            lastPostLabel,
            lastPostValue,
            lastPostArrow
        );
    
        lastPostRow.addEventListener(
            "click",
            async () => {
                if (
                    !stats?.lastPostDate
                ) {
                    return;
                }
    
                const requestRegionId =
                    state.currentRegionId;
    
                const requestGeneration =
                    state.workspaceGeneration;
    
                const session =
                    await loadMemberSessionByDate(
                        requestRegionId,
                        memberId,
                        stats.lastPostDate,
                        "attended"
                    );
    
                const isCurrent =
                    requestGeneration ===
                        state.workspaceGeneration &&
                    requestRegionId ===
                        state.currentRegionId;
    
                if (
                    !isCurrent ||
                    !session
                ) {
                    return;
                }
    
                const alreadyLoaded =
                    state.sessions.some(
                        candidate =>
                            candidate.id ===
                            session.id
                    );
    
                if (!alreadyLoaded) {
                    state.sessions = [
                        ...state.sessions,
                        session,
                    ];
                }
    
                state.selectedSessionId =
                    session.id;
    
                navigateTo(
                    "sessionDetail"
                );
            }
        );
    
        card.append(
            metricRow,
            lastPostRow
        );
    
        section.append(
            header,
            card
        );
    
        return section;
    }
    const myStatsSection = renderMyStatsSection();

    const nav = createGlobalNav();

    const primaryActionsRow = createPrimaryActionsRow();

    const activeHeroSection =
        resumeWorkoutSection ||
        dashboardCtaSection;

    app.append(
        dashboardHeader,
        userRow,

        activeHeroSection,

        primaryActionsRow,
    
        ...(tomorrowCommitmentsSection
            ? [tomorrowCommitmentsSection]
            : []),
    
        myUpcomingQsSection,
    
        ...(announcementsSection
            ? [announcementsSection]
            : []),
    
        ...(myStatsSection
            ? [myStatsSection]
            : []),

        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}