import { state } from "../modules/state.js";
import { bootApp, renderApp } from "../index.js";
import { formatShortDate, formatDate, getTodayDate, formatMonthDayYear } from "../utils/date.js";
import { importData } from "../utils/importData.js";
import { exportState } from "../utils/export.js";
import { createGlobalNav } from "../components/globalNav.js";
import { signOut } from "../services/auth.js";
import { checkRegionAccess, loadRegionData } from "../services/cloudData.js";
import { replacePersistedData } from "../services/appData.js";
import { navigateTo } from "../utils/navigation.js";
import { generatePreblast } from "../modules/generatePreblast.js";
import { upsertNotificationSettings } from "../services/cloudData.js";
import { getUpcomingReminders } from "../utils/upcomingReminders.js";
import { subscribeToPush } from "../services/pushNotifications.js";
import { showToast } from "../utils/toast.js";
import { unclaimQSlot } from "../services/qSlots.js";
import { getMemberStats } from "../modules/stats.js";
import { createIcon, createWeatherIcon } from "../utils/icons.js";
import { getAoWeather } from "../services/weather.js";

export function renderDashboard() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = state.regionName || "F3 App";

    let regionSwitcher = null;
    let regionSwitcherLabel = null;

    if (state.currentUserRole === "admin" && state.availableRegions?.length) {
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

        regionSwitcher.addEventListener("change", async (event) => {
            
            const selected = event.target.value;

            state.regionOverrideId = selected || null;

            const activeRegionId = state.regionOverrideId || state.profileRegionId;
            state.currentRegionId = activeRegionId;

            const access = await checkRegionAccess(state.currentUserId, activeRegionId);

            if (!access) {
                const region = state.availableRegions.find(r => r.id === activeRegionId);
                state.regionName = region?.name || state.regionName;
                state.currentView = "regionGate";
                renderApp();
                return;
            }

            const cloudData = await loadRegionData(activeRegionId);
            replacePersistedData(cloudData);

            state.draftPlannedWorkout = null;
            state.editingPlannedWorkoutId = null;
            state.selectedPlannedWorkoutId = null;
            state.draftSession = null;
            state.editingSessionId = null;
            state.selectedSessionId = null;
            state.plannedWorkoutLaunchMode = null;

            localStorage.removeItem("draftPlannedWorkout");
            
            console.log("Switching to Region:", activeRegionId);

            renderApp();
        });
}

    const userRow = document.createElement("div");
    userRow.classList.add("user-row");

    const roleBadge = document.createElement("span");
    roleBadge.classList.add("role-badge");
    roleBadge.dataset.role = state.currentUserRole;
    roleBadge.textContent = state.currentUserRole === "admin" ? "Admin" : "User";

    const linkedMember = state.members.find(
        member => member.id === state.currentUserMemberId
    );

    const userName = document.createElement("span");
    userName.classList.add("user-name");
    userName.textContent = linkedMember?.paxName || state.currentUserDisplayName || "User";

    const userLeft = document.createElement("div");
    userLeft.classList.add("user-left");
    userLeft.append(roleBadge, userName);

    const signOutButton = document.createElement("button");
    signOutButton.textContent = "Sign Out";

    signOutButton.addEventListener("click", async () => {
        try{
            await signOut();
            localStorage.removeItem("f3AppState");
            state.regionName = "";
            state.members = [];
            state.sessions = [];
            state.plannedWorkouts = [];
            state.currentUserId = null;
            state.currentUserRole = null;
            state.currentUserDisplayName = null;
            state.selectedMemberId = null;
            state.selectedSessionId = null;
            state.selectedPlannedWorkoutId = null;
            state.editingMemberId = null;
            state.editingSessionId = null;
            state.editingPlannedWorkoutId = null;
            state.draftSession = null;
            state.currentView = "dashboard";
            state.currentRegionId = null;
            state.profileRegionId = null;
            state.regionOverrideId = null;
            state.availableRegions = [];
            state.qSignupAoFilter = "all";
            state.qSignupOpenOnly = false;
            state.currentUserMemberId = null;
            state.claimingMemberId = null;
            state.notificationSettings = null;
            localStorage.removeItem("theQNavState");

            await bootApp();
        } catch (error) {
            console.error("Failed to sign out:", error);
            showToast("Failed to sign out.", "error");
        }
    });

    const isAdmin = state.currentUserRole === "admin";

    function findMatchingPlannedWorkoutForSlot(slot) {
        const ao = state.aos.find(a => a.id === slot.aoId);

        return state.plannedWorkouts.find(workout => 
            workout.date === slot.date &&
            workout.createdByUserId === state.currentUserId &&
            workout.aoName === ao?.name
        );
    }

    function findLoggedSessionForSlot(slot) {
        const ao = state.aos.find(a => a.id === slot.aoId);

        return state.sessions.find(session => {
            const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

            return (
                session.date === slot.date &&
                session.aoName === ao?.name &&
                effectiveQIds.includes(state.currentUserMemberId)
            );
        });
    }

    function isTodayQStillActionable(slot) {
        const today = getTodayDate();

        if (slot.date !== today) {
            return true;
        }

        const ao = state.aos.find(a => a.id === slot.aoId);

        if (!ao?.time) {
            return true;
        }

        const [hourString, minuteString] = ao.time.split(":");
        const hour = Number(hourString);
        const minute = Number(minuteString || 0);

        if (Number.isNaN(hour) || Number.isNaN(minute)) {
            return true;
        }

        const cutoff = new Date();
        cutoff.setHours(hour + 4, minute, 0, 0);

        return new Date() < cutoff;
    }

    function getNextQTargetDateTime(slot, ao) {
        if (!slot || !ao?.time) {
            return null;
        }

        return `${slot.date}T${ao.time}:00`;
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

        const weather = await getAoWeather(ao.id, targetDateTime);

        state.weatherByAoDate[cacheKey] = weather;

        if (state.currentView === "dashboard") {
            renderApp();
        }
    }

    function getMyUpcomingQSlots() {
        const today = getTodayDate();

        return state.qSlots
            .filter(slot => {
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

                if (!isTodayQStillActionable(slot)) {
                    return false;
                } 

                return true;
            })
            .sort((a, b) => a.date.localeCompare(b.date));
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

    let nextQSection = null;

    if (nextQSlot) {
        const ao = state.aos.find(a => a.id === nextQSlot.aoId);
        const weatherCacheKey = getWeatherCacheKey(nextQSlot, ao);
        const nextQWeather = weatherCacheKey
            ? state.weatherByAoDate?.[weatherCacheKey]
            : null;
        const matchingWorkout = findMatchingPlannedWorkoutForSlot(nextQSlot);
        const hasPlannedWorkout = Boolean(matchingWorkout);
        const isTodayQ = nextQSlot.date === today;
        const isTomorrowQ = nextQSlot.date === tomorrow;

        nextQSection = document.createElement("div");
        nextQSection.classList.add("section");

        const nextQHeading = document.createElement("div");
        nextQHeading.classList.add("detail-label");
        nextQHeading.textContent = "Your Next Q";

        const nextQCard = document.createElement("div");
        nextQCard.classList.add("member-card");

        const nextQCardContent = document.createElement("div");

        const nextQActions = document.createElement("div");
        nextQActions.classList.add("q-slot-actions");

        const nextQTitle = document.createElement("div");
        nextQTitle.classList.add("member-name");
        nextQTitle.textContent = isTodayQ
            ? `You are Qing today at ${ao?.name || "Unknown AO"}`
            : `You are Qing at ${ao?.name || "Unknown AO"}`;

        const nextQSubtitle = document.createElement("div");
        nextQSubtitle.classList.add("stats-line");

        nextQSubtitle.textContent = isTodayQ
            ? (ao?.time ? `Today • ${ao.time}` : "Today")
            : (ao?.time
                ? `${formatShortDate(nextQSlot.date)} • ${ao.time}`
                : formatShortDate(nextQSlot.date));

        const nextQPreview = document.createElement("div");
        nextQPreview.classList.add("stats-line");
        nextQPreview.textContent = hasPlannedWorkout
            ? "BD Ready"
            : "No workout planned";

        const nextQWeatherLine = document.createElement("div");
        nextQWeatherLine.classList.add("stats-line", "next-q-weather-line");

        if (nextQWeather?.isLoading) {
            nextQWeatherLine.textContent = "Loading weather...";
        } else if (nextQWeather && !nextQWeather.weatherUnavailable) {
            const rainLabel =
                typeof nextQWeather.precipChance === "number"
                    ? `${nextQWeather.precipChance}% rain`
                    : "Rain chance unavailable";

            const windLabel =
                typeof nextQWeather.windMph === "number"
                    ? `${nextQWeather.windMph} mph wind`
                    : "Wind unavailable";

            const weatherIcon = createWeatherIcon(nextQWeather.icon);

            const weatherText = document.createElement("span");
            weatherText.textContent =
                `${nextQWeather.temp}° · ${nextQWeather.condition} · ${rainLabel}`;

            nextQWeatherLine.append(weatherIcon, weatherText);

        } else if (nextQWeather?.weatherUnavailable) {
            nextQWeatherLine.textContent = "Weather unavailable";
        }

        nextQCardContent.append(nextQTitle, nextQSubtitle, nextQPreview);

        if (nextQWeather || ao?.latitude) {
            nextQCardContent.appendChild(nextQWeatherLine);
        }

        const actionButton = document.createElement("button");
        actionButton.classList.add("primary-button");

        if (!hasPlannedWorkout) {
            actionButton.textContent = "Plan Workout";

            actionButton.addEventListener("click", (event) => {
                event.stopPropagation();

                state.draftPlannedWorkout = {
                    id: crypto.randomUUID(),
                    date: nextQSlot.date,
                    aoName: ao?.name || "",
                    title: "",
                    introduction: "",
                    warmorama: "",
                    thangs: "",
                    finisher: "",
                    notes: "",
                    sourceWorkoutId: null,
                    sourceSessionId: null,
                    createdAt: Date.now(),
                    lastModifiedAt: null,
                    createdByUserId: state.currentUserId,
                    isShared: false,
                    timers: [],
                };

                state.editingPlannedWorkoutId = null;
                state.selectedPlannedWorkoutId = null;
                state.returnToViewAfterPlanner = "dashboard";
                state.returnToLaunchModeAfterPlanner = null;
                navigateTo("workoutPlanner");
            });
        } else if (isTodayQ) {
            actionButton.textContent = "Start Today's Workout";

            actionButton.addEventListener("click", (event) => {
                event.stopPropagation();
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = "execution";
                navigateTo("plannedWorkoutDetail");
            });
        } else {
            actionButton.textContent = "View Workout";

            actionButton.addEventListener("click", (event) => {
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

                if (matchingWorkout) {
                    state.selectedPreblastWorkoutId = matchingWorkout.id;
                    state.draftPreblastText = generatePreblast(matchingWorkout, state.aos);
                } else {
                    const fallbackWorkout = {
                        date: nextQSlot.date,
                        aoName: ao?.name || "",
                    };

                    state.selectedPreblastWorkoutId = matchingWorkout?.id || null;
                    state.draftPreblastText = generatePreblast(fallbackWorkout, state.aos);
                }

                state.currentView = "preblast";
                renderApp();
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
                state.draftPlannedWorkout = {
                    id: crypto.randomUUID(),
                    date: nextQSlot.date,
                    aoName: ao?.name || "",
                    title: "",
                    introduction: "",
                    warmorama: "",
                    thangs: "",
                    finisher: "",
                    notes: "",
                    sourceWorkoutId: null,
                    sourceSessionId: null,
                    createdAt: Date.now(),
                    lastModifiedAt: null,
                    createdByUserId: state.currentUserId,
                    isShared: false,
                    timers: [],
                };

                state.editingPlannedWorkoutId = null;
                state.selectedPlannedWorkoutId = null;
                state.returnToViewAfterPlanner = "dashboard";
                state.returnToLaunchModeAfterPlanner = null;
                navigateTo("workoutPlanner");
            } else {
                state.selectedPlannedWorkoutId = matchingWorkout.id;
                state.plannedWorkoutLaunchMode = isTodayQ ? "execution" : null;
                navigateTo("plannedWorkoutDetail");
            }
        });

        nextQActions.prepend(actionButton);
        nextQCard.append(nextQCardContent, nextQActions);
        nextQSection.append(nextQHeading, nextQCard);
        loadNextQWeather(nextQSlot, ao);
    }

    const quickAccessHeading = document.createElement("div");
    quickAccessHeading.textContent = "Quick Access";
    quickAccessHeading.classList.add("detail-label");

    const quickAccessRow = document.createElement("div");
    quickAccessRow.classList.add("quick-access-row");

    const workoutLibraryButton = document.createElement("button");
    workoutLibraryButton.classList.add("quick-access-card");
    workoutLibraryButton.textContent = "Workout Library";
    workoutLibraryButton.addEventListener("click", () => {
        state.currentView = "plannedWorkoutList";
        renderApp();
    });

    const rosterButton = document.createElement("button");
    rosterButton.classList.add("quick-access-card");
    rosterButton.textContent = "Roster";
    rosterButton.addEventListener("click", () => {
        state.currentView = "roster";
        renderApp()
    });

    const qSignupButton = document.createElement("button");
    qSignupButton.classList.add("quick-access-card");
    qSignupButton.textContent = "Q Signup";
    qSignupButton.addEventListener("click", () => {
        state.currentView = "qSignup";
        renderApp();
    });

    const weeklyQButton = document.createElement("button");
    weeklyQButton.classList.add("quick-access-card");
    weeklyQButton.textContent = "Weekly Q Schedule";

    weeklyQButton.addEventListener("click", () => {
        navigateTo("weeklyQCalendar");
    });

    const templatesButton = document.createElement("button");
    templatesButton.classList.add("quick-access-card");
    templatesButton.textContent = "My Templates";

    templatesButton.addEventListener("click", () => {
        navigateTo("templateHub");
    });

    quickAccessRow.append(
        workoutLibraryButton,
        qSignupButton,
        weeklyQButton,
        rosterButton,
        templatesButton,
);

    function renderMyUpcomingQs() {
        const mySlots = myUpcomingQSlots.slice(1);

        const section = document.createElement("div");
        section.classList.add("section");

        const heading = document.createElement("div");
        heading.textContent = "My Upcoming Qs";
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
                    state.draftPlannedWorkout = {
                        id: crypto.randomUUID(),
                        date: slot.date,
                        aoName: ao?.name || "",
                        title: "",
                        introduction: "",
                        warmorama: "",
                        thangs: "",
                        finisher: "",
                        notes: "",
                        sourceWorkoutId: null,
                        sourceSessionId: null,
                        createdAt: Date.now(),
                        lastModifiedAt: null,
                        createdByUserId: state.currentUserId,
                        isShared: false,
                        timers: [],
                    };

                    state.editingPlannedWorkoutId = null;
                    state.selectedPlannedWorkoutId = null;
                    state.returnToViewAfterPlanner = "dashboard";
                    state.returnToLaunchModeAfterPlanner = null;
                    navigateTo("workoutPlanner");
                } else {
                    state.selectedPlannedWorkoutId = matchingWorkout.id;
                    state.plannedWorkoutLaunchMode =
                        slot.date === today ? "execution" : null;

                    navigateTo("plannedWorkoutDetail");
                }
            });

            const ao = state.aos.find(a => a.id === slot.aoId);
            const hasPlannedWorkout = state.plannedWorkouts.some(workout =>
                workout.date === slot.date &&
                workout.createdByUserId === state.currentUserId &&
                workout.aoName === ao?.name
            );

            const title = document.createElement("div");
            title.classList.add("member-name");
            title.textContent = `${formatDate(slot.date)} - ${ao?.name || "Unknown AO"}`;

            const status = document.createElement("div");
            status.classList.add("stats-line");
            status.textContent = hasPlannedWorkout ? "BD Ready" : "No workout planned";

            const rowText = document.createElement("div");
            rowText.classList.add("upcoming-q-row-text");
            rowText.append(title, status);

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

            row.append(rowText, unclaimButton);

            section.appendChild(row);
        });

        return section;
    }

    const myUpcomingQsSection = renderMyUpcomingQs();

    function renderMyStatsSection() {
        const memberId = state.currentUserMemberId;

        if (!memberId) {
            return null;
        }

        const stats = getMemberStats(memberId);

        const section = document.createElement("div");
        section.classList.add("section");

        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = "My Stats";

        const card = document.createElement("div");
        card.classList.add("member-card");

        const grid = document.createElement("div");
        grid.classList.add("stats-grid");

        const statItems = [
            { label: "Posts", value: stats.posts, icon: "posts" },
            { label: "Qs Led", value: stats.qs, icon: "qs" },
            { label: "FNGs EH'd", value: stats.fngsEh, icon: "fngsEh" },
            { label: "Favorite AO", value: stats.favoriteAo || "-", icon: "favoriteAo" },
            { 
                label: "Last Post",
                value: stats.lastPostDate ? formatMonthDayYear(stats.lastPostDate) : "-",
                type: "date",
                icon: "lastPost"
            },
            { 
                label: "FNG Date",
                value: stats.firstPostDate ? formatMonthDayYear(stats.firstPostDate) : "-",
                type: "date",
                icon: "fngDate"
            },
        ];

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
            tile.append(icon, text);
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

    const myRecentSessions = state.sessions.filter(session => {
        const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

        return (
            effectiveQIds.includes(state.currentUserMemberId) ||
            session.attendeeIds?.includes(state.currentUserMemberId)
        );
    });

    const sortedSessions = [...myRecentSessions].sort((a,b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
        }

        const aCreatedAt = a.createdAt || 0;
        const bCreatedAt = b.createdAt || 0;

        return bCreatedAt - aCreatedAt;
    })
    if (sortedSessions.length === 0) {
        recentSessionList.textContent = "No recent activity.";
    } else {
        sortedSessions.slice(0, 3).forEach((session) => {
            const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);

            const qNames = effectiveQIds
                .map(qId => state.members.find(m => m.id === qId))
                .filter(Boolean)
                .map(member => member.paxName);
            
            const qLabel = qNames.length > 0 ? qNames.join(", ") : "-";
            const sessionDetail = document.createElement("div");
            sessionDetail.classList.add("member-card", "session-history-card");

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
            summaryLine.textContent = `${session.attendeeIds.length} PAX · ${session.fngs.length} FNGs`;

            sessionDetail.append(topLine, typeLine);
            
            if (!isSoloQ) {
                sessionDetail.appendChild(qLine);
            }
             
            sessionDetail.appendChild(summaryLine);

            sessionDetail.addEventListener("click", () => {
                state.selectedSessionId = session.id;
                state.currentView = "sessionDetail";
                renderApp();
            })

            recentSessionList.appendChild(sessionDetail);
        })
    }
    recentSessionsSection.append(recentSessionList);

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json";
    importInput.style.display = "none";

    const importButton = document.createElement("button");
    importButton.textContent = "Import Data";

    importButton.addEventListener("click", () => {
        importInput.click();
    });

    importInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            importData(data);
            renderApp();
        } catch (error) {
            console.error("Import failed:", error);
            alert("Import failed. Please choose a valid JSON file.");
        }

        importInput.value = "";
    })

    const exportButton = document.createElement("button");
    exportButton.textContent = "Export Data";

    exportButton.addEventListener("click", () => {
        exportState(state);
        showToast("Data exported!", "success");
    });

    const stalePaxButton = document.createElement("button");
    stalePaxButton.textContent = "Review Stale PAX";
    stalePaxButton.addEventListener("click", () => {
        navigateTo("stalePax");
    });

    const adminFlagsButton = document.createElement("button");
    const openFlagsCount = (state.adminFlags || [])
        .filter(f => f.status === "open").length;
    adminFlagsButton.textContent = `Admin Flags (${openFlagsCount})`;
    adminFlagsButton.addEventListener("click", () => {
        navigateTo("adminFlags");
    })

    const manageAosButton = document.createElement("button");
    manageAosButton.textContent = "Manage AOs";
    manageAosButton.addEventListener("click", () => {
        navigateTo("aoManagement");
    })

    const adminSettingsButton = document.createElement("button");
    adminSettingsButton.textContent = "Admin Settings";
    adminSettingsButton.addEventListener("click", () => {
        navigateTo("adminSettings");
    });

    const dataToolsHeading = document.createElement("div");
    dataToolsHeading.textContent = "Data Tools";
    dataToolsHeading. classList.add("detail-label");

    const dataToolsRow = document.createElement("div");
    dataToolsRow.classList.add("button-row");

    userRow.append(userLeft, signOutButton);

    const notificationRow = document.createElement("div");
    notificationRow.classList.add("section");

    const notificationLabel = document.createElement("div");
    notificationLabel.classList.add("detail-label");
    notificationLabel.textContent = "Reminders";

    const notificationToggle = document.createElement("button");
    notificationToggle.classList.add("secondary-button");

    const isEnabled = state.notificationSettings?.pushEnabled;

    notificationToggle.textContent = isEnabled
        ? "On"
        : "Off";

    notificationToggle.addEventListener("click", async () => {
        const nextValue = !state.notificationSettings?.pushEnabled;
        try {
            let pushSubscription = state.notificationSettings?.pushSubscription ?? null;
            
            if (nextValue) {
                const subscription = await subscribeToPush();
                pushSubscription = subscription?.toJSON() ?? null;
            }
            await upsertNotificationSettings(state.currentUserId, {
                push_enabled: nextValue,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                push_subscription: pushSubscription,
            });
        
            state.notificationSettings = {
                ...state.notificationSettings,
                pushEnabled: nextValue,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                pushSubscription,
            };
            renderApp();
        } catch (error) {
            console.error("Failed to update notification settings:", error);
            alert("Failed to update reminders.");
        }
    });

    if(isAdmin){
        dataToolsRow.append(
            importButton,
            exportButton,
            manageAosButton,
            adminSettingsButton, 
            adminFlagsButton, 
            stalePaxButton
        );
    }

    const nav = createGlobalNav();
    notificationRow.append(notificationLabel, notificationToggle);

    const testNotificationButton = document.createElement("button");
    testNotificationButton.textContent = "Test Reminders";

    testNotificationButton.addEventListener("click", () => {
        const reminders = getUpcomingReminders(state);
        console.log("Reminders:", reminders);

        if (reminders.length === 0) {
            alert("No reminders");
            return;
        }
        alert(reminders.map(r => r.message).join("\n\n"));

        reminders.forEach(r => {
            state.sentNotificationKeys.push(r.key);
        });

        console.log("sent keys:", state.sentNotificationKeys);
    });

    app.append(
        title, 
        ...(regionSwitcherLabel ? [regionSwitcherLabel] : []),
        ...(regionSwitcher ? [regionSwitcher] : []),
        userRow,
        //notificationRow,
        ...(nextQSection ? [nextQSection] : []),
        ...(myStatsSection ? [myStatsSection] : []),
        quickAccessHeading, 
        quickAccessRow, 
        myUpcomingQsSection);

    if (isAdmin) {
        app.append(dataToolsHeading, dataToolsRow, importInput, testNotificationButton);
    }
    app.append(recentSessionsSection, nav);
}