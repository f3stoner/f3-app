import { state } from "../modules/state.js";
import {
    loadRegionCampaigns,
    loadCampaignProgress,
} from "../services/cloudData.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { canManageCampaigns } from "../utils/permissions.js";

function formatCampaignDate(date) {
    if (!date) return "";

    return new Date(`${date}T12:00:00`)
        .toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
}

function formatCampaignDateRange(campaign) {
    const start = formatCampaignDate(campaign.startsOn);
    const end = formatCampaignDate(campaign.endsOn);

    if (!start) return end;
    if (!end) return start;

    return `${start}–${end}`;
}

function getCampaignGroup(campaign, today) {
    if (
        campaign.status === "completed" ||
        campaign.status === "cancelled" ||
        campaign.endsOn < today
    ) {
        return "completed";
    }

    if (
        campaign.status === "scheduled" ||
        campaign.startsOn > today
    ) {
        return "upcoming";
    }

    return "active";
}

function createCampaignSectionLabel(label) {
    const heading = document.createElement("h2");
    heading.className = "campaign-section-label";
    heading.textContent = label;

    return heading;
}

function createCampaignProgressBar(progress) {
    const track = document.createElement("div");
    track.className = "campaign-progress-track";

    const fill = document.createElement("div");
    fill.className = "campaign-progress-fill";
    fill.style.width = `${Math.min(Math.max(progress.percent, 0), 100)}%`;

    track.append(fill);

    return track;
}

function createActiveCampaign(campaign, progress) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "campaign-active-card";

    const header = document.createElement("div");
    header.className = "campaign-active-card-header";

    const identity = document.createElement("div");
    identity.className = "campaign-active-card-identity";

    const eyebrow = document.createElement("div");
    eyebrow.className = "campaign-active-eyebrow";
    eyebrow.textContent = "Regional Campaign";

    const title = document.createElement("h3");
    title.className = "campaign-active-title";
    title.textContent = campaign.title;

    identity.append(eyebrow, title);

    const dates = document.createElement("div");
    dates.className = "campaign-active-dates";
    dates.textContent = formatCampaignDateRange(campaign);

    header.append(identity, dates);
    item.append(header);

    if (campaign.description) {
        const description = document.createElement("p");
        description.className = "campaign-active-description";
        description.textContent = campaign.description;

        item.append(description);
    }

    const progressHeader = document.createElement("div");
    progressHeader.className = "campaign-progress-header";

    const value = document.createElement("div");
    value.className = "campaign-progress-value";

    const current = document.createElement("strong");
    current.textContent = progress.current;

    const target = document.createElement("span");
    target.textContent = ` / ${progress.target}`;

    value.append(current, target);

    const unit = document.createElement("div");
    unit.className = "campaign-progress-unit";
    unit.textContent = progress.unit;

    const percent = document.createElement("div");
    percent.className = "campaign-progress-percent";
    percent.textContent = `${progress.percent}%`;

    progressHeader.append(value, unit, percent);

    item.append(
        progressHeader,
        createCampaignProgressBar(progress)
    );

    const footer = document.createElement("div");
    footer.className = "campaign-progress-footer";

    if (progress.goalReached) {
        footer.textContent = `Goal reached · ${progress.current} ${progress.unit}`;
    } else {
        const remaining = Math.max(progress.target - progress.current, 0);
        footer.textContent = `${remaining} ${progress.unit} to go`;
    }

    item.append(footer);

    item.addEventListener("click", () => {
        state.selectedCampaignId = campaign.id;
        navigateTo("campaignDetail");
    });

    return item;
}

function createCampaignRow(campaign, { completed = false } = {}) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "campaign-row";

    const content = document.createElement("div");
    content.className = "campaign-row-content";

    const title = document.createElement("div");
    title.className = "campaign-row-title";
    title.textContent = campaign.title;

    const meta = document.createElement("div");
    meta.className = "campaign-row-meta";
    meta.textContent = formatCampaignDateRange(campaign);

    content.append(title, meta);

    const status = document.createElement("div");
    status.className = completed
        ? "campaign-row-status campaign-row-status-complete"
        : "campaign-row-status";
    status.textContent = completed ? "Complete" : "Upcoming";

    const chevron = document.createElement("span");
    chevron.className = "campaign-row-chevron";
    chevron.textContent = "›";

    row.append(content, status, chevron);

    row.addEventListener("click", () => {
        state.selectedCampaignId = campaign.id;
        navigateTo("campaignDetail");
    });

    return row;
}

function createCampaignState({
    type,
    title,
    message,
    onRetry = null,
}) {
    const container = document.createElement("div");
    container.className = `campaign-state campaign-state-${type}`;

    if (type === "loading") {
        const spinner = document.createElement("div");
        spinner.className = "campaign-spinner";
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
        retry.className = "campaign-retry";
        retry.textContent = "Try Again";
        retry.addEventListener("click", onRetry);

        container.append(retry);
    }

    return container;
}

async function loadCampaignContent(content) {
    const regionId = state.activeRegionId || state.currentRegionId;

    if (!regionId) {
        content.replaceChildren(
            createCampaignState({
                type: "empty",
                title: "No region selected",
                message: "Select a region to view its campaigns.",
            })
        );

        return;
    }

    const campaigns = await loadRegionCampaigns(regionId);

    if (campaigns.length === 0) {
        content.replaceChildren(
            createCampaignState({
                type: "empty",
                title: "No campaigns yet",
                message: "Regional campaigns will appear here when they launch.",
            })
        );

        return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const groups = {
        active: [],
        upcoming: [],
        completed: [],
    };

    campaigns.forEach(campaign => {
        groups[getCampaignGroup(campaign, today)].push(campaign);
    });

    const fragment = document.createDocumentFragment();

    if (groups.active.length > 0) {
        const section = document.createElement("section");
        section.className = "campaign-section campaign-section-active";
        section.append(createCampaignSectionLabel("Active"));

        const list = document.createElement("div");
        list.className = "campaign-active-list";

        const progressResults = await Promise.all(
            groups.active.map(async campaign => ({
                campaign,
                progress: await loadCampaignProgress(campaign.id),
            }))
        );

        progressResults.forEach(({ campaign, progress }) => {
            list.append(createActiveCampaign(campaign, progress));
        });

        section.append(list);
        fragment.append(section);
    }

    if (groups.upcoming.length > 0) {
        const section = document.createElement("section");
        section.className = "campaign-section";
        section.append(createCampaignSectionLabel("Upcoming"));

        const list = document.createElement("div");
        list.className = "campaign-row-list";

        groups.upcoming.forEach(campaign => {
            list.append(createCampaignRow(campaign));
        });

        section.append(list);
        fragment.append(section);
    }

    if (groups.completed.length > 0) {
        const section = document.createElement("section");
        section.className = "campaign-section";
        section.append(createCampaignSectionLabel("Completed"));

        const list = document.createElement("div");
        list.className = "campaign-row-list";

        groups.completed.forEach(campaign => {
            list.append(
                createCampaignRow(campaign, {
                    completed: true,
                })
            );
        });

        section.append(list);
        fragment.append(section);
    }

    content.replaceChildren(fragment);
}

export function renderCampaignsView() {
    const app = document.getElementById("app");
    if (!app) return;

    app.replaceChildren();

    const container = document.createElement("main");
    container.className = "campaigns-view";

    const header = document.createElement("header");
    header.className = "campaign-header";

    const identity = document.createElement("div");
    identity.className = "campaign-header-identity";

    const title = document.createElement("h1");
    title.textContent = "Campaigns";

    const subtitle = document.createElement("p");
    subtitle.className = "campaign-header-subtitle";
    subtitle.textContent = "What the region is working toward.";

    identity.append(title, subtitle);

    if (canManageCampaigns()) {
        const startButton = document.createElement("button");
        startButton.type = "button";
        startButton.className = "campaign-header-action";
        startButton.textContent = "+ Start";
    
        startButton.addEventListener("click", () => {
            navigateTo("campaignCreate");
        });
    
        header.append(identity, startButton);
    } else {
        header.append(identity);
    }

    const content = document.createElement("div");
    content.className = "campaign-content";

    content.append(
        createCampaignState({
            type: "loading",
            title: "Loading campaigns",
            message: "Pulling the latest regional progress.",
        })
    );

    container.append(header, content);
    app.append(container, createGlobalNav());

    loadCampaignContent(content).catch(error => {
        console.error("Failed to load campaigns:", error);

        content.replaceChildren(
            createCampaignState({
                type: "error",
                title: "Unable to load campaigns",
                message: "Check your connection and try again.",
                onRetry: renderCampaignsView,
            })
        );
    });
}