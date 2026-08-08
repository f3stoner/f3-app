import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import {
    loadCampaign,
    loadCampaignProgress,
    loadCampaignRecentProgress,
    deleteCampaign,
} from "../services/cloudData.js";
import { canManageCampaigns } from "../utils/permissions.js";
import { showToast } from "../utils/toast.js";
import { createGlobalNav } from "../components/globalNav.js";

function formatCampaignDate(date) {
    if (!date) return "";

    return new Date(`${date}T12:00:00`)
        .toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
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
    if (!canManageCampaigns()) {
        return null;
    }

    const section = document.createElement("section");
    section.className =
        "campaign-detail-section campaign-detail-management";

    const label = document.createElement("h2");
    label.className = "campaign-detail-section-label";
    label.textContent = "Campaign Management";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "campaign-detail-delete";
    deleteButton.textContent = "Delete Campaign";

    deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
            `Delete "${campaign.title}"?\n\nThis cannot be undone.`
        );

        if (!confirmed) return;

        deleteButton.disabled = true;
        deleteButton.textContent = "Deleting…";

        try {
            await deleteCampaign(campaign.id);

            state.selectedCampaignId = null;

            showToast("Campaign deleted.", "success");
            navigateTo("campaigns");
        } catch (error) {
            console.error("Failed to delete campaign:", error);

            deleteButton.disabled = false;
            deleteButton.textContent = "Delete Campaign";

            showToast(
                error?.message || "Failed to delete campaign.",
                "error"
            );
        }
    });

    section.append(label, deleteButton);

    return section;
}

function createDetailContent(
    campaign,
    progress,
    recentProgress
) {
    const fragment = document.createDocumentFragment();

    const hero = document.createElement("section");
    hero.className = "campaign-detail-hero";

    const eyebrow = document.createElement("div");
    eyebrow.className = "campaign-detail-eyebrow";
    eyebrow.textContent = `${getCampaignStatus(campaign)} · Regional Campaign`;

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

    const progressSection = document.createElement("section");
    progressSection.className = "campaign-detail-progress";

    const progressLabel = document.createElement("div");
    progressLabel.className = "campaign-detail-section-label";
    progressLabel.textContent = "Regional Progress";

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

    progressSection.append(
        progressLabel,
        valueRow,
        createProgressBar(progress)
    );

    const progressCopy = document.createElement("div");
    progressCopy.className = "campaign-detail-progress-copy";

    if (progress.goalReached) {
        progressCopy.textContent =
            `Goal reached · ${progress.current} ${progress.unit}`;
    } else {
        const remaining = Math.max(progress.target - progress.current, 0);
        progressCopy.textContent = `${remaining} ${progress.unit} to go`;
    }

    progressSection.append(progressCopy);
    fragment.append(progressSection);

    const goalSection = document.createElement("section");
    goalSection.className = "campaign-detail-section";

    const goalLabel = document.createElement("h2");
    goalLabel.className = "campaign-detail-section-label";
    goalLabel.textContent = "The Goal";

    const goalCopy = document.createElement("p");
    goalCopy.className = "campaign-detail-copy";
    goalCopy.textContent =
        `Reach ${progress.target} ${progress.unit} between ${formatCampaignDateRange(campaign)}.`;

    goalSection.append(goalLabel, goalCopy);
    fragment.append(goalSection);

    const rulesSection = document.createElement("section");
    rulesSection.className = "campaign-detail-section";

    const rulesLabel = document.createElement("h2");
    rulesLabel.className = "campaign-detail-section-label";
    rulesLabel.textContent = "How Progress Counts";

    const rulesCopy = document.createElement("p");
    rulesCopy.className = "campaign-detail-copy";
    rulesCopy.textContent = getCampaignMetricDescription(campaign);

    rulesSection.append(rulesLabel, rulesCopy);
    fragment.append(rulesSection);

    fragment.append(createRecentProgressSection(recentProgress));

    const managementSection =
        createCampaignManagementSection(campaign);

    if (managementSection) {
        fragment.append(managementSection);
    }

        return fragment;
    }

export function renderCampaignDetailView() {
    const app = document.getElementById("app");
    if (!app) return;

    app.replaceChildren();

    const container = document.createElement("main");
    container.className = "campaign-detail-view";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "campaign-detail-back";
    backButton.textContent = "‹ Campaigns";

    backButton.addEventListener("click", () => {
        navigateTo("campaigns");
    });

    const content = document.createElement("div");
    content.className = "campaign-detail-content";

    content.append(
        createDetailState({
            type: "loading",
            title: "Loading campaign",
            message: "Pulling the latest regional progress.",
        })
    );

    container.append(backButton, content);
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

    Promise.all([
        loadCampaign(campaignId),
        loadCampaignProgress(campaignId),
        loadCampaignRecentProgress(campaignId),
    ])
        .then(([campaign, progress, recentProgress]) => {
            if (!campaign) {
                throw new Error("Campaign not found.");
            }

            content.replaceChildren(
                createDetailContent(
                    campaign,
                    progress,
                    recentProgress
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