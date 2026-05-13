import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { formatDate, getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { updateQSlotInCloud } from "../services/cloudData.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { logActionFailure, logAppEvent } from "../services/appEvents.js";
import { APP_EVENTS } from "../constants/appEvents.js";
import { userAlreadyHasQOnDate } from "../utils/qSlotValidation.js";
import { shareWeeklyQScheduleImage } from "../utils/shareWeeklyQScheduleIMage.js";
import { getWorkoutEmphasisForSlot } from "../utils/workoutEmphasis.js";
import { createIcon, createWeatherIcon } from "../utils/icons.js";
import { getAoWeather } from "../services/weather.js";

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getMondayForDate(dateString = getTodayDate()) {
    const date = new Date(`${dateString}T12:00:00`);
    const day = date.getDay();
    const diff = day === 0 ? -6: 1 - day;

    date.setDate(date.getDate() + diff);

    return formatDateKey(date);
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);
    return formatDateKey(date);
}

function getWeekDates(startDate) {
    return Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
}

function getMemberName(memberId) {
    const member = state.members.find(m => m.id === memberId);
    return member?.paxName || "Filled";
}

function getAoForSlot(slot) {
    return state.aos.find(ao => ao.id === slot.aoId) || null;
}

function getWeatherTargetDateTime(date, ao) {
    if (!date || !ao?.time) {
        return null;
    }

    return `${date}T${ao.time}:00-05:00`;
}

function getWeatherCacheKey(date, ao) {
    const targetDateTime = getWeatherTargetDateTime(date, ao);

    if (!ao?.id || !targetDateTime) {
        return null;
    }

    return `${ao.id}__${targetDateTime}`;
}

async function loadWeeklyWeather(date, ao) {
    const targetDateTime = getWeatherTargetDateTime(date, ao);
    const cacheKey = getWeatherCacheKey(date, ao);

    if (!ao?.id || !targetDateTime || !cacheKey) {
        return;
    }

    state.weatherByAoDate = state.weatherByAoDate || {};

    if (state.weatherByAoDate[cacheKey]) {
        return;
    }

    state.weatherByAoDate[cacheKey] = {
        isLoading: true,
    };

    const weather = await getAoWeather(ao.id, targetDateTime);

    state.weatherByAoDate[cacheKey] = weather;

    if (state.currentView === "weeklyQCalendar") {
        renderApp();
    }
}

function findMatchingPlannedWorkout(slot, ao) {
    return state.plannedWorkouts.find(workout =>
        workout.date === slot.date &&
        workout.createdByUserId === state.currentUserId &&
        workout.aoName === ao?.name
    );
}

export function renderWeeklyQCalendarView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const today = getTodayDate();

    if (!state.weeklyQCalendarStartDate) {
        state.weeklyQCalendarStartDate = getMondayForDate(today);
    }

    const weekStart = state.weeklyQCalendarStartDate;
    const weekDates = getWeekDates(weekStart);
    const weekEnd = weekDates[6];
    
    const title = document.createElement("h1");
    title.textContent = "Weekly Q Schedule";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

    const weekControls = document.createElement("div");
    weekControls.classList.add("button-row");

    const shareButton = document.createElement("button");
    shareButton.classList.add("secondary-button");
    shareButton.textContent = "Share Week";

    shareButton.addEventListener("click", async () => {
        try {
            await shareWeeklyQScheduleImage({
                weekStart,
                weekEnd,
                weekDates,
            });
        } catch (error) {
            console.error("Failed to share weekly schedule:", error);
            showToast("Failed to share weekly schedule.", "error");
        }
    });

    weekControls.append(shareButton);

    const previousButton = document.createElement("button");
    previousButton.classList.add("secondary-button");
    previousButton.textContent = "← Previous";

    previousButton.addEventListener("click", () => {
        state.weeklyQCalendarStartDate = addDays(weekStart, -7);
        renderApp();
    });

    const todayButton = document.createElement("button");
    todayButton.classList.add("secondary-button");
    todayButton.textContent = "This Week";

    todayButton.addEventListener("click", () => {
        state.weeklyQCalendarStartDate = getMondayForDate(today);
        renderApp();
    });

    const nextButton = document.createElement("button");
    nextButton.classList.add("secondary-button");
    nextButton.textContent = "Next →";

    nextButton.addEventListener("click", () => {
        state.weeklyQCalendarStartDate = addDays(weekStart, 7);
        renderApp();
    });

    weekControls.append(previousButton, todayButton, nextButton);

    const calendar = document.createElement("div");
    calendar.classList.add("weekly-q-calendar");

    weekDates.forEach(date => {
        const dayCard = document.createElement("div");
        dayCard.classList.add("section", "weekly-q-day-card");

        const dayTitle = document.createElement("div");
        dayTitle.classList.add("detail-label");
        dayTitle.textContent = formatDate(date);

        const daySlots = state.qSlots
            .filter(slot => slot.date === date)
            .sort((a, b) => {
                const aoA = getAoForSlot(a)?.name || "";
                const aoB = getAoForSlot(b)?.name || "";
                return aoA.localeCompare(aoB);
            });

        dayCard.appendChild(dayTitle);

        if (daySlots.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No Q slots";
            dayCard.appendChild(empty);
        } else {
            daySlots.forEach(slot => {
                const ao = getAoForSlot(slot);
                const emphasis = getWorkoutEmphasisForSlot(slot, ao);
                const isMine = slot.qUserId === state.currentUserMemberId;
                const matchingWorkout = findMatchingPlannedWorkout(slot, ao);

                const weatherCacheKey = getWeatherCacheKey(slot.date, ao);

                const weather = weatherCacheKey
                    ? state.weatherByAoDate?.[weatherCacheKey]
                    : null;

                const slotRow = document.createElement("div");
                slotRow.classList.add("q-slot-card", "weekly-q-slot-row");

                const slotMain = document.createElement("div");

                const aoRow = document.createElement("div");
                aoRow.classList.add("weekly-q-slot-ao-row");
                
                const aoLine = document.createElement("div");
                aoLine.classList.add("member-name");
                aoLine.textContent = ao?.name || "Unknown AO";

                aoRow.appendChild(aoLine);

                if (emphasis) {
                    const emphasisBadge = document.createElement("span");
                    emphasisBadge.classList.add("workout-emphasis-line");

                    const icon = createIcon(emphasis.icon);
                    icon.classList.add("workout-emphasis-icon");

                    const label = document.createElement("div");
                    label.textContent = emphasis.label;

                    emphasisBadge.append(icon, label);
                    aoRow.appendChild(emphasisBadge);
                }

                const qLine = document.createElement("div");
                qLine.classList.add("stats-line");
                qLine.textContent = slot.qUserId
                    ?isMine
                        ? "Q: You"
                        : `Q: ${getMemberName(slot.qUserId)}`
                    : "Q: OPEN";

                const metaLine = document.createElement("div");
                metaLine.classList.add("stats-line");
                metaLine.textContent = ao?.time ? `Start: ${ao.time}` : "No time set";

                slotMain.append(
                    aoRow,
                    qLine,
                    metaLine
                );

                if (weather && !weather.isLoading && !weather.weatherUnavailable) {
                    const weatherRow = document.createElement("div");
                    weatherRow.classList.add("weekly-q-weather");

                    const weatherIcon = createWeatherIcon(weather.icon, {
                        size: 12,
                        className: "weekly-q-weather-icon",
                    });

                    const weatherText = document.createElement("span");

                    weatherText.textContent =
                        `${weather.temp}° · ${weather.precipChance}%`;

                    weatherRow.append(weatherIcon, weatherText);

                    slotMain.appendChild(weatherRow);
                }

                const actions = document.createElement("div");
                actions.classList.add("q-slot-actions");

                const isPastSlot = slot.date < today;

                if (!slot.qUserId && isPastSlot) {
                    qLine.textContent = "Q: OPEN (past)";
                }

                if (!slot.qUserId && !isPastSlot) {
                    const claimButton = document.createElement("button");
                    claimButton.textContent = "Claim";

                    claimButton.addEventListener("click", async () => {
                        try {
                            if (userAlreadyHasQOnDate(slot.date, state.currentUserMemberId, slot.id)) {
                                showToast("You already have a Q scheduled that day.", "error");
                                return;
                            }

                            const updatedSlot = await updateQSlotInCloud(state.currentRegionId, {
                                ...slot,
                                qUserId: state.currentUserMemberId,
                            });

                            const index = state.qSlots.findIndex(q => q.id === slot.id);
                            if (index !== -1) {
                                state.qSlots[index] = updatedSlot;
                            }

                            logAppEvent({
                                type: APP_EVENTS.Q_SLOT_CLAIMED,
                                metadata: {
                                    qSlotId: slot.id,
                                    aoId: slot.aoId || null,
                                    aoName: ao?.name || null,
                                    date: slot.date || null,
                                    qUserId: state.currentUserMemberId || null,
                                    claimSource: "weekly_calendar",
                                },
                            });

                            renderApp();
                        } catch (error) {
                            console.error("Failed to claim Q slot:", error);
                            showToast("Failed to claim Q slot.", "error");

                            logActionFailure("weeklyCalendar.claimQSlot", error, {
                                qSlotId: slot?.id || null,
                                aoId: slot?.aoId || null,
                                date: slot?.date || null,
                            });
                        }
                    });

                    actions.appendChild(claimButton);
                }

                if (isMine && (!isPastSlot || matchingWorkout)) {
                    const workoutButton = document.createElement("button");
                    workoutButton.textContent = matchingWorkout ? "View BD" : "Plan BD";

                    workoutButton.addEventListener("click", () => {
                        if (matchingWorkout) {
                            state.selectedPlannedWorkoutId = matchingWorkout.id;
                            state.plannedWorkoutLaunchMode = null;
                            navigateTo("plannedWorkoutDetail");
                            return;
                        }

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
                        navigateTo("workoutPlanner");
                    });

                    actions.appendChild(workoutButton);
                }

                loadWeeklyWeather(slot.date, ao);

                slotRow.append(slotMain, actions);
                dayCard.appendChild(slotRow);
            });
        }

        calendar.appendChild(dayCard);
    });

    const nav = createGlobalNav();

    app.append(
        title,
        subtitle,
        weekControls,
        calendar,
        nav,
    );
}