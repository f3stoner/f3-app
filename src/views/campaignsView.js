import { state } from "../modules/state.js";
import {
    loadRegionCampaigns,
    loadCampaignProgress,
    joinCampaign,
    logMemberActivity,
} from "../services/cloudData.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";

let activeCampaignTab = "mine";
let campaignViewData = null;

function renderCampaignTab() {
    const tabContent =
        document.querySelector(
            ".view-campaigns .campaign-tab-content"
        );

    if (!tabContent || !campaignViewData) {
        return;
    }

    tabContent.replaceChildren(
        createCampaignTabContent(
            campaignViewData
        )
    );

    document
        .querySelectorAll(
            ".view-campaigns .campaign-tab"
        )
        .forEach(button => {
            button.classList.toggle(
                "campaign-tab-active",
                button.dataset.campaignTab ===
                    activeCampaignTab
            );
        });
}

function formatCampaignDate(date) {
    if (!date) return "";

    return new Date(`${date}T12:00:00`)
        .toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
}

function formatCampaignDateWithYear(date) {
    if (!date) return "";

    return new Date(`${date}T12:00:00`)
        .toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
}

function formatCampaignDateRange(campaign) {
    if (!campaign.startsOn && !campaign.endsOn) {
        return "";
    }

    if (!campaign.startsOn) {
        return formatCampaignDateWithYear(
            campaign.endsOn
        );
    }

    if (!campaign.endsOn) {
        return formatCampaignDateWithYear(
            campaign.startsOn
        );
    }

    const startYear =
        campaign.startsOn.slice(0, 4);

    const endYear =
        campaign.endsOn.slice(0, 4);

    if (startYear !== endYear) {
        return (
            `${formatCampaignDateWithYear(campaign.startsOn)}` +
            `–${formatCampaignDateWithYear(campaign.endsOn)}`
        );
    }

    const start =
        formatCampaignDate(
            campaign.startsOn
        );

    const end =
        formatCampaignDate(
            campaign.endsOn
        );

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

function isPrivateChallenge(campaign) {
    return campaign.visibility === "private";
}

function isIndividualChallenge(campaign) {
    return (
        campaign.participantMode === "individual" &&
        campaign.enrollmentMode === "opt_in"
    );
}

function getIndividualChallengeLabel(campaign) {
    return isPrivateChallenge(campaign)
        ? "Private Challenge"
        : "Joined Challenge";
}

function createCampaignSectionLabel(label) {
    const heading =
        document.createElement("h2");

    heading.className =
        "campaign-section-label";

    heading.textContent = label;

    return heading;
}

function createCampaignProgressBar(progress) {
    const track =
        document.createElement("div");

    track.className =
        "campaign-progress-track";

    const fill =
        document.createElement("div");

    fill.className =
        "campaign-progress-fill";

    fill.style.width =
        `${Math.min(
            Math.max(progress.percent, 0),
            100
        )}%`;

    track.append(fill);

    return track;
}

function createCampaignProgressRow(
    campaign,
    progress,
    eyebrowText
) {
    const row =
        document.createElement("button");

    row.type = "button";
    row.className =
        "campaign-progress-row";

    if (isPrivateChallenge(campaign)) {
        row.classList.add(
            "campaign-progress-row-private"
        );
    }

    const top =
        document.createElement("div");

    top.className =
        "campaign-progress-row-top";

    const identity =
        document.createElement("div");

    identity.className =
        "campaign-progress-row-identity";

    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "campaign-progress-row-eyebrow";

    eyebrow.textContent =
        eyebrowText;

    const title =
        document.createElement("div");

    title.className =
        "campaign-progress-row-title";

    title.textContent =
        campaign.title;

    identity.append(
        eyebrow,
        title
    );

    const percent =
        document.createElement("div");

    percent.className =
        "campaign-progress-row-percent";

    percent.textContent =
        `${progress.percent}%`;

    top.append(
        identity,
        percent
    );

    const meta =
        document.createElement("div");

    meta.className =
        "campaign-progress-row-meta";

    const progressText =
        document.createElement("span");

    progressText.textContent =
        `${progress.current} / ${progress.target} ${progress.unit}`;

    const dates =
        document.createElement("span");

    dates.textContent =
        formatCampaignDateRange(
            campaign
        );

    meta.append(
        progressText,
        dates
    );

    row.append(
        top,
        meta,
        createCampaignProgressBar(
            progress
        )
    );

    row.addEventListener(
        "click",
        () => {
            state.selectedCampaignId =
                campaign.id;

            navigateTo(
                "campaignDetail"
            );
        }
    );

    return row;
}

function createUpcomingChallengeRow(
    campaign,
    eyebrowText
) {
    const row =
        document.createElement("button");

    row.type = "button";
    row.className =
        "campaign-progress-row";

    if (isPrivateChallenge(campaign)) {
        row.classList.add(
            "campaign-progress-row-private"
        );
    }

    const top =
        document.createElement("div");

    top.className =
        "campaign-progress-row-top";

    const identity =
        document.createElement("div");

    identity.className =
        "campaign-progress-row-identity";

    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "campaign-progress-row-eyebrow";

    eyebrow.textContent =
        eyebrowText;

    const title =
        document.createElement("div");

    title.className =
        "campaign-progress-row-title";

    title.textContent =
        campaign.title;

    identity.append(
        eyebrow,
        title
    );

    const status =
        document.createElement("div");

    status.className =
        "campaign-row-status";

    status.textContent =
        "Upcoming";

    top.append(
        identity,
        status
    );

    const meta =
        document.createElement("div");

    meta.className =
        "campaign-progress-row-meta";

    const dates =
        document.createElement("span");

    dates.textContent =
        formatCampaignDateRange(
            campaign
        );

    meta.append(dates);

    row.append(
        top,
        meta
    );

    row.addEventListener(
        "click",
        () => {
            state.selectedCampaignId =
                campaign.id;

            navigateTo(
                "campaignDetail"
            );
        }
    );

    return row;
}

function createAvailableChallenge(
    campaign,
    progress,
    onJoined
) {
    const item =
        document.createElement("div");

    item.className =
        "campaign-available-card";

    const main =
        document.createElement("button");

    main.type = "button";
    main.className =
        "campaign-available-main";

    const identity =
        document.createElement("div");

    identity.className =
        "campaign-available-identity";

    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "campaign-active-eyebrow";

    eyebrow.textContent =
        "Available Challenge";

    const title =
        document.createElement("h3");

    title.className =
        "campaign-active-title";

    title.textContent =
        campaign.title;

    identity.append(
        eyebrow,
        title
    );

    const dates =
        document.createElement("div");

    dates.className =
        "campaign-active-dates";

    dates.textContent =
        formatCampaignDateRange(
            campaign
        );

    const header =
        document.createElement("div");

    header.className =
        "campaign-active-card-header";

    header.append(
        identity,
        dates
    );

    main.append(header);

    if (campaign.description) {
        const description =
            document.createElement("p");

        description.className =
            "campaign-available-description";

        description.textContent =
            campaign.description;

        main.append(description);
    }

    const meta =
        document.createElement("div");

    meta.className =
        "campaign-available-meta";

    meta.textContent =
        `${progress.participantCount} PAX participating`;

    main.append(meta);

    main.addEventListener(
        "click",
        () => {
            state.selectedCampaignId =
                campaign.id;

            navigateTo(
                "campaignDetail"
            );
        }
    );

    const joinButton =
        document.createElement("button");

    joinButton.type = "button";
    joinButton.className =
        "campaign-available-join";

    joinButton.textContent =
        "Join Challenge";

    joinButton.addEventListener(
        "click",
        async () => {
            joinButton.disabled = true;
            joinButton.textContent =
                "Joining…";

            try {
                await joinCampaign(
                    campaign.id
                );

                showToast(
                    "You're in.",
                    "success"
                );

                onJoined();
            } catch (error) {
                console.error(
                    "Failed to join challenge:",
                    error
                );

                joinButton.disabled =
                    false;

                joinButton.textContent =
                    "Join Challenge";

                showToast(
                    error?.message ||
                        "Failed to join challenge.",
                    "error"
                );
            }
        }
    );

    item.append(
        main,
        joinButton
    );

    return item;
}

function createCampaignRow(
    campaign,
    {
        completed = false,
        label = null,
    } = {}
) {
    const row =
        document.createElement("button");

    row.type = "button";
    row.className =
        "campaign-row";

    if (isPrivateChallenge(campaign)) {
        row.classList.add(
            "campaign-row-private"
        );
    }

    const content =
        document.createElement("div");

    content.className =
        "campaign-row-content";

    if (label) {
        const eyebrow =
            document.createElement("div");

        eyebrow.className =
            "campaign-progress-row-eyebrow";

        eyebrow.textContent =
            label;

        content.append(
            eyebrow
        );
    }

    const title =
        document.createElement("div");

    title.className =
        "campaign-row-title";

    title.textContent =
        campaign.title;

    const meta =
        document.createElement("div");

    meta.className =
        "campaign-row-meta";

    meta.textContent =
        formatCampaignDateRange(
            campaign
        );

    content.append(
        title,
        meta
    );

    const status =
        document.createElement("div");

    status.className =
        completed
            ? "campaign-row-status campaign-row-status-complete"
            : "campaign-row-status";

    status.textContent =
        completed
            ? "Complete"
            : "Upcoming";

    const chevron =
        document.createElement("span");

    chevron.className =
        "campaign-row-chevron";

    chevron.textContent = "›";

    row.append(
        content,
        status,
        chevron
    );

    row.addEventListener(
        "click",
        () => {
            state.selectedCampaignId =
                campaign.id;

            navigateTo(
                "campaignDetail"
            );
        }
    );

    return row;
}

function createCampaignState({
    type,
    title,
    message,
    onRetry = null,
}) {
    const container =
        document.createElement("div");

    container.className =
        `campaign-state campaign-state-${type}`;

    if (type === "loading") {
        const spinner =
            document.createElement("div");

        spinner.className =
            "campaign-spinner";

        container.append(
            spinner
        );
    }

    const heading =
        document.createElement("h2");

    heading.textContent =
        title;

    const copy =
        document.createElement("p");

    copy.textContent =
        message;

    container.append(
        heading,
        copy
    );

    if (onRetry) {
        const retry =
            document.createElement("button");

        retry.type = "button";
        retry.className =
            "campaign-retry";

        retry.textContent =
            "Try Again";

        retry.addEventListener(
            "click",
            onRetry
        );

        container.append(
            retry
        );
    }

    return container;
}

function createActivityLogger(
    activeProgress,
    onLogged
) {
    const activities =
        new Map();

    activeProgress.forEach(
        ({ campaign, progress }) => {
            if (
                campaign.metricKey !==
                    "manual_quantity" ||
                !campaign.activityKey
            ) {
                return;
            }

            const isApplicable =
                campaign.participantMode ===
                    "collective" ||
                progress.isEnrolled;

            if (!isApplicable) {
                return;
            }

            if (
                !activities.has(
                    campaign.activityKey
                )
            ) {
                activities.set(
                    campaign.activityKey,
                    {
                        activityKey:
                            campaign.activityKey,

                        name:
                            campaign.activityName ||
                            progress.unit ||
                            campaign.activityKey,

                        unit:
                            progress.unit || "",
                    }
                );
            }
        }
    );

    if (activities.size === 0) {
        return null;
    }

    const section =
        document.createElement("section");

    section.className =
        "campaign-activity-logger";

    const heading =
        document.createElement("div");

    heading.className =
        "campaign-activity-logger-heading";

    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "campaign-section-label";

    eyebrow.textContent =
        "Log Activity";

    const copy =
        document.createElement("p");

    copy.textContent =
        "One log updates every matching challenge.";

    heading.append(
        eyebrow,
        copy
    );

    const controls =
        document.createElement("div");

    controls.className =
        "campaign-activity-logger-controls";

    const activityInput =
        document.createElement("select");

    activityInput.className =
        "campaign-activity-input";

    activities.forEach(activity => {
        const option =
            document.createElement("option");

        option.value =
            activity.activityKey;

        option.textContent =
            activity.name;

        activityInput.append(
            option
        );
    });

    const quantityInput =
        document.createElement("input");

    quantityInput.type = "number";
    quantityInput.min = "0.01";
    quantityInput.step = "any";
    quantityInput.inputMode =
        "decimal";

    quantityInput.placeholder =
        "Amount";

    quantityInput.className =
        "campaign-activity-quantity";

    const logButton =
        document.createElement("button");

    logButton.type = "button";
    logButton.className =
        "campaign-activity-submit";

    logButton.textContent =
        "Log";

    logButton.addEventListener(
        "click",
        async () => {
            const activityKey =
                activityInput.value;

            const quantity =
                Number(
                    quantityInput.value
                );

            if (!activityKey) {
                showToast(
                    "Choose an activity.",
                    "error"
                );
                return;
            }

            if (
                !Number.isFinite(
                    quantity
                ) ||
                quantity <= 0
            ) {
                showToast(
                    "Enter an amount greater than zero.",
                    "error"
                );
                return;
            }

            logButton.disabled =
                true;

            logButton.textContent =
                "Logging…";

            try {
                const result =
                    await logMemberActivity(
                        activityKey,
                        quantity
                    );

                const affectedCount =
                    Number(
                        result
                            ?.affectedCampaignCount
                    ) || 0;

                const unit =
                    result?.unit ||
                    activities.get(
                        activityKey
                    )?.unit ||
                    "";

                showToast(
                    affectedCount > 1
                        ? `${quantity} ${unit} logged · counted toward ${affectedCount} challenges.`
                        : `${quantity} ${unit} logged.`,
                    "success"
                );

                quantityInput.value =
                    "";

                await onLogged();
            } catch (error) {
                console.error(
                    "Failed to log activity:",
                    error
                );

                logButton.disabled =
                    false;

                logButton.textContent =
                    "Log";

                showToast(
                    error?.message ||
                        "Failed to log activity.",
                    "error"
                );
            }
        }
    );

    controls.append(
        quantityInput,
        activityInput,
        logButton
    );

    section.append(
        heading,
        controls
    );

    return section;
}

function createCampaignTabs() {
    const tabs =
        document.createElement("div");

    tabs.className =
        "campaign-tabs";

    [
        {
            key: "mine",
            label: "My Challenges",
        },
        {
            key: "discover",
            label: "Discover",
        },
        {
            key: "history",
            label: "History",
        },
    ].forEach(tab => {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className =
            "campaign-tab";

        button.dataset.campaignTab =
            tab.key;

        button.textContent =
            tab.label;

        if (
            tab.key ===
            activeCampaignTab
        ) {
            button.classList.add(
                "campaign-tab-active"
            );
        }

        button.addEventListener(
            "click",
            () => {
                if (
                    activeCampaignTab ===
                    tab.key
                ) {
                    return;
                }

                activeCampaignTab =
                    tab.key;

                renderCampaignTab();
            }
        );

        tabs.append(
            button
        );
    });

    return tabs;
}

function createCampaignTabContent({
    lifecycleGroups,
    groups,
}) {
    const content =
        document.createDocumentFragment();

    if (activeCampaignTab === "mine") {
        if (
            groups.private.length > 0
        ) {
            const section =
                document.createElement("section");

            section.className =
                "campaign-section";

            section.append(
                createCampaignSectionLabel(
                    "Private"
                )
            );

            const list =
                document.createElement("div");

            list.className =
                "campaign-progress-row-list";

            groups.private.forEach(
                ({ campaign, progress }) => {
                    list.append(
                        createCampaignProgressRow(
                            campaign,
                            progress,
                            "Private Challenge"
                        )
                    );
                }
            );

            section.append(list);
            content.append(section);
        }

        if (
            groups.sharedJoined.length > 0
        ) {
            const section =
                document.createElement("section");

            section.className =
                "campaign-section";

            section.append(
                createCampaignSectionLabel(
                    "Shared"
                )
            );

            const list =
                document.createElement("div");

            list.className =
                "campaign-progress-row-list";

            groups.sharedJoined.forEach(
                ({ campaign, progress }) => {
                    list.append(
                        createCampaignProgressRow(
                            campaign,
                            progress,
                            getIndividualChallengeLabel(
                                campaign
                            )
                        )
                    );
                }
            );

            section.append(list);
            content.append(section);
        }

        if (
            groups.regional.length > 0
        ) {
            const section =
                document.createElement("section");

            section.className =
                "campaign-section";

            section.append(
                createCampaignSectionLabel(
                    "Regional"
                )
            );

            const list =
                document.createElement("div");

            list.className =
                "campaign-progress-row-list";

            groups.regional.forEach(
                ({ campaign, progress }) => {
                    list.append(
                        createCampaignProgressRow(
                            campaign,
                            progress,
                            "Regional Campaign"
                        )
                    );
                }
            );

            section.append(list);
            content.append(section);
        }

        if (
            groups.privateUpcoming.length > 0
        ) {
            const section =
                document.createElement("section");

            section.className =
                "campaign-section";

            section.append(
                createCampaignSectionLabel(
                    "Starting Soon"
                )
            );

            const list =
                document.createElement("div");

            list.className =
                "campaign-progress-row-list";

            groups.privateUpcoming.forEach(
                campaign => {
                    list.append(
                        createUpcomingChallengeRow(
                            campaign,
                            "Private Challenge"
                        )
                    );
                }
            );

            section.append(list);
            content.append(section);
        }

        if (
            groups.private.length === 0 &&
            groups.sharedJoined.length === 0 &&
            groups.regional.length === 0 &&
            groups.privateUpcoming.length === 0
        ) {
            content.append(
                createCampaignState({
                    type: "empty",
                    title:
                        "Nothing active yet",
                    message:
                        "Create a challenge or join one from Discover.",
                })
            );
        }
    }

    if (
        activeCampaignTab ===
        "discover"
    ) {
        if (
            groups.available.length > 0
        ) {
            const section =
                document.createElement("section");

            section.className =
                "campaign-section";

            section.append(
                createCampaignSectionLabel(
                    "Available Challenges"
                )
            );

            const list =
                document.createElement("div");

            list.className =
                "campaign-available-list";

            groups.available.forEach(
                ({ campaign, progress }) => {
                    list.append(
                        createAvailableChallenge(
                            campaign,
                            progress,
                            renderCampaignsView
                        )
                    );
                }
            );

            section.append(list);
            content.append(section);
        }

        if (
            groups.publicUpcoming.length > 0
        ) {
            const section =
                document.createElement("section");

            section.className =
                "campaign-section";

            section.append(
                createCampaignSectionLabel(
                    "Starting Soon"
                )
            );

            const list =
                document.createElement("div");

            list.className =
                "campaign-row-list";

            groups.publicUpcoming.forEach(
                campaign => {
                    list.append(
                        createCampaignRow(
                            campaign
                        )
                    );
                }
            );

            section.append(list);
            content.append(section);
        }

        if (
            groups.available.length === 0 &&
            groups.publicUpcoming.length === 0
        ) {
            content.append(
                createCampaignState({
                    type: "empty",
                    title:
                        "Nothing to discover",
                    message:
                        "New shared challenges and upcoming campaigns will appear here.",
                })
            );
        }
    }

    if (
        activeCampaignTab ===
        "history"
    ) {
        if (
            lifecycleGroups.completed.length > 0
        ) {
            const section =
                document.createElement("section");

            section.className =
                "campaign-section";

            section.append(
                createCampaignSectionLabel(
                    "Completed"
                )
            );

            const list =
                document.createElement("div");

            list.className =
                "campaign-row-list";

            lifecycleGroups.completed.forEach(
                campaign => {
                    let label = null;

                    if (
                        isPrivateChallenge(
                            campaign
                        )
                    ) {
                        label =
                            "Private Challenge";
                    } else if (
                        isIndividualChallenge(
                            campaign
                        )
                    ) {
                        label =
                            "Shared Challenge";
                    } else {
                        label =
                            "Regional Campaign";
                    }

                    list.append(
                        createCampaignRow(
                            campaign,
                            {
                                completed:
                                    true,

                                label,
                            }
                        )
                    );
                }
            );

            section.append(list);
            content.append(section);
        } else {
            content.append(
                createCampaignState({
                    type: "empty",
                    title:
                        "No history yet",
                    message:
                        "Completed and expired challenges will appear here.",
                })
            );
        }
    }

    return content;
}

async function loadCampaignContent(content) {
    const regionId =
        state.activeRegionId ||
        state.currentRegionId;

    if (!regionId) {
        content.replaceChildren(
            createCampaignState({
                type: "empty",
                title:
                    "No region selected",
                message:
                    "Select a region to view its campaigns.",
            })
        );

        return;
    }

    const campaigns =
        await loadRegionCampaigns(
            regionId
        );

    if (
        campaigns.length === 0
    ) {
        content.replaceChildren(
            createCampaignState({
                type: "empty",
                title:
                    "No campaigns yet",
                message:
                    "Create a challenge or wait for a regional campaign to launch.",
            })
        );

        return;
    }

    const today =
        new Date()
            .toISOString()
            .slice(0, 10);

    const lifecycleGroups = {
        active: [],
        upcoming: [],
        completed: [],
    };

    campaigns.forEach(campaign => {
        lifecycleGroups[
            getCampaignGroup(
                campaign,
                today
            )
        ].push(campaign);
    });

    const activeProgress =
        await Promise.all(
            lifecycleGroups.active.map(
                async campaign => ({
                    campaign,

                    progress:
                        await loadCampaignProgress(
                            campaign.id
                        ),
                })
            )
        );

    const groups = {
        private: [],
        sharedJoined: [],
        regional: [],
        available: [],
        privateUpcoming: [],
        publicUpcoming: [],
    };

    activeProgress.forEach(item => {
        const {
            campaign,
            progress,
        } = item;

        if (
            isPrivateChallenge(
                campaign
            )
        ) {
            groups.private.push(
                item
            );

            return;
        }

        if (
            isIndividualChallenge(
                campaign
            )
        ) {
            if (
                progress.isEnrolled
            ) {
                groups.sharedJoined.push(
                    item
                );
            } else {
                groups.available.push(
                    item
                );
            }

            return;
        }

        groups.regional.push(
            item
        );
    });

    lifecycleGroups.upcoming.forEach(
        campaign => {
            if (
                isPrivateChallenge(
                    campaign
                )
            ) {
                groups.privateUpcoming.push(
                    campaign
                );
            } else {
                groups.publicUpcoming.push(
                    campaign
                );
            }
        }
    );

    campaignViewData = {
        lifecycleGroups,
        groups,
    };

    const fragment =
        document.createDocumentFragment();

    const activityLogger =
        createActivityLogger(
            activeProgress,
            renderCampaignsView
        );

    if (activityLogger) {
        fragment.append(
            activityLogger
        );
    }

    fragment.append(
        createCampaignTabs()
    );

    const tabContent =
        document.createElement("div");

    tabContent.className =
        "campaign-tab-content";

    tabContent.append(
        createCampaignTabContent(
            campaignViewData
        )
    );

    fragment.append(
        tabContent
    );

    content.replaceChildren(
        fragment
    );
}

export function renderCampaignsView() {
    const app =
        document.getElementById("app");

    if (!app) return;

    app.replaceChildren();

    const container =
        document.createElement("main");

    container.className =
        "campaigns-view";

    const header =
        document.createElement("header");

    header.className =
        "campaign-header";

    const identity =
        document.createElement("div");

    identity.className =
        "campaign-header-identity";

    const title =
        document.createElement("h1");

    title.textContent =
        "Campaigns";

    const subtitle =
        document.createElement("p");

    subtitle.className =
        "campaign-header-subtitle";

    subtitle.textContent =
        "Set goals. Track the work. Keep moving.";

    identity.append(
        title,
        subtitle
    );

    const startButton =
        document.createElement("button");

    startButton.type =
        "button";

    startButton.className =
        "campaign-header-action";

    startButton.textContent =
        "+ Start";

    startButton.addEventListener(
        "click",
        () => {
            navigateTo(
                "campaignCreate"
            );
        }
    );

    header.append(
        identity,
        startButton
    );

    const content =
        document.createElement("div");

    content.className =
        "campaign-content";

    content.append(
        createCampaignState({
            type: "loading",
            title:
                "Loading campaigns",
            message:
                "Pulling the latest progress.",
        })
    );

    container.append(
        header,
        content
    );

    app.append(
        container,
        createGlobalNav()
    );

    loadCampaignContent(
        content
    ).catch(error => {
        console.error(
            "Failed to load campaigns:",
            error
        );

        content.replaceChildren(
            createCampaignState({
                type: "error",
                title:
                    "Unable to load campaigns",
                message:
                    "Check your connection and try again.",
                onRetry:
                    renderCampaignsView,
            })
        );
    });
}