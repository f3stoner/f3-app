import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import {
    loadCampaign,
    loadCampaignProgress,
    loadCampaignRecentProgress,
    loadCampaignDailyHistory,
    joinCampaign,
    leaveCampaign,
    deleteCampaign,
    loadCampaignStandings,
    setCampaignDailyQuantity,
    setCampaignQuantity,
} from "../services/cloudData.js";
import { canManageCampaigns } from "../utils/permissions.js";
import { showToast } from "../utils/toast.js";
import { createGlobalNav } from "../components/globalNav.js";
import { createAppHeader } from "../components/appHeader.js";

let activeCampaignDetailTab = "progress";
let campaignDetailData = null;

function formatCampaignDate(date) {
    if (!date) return "";

    return new Date(`${date}T12:00:00`)
        .toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
}

function getMonthKey(dateString) {
    return dateString.slice(0, 7);
}

function getMonthLabel(dateString) {
    return new Date(`${dateString}T12:00:00`)
        .toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
        });
}

function getDaysInMonth(year, monthIndex) {
    return new Date(
        year,
        monthIndex + 1,
        0
    ).getDate();
}

function getMonthStartDay(year, monthIndex) {
    return new Date(
        year,
        monthIndex,
        1
    ).getDay();
}

function supportsRecentProgress(campaign) {
    return campaign.metricKey === "regional_first_time_fngs";
}

function shouldShowPersonalProgress(campaign, progress) {
    return !isIndividualChallenge(campaign) || progress.isEnrolled;
}

function supportsStandings(campaign) {
    return isIndividualChallenge(campaign)
        && (
            campaign.metricKey === "member_posts"
            || campaign.metricKey === "manual_quantity"
        );
}

function canManageCampaign(campaign) {
    if (canManageCampaigns()) {
        return true;
    }

    return campaign.creatorMode === "pax"
        && campaign.createdByUserId === state.currentUserId;
}

function formatCampaignDateRange(campaign) {
    const start = formatCampaignDate(campaign.startsOn);
    const end = formatCampaignDate(campaign.endsOn);

    if (!start) return end;
    if (!end) return start;

    return `${start} – ${end}`;
}

function getCampaignStatus(campaign) {
    const today = new Date().toISOString().slice(0, 10);

    if (
        campaign.status === "completed" ||
        campaign.endsOn < today
    ) {
        return "Completed";
    }

    if (
        campaign.status === "scheduled" ||
        campaign.startsOn > today
    ) {
        return "Upcoming";
    }

    if (campaign.status === "cancelled") {
        return "Cancelled";
    }

    return "Active";
}

function getCampaignMetricDescription(campaign) {
    if (campaign.metricKey === "regional_first_time_fngs") {
        return "Each first-time PAX welcomed at a regional workout during the campaign counts toward the goal.";
    }

    if (campaign.metricKey === "member_posts") {
        return "Each workout you attend in the region during the campaign counts as one post.";
    }

    if (isManualDailyChallenge(campaign)) {
        return "Log your activity throughout the day. Your entries are added to today's total, and each day that reaches the daily target counts as completed.";
    }
    
    if (isManualCumulativeChallenge(campaign)) {
        return "Log your activity throughout the challenge. Each entry adds to your cumulative total toward the overall goal.";
    }

    return "Progress is calculated from qualifying activity during the campaign window.";
}

function createProgressBar(progress) {
    const track = document.createElement("div");
    track.className = "campaign-detail-progress-track";

    const fill = document.createElement("div");
    fill.className = "campaign-detail-progress-fill";
    fill.style.width = `${Math.min(Math.max(progress.percent, 0), 100)}%`;

    track.append(fill);

    return track;
}

function createCampaignDetailTabs() {
    const tabs = document.createElement("div");
    tabs.className = "campaign-detail-tabs";

    [
        { key: "progress", label: "Progress" },
        { key: "standings", label: "Standings" },
        { key: "about", label: "About" },
    ].forEach(tab => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "campaign-detail-tab";
        button.dataset.campaignDetailTab = tab.key;
        button.textContent = tab.label;

        if (tab.key === activeCampaignDetailTab) {
            button.classList.add("campaign-detail-tab-active");
        }

        button.addEventListener("click", () => {
            if (activeCampaignDetailTab === tab.key) return;

            activeCampaignDetailTab = tab.key;
            renderCampaignDetailTab();
        });

        tabs.append(button);
    });

    return tabs;
}

function renderCampaignDetailTab() {
    const content =
        document.querySelector(
            ".view-campaignDetail .campaign-detail-tab-content"
        );

    if (!content || !campaignDetailData) return;

    content.replaceChildren(
        createCampaignDetailTabContent(
            campaignDetailData
        )
    );

    document
        .querySelectorAll(
            ".view-campaignDetail .campaign-detail-tab"
        )
        .forEach(button => {
            button.classList.toggle(
                "campaign-detail-tab-active",
                button.dataset.campaignDetailTab ===
                    activeCampaignDetailTab
            );
        });
}

function createOverallProgressSection(campaign, progress) {
    if (!shouldShowPersonalProgress(campaign, progress)) {
        return null;
    }

    const section = document.createElement("section");
    section.className =
        "campaign-detail-progress campaign-detail-overall-progress";

    const label = document.createElement("div");
    label.className = "campaign-detail-section-label campaign-detail-subsection-title";
    label.textContent = isManualDailyChallenge(campaign)
        ? "Challenge Progress"
        : isIndividualChallenge(campaign)
            ? "Your Progress"
            : "Regional Progress";

    const valueRow = document.createElement("div");
    valueRow.className = "campaign-detail-progress-value-row";

    const value = document.createElement("div");
    value.className = "campaign-detail-progress-value";

    const current = document.createElement("strong");
    current.textContent = progress.current;

    const target = document.createElement("span");
    target.textContent = ` / ${progress.target}`;

    value.append(current, target);

    const unit = document.createElement("div");
    unit.className = "campaign-detail-progress-unit";
    unit.textContent = progress.unit;

    const percent = document.createElement("div");
    percent.className = "campaign-detail-progress-percent";
    percent.textContent = `${progress.percent}%`;

    valueRow.append(value, unit, percent);

    section.append(
        label,
        valueRow,
        createProgressBar(progress)
    );

    const copy = document.createElement("div");
    copy.className = "campaign-detail-progress-copy";

    if (
        isManualDailyChallenge(campaign) &&
        progress.totalDays > 0
    ) {
        copy.textContent =
            `${progress.completedDays} of ${progress.totalDays} days completed`;
    } else if (progress.goalReached) {
        copy.textContent =
            `Goal reached · ${progress.current} ${progress.unit}`;
    } else {
        const remaining =
            Math.max(progress.target - progress.current, 0);

        copy.textContent =
            `${remaining} ${progress.unit} to go`;
    }

    section.append(copy);

    return section;
}

function createCampaignDetailTabContent({
    campaign,
    progress,
    recentProgress,
    dailyHistory,
    standings,
}) {
    const content = document.createDocumentFragment();

    if (activeCampaignDetailTab === "progress") {
        const overallProgress =
            createOverallProgressSection(
                campaign,
                progress
            );

        if (overallProgress) {
            content.append(overallProgress);
        }

        if (
            isManualDailyChallenge(campaign) &&
            progress.isEnrolled
        ) {
            content.append(
                createDailyChallengeCalendar(
                    campaign,
                    progress,
                    dailyHistory
                )
            );
        }

        if (supportsRecentProgress(campaign)) {
            content.append(
                createRecentProgressSection(
                    recentProgress
                )
            );
        }

        if (
            !isManualDailyChallenge(campaign) &&
            !supportsRecentProgress(campaign)
        ) {
            const copy = document.createElement("p");
            copy.className = "campaign-detail-copy";
            copy.textContent =
                "Progress updates will appear here as the challenge continues.";

            content.append(copy);
        }
    }

    if (activeCampaignDetailTab === "standings") {
        const standingsSection =
            createStandingsSection(
                campaign,
                standings
            );

        if (standingsSection) {
            content.append(standingsSection);
        } else {
            const empty = document.createElement("p");
            empty.className = "campaign-detail-copy";
            empty.textContent =
                "Standings are not available for this campaign.";

            content.append(empty);
        }
    }

    if (activeCampaignDetailTab === "about") {
        const participation =
            createParticipationStatus(
                campaign,
                progress
            );

        if (participation) {
            const participationSection =
                document.createElement("section");

            participationSection.className =
                "campaign-detail-about-participation";

            participationSection.append(
                participation
            );

            content.append(
                participationSection
            );
        }
        content.append(
            createCampaignAboutSection(
                campaign,
                progress
            )
        );

        const managementSection =
            createCampaignManagementSection(
                campaign
            );

        if (managementSection) {
            content.append(
                managementSection
            );
        }
    }

    return content;
}

function createCampaignAboutSection(
    campaign,
    progress
) {
    const section = document.createElement("section");
    section.className =
        "campaign-detail-about";

    const goal = document.createElement("div");
    goal.className =
        "campaign-detail-about-block";

    const goalLabel = document.createElement("h2");
    goalLabel.className =
        "campaign-detail-section-label";
    goalLabel.textContent = "The Goal";

    const goalCopy = document.createElement("p");
    goalCopy.className =
        "campaign-detail-copy";

    if (isManualDailyChallenge(campaign)) {
        goalCopy.textContent =
            `Complete ${progress.todayTarget} ${progress.unit} each day from ${formatCampaignDateRange(campaign)}.`;
    } else {
        goalCopy.textContent =
            isIndividualChallenge(campaign)
                ? `Complete ${progress.target} ${progress.unit} between ${formatCampaignDateRange(campaign)}.`
                : `Reach ${progress.target} ${progress.unit} between ${formatCampaignDateRange(campaign)}.`;
    }

    goal.append(
        goalLabel,
        goalCopy
    );

    const rules = document.createElement("div");
    rules.className =
        "campaign-detail-about-block";

    const rulesLabel =
        document.createElement("h2");
    rulesLabel.className =
        "campaign-detail-section-label";
    rulesLabel.textContent =
        "How Progress Counts";

    const rulesCopy =
        document.createElement("p");
    rulesCopy.className =
        "campaign-detail-copy";
    rulesCopy.textContent =
        getCampaignMetricDescription(campaign);

    rules.append(
        rulesLabel,
        rulesCopy
    );

    section.append(
        goal,
        rules
    );

    return section;
}

function createDetailState({ type, title, message, onRetry = null }) {
    const container = document.createElement("div");
    container.className = `campaign-detail-state campaign-detail-state-${type}`;

    if (type === "loading") {
        const spinner = document.createElement("div");
        spinner.className = "campaign-detail-spinner";
        container.append(spinner);
    }

    const heading = document.createElement("h2");
    heading.textContent = title;

    const copy = document.createElement("p");
    copy.textContent = message;

    container.append(heading, copy);

    if (onRetry) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "campaign-detail-retry";
        retry.textContent = "Try Again";
        retry.addEventListener("click", onRetry);

        container.append(retry);
    }

    return container;
}

function createRecentProgressSection(items) {
    const section = document.createElement("section");
    section.className = "campaign-detail-section campaign-detail-recent";

    const label = document.createElement("h2");
    label.className = "campaign-detail-section-label";
    label.textContent = "Recent Progress";

    section.append(label);

    if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "campaign-detail-copy";
        empty.textContent = "No qualifying progress yet.";

        section.append(empty);
        return section;
    }

    const list = document.createElement("div");
    list.className = "campaign-detail-recent-list";

    items.forEach(item => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "campaign-detail-recent-row";

        const identity = document.createElement("div");
        identity.className = "campaign-detail-recent-identity";

        const name = document.createElement("strong");
        name.className = "campaign-detail-recent-name";
        name.textContent = item.paxName || "New PAX";

        const action = document.createElement("span");
        action.className = "campaign-detail-recent-action";
        action.textContent = "joined the region";

        identity.append(name, action);

        const meta = document.createElement("div");
        meta.className = "campaign-detail-recent-meta";

        const parts = [
            item.aoName,
            formatCampaignDate(item.sessionDate),
        ].filter(Boolean);

        meta.textContent = parts.join(" · ");

        const chevron = document.createElement("span");
        chevron.className = "campaign-detail-recent-chevron";
        chevron.textContent = "›";

        row.append(identity, meta, chevron);

        row.addEventListener("click", () => {
            state.selectedSessionId = item.sessionId;
            navigateTo("sessionDetail");
        });

        list.append(row);
    });

    section.append(list);

    return section;
}

function createCampaignManagementSection(campaign) {
    if (!canManageCampaign(campaign)) {
        return null;
    }

    const section = document.createElement("section");
    section.className =
        "campaign-detail-section campaign-detail-management";

    const label = document.createElement("h2");
    label.className = "campaign-detail-section-label";
    label.textContent = campaign.creatorMode === "pax"
        ? "Challenge Management"
        : "Campaign Management";

    const deleteLabel = campaign.creatorMode === "pax"
        ? "Delete Challenge"
        : "Delete Campaign";
    
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "campaign-detail-delete";
    deleteButton.textContent = deleteLabel;

    const itemLabel = campaign.creatorMode === "pax"
        ? "challenge"
        : "campaign";

    deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
            `Delete ${itemLabel} "${campaign.title}"?\n\nThis cannot be undone.`
        );

        if (!confirmed) return;

        deleteButton.disabled = true;
        deleteButton.textContent = "Deleting…";

        try {
            await deleteCampaign(campaign.id);

            state.selectedCampaignId = null;

            showToast(
                `${itemLabel === "challenge" ? "Challenge" : "Campaign"} deleted.`,
                "success"
            );
            navigateTo("campaigns");
        } catch (error) {
            console.error("Failed to delete campaign:", error);
        
            deleteButton.disabled = false;
            deleteButton.textContent = deleteLabel;
        
            showToast(
                error?.message || `Failed to delete ${itemLabel}.`,
                "error"
            );
        }
    });

    section.append(label, deleteButton);

    return section;
}

function isIndividualChallenge(campaign) {
    return campaign.participantMode === "individual";
}

function isManualDailyChallenge(campaign) {
    return campaign.metricKey === "manual_quantity"
        && campaign.trackingMode === "manual"
        && campaign.cadence === "daily";
}

function isManualCumulativeChallenge(campaign) {
    return campaign.metricKey === "manual_quantity"
        && campaign.trackingMode === "manual"
        && campaign.cadence === "campaign";
}

function getCampaignTypeLabel(campaign) {
    return isIndividualChallenge(campaign)
        ? "Challenge"
        : "Regional Campaign";
}

function createParticipationStatus(campaign, progress) {
    if (!isIndividualChallenge(campaign)) return null;

    const container = document.createElement("div");
    container.className = "campaign-detail-participation";

    const summary = document.createElement("div");
    summary.className = "campaign-detail-participant-count";

    const count = document.createElement("strong");
    count.textContent = progress.participantCount;

    const label = document.createElement("span");
    label.textContent =
        progress.participantCount === 1
            ? " PAX participating"
            : " PAX participating";

    summary.append(count, label);

    const action = document.createElement("button");
    action.type = "button";

    if (progress.isEnrolled) {
        action.className = "campaign-detail-leave";
        action.textContent = "Leave Challenge";
    } else {
        action.className = "campaign-detail-join";
        action.textContent = "Join Challenge";
    }

    action.addEventListener("click", async () => {
        action.disabled = true;

        const originalText = action.textContent;
        action.textContent = progress.isEnrolled
            ? "Leaving…"
            : "Joining…";

        try {
            if (progress.isEnrolled) {
                await leaveCampaign(campaign.id);
                showToast("You left the challenge.", "success");
            } else {
                await joinCampaign(campaign.id);
                showToast("You're in.", "success");
            }

            renderCampaignDetailView();
        } catch (error) {
            console.error("Failed to update campaign participation:", error);

            action.disabled = false;
            action.textContent = originalText;

            showToast(
                error?.message || "Failed to update challenge.",
                "error"
            );
        }
    });

    if (progress.isEnrolled) {
        const enrolled = document.createElement("div");
        enrolled.className = "campaign-detail-enrolled";

        const mark = document.createElement("span");
        mark.textContent = "✓";

        const text = document.createElement("strong");
        text.textContent = "You're In";

        enrolled.append(mark, text);
        container.append(summary, enrolled, action);
    } else {
        container.append(summary, action);
    }

    return container;
}

function createDailyChallengeCalendar(
    campaign,
    progress,
    history = []
) {
    const section = document.createElement("section");
    section.className = "campaign-detail-section campaign-detail-calendar";

    const label = document.createElement("h2");
    label.className = "campaign-detail-section-label campaign-detail-subsection-title";
    label.textContent = "Daily Progress";

    section.append(label);

    const historyByDate = new Map(
        history.map(item => [
            item.date,
            Number(item.quantity) || 0,
        ])
    );

    const today =
        new Date().toISOString().slice(0, 10);

    const startDate = new Date(
        `${campaign.startsOn}T12:00:00`
    );

    const endDate = new Date(
        `${campaign.endsOn}T12:00:00`
    );

    const monthCursor = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        1
    );

    while (monthCursor <= endDate) {
        const year =
            monthCursor.getFullYear();

        const monthIndex =
            monthCursor.getMonth();

        const monthKey =
            `${year}-${String(
                monthIndex + 1
            ).padStart(2, "0")}`;

        const monthBlock =
            document.createElement("div");
        monthBlock.className =
            "campaign-detail-calendar-month";

        const monthTitle =
            document.createElement("div");
        monthTitle.className =
            "campaign-detail-calendar-month-title";
        monthTitle.textContent =
            getMonthLabel(
                `${monthKey}-01`
            );

        monthBlock.append(monthTitle);

        const weekdays =
            document.createElement("div");
        weekdays.className =
            "campaign-detail-calendar-weekdays";

        ["S", "M", "T", "W", "T", "F", "S"]
            .forEach(day => {
                const weekday =
                    document.createElement("div");

                weekday.textContent = day;

                weekdays.append(weekday);
            });

        monthBlock.append(weekdays);

        const grid =
            document.createElement("div");
        grid.className =
            "campaign-detail-calendar-grid";

        const startDay =
            getMonthStartDay(
                year,
                monthIndex
            );

        for (
            let index = 0;
            index < startDay;
            index += 1
        ) {
            const spacer =
                document.createElement("div");

            spacer.className =
                "campaign-detail-calendar-spacer";

            grid.append(spacer);
        }

        const daysInMonth =
            getDaysInMonth(
                year,
                monthIndex
            );

        for (
            let day = 1;
            day <= daysInMonth;
            day += 1
        ) {
            const date =
                `${monthKey}-${String(day)
                    .padStart(2, "0")}`;

            const quantity =
                historyByDate.get(date) || 0;

            const isBeforeCampaign =
                date < campaign.startsOn;

            const isAfterCampaign =
                date > campaign.endsOn;

            const isFuture =
                date > today;

            const isToday =
                date === today;

            const isComplete =
                progress.todayTarget > 0 &&
                quantity >= progress.todayTarget;

            const isMissed =
                !isBeforeCampaign &&
                !isAfterCampaign &&
                !isFuture &&
                !isComplete;

            const cell =
                document.createElement("button");

            cell.type = "button";
            cell.className =
                "campaign-detail-calendar-day";

            if (
                isBeforeCampaign ||
                isAfterCampaign
            ) {
                cell.classList.add(
                    "campaign-detail-calendar-day-outside"
                );
            }

            if (isFuture) {
                cell.classList.add(
                    "campaign-detail-calendar-day-future"
                );
            }

            if (isToday) {
                cell.classList.add(
                    "campaign-detail-calendar-day-today"
                );
            }

            if (isComplete) {
                cell.classList.add(
                    "campaign-detail-calendar-day-complete"
                );
            } else if (isMissed) {
                cell.classList.add(
                    "campaign-detail-calendar-day-missed"
                );
            }

            const dayNumber =
                document.createElement("span");

            dayNumber.className =
                "campaign-detail-calendar-day-number";
            dayNumber.textContent = day;

            const value =
                document.createElement("span");

            value.className =
                "campaign-detail-calendar-day-value";

            if (
                !isBeforeCampaign &&
                !isAfterCampaign &&
                quantity > 0
            ) {
                value.textContent = quantity;
            } else {
                value.textContent = "";
            }

            cell.append(
                dayNumber,
                value
            );

            cell.disabled =
                isBeforeCampaign ||
                isAfterCampaign;

            if (
                !cell.disabled &&
                quantity > 0
            ) {
                cell.addEventListener(
                    "click",
                    () => {
                        showToast(
                            `${quantity} ${progress.unit} on ${formatCampaignDate(date)}.`,
                            "info"
                        );
                    }
                );
            }

            grid.append(cell);
        }

        monthBlock.append(grid);
        section.append(monthBlock);

        monthCursor.setMonth(
            monthCursor.getMonth() + 1
        );
    }

    return section;
}

function createDailyProgressBar(progress) {
    const percent = progress.todayTarget > 0
        ? (progress.todayCurrent / progress.todayTarget) * 100
        : 0;

    const track = document.createElement("div");
    track.className = "campaign-detail-progress-track";

    const fill = document.createElement("div");
    fill.className = "campaign-detail-progress-fill";
    fill.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;

    track.append(fill);

    return track;
}

function createDailyChallengeSection(campaign, progress) {
    if (
        !isManualDailyChallenge(campaign)
        || !progress.isEnrolled
    ) {
        return null;
    }

    const section = document.createElement("section");
    section.className = "campaign-detail-progress campaign-detail-today";

    const dailyGoalComplete =
        progress.todayTarget > 0 &&
        progress.todayCurrent >= progress.todayTarget;

    if (dailyGoalComplete) {
        section.classList.add("campaign-detail-today-complete");
    }

    const label = document.createElement("div");
    label.className = "campaign-detail-section-label";
    label.textContent = "Today";

    const valueRow = document.createElement("div");
    valueRow.className = "campaign-detail-progress-value-row";

    const value = document.createElement("div");
    value.className = "campaign-detail-progress-value";

    const current = document.createElement("strong");
    current.textContent = progress.todayCurrent;

    const target = document.createElement("span");
    target.textContent = ` / ${progress.todayTarget}`;

    value.append(current, target);

    const unit = document.createElement("div");
    unit.className = "campaign-detail-progress-unit";
    unit.textContent = progress.unit;

    valueRow.append(value, unit);

    section.append(
        label,
        valueRow,
        createDailyProgressBar(progress)
    );

    const status = document.createElement("div");
    status.className = "campaign-detail-progress-copy";

    if (progress.todayCurrent >= progress.todayTarget) {
        status.textContent =
            `✓ Daily goal complete · ${progress.todayCurrent} ${progress.unit}`;
    } else {
        const remaining =
            progress.todayTarget - progress.todayCurrent;

        status.textContent =
            `${remaining} ${progress.unit} to go today`;
    }

    section.append(status);

    const quickActions = document.createElement("div");
    quickActions.className = "campaign-detail-quick-actions";

    [25, 50, 100].forEach(amount => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "campaign-detail-quick-add";
        button.textContent = `+${amount}`;

        button.addEventListener("click", async () => {
            await addCampaignQuantity(
                campaign,
                progress,
                amount,
                button
            );
        });

        quickActions.append(button);
    });

    const custom = document.createElement("div");
    custom.className = "campaign-detail-custom-log";

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "1";
    input.step = "1";
    input.placeholder = "Custom amount";
    input.className = "campaign-detail-custom-input";

    const logButton = document.createElement("button");
    logButton.type = "button";
    logButton.className = "campaign-detail-log-button";
    logButton.textContent = "Log";

    logButton.addEventListener("click", async () => {
        const amount = Number(input.value);

        if (!Number.isFinite(amount) || amount <= 0) {
            showToast("Enter an amount greater than zero.", "error");
            return;
        }

        await addCampaignQuantity(
            campaign,
            progress,
            amount,
            logButton
        );
    });

    custom.append(input, logButton);

    section.append(quickActions, custom);

    return section;
}

function createCumulativeChallengeSection(campaign, progress) {
    if (
        !isManualCumulativeChallenge(campaign)
        || !progress.isEnrolled
    ) {
        return null;
    }

    const section = document.createElement("section");
    section.className = "campaign-detail-progress campaign-detail-cumulative-log";

    const label = document.createElement("div");
    label.className = "campaign-detail-section-label";
    label.textContent = `Log ${progress.unit || "Progress"}`;

    const today = document.createElement("div");
    today.className = "campaign-detail-cumulative-today";
    
    const todayValue = document.createElement("strong");
    todayValue.textContent = progress.todayCurrent || 0;
    
    const todayUnit = document.createElement("span");
    todayUnit.textContent =
        ` ${progress.unit || ""} today`;
    
    today.append(todayValue, todayUnit);
    
    section.append(label, today);

    const quickActions = document.createElement("div");
    quickActions.className = "campaign-detail-quick-actions";

    [1, 5, 10].forEach(amount => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "campaign-detail-quick-add";
        button.textContent = `+${amount}`;

        button.addEventListener("click", async () => {
            await addCumulativeCampaignQuantity(
                campaign,
                progress,
                amount,
                button
            );
        });

        quickActions.append(button);
    });

    const custom = document.createElement("div");
    custom.className = "campaign-detail-custom-log";

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.min = "0";
    input.step = "any";
    input.placeholder = "Custom amount";
    input.className = "campaign-detail-custom-input";

    const logButton = document.createElement("button");
    logButton.type = "button";
    logButton.className = "campaign-detail-log-button";
    logButton.textContent = "Log";

    logButton.addEventListener("click", async () => {
        const amount = Number(input.value);

        if (!Number.isFinite(amount) || amount <= 0) {
            showToast("Enter an amount greater than zero.", "error");
            return;
        }

        await addCumulativeCampaignQuantity(
            campaign,
            progress,
            amount,
            logButton
        );
    });

    custom.append(input, logButton);
    section.append(quickActions, custom);

    return section;
}

async function addCumulativeCampaignQuantity(
    campaign,
    progress,
    amount,
    button
) {
    const newTotal =
        Number(progress.todayCurrent || 0)
        + amount;

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Saving…";

    try {
        const result =
            await setCampaignQuantity(
                campaign.id,
                newTotal
            );
        
        const affectedCount =
            Number(result?.affectedCampaignCount) || 0;
        
        showToast(
            affectedCount > 1
                ? `${amount} ${progress.unit} logged · counted toward ${affectedCount} challenges.`
                : `${amount} ${progress.unit} logged.`,
            "success"
        );

        renderCampaignDetailView();
    } catch (error) {
        console.error(
            "Failed to log cumulative campaign progress:",
            error
        );

        button.disabled = false;
        button.textContent = originalText;

        showToast(
            error?.message || "Failed to log progress.",
            "error"
        );
    }
}

async function addCampaignQuantity(
    campaign,
    progress,
    amount,
    button
) {
    const newTotal = progress.todayCurrent + amount;
    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Saving…";

    try {
        const result =
            await setCampaignDailyQuantity(
                campaign.id,
                newTotal
            );
        
        const affectedCount =
            Number(result?.affectedCampaignCount) || 0;
        
        showToast(
            affectedCount > 1
                ? `${amount} ${progress.unit} logged · counted toward ${affectedCount} challenges.`
                : `${amount} ${progress.unit} logged.`,
            "success"
        );

        renderCampaignDetailView();
    } catch (error) {
        console.error(
            "Failed to log campaign progress:",
            error
        );

        button.disabled = false;
        button.textContent = originalText;

        showToast(
            error?.message || "Failed to log progress.",
            "error"
        );
    }
}

function createStandingsSection(campaign, standings) {
    if (!supportsStandings(campaign) || standings.length === 0) {
        return null;
    }

    const section = document.createElement("section");
    section.className = "campaign-detail-section campaign-detail-standings";

    const label = document.createElement("h2");
    label.className = "campaign-detail-section-label";
    label.textContent = "Challenge Standings";

    const list = document.createElement("div");
    list.className = "campaign-detail-standings-list";

    standings.forEach(item => {
        const row = document.createElement("div");
        row.className = "campaign-detail-standing-row";

        if (item.isCurrentMember) {
            row.classList.add("campaign-detail-standing-row-current");
        }

        const rank = document.createElement("div");
        rank.className = "campaign-detail-standing-rank";
        rank.textContent = item.rank;

        const identity = document.createElement("div");
        identity.className = "campaign-detail-standing-identity";

        const name = document.createElement("strong");
        name.className = "campaign-detail-standing-name";
        name.textContent = item.isCurrentMember
            ? `${item.paxName} · You`
            : item.paxName;

        identity.append(name);

        const progress = document.createElement("div");
        progress.className = "campaign-detail-standing-progress";

        if (
            isManualDailyChallenge(campaign)
            && item.totalDays > 0
        ) {
            progress.textContent =
                `${item.completedDays} / ${item.totalDays} days`;
        } else {
            progress.textContent =
                `${item.current} / ${item.target}`;
        }

        row.append(rank, identity, progress);
        list.append(row);
    });

    section.append(label, list);

    return section;
}

function createDetailContent(
    campaign,
    progress,
    recentProgress,
    dailyHistory,
    standings
) {
    const fragment = document.createDocumentFragment();

    const hero = document.createElement("section");
    hero.className = "campaign-detail-hero";

    const eyebrow = document.createElement("div");
    eyebrow.className = "campaign-detail-eyebrow";
    eyebrow.textContent = `${getCampaignStatus(campaign)} · ${getCampaignTypeLabel(campaign)}`;

    const title = document.createElement("h1");
    title.className = "campaign-detail-title";
    title.textContent = campaign.title;

    const dates = document.createElement("div");
    dates.className = "campaign-detail-dates";
    dates.textContent = formatCampaignDateRange(campaign);

    hero.append(eyebrow, title, dates);

    if (campaign.description) {
        const description = document.createElement("p");
        description.className = "campaign-detail-description";
        description.textContent = campaign.description;
        hero.append(description);
    }

    fragment.append(hero);

    const dailySection = createDailyChallengeSection(campaign, progress);

    if (dailySection) {
        fragment.append(dailySection);
    }

    const cumulativeSection =
        createCumulativeChallengeSection(campaign, progress);

    if (cumulativeSection) {
        fragment.append(cumulativeSection);
    }

    if (isIndividualChallenge(campaign) && !progress.isEnrolled) {
        const joinSection = document.createElement("section");
        joinSection.className = "campaign-detail-join-panel";

        const participantCount = document.createElement("div");
        participantCount.className = "campaign-detail-participant-count";

        const count = document.createElement("strong");
        count.textContent = progress.participantCount;

        const label = document.createElement("span");
        label.textContent = " PAX participating";

        participantCount.append(count, label);

        const joinButton = document.createElement("button");
        joinButton.type = "button";
        joinButton.className = "campaign-detail-join";
        joinButton.textContent = "Join Challenge";

        joinButton.addEventListener("click", async () => {
            joinButton.disabled = true;
            joinButton.textContent = "Joining…";

            try {
                await joinCampaign(campaign.id);

                showToast("You're in.", "success");
                renderCampaignDetailView();
            } catch (error) {
                console.error("Failed to join challenge:", error);

                joinButton.disabled = false;
                joinButton.textContent = "Join Challenge";

                showToast(
                    error?.message || "Failed to join challenge.",
                    "error"
                );
            }
        });

        joinSection.append(participantCount, joinButton);
        fragment.append(joinSection);
    }

    campaignDetailData = {
        campaign,
        progress,
        recentProgress,
        dailyHistory,
        standings,
    };

    fragment.append(
        createCampaignDetailTabs()
    );

    const tabContent = document.createElement("div");
    tabContent.className = "campaign-detail-tab-content";

    tabContent.append(
        createCampaignDetailTabContent(
            campaignDetailData
        )
    );

    fragment.append(tabContent);

    return fragment;
}

export function renderCampaignDetailView() {
    const app = document.getElementById("app");
    if (!app) return;

    activeCampaignDetailTab = "progress";
    campaignDetailData = null;

    app.replaceChildren();

    const header = createAppHeader({
        title: "Challenge",
        showBack: true,
        showMenu: true,
        fallbackView: "campaigns",
    });

    app.appendChild(header);

    const container = document.createElement("main");
    container.className = "campaign-detail-view";

    const content = document.createElement("div");
    content.className = "campaign-detail-content";

    content.append(
        createDetailState({
            type: "loading",
            title: "Loading campaign",
            message: "Pulling the latest regional progress.",
        })
    );

    container.append(content);
    app.append(container, createGlobalNav());

    const campaignId = state.selectedCampaignId;

    if (!campaignId) {
        content.replaceChildren(
            createDetailState({
                type: "error",
                title: "Campaign not found",
                message: "Return to Campaigns and select a campaign.",
            })
        );

        return;
    }

    loadCampaign(campaignId)
        .then(async campaign => {
            if (!campaign) {
                throw new Error("Campaign not found.");
            }

            const progress = await loadCampaignProgress(campaignId);

            const [
                recentProgress,
                dailyHistory,
                standings,
            ] = await Promise.all([
                supportsRecentProgress(campaign)
                    ? loadCampaignRecentProgress(campaignId)
                    : Promise.resolve([]),
            
                isManualDailyChallenge(campaign) && progress.isEnrolled
                    ? loadCampaignDailyHistory(campaignId)
                    : Promise.resolve([]),
            
                supportsStandings(campaign)
                    ? loadCampaignStandings(campaignId)
                    : Promise.resolve([]),
            ]);
            
            content.replaceChildren(
                createDetailContent(
                    campaign,
                    progress,
                    recentProgress,
                    dailyHistory,
                    standings
                )
            );
        })
        .catch(error => {
            console.error("Failed to load campaign detail:", error);

            content.replaceChildren(
                createDetailState({
                    type: "error",
                    title: "Unable to load campaign",
                    message: "Check your connection and try again.",
                    onRetry: renderCampaignDetailView,
                })
            );
        });
}