import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatShortDate, formatDate, getTodayDate, formatMonthDayYear } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { 
    loadMemberDashboardStats, 
    loadMemberSessionByDate, 
    loadMemberSessions, 
    loadRecentMemberActivity,
 } from "../services/cloudData.js";
 import { updateSession } from "../services/appData.js";
import { navigateTo } from "../utils/navigation.js";
import { generatePreblast } from "../modules/generatePreblast.js";
import { showToast } from "../utils/toast.js";
import { unclaimQSlot } from "../services/qSlots.js";
import { createIcon, createWeatherIcon } from "../utils/icons.js";
import { getAoWeather } from "../services/weather.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import { logAppEvent } from "../services/appEvents.js";
import { createWorkoutEmphasisBadge } from "../components/workoutEmphasisBadge.js";
import { releaseWakeLock } from "../utils/wakelock.js";
import { getSessionDisplayCounts } from "../utils/sessionAttendance.js";
import { getDashboardLeadershipBadge } from "../utils/leadership.js";
import { findWorkoutForQSlot } from "../utils/qSlotMatching.js";
import { createAppHeader } from "../components/appHeader.js";
import { clearPlannerDraft, savePlannerDraft, createNewPlannerDraft, createExistingPlannerDraft } from "../services/plannerDraftRepository.js";
import { switchWorkspace } from "../services/workspaceService.js";

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

    const dashboardHeader = document.createElement("div");
    dashboardHeader.classList.add("dashboard-header");

    const title = document.createElement("h1");
    title.textContent = state.regionName || "F3 App";

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.classList.add("hamburger-button");
    menuButton.setAttribute("aria-label", "Open menu");
    menuButton.textContent = "☰";

    menuButton.addEventListener("click", () => {
        state.isMainMenuOpen = true;
        document.body.classList.add("menu-open");
        renderApp();
    });

    dashboardHeader.append(title, menuButton);

    let regionSwitcher = null;
    let regionSwitcherLabel = null;

    if (hasPermission(PERMISSIONS.ACCESS_DEBUG_TOOLS) && state.availableRegions?.length) {
        regionSwitcherLabel = document.createElement("div");
        regionSwitcherLabel.classList.add("detail-label");
        regionSwitcherLabel.textContent = "Debug Region";
        
        regionSwitcher = document.createElement("select");

        const profileOption = document.createElement("option");
        profileOption.value = "";
        profileOption.textContent = "Use Profile Region";
        regionSwitcher.appendChild(profileOption);

        state.availableRegions.forEach(region => {
            const option = document.createElement("option");
            option.value = region.id;
            option.textContent = region.name;
            regionSwitcher.appendChild(option);
        });

        regionSwitcher.value = state.regionOverrideId || "";

        regionSwitcher.addEventListener("change", async event => {
            const selectedRegionId =
                event.target.value || null;
        
            state.regionOverrideId =
                selectedRegionId;
        
            const activeRegionId =
                selectedRegionId ||
                state.profileRegionId;
        
            const loaded = await switchWorkspace(
                activeRegionId,
                {
                    onAccessDenied: () => {
                        state.currentView =
                            "regionGate";
        
                        renderApp();
                    },
                }
            );
        
            if (!loaded) {
                return;
            }
        
            clearPlannerDraft();
        
            state.selectedPlannedWorkoutId = null;
            state.draftSession = null;
            state.editingSessionId = null;
            state.selectedSessionId = null;
            state.plannedWorkoutLaunchMode = null;
            state.qSignupAoFilter = null;
            state.hasInitializedQSignupFilter = false;
        
            renderApp();
        });
}

    const userRow = document.createElement("div");
    userRow.classList.add("user-row");

    const roleBadge = document.createElement("span");
    roleBadge.classList.add("role-badge");

    const role = state.currentUserRole || "pax";

    roleBadge.dataset.role = role;
    roleBadge.textContent = getDashboardLeadershipBadge();

    const linkedMember = state.members.find(
        member => member.id === state.currentUserMemberId
    );

    const userName = document.createElement("button");
    userName.type = "button";
    userName.classList.add("user-name", "dashboard-profile-link");

    const userNameText = document.createElement("span");
    userNameText.textContent =
        linkedMember?.paxName ||
        state.currentUserDisplayName ||
        "User";

    const profileChevron = document.createElement("span");
    profileChevron.classList.add("dashboard-profile-chevron");
    profileChevron.setAttribute("aria-hidden", "true");
    profileChevron.textContent = "›";

    userName.append(userNameText, profileChevron);

    userName.setAttribute("aria-label", "View my profile");

    userName.addEventListener("click", () => {
        if (!linkedMember) return;

        state.selectedPaxId = linkedMember.id;
        navigateTo("paxProfile");
    });

    const userLeft = document.createElement("div");
    userLeft.classList.add("user-left");
    userLeft.append(roleBadge, userName);

    userRow.append(userLeft);

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
        const row = document.createElement("div");
        row.classList.add("dashboard-primary-actions");

        const qSignupButton = document.createElement("button");
        qSignupButton.classList.add("primary-action-card");
        qSignupButton.textContent = "Q Signup";

        qSignupButton.addEventListener("click", () => {
            navigateTo("qSignup");
        });

        const weeklyQButton = document.createElement("button");
        weeklyQButton.classList.add("primary-action-card");
        weeklyQButton.textContent = "Weekly Q Schedule";

        weeklyQButton.addEventListener("click", () => {
            navigateTo("weeklyQCalendar");
        });

        row.append(qSignupButton, weeklyQButton);

        return row;
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
        section.classList.add("section");
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = "Workout In Progress";
    
        const card = document.createElement("div");
        card.classList.add("member-card", "dashboard-next-q-card");
    
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

        if (!slot || !ao || !targetDateTime) {
            return null;
        }

        return `${ao.id}__${targetDateTime}`;
    }

    async function loadNextQWeather(slot, ao) {
        const targetDateTime = getNextQTargetDateTime(slot, ao);
        const cacheKey = getWeatherCacheKey(slot, ao);

        if (!ao?.id || !targetDateTime || !cacheKey) {
            return;
        }

        if (state.weatherByAoDate?.[cacheKey]) {
            return;
        }

        state.weatherByAoDate = state.weatherByAoDate || {};
        state.weatherByAoDate[cacheKey] = {
            isLoading: true,
        };

        patchNextQWeather(cacheKey);

        try {
            const weather = await getAoWeather(ao.id, targetDateTime);

            state.weatherByAoDate[cacheKey] = weather;
        } catch (error) {
            console.error("Failed to load next Q weather:", error);

            state.weatherByAoDate[cacheKey] = {
                weatherUnavailable: true,
            };
        }

        if (state.currentView === "dashboard") {
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

        weatherLine.textContent = `${tempLabel} · ${humidityLabel} · ${rainLabel} · ${windLabel}`;
    }

    function patchNextQWeather(cacheKey) {
        const weatherLine = document.querySelector(
            `[data-next-q-weather-key="${cacheKey}"]`
        );

        if (!weatherLine) return;

        renderNextQWeatherLine(
            weatherLine,
            state.weatherByAoDate?.[cacheKey]
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
    
        const dayKey = String(getDayOfWeekFromDateKey(slot.date));
    
        return (
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

    const activeExecution = getActiveWorkoutExecution();
    const resumeWorkoutSection = renderResumeWorkoutSection(activeExecution);

    let dashboardCtaSection = renderNoUpcomingQSection();

    if (nextQSlot) {
        const ao = state.aos.find(a => a.id === nextQSlot.aoId);
        const displayTime = getSlotDisplayTime(nextQSlot, ao);
        const weatherCacheKey = getWeatherCacheKey(nextQSlot, ao);
        const nextQWeather = weatherCacheKey
            ? state.weatherByAoDate?.[weatherCacheKey]
            : null;
        const matchingWorkout = findMatchingPlannedWorkoutForSlot(nextQSlot);
        const hasPlannedWorkout = Boolean(matchingWorkout);
        const isTodayQ = nextQSlot.date === today;
        const isTomorrowQ = nextQSlot.date === tomorrow;
        const loggedSession = findLoggedSessionForSlot(nextQSlot);
        const isPastTodayWorkout = isTodayQPastWorkoutTime(nextQSlot);

        dashboardCtaSection = document.createElement("div");
        dashboardCtaSection.classList.add("section");

        const nextQHeading = document.createElement("div");
        nextQHeading.classList.add("detail-label");
        nextQHeading.textContent = "My Next Q";

        const nextQCard = document.createElement("div");
        nextQCard.classList.add("member-card", "dashboard-next-q-card");

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
                        nextQSlot.siteId ||
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
                    siteId: nextQSlot.siteId || null,
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
                    siteId: nextQSlot.siteId || null,
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
                    siteId: nextQSlot.siteId || null,
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
                            nextQSlot.siteId ||
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
        section.classList.add("section");
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = "Next Action";
    
        const card = document.createElement("div");
        card.classList.add("member-card", "dashboard-next-q-card");
    
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

    function renderAnnouncementsSection() {
        const announcements = state.announcements || [];
    
        if (announcements.length === 0) {
            return null;
        }
    
        const isExpanded = Boolean(state.dashboardAnnouncementsExpanded);
    
        const section = document.createElement("div");
        section.classList.add(
            "section",
            "dashboard-announcements-section",
            "compact-announcements-section"
        );
    
        const headerButton = document.createElement("button");
        headerButton.type = "button";
        headerButton.classList.add("announcement-toggle-row");
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = `Announcements (${announcements.length})`;
    
        const toggleText = document.createElement("div");
        toggleText.classList.add("stats-line");
        toggleText.textContent = isExpanded ? "Hide" : "Show";
    
        headerButton.append(heading, toggleText);
    
        headerButton.addEventListener("click", () => {
            state.dashboardAnnouncementsExpanded = !state.dashboardAnnouncementsExpanded;
        
            if (!state.dashboardAnnouncementsExpanded) {
                state.expandedDashboardAnnouncementId = null;
            }
        
            renderApp();
        });
    
        const list = document.createElement("div");
        list.classList.add("announcement-list");
    
        const visibleAnnouncements = isExpanded
            ? announcements
            : announcements.slice(0, 1);
    
            visibleAnnouncements.forEach(announcement => {
                const isAnnouncementExpanded =
                    state.expandedDashboardAnnouncementId === announcement.id;
            
                const row = document.createElement("button");
                row.type = "button";
                row.classList.add("announcement-inline-row", "announcement-title-only-row");
            
                const title = document.createElement("div");
                title.classList.add("member-name", "announcement-title");
                title.textContent = announcement.title || "📣 Announcement";
            
                row.appendChild(title);
            
                row.addEventListener("click", () => {
                    state.expandedDashboardAnnouncementId = isAnnouncementExpanded
                        ? null
                        : announcement.id;
            
                    renderApp();
                });
            
                list.appendChild(row);
            
                if (isAnnouncementExpanded) {
                    const body = document.createElement("div");
                    body.classList.add("stats-line", "announcement-body", "announcement-expanded-body");
                    body.textContent = announcement.body || "";
                
                    list.appendChild(body);
                
                    if (announcement.linkUrl) {
                        const link = document.createElement("a");
                        link.href = announcement.linkUrl;
                        link.target = "_blank";
                        link.rel = "noopener noreferrer";
                        link.textContent = announcement.linkLabel || "Open Link";
                        link.classList.add("secondary-button", "announcement-link-button");
                
                        list.appendChild(link);
                    }
                }
            });
    
        section.append(headerButton, list);
    
        return section;
    }

    function renderMyUpcomingQs() {
        const mySlots = myUpcomingQSlots.slice(1);

        const section = document.createElement("div");
        section.classList.add("section");

        const heading = document.createElement("div");
        heading.textContent = "My Qs";
        heading.classList.add("detail-label");
        section.appendChild(heading); 

        if (mySlots.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No other upcoming Qs."
            section.appendChild(empty);
            return section;
        }

        mySlots.forEach(slot => {
            const row = document.createElement("div");
            row.classList.add("selected-summary-row");
            row.style.cursor = "pointer";

            row.addEventListener("click", () => {
                const matchingWorkout = findMatchingPlannedWorkoutForSlot(slot);
                const ao = state.aos.find(a => a.id === slot.aoId);

                if (!matchingWorkout) {
                    const newWorkout = createBlankWorkout({
                        date: slot.date,
                        aoId: ao?.id || slot.aoId || null,
                        aoName: ao?.name || "",
                        siteId: slot.siteId || null,
                        qSlotId: slot.id,
                    });
                    
                    savePlannerDraft(
                        createNewPlannerDraft(newWorkout)
                    );
                    
                    state.selectedPlannedWorkoutId = null;
                    state.returnToViewAfterPlanner = "dashboard";
                    state.returnToLaunchModeAfterPlanner = null;
                    
                    navigateTo("workoutPlanner");
                } else {
                    if (!matchingWorkout.isFinalized) {

                        savePlannerDraft(
                            createExistingPlannerDraft(matchingWorkout)
                        );
                    
                        state.selectedPlannedWorkoutId = null;
                        state.returnToViewAfterPlanner = "dashboard";
                        state.returnToLaunchModeAfterPlanner = null;
                    
                        navigateTo("workoutPlanner");
                        return;
                    }
                
                    state.selectedPlannedWorkoutId = matchingWorkout.id;
                    state.plannedWorkoutLaunchMode =
                        slot.date === today ? "execution" : null;
                
                    navigateTo("plannedWorkoutDetail");
                }
            });

            const ao = state.aos.find(a => a.id === slot.aoId);
            const matchingWorkout = findMatchingPlannedWorkoutForSlot(slot);
            const hasPlannedWorkout = Boolean(matchingWorkout);

            const title = document.createElement("div");
            title.classList.add("member-name");
            title.textContent = `${formatDate(slot.date)} - ${ao?.name || "Unknown AO"}`;

            const status = document.createElement("div");
            status.classList.add(
                "dashboard-status-pill",
                getWorkoutReadinessClass(matchingWorkout),
            );
            status.textContent = hasPlannedWorkout 
                ? getWorkoutReadinessLabel(matchingWorkout)
                : "Needs BD";

            const rowText = document.createElement("div");
            rowText.classList.add("upcoming-q-row-text");
            
            const emphasisBadge = createWorkoutEmphasisBadge(slot, ao);
            
            rowText.append(title);
            
            if (emphasisBadge) {
                emphasisBadge.classList.add("dashboard-q-emphasis");
                rowText.appendChild(emphasisBadge);
            }

            const rowActions = document.createElement("div");
            rowActions.classList.add("upcoming-q-row-actions");

            const unclaimButton = document.createElement("button");
            unclaimButton.classList.add("secondary-button", "small-action-button");
            unclaimButton.textContent = "Unclaim";

            unclaimButton.addEventListener("click", async (event) => {
                event.stopPropagation();

                const result = await unclaimQSlot(slot);

                if (result?.success) {
                    renderApp();
                }
            });

            rowActions.append(status, unclaimButton);
            row.append(rowText, rowActions);

            section.appendChild(row);
        });

        return section;
    }

    const myUpcomingQsSection = renderMyUpcomingQs();

    const announcementsSection = renderAnnouncementsSection();

    function renderMyStatsSection() {
        const memberId = state.currentUserMemberId;

        if (!memberId) {
            return null;
        }

        const memberStatsKey = `${state.currentRegionId}__${memberId}`;
        const stats = state.memberDashboardStatsByMemberId?.[memberStatsKey] || null;
        
        if (!stats) {
            loadMemberDashboardStats(state.currentRegionId, memberId)
                .then(loadedStats => {
                    state.memberDashboardStatsByMemberId = {
                        ...(state.memberDashboardStatsByMemberId || {}),
                        [memberStatsKey]: loadedStats
                    };

                    if (state.currentView === "dashboard") {
                        renderApp();
                    }
                })
                .catch(error => {
                    console.error("Failed to load member dashboard stats:", error);
                });
        }

        const section = document.createElement("div");
        section.classList.add("section");

        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = "My Stats";

        const card = document.createElement("div");
        card.classList.add("member-card", "dashboard-stats-card");

        const grid = document.createElement("div");
        grid.classList.add("stats-grid");

        function getDaysAgoLabel(dateString) {
            if (!dateString) return "";
        
            const today = new Date();
            const target = new Date(dateString);
        
            today.setHours(0, 0, 0, 0);
            target.setHours(0, 0, 0, 0);
        
            const diffDays = Math.floor(
                (today - target) / (1000 * 60 * 60 * 24)
            );
        
            if (diffDays === 0) return "Today";
            if (diffDays === 1) return "1 day ago";
            return `${diffDays} days ago`;
        }

        const statItems = [
            { label: "Posts", value: stats?.posts ?? "...", icon: "posts", action: "posts" },
            { label: "Qs Led", value: stats?.qs ?? "...", icon: "qs", action: "qs" },
            { 
                label: "Last Post",
                value: stats?.lastPostDate ? formatMonthDayYear(stats.lastPostDate) : "...",
                subtext: stats?.lastPostDate ? getDaysAgoLabel(stats.lastPostDate) : "",
                type: "date",
                icon: "lastPost",
                action: "lastPost"
            },
            { 
                label: "Last Q", 
                value: stats?.lastQDate ? formatMonthDayYear(stats.lastQDate) : "...",
                subtext: stats?.lastQDate ? getDaysAgoLabel(stats.lastQDate) : "",
                type: "date",
                icon: "qs", 
                action:"lastQ" 
            },

            { label: "FNGs EH'd", value: stats?.fngsEh ?? "...", icon: "fngsEh" },

            { 
                label: "First Post",
                value: stats?.firstPostDate ? formatMonthDayYear(stats.firstPostDate) : "...",
                type: "date",
                icon: "fngDate",
                action: "firstPost"
            },
        ];

        async function hydrateMemberSessions(mode) {
            const cacheKey = `${state.currentRegionId}__${memberId}__${mode}`;
            state.memberSessionsLoadedByMode = state.memberSessionsLoadedByMode || {};
        
            if (state.memberSessionsLoadedByMode[cacheKey]) {
                return {
                    sessions: state.sessions.filter(session => {
                        const isQ = session.qIds?.includes(memberId);
                        const attended = session.attendeeIds?.includes(memberId);
        
                        if (mode === "q") return isQ;
                        if (mode === "attended") return attended;
                        return attended || isQ;
                    }),
                    loadedFromNetwork: false,
                };
            }
        
            const sessions = await loadMemberSessions(
                state.currentRegionId,
                memberId,
                mode
            );
        
            const existingIds = new Set(state.sessions.map(session => session.id));
            const newSessions = sessions.filter(session => !existingIds.has(session.id));
        
            state.sessions = [...state.sessions, ...newSessions];
            state.memberSessionsLoadedByMode[cacheKey] = true;
        
            return {
                sessions,
                loadedFromNetwork: true,
            };
        }

        statItems.forEach(item => {
            const tile = document.createElement("div");
            tile.classList.add("stat-tile");

            const value = document.createElement("div");
            value.classList.add("stat-value");
            value.textContent = item.value;

            const label = document.createElement("div");
            label.classList.add("stat-label");
            label.textContent = item.label;

            if (item.type) {
                tile.classList.add(`stat-tile-${item.type}`);
            }

            const icon = createIcon(item.icon);

            const text = document.createElement("div");
            text.classList.add("stat-text");

            text.append(value, label);

            if (item.subtext) {
                const subtext = document.createElement("div");
                subtext.classList.add("stat-subtext");
                subtext.textContent = item.subtext;
                text.appendChild(subtext);
            } 

            tile.append(icon, text);

            if (item.action === "posts") {
                tile.classList.add("clickable-stat-tile");

                tile.addEventListener("click", async () => {
                    const cacheKey = `${state.currentRegionId}__${memberId}__attended`;
                
                    if (!state.memberSessionsLoadedByMode?.[cacheKey]) {
                        showToast("Loading full history...", "info");
                    }
                
                    await hydrateMemberSessions("attended");
                
                    state.sessionHistoryFilterType = "attended";
                    state.sessionHistoryAoFilter = "";
                    state.sessionHistorySearchTerm = "";
                    navigateTo("sessionHistory");
                });
            }

            if (item.action === "qs") {
                tile.classList.add("clickable-stat-tile");

                tile.addEventListener("click", async () => {
                    const cacheKey = `${state.currentRegionId}__${memberId}__q`;
                
                    if (!state.memberSessionsLoadedByMode?.[cacheKey]) {
                        showToast("Loading full history...", "info");
                    }
                
                    await hydrateMemberSessions("q");
                
                    state.sessionHistoryFilterType = "q";
                    state.sessionHistoryAoFilter = "";
                    state.sessionHistorySearchTerm = "";
                    navigateTo("sessionHistory");
                });
            }

            if (item.action === "lastPost") {
                tile.classList.add("clickable-stat-tile");

                tile.addEventListener("click", async () => {
                    const session = await loadMemberSessionByDate(
                        state.currentRegionId,
                        memberId,
                        stats?.lastPostDate,
                        "attended"
                    );
                
                    if (!session) return;
                
                    const existingIds = new Set(state.sessions.map(session => session.id));
                    if (!existingIds.has(session.id)) {
                        state.sessions = [...state.sessions, session];
                    }
                
                    state.selectedSessionId = session.id;
                    navigateTo("sessionDetail");
                });
            }

            if (item.action === "lastQ") {
                tile.classList.add("clickable-stat-tile");
            
                tile.addEventListener("click", async () => {
                    const session = await loadMemberSessionByDate(
                        state.currentRegionId,
                        memberId,
                        stats?.lastQDate,
                        "q"
                    );
            
                    if (!session) return;
            
                    const existingIds = new Set(state.sessions.map(session => session.id));
                    if (!existingIds.has(session.id)) {
                        state.sessions = [...state.sessions, session];
                    }
            
                    state.selectedSessionId = session.id;
                    navigateTo("sessionDetail");
                });
            }

            if (item.action === "firstPost") {
                tile.classList.add("clickable-stat-tile");

                tile.addEventListener("click", async () => {
                    const session = await loadMemberSessionByDate(
                        state.currentRegionId,
                        memberId,
                        stats?.firstPostDate,
                        "attended"
                    );
                
                    if (!session) return;
                
                    const existingIds = new Set(state.sessions.map(session => session.id));
                    if (!existingIds.has(session.id)) {
                        state.sessions = [...state.sessions, session];
                    }
                
                    state.selectedSessionId = session.id;
                    navigateTo("sessionDetail");
                });
            }

            grid.append(tile);
        });

        card.append(grid);
        section.append(heading, card);

        return section;
    }

    const myStatsSection = renderMyStatsSection();

    const recentSessionsSection = document.createElement("div");
    const recentHeading = document.createElement("h2");
    const recentSessionList = document.createElement("div");
    recentHeading.textContent = "My Recent Activity";
    recentSessionsSection.append(recentHeading);

    const recentActivityKey = `${state.currentRegionId}__${state.currentUserMemberId}`;
    const recentActivity =
        state.recentMemberActivityByMemberId?.[recentActivityKey] || null;
    
    if (!recentActivity && state.currentUserMemberId) {
        loadRecentMemberActivity(
            state.currentRegionId,
            state.currentUserMemberId,
            2
        )
            .then(sessions => {
                state.recentMemberActivityByMemberId = {
                    ...(state.recentMemberActivityByMemberId || {}),
                    [recentActivityKey]: sessions,
                };
    
                const existingIds = new Set(state.sessions.map(session => session.id));
                const newSessions = sessions.filter(session => !existingIds.has(session.id));
                state.sessions = [...state.sessions, ...newSessions];
    
                if (state.currentView === "dashboard") {
                    renderApp();
                }
            })
            .catch(error => {
                console.error("Failed to load recent member activity:", error);
            });
    }
    
    const sortedSessions = recentActivity || [];
        if (sortedSessions.length === 0) {
        recentSessionList.textContent = "No recent activity.";
        } else {
            sortedSessions.slice(0, 2).forEach((session) => {
                const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

                const qNames = effectiveQIds
                    .map(qId => state.members.find(m => m.id === qId))
                    .filter(Boolean)
                    .map(member => member.paxName);
                
                const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";
                const sessionDetail = document.createElement("div");
                sessionDetail.classList.add("member-card", "session-history-card", "dashboard-activity-card");

                const topLine = document.createElement("div");
                topLine.classList.add("member-name");
                topLine.textContent = `${formatDate(session.date)} · ${session.aoName}`;

                const isQ = effectiveQIds.includes(state.currentUserMemberId);
                const isSoloQ = isQ && effectiveQIds.length === 1;
                const isCoQ = isQ && effectiveQIds.length > 1;

                const typeLine = document.createElement("div");
                typeLine.classList.add("stats-line", "activity-type");

            if (isQ) {
                typeLine.classList.add("q");
            }

           if (isCoQ) {
            typeLine.textContent = "Co-Q";
           } else if (isQ) {
            typeLine.textContent = "Q'd";
           } else {
            typeLine.textContent = "Attended";
           }

            const qLine = document.createElement("div");
            qLine.classList.add("stats-line", "q-line");
            qLine.textContent = `Q: ${qLabel}`;

            const summaryLine = document.createElement("div");
            summaryLine.classList.add("stats-line");
            const {
                totalAttendance,
                fngCount,
            } = getSessionDisplayCounts(session);
            
            summaryLine.textContent =
                `${totalAttendance} Attended · ${fngCount} FNG${fngCount === 1 ? "" : "s"}`;

            sessionDetail.append(topLine, typeLine);
            
            if (!isSoloQ) {
                sessionDetail.appendChild(qLine);
            }
             
            sessionDetail.appendChild(summaryLine);

            sessionDetail.addEventListener("click", () => {
                state.selectedSessionId = session.id;
                navigateTo("sessionDetail");
                renderApp();
            })

            recentSessionList.appendChild(sessionDetail);
        });

        const viewAllActivityButton = document.createElement("button");
        viewAllActivityButton.classList.add("secondary-button", "view-all-activity-button");
        viewAllActivityButton.textContent = "View All Activity";

        viewAllActivityButton.addEventListener("click", () => {
            navigateTo("sessionHistory");
        });

        recentSessionList.appendChild(viewAllActivityButton);
    }
    recentSessionsSection.append(recentSessionList);

    const nav = createGlobalNav();

    const primaryActionsRow = createPrimaryActionsRow();

    app.append(
        dashboardHeader, 
        ...(regionSwitcherLabel ? [regionSwitcherLabel] : []),
        ...(regionSwitcher ? [regionSwitcher] : []),
        userRow,
        ...(resumeWorkoutSection ? [resumeWorkoutSection] : []),
        dashboardCtaSection,
        ...(announcementsSection ? [announcementsSection] : []),
        primaryActionsRow,
        myUpcomingQsSection,
        ...(myStatsSection ? [myStatsSection] : []),
        recentSessionsSection,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}