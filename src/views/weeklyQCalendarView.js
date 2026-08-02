import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { getTodayDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { showToast } from "../utils/toast.js";
import { shareWeeklyQScheduleImage } from "../utils/shareWeeklyQScheduleImage.js";
import { getWorkoutEmphasisForSlot } from "../utils/workoutEmphasis.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { findWorkoutForQSlot } from "../utils/qSlotMatching.js";
import { resolveSiteForQSlot } from "../utils/siteResolution.js";
import { getMemberById } from "../utils/memberLookup.js";
import { createIcon } from "../utils/icons.js";


function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getDayOfWeekFromDateKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).getDay();
}

function getMondayForDate(dateString = getTodayDate()) {
    const date = new Date(`${dateString}T12:00:00`);
    const day = date.getDay();

    const diff =
        day === 0
            ? 1
            : 1 - day;

    date.setDate(date.getDate() + diff);

    return formatDateKey(date);
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);
    return formatDateKey(date);
}

function getSlotDisplayTime(slot, ao) {
    return (
        slot?.overrideTime ||
        slot?.startTime ||
        ao?.timeSchedule?.[
            String(
                getDayOfWeekFromDateKey(
                    slot.date
                )
            )
        ] ||
        ao?.time ||
        ""
    );
}

function parseTimeToMinutes(timeValue) {
    if (!timeValue) {
        return null;
    }

    const match = String(timeValue)
        .trim()
        .match(
            /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i
        );

    if (!match) {
        return null;
    }

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem =
        match[3]?.toUpperCase() || null;

    if (
        !Number.isFinite(hours) ||
        !Number.isFinite(minutes) ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    if (meridiem) {
        if (hours < 1 || hours > 12) {
            return null;
        }

        if (meridiem === "AM") {
            hours =
                hours === 12
                    ? 0
                    : hours;
        } else {
            hours =
                hours === 12
                    ? 12
                    : hours + 12;
        }
    } else if (hours < 0 || hours > 23) {
        return null;
    }

    return hours * 60 + minutes;
}

function getDefaultWeeklyCalendarStartDate(
    dateString = getTodayDate()
) {
    const date = new Date(
        `${dateString}T12:00:00`
    );

    const dayOfWeek = date.getDay();

    /*
     * Sunday belongs to the upcoming
     * Monday–Saturday schedule.
     */
    if (dayOfWeek === 0) {
        return addDays(dateString, 1);
    }

    const currentWeekStart =
        getMondayForDate(dateString);

    /*
     * Monday through Friday remain on the
     * currently active week.
     */
    if (dayOfWeek !== 6) {
        return currentWeekStart;
    }

    const saturdaySlots =
        state.qSlots.filter(
            slot =>
                slot.date === dateString
        );

    const latestStartMinutes =
        saturdaySlots.reduce(
            (
                latestMinutes,
                slot
            ) => {
                const ao =
                    getAoForSlot(slot);

                const displayTime =
                    getSlotDisplayTime(
                        slot,
                        ao
                    );

                const startMinutes =
                    parseTimeToMinutes(
                        displayTime
                    );

                if (startMinutes === null) {
                    return latestMinutes;
                }

                return Math.max(
                    latestMinutes,
                    startMinutes
                );
            },
            -1
        );

    /*
     * Without a usable Saturday start time,
     * keep showing the current week rather
     * than guessing that it has ended.
     */
    if (latestStartMinutes < 0) {
        return currentWeekStart;
    }

    const now = new Date();

    const currentMinutes =
        now.getHours() * 60 +
        now.getMinutes();

    const saturdayScheduleEnd =
        latestStartMinutes + 120;

    if (
        currentMinutes >=
        saturdayScheduleEnd
    ) {
        return addDays(
            currentWeekStart,
            7
        );
    }

    return currentWeekStart;
}

function getWeekDates(startDate) {
    return Array.from({ length: 6 }, (_, index) => addDays(startDate, index));
}

function formatCalendarDayName(dateString) {
    return new Date(
        `${dateString}T12:00:00`
    )
        .toLocaleDateString(
            undefined,
            {
                weekday: "long",
            }
        );
}

function formatCalendarDayDate(dateString) {
    return new Date(
        `${dateString}T12:00:00`
    )
        .toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric",
            }
        );
}

function formatCalendarWeekRange(
    startDate,
    endDate
) {
    const start = new Date(
        `${startDate}T12:00:00`
    );

    const end = new Date(
        `${endDate}T12:00:00`
    );

    const startLabel =
        start.toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric",
            }
        );

    const endLabel =
        end.toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric",
                year: "numeric",
            }
        );

    return `${startLabel} – ${endLabel}`;
}

function getMemberName(memberId) {
    const member =
        getMemberById(memberId);

    return (
        member?.paxName ||
        member?.realName ||
        "Filled"
    );
}

function getAoForSlot(slot) {
    return state.aos.find(ao => ao.id === slot.aoId) || null;
}

export function renderWeeklyQCalendarView() {
    const app = document.getElementById("app");
    app.textContent = "";
    app.className = "view-weeklyQCalendar";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const today = getTodayDate();

    if (!state.weeklyQCalendarStartDate) {
        state.weeklyQCalendarStartDate =
            getDefaultWeeklyCalendarStartDate(
                today
            );
    }

    const weekStart = state.weeklyQCalendarStartDate;
    const weekDates = getWeekDates(weekStart);
    const weekEnd = weekDates[weekDates.length - 1];
    
    const title =
        document.createElement("h1");

    title.textContent =
        "Weekly Q Schedule";

    const subtitle =
        document.createElement("p");

    subtitle.classList.add(
        "weekly-q-subtitle"
    );

    subtitle.textContent =
        "See who is leading across the region this week.";


    /* Week navigation */

    const weekNav =
        document.createElement("div");

    weekNav.classList.add(
        "weekly-q-week-nav"
    );

    const previousButton =
        document.createElement("button");

    previousButton.type = "button";

    previousButton.classList.add(
        "weekly-q-week-arrow"
    );

    previousButton.setAttribute(
        "aria-label",
        "Previous week"
    );

    previousButton.textContent = "‹";

    previousButton.addEventListener(
        "click",
        () => {
            state.weeklyQCalendarStartDate =
                addDays(weekStart, -7);

            renderApp();
        }
    );

    const weekLabel =
        document.createElement("button");

    weekLabel.type = "button";

    weekLabel.classList.add(
        "weekly-q-week-label"
    );

    const weekLabelMain =
        document.createElement("div");

    weekLabelMain.classList.add(
        "weekly-q-week-label-main"
    );

    const currentWeekStart =
        getDefaultWeeklyCalendarStartDate(
            today
        );

    weekLabelMain.textContent =
        weekStart === currentWeekStart
            ? "This Week"
            : "View This Week";

    const weekLabelDates =
        document.createElement("div");

    weekLabelDates.classList.add(
        "weekly-q-week-label-dates"
    );

    weekLabelDates.textContent =
        formatCalendarWeekRange(
            weekStart,
            weekEnd
        );

    weekLabel.append(
        weekLabelMain,
        weekLabelDates
    );

    weekLabel.addEventListener(
        "click",
        () => {
            state.weeklyQCalendarStartDate =
                currentWeekStart;

            renderApp();
        }
    );

    const nextButton =
        document.createElement("button");

    nextButton.type = "button";

    nextButton.classList.add(
        "weekly-q-week-arrow"
    );

    nextButton.setAttribute(
        "aria-label",
        "Next week"
    );

    nextButton.textContent = "›";

    nextButton.addEventListener(
        "click",
        () => {
            state.weeklyQCalendarStartDate =
                addDays(weekStart, 7);

            renderApp();
        }
    );

    weekNav.append(
        previousButton,
        weekLabel,
        nextButton
    );


    /* Share */

    const shareButton =
        document.createElement("button");

    shareButton.type = "button";

    shareButton.classList.add(
        "weekly-q-share-button"
    );

    shareButton.textContent =
        "Share Weekly Preblast";

    shareButton.addEventListener(
        "click",
        async () => {
            try {
                await shareWeeklyQScheduleImage({
                    weekStart,
                    weekEnd,
                    weekDates,
                });
            } catch (error) {
                console.error(
                    "Failed to share weekly schedule:",
                    error
                );

                showToast(
                    "Failed to share weekly schedule.",
                    "error"
                );
            }
        }
    );


    /* Weekly summary */

    const weekSlots =
        state.qSlots.filter(
            slot =>
                weekDates.includes(slot.date)
        );

    const filledCount =
        weekSlots.filter(
            slot => Boolean(slot.qUserId)
        ).length;

    const openCount =
        weekSlots.length - filledCount;

    const summary =
        document.createElement("div");

    summary.classList.add(
        "weekly-q-summary"
    );

    function createSummaryItem(
        value,
        label,
        extraClass = null
    ) {
        const item =
            document.createElement("div");

        item.classList.add(
            "weekly-q-summary-item"
        );

        if (extraClass) {
            item.classList.add(extraClass);
        }

        const valueElement =
            document.createElement("div");

        valueElement.classList.add(
            "weekly-q-summary-value"
        );

        valueElement.textContent =
            String(value);

        const labelElement =
            document.createElement("div");

        labelElement.classList.add(
            "weekly-q-summary-label"
        );

        labelElement.textContent = label;

        item.append(
            valueElement,
            labelElement
        );

        return item;
    }

    summary.append(
        createSummaryItem(
            weekSlots.length,
            "Workouts"
        ),
        createSummaryItem(
            filledCount,
            "Filled"
        ),
        createSummaryItem(
            openCount,
            "Open",
            "weekly-q-summary-open"
        )
    );


    /* Horizontal calendar */

    const calendarShell =
        document.createElement("div");

    calendarShell.classList.add(
        "weekly-q-calendar-shell"
    );

    const calendar =
        document.createElement("div");

    calendar.classList.add(
        "weekly-q-calendar"
    );

    let todayColumn = null;

    weekDates.forEach(date => {
        const dayColumn =
            document.createElement("section");

        dayColumn.classList.add(
            "weekly-q-day-column"
        );

        dayColumn.dataset.date = date;

        if (date === today) {
            dayColumn.classList.add(
                "is-today"
            );

            todayColumn = dayColumn;
        }

        const daySlots =
            state.qSlots
                .filter(
                    slot =>
                        slot.date === date
                )
                .sort((a, b) => {
                    const aoA =
                        getAoForSlot(a)?.name ||
                        "";

                    const aoB =
                        getAoForSlot(b)?.name ||
                        "";

                    return aoA.localeCompare(
                        aoB
                    );
                });


        /* Day header */

        const dayHeader =
            document.createElement("header");

        dayHeader.classList.add(
            "weekly-q-day-header"
        );

        const dayIdentity =
            document.createElement("div");

        const dayName =
            document.createElement("div");

        dayName.classList.add(
            "weekly-q-day-name"
        );

        dayName.textContent =
            date === today
                ? "Today"
                : formatCalendarDayName(date);

        const dayDate =
            document.createElement("div");

        dayDate.classList.add(
            "weekly-q-day-date"
        );

        dayDate.textContent =
            formatCalendarDayDate(date);

        dayIdentity.append(
            dayName,
            dayDate
        );

        const dayCount =
            document.createElement("div");

        dayCount.classList.add(
            "weekly-q-day-count"
        );

        dayCount.textContent =
            String(daySlots.length);

        dayHeader.append(
            dayIdentity,
            dayCount
        );

        dayColumn.appendChild(
            dayHeader
        );


        /* Slots */

        const slotList =
            document.createElement("div");

        slotList.classList.add(
            "weekly-q-day-slots"
        );

        if (daySlots.length === 0) {
            const empty =
                document.createElement("div");

            empty.classList.add(
                "weekly-q-day-empty"
            );

            empty.textContent =
                "No scheduled workouts";

            slotList.appendChild(empty);
        }

        daySlots.forEach(slot => {
            const ao =
                getAoForSlot(slot);

            const emphasis =
                getWorkoutEmphasisForSlot(
                    slot,
                    ao
                );

            const matchingWorkout =
                findWorkoutForQSlot(
                    slot,
                    state.plannedWorkouts,
                    state.currentUserId,
                    state.aos
                );

            const displayTime =
                matchingWorkout?.startTime ||
                getSlotDisplayTime(
                    slot,
                    ao
                );

            const site =
                resolveSiteForQSlot(
                    slot,
                    ao
                );

            const row =
                document.createElement("div");

            row.classList.add(
                "weekly-q-calendar-slot"
            );

            const main =
                document.createElement("div");

            main.classList.add(
                "weekly-q-calendar-slot-main"
            );

            const heading =
                document.createElement("div");

            heading.classList.add(
                "weekly-q-calendar-slot-heading"
            );

            const aoName =
                document.createElement("div");

            aoName.classList.add(
                "weekly-q-calendar-slot-ao"
            );

            aoName.textContent =
                ao?.name ||
                "Unknown AO";

            heading.appendChild(aoName);

            if (emphasis) {
                const emphasisBadge =
                    document.createElement(
                        "span"
                    );

                emphasisBadge.classList.add(
                    "weekly-q-calendar-emphasis"
                );

                const icon =
                    createIcon(
                        emphasis.icon
                    );

                const label =
                    document.createElement(
                        "span"
                    );

                label.textContent =
                    emphasis.label;

                emphasisBadge.append(
                    icon,
                    label
                );

                heading.appendChild(
                    emphasisBadge
                );
            }

            const location =
                document.createElement("div");

            location.classList.add(
                "weekly-q-calendar-location"
            );

            location.textContent =
                site?.name ||
                "Site not set";

            main.append(
                heading,
                location
            );

            const side =
                document.createElement("div");

            side.classList.add(
                "weekly-q-calendar-slot-side"
            );

            const qName =
                document.createElement("div");

            qName.classList.add(
                "weekly-q-calendar-q"
            );

            if (slot.qUserId) {
                qName.textContent =
                    slot.qUserId ===
                    state.currentUserMemberId
                        ? "You"
                        : getMemberName(
                            slot.qUserId
                        );
            } else {
                qName.textContent = "Open";

                qName.classList.add(
                    "is-open"
                );
            }

            const time =
                document.createElement("div");

            time.classList.add(
                "weekly-q-calendar-time"
            );

            time.textContent =
                displayTime ||
                "Time TBD";

            side.append(
                qName,
                time
            );

            row.append(
                main,
                side
            );

            slotList.appendChild(row);
        });

        dayColumn.appendChild(slotList);
        calendar.appendChild(dayColumn);
    });

    calendarShell.appendChild(calendar);

    const swipeHint =
        document.createElement("p");

    swipeHint.classList.add(
        "weekly-q-swipe-hint"
    );

    swipeHint.textContent =
        "Swipe to move through the week";
        
    const nav = createGlobalNav();

    app.append(
        header,
        title,
        subtitle,
        weekNav,
        shareButton,
        summary,
        calendarShell,
        swipeHint,
        nav
    );

    requestAnimationFrame(() => {
        const targetColumn =
            todayColumn ||
            calendar.querySelector(
                ".weekly-q-day-column"
            );
    
        if (!targetColumn) return;
    
        const targetLeft =
            targetColumn.offsetLeft -
            (
                calendar.clientWidth -
                targetColumn.offsetWidth
            ) / 2;
    
        calendar.scrollTo({
            left: Math.max(
                0,
                targetLeft
            ),
            behavior: "auto",
        });
    });

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}