import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import {
    loadCampaignTemplates,
    loadActivityTypes,
    createCampaign,
    createCustomCampaign,
} from "../services/cloudData.js";
import { canManageCampaigns } from "../utils/permissions.js";
import { createGlobalNav } from "../components/globalNav.js";
import { showToast } from "../utils/toast.js";
import { createAppHeader } from "../components/appHeader.js";

function getToday() {
    return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);

    return date.toISOString().slice(0, 10);
}

function createState(title, message) {
    const stateBlock = document.createElement("div");
    stateBlock.className = "campaign-create-state";

    const heading = document.createElement("h2");
    heading.textContent = title;

    const copy = document.createElement("p");
    copy.textContent = message;

    stateBlock.append(heading, copy);

    return stateBlock;
}

function createTemplateButton(template, onSelect) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "campaign-template-row";

    const content = document.createElement("div");
    content.className = "campaign-template-row-content";

    const eyebrow = document.createElement("div");
    eyebrow.className = "campaign-template-eyebrow";
    eyebrow.textContent = "Official The Q Template";

    const title = document.createElement("div");
    title.className = "campaign-template-title";
    title.textContent = template.title;

    const description = document.createElement("div");
    description.className = "campaign-template-description";
    description.textContent = template.description;

    content.append(eyebrow, title, description);

    const chevron = document.createElement("span");
    chevron.className = "campaign-template-chevron";
    chevron.textContent = "›";

    button.append(content, chevron);

    button.addEventListener("click", () => {
        onSelect(template);
    });

    return button;
}

function createCustomChallengeButton({
    title,
    description,
    onSelect,
}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "campaign-template-row campaign-custom-template-row";

    const content = document.createElement("div");
    content.className = "campaign-template-row-content";

    const eyebrow = document.createElement("div");
    eyebrow.className = "campaign-template-eyebrow";
    eyebrow.textContent = "Create Your Own";

    const titleEl = document.createElement("div");
    titleEl.className = "campaign-template-title";
    titleEl.textContent = title;

    const descriptionEl = document.createElement("div");
    descriptionEl.className = "campaign-template-description";
    descriptionEl.textContent = description;

    content.append(
        eyebrow,
        titleEl,
        descriptionEl
    );

    const chevron = document.createElement("span");
    chevron.className = "campaign-template-chevron";
    chevron.textContent = "›";

    button.append(content, chevron);
    button.addEventListener("click", onSelect);

    return button;
}

function createField(labelText, input) {
    const field = document.createElement("label");
    field.className = "campaign-create-field";

    const label = document.createElement("span");
    label.className = "campaign-create-field-label";
    label.textContent = labelText;

    field.append(label, input);

    return field;
}

function createCampaignForm(template, onBack) {
    const form = document.createElement("form");
    form.className = "campaign-create-form";

    const templateSummary = document.createElement("div");
    templateSummary.className = "campaign-create-template-summary";

    const eyebrow = document.createElement("div");
    eyebrow.className = "campaign-template-eyebrow";
    eyebrow.textContent = "Selected Template";

    const templateTitle = document.createElement("h2");
    templateTitle.textContent = template.title;

    const templateCopy = document.createElement("p");
    templateCopy.textContent = template.description;

    templateSummary.append(eyebrow, templateTitle, templateCopy);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.required = true;
    nameInput.maxLength = 100;
    nameInput.placeholder = "September FNG Push";

    const targetInput = document.createElement("input");
    targetInput.type = "number";
    targetInput.required = true;
    targetInput.min = "1";
    targetInput.step = "1";
    targetInput.inputMode = "numeric";

    const startsInput = document.createElement("input");
    startsInput.type = "date";
    startsInput.required = true;
    startsInput.value = getToday();

    const endsInput = document.createElement("input");
    endsInput.type = "date";
    endsInput.required = true;
    endsInput.value = addDays(
        startsInput.value,
        Math.max((template.defaultDurationDays || 30) - 1, 0)
    );

    startsInput.addEventListener("change", () => {
        if (!startsInput.value) return;

        endsInput.value = addDays(
            startsInput.value,
            Math.max((template.defaultDurationDays || 30) - 1, 0)
        );
    });

    const descriptionInput = document.createElement("textarea");
    descriptionInput.rows = 3;
    descriptionInput.maxLength = 500;
    descriptionInput.placeholder = "Optional campaign description";

    const targetWrap = document.createElement("div");
    targetWrap.className = "campaign-create-target-wrap";

    const unit = document.createElement("span");
    unit.className = "campaign-create-target-unit";
    unit.textContent = template.metricConfig?.unit || "";

    targetWrap.append(targetInput, unit);

    const fields = document.createElement("div");
    fields.className = "campaign-create-fields";

    fields.append(
        createField("Campaign Name", nameInput),
        createField("Goal", targetWrap),
        createField("Starts", startsInput),
        createField("Ends", endsInput),
        createField("Description", descriptionInput)
    );

    const actions = document.createElement("div");
    actions.className = "campaign-create-actions";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "secondary-button";
    backButton.textContent = "Back";
    backButton.addEventListener("click", onBack);

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "primary-button";
    submitButton.textContent = "Start Campaign";

    actions.append(backButton, submitButton);

    form.append(templateSummary, fields, actions);

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const regionId =
            state.activeRegionId ||
            state.currentRegionId;
        const title = nameInput.value.trim();
        const targetValue = Number(targetInput.value);

        if (!regionId) {
            showToast("No active region selected.", "error");
            return;
        }

        if (!title) {
            showToast("Campaign name is required.", "error");
            return;
        }

        if (!Number.isFinite(targetValue) || targetValue <= 0) {
            showToast("Enter a valid campaign goal.", "error");
            return;
        }

        if (!startsInput.value || !endsInput.value) {
            showToast("Campaign dates are required.", "error");
            return;
        }

        if (endsInput.value < startsInput.value) {
            showToast("End date cannot be before start date.", "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Starting…";

        try {
            const campaign = await createCampaign({
                regionId,
                templateId: template.id,
                title,
                description: descriptionInput.value.trim(),
                startsOn: startsInput.value,
                endsOn: endsInput.value,
                targetValue,
            });

            state.selectedCampaignId = campaign.id;

            showToast("Campaign started.", "success");
            navigateTo("campaignDetail");
        } catch (error) {
            console.error("Failed to start campaign:", error);

            submitButton.disabled = false;
            submitButton.textContent = "Start Campaign";

            showToast(
                error?.message || "Failed to start campaign.",
                "error"
            );
        }
    });

    return form;
}

function createCustomQuantityChallengeForm(
    cadence,
    activityTypes,
    onBack,
    options = {}
) {
    const {
        creatorMode = "pax",
        participantMode = "individual",
        enrollmentMode = "opt_in",
    } = options;

    const isDaily = cadence === "daily";
    const isRegional = creatorMode === "region";
    const form = document.createElement("form");
    form.className = "campaign-create-form";

    const summary = document.createElement("div");
    summary.className = "campaign-create-template-summary";

    const eyebrow = document.createElement("div");
    eyebrow.className = "campaign-template-eyebrow";
    eyebrow.textContent = isRegional
        ? "Regional Campaign"
        : "Custom Challenge";

    const title = document.createElement("h2");
    title.textContent = isRegional
        ? "Cumulative Regional Goal"
        : isDaily
            ? "Daily Quantity"
            : "Cumulative Quantity";

    const copy = document.createElement("p");
    copy.textContent = isRegional
        ? "Set one shared goal and let PAX across the region contribute toward the total."
        : isDaily
            ? "Set a daily target for an activity and challenge PAX to hit it each day."
            : "Set a total goal for an activity and work toward it over the full challenge.";

    summary.append(eyebrow, title, copy);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.required = true;
    nameInput.maxLength = 100;
    nameInput.placeholder = isRegional
        ? "10,000 Miles Together"
        : isDaily
            ? "50 Burpees a Day"
            : "1000 Miles in a Year";

    const activityInput = document.createElement("select");
    activityInput.required = true;
    
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Choose activity";
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    
    activityInput.append(placeholderOption);
    
    activityTypes.forEach(activity => {
        const option = document.createElement("option");
        option.value = activity.activityKey;
        option.textContent = activity.displayName;
    
        activityInput.append(option);
    });

    const targetInput = document.createElement("input");
    targetInput.type = "number";
    targetInput.required = true;
    targetInput.min = "1";
    targetInput.step = "1";
    targetInput.inputMode = "numeric";
    targetInput.placeholder = "50";

    const startsInput = document.createElement("input");
    startsInput.type = "date";
    startsInput.required = true;
    startsInput.value = getToday();

    const endsInput = document.createElement("input");
    endsInput.type = "date";
    endsInput.required = true;
    endsInput.value = addDays(startsInput.value, 29);

    startsInput.addEventListener("change", () => {
        if (!startsInput.value) return;

        endsInput.value = addDays(
            startsInput.value,
            29
        );
    });

    const descriptionInput = document.createElement("textarea");
    descriptionInput.rows = 3;
    descriptionInput.maxLength = 500;
    descriptionInput.placeholder =
        "Optional challenge description";

    const fields = document.createElement("div");
    fields.className = "campaign-create-fields";

    fields.append(
        createField("Challenge Name", nameInput),
        createField("Tracker", activityInput),
        createField(
            isRegional
                ? "Regional Goal"
                : isDaily
                    ? "Daily Goal"
                    : "Total Goal",
            targetInput
        ),
        createField("Starts", startsInput),
        createField("Ends", endsInput),
        createField("Description", descriptionInput)
    );

    const actions = document.createElement("div");
    actions.className = "campaign-create-actions";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "secondary-button";
    backButton.textContent = "Back";
    backButton.addEventListener("click", onBack);

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "primary-button";
    submitButton.textContent = "Create Challenge";

    actions.append(backButton, submitButton);

    form.append(summary, fields, actions);

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const regionId =
            state.activeRegionId ||
            state.currentRegionId;

        const title = nameInput.value.trim();
        const activityKey = activityInput.value;
        const activity = activityTypes.find(
            item => item.activityKey === activityKey
        );
        const dailyTarget = Number(targetInput.value);

        if (!regionId) {
            showToast("No active region selected.", "error");
            return;
        }

        if (!title) {
            showToast("Challenge name is required.", "error");
            return;
        }

        if (!activity) {
            showToast("Choose an activity.", "error");
            return;
        }

        if (
            !Number.isFinite(dailyTarget)
            || dailyTarget <= 0
        ) {
            showToast(
                isDaily
                    ? "Enter a valid daily goal."
                    : "Enter a valid total goal.",
                "error"
            );
            return;
        }

        if (!startsInput.value || !endsInput.value) {
            showToast("Challenge dates are required.", "error");
            return;
        }

        if (endsInput.value < startsInput.value) {
            showToast(
                "End date cannot be before start date.",
                "error"
            );
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Creating…";

        try {
            const campaign =
                await createCustomCampaign({
                    regionId,
                    title,
                    description: descriptionInput.value.trim(),
                    creatorMode,
                    participantMode,
                    enrollmentMode,
                    trackingMode: "manual",
                    cadence,
                    metricKey: "manual_quantity",
                    activityKey,
                    targetValue: dailyTarget,
                    metricConfig: {
                        activityName: activity.displayName,
                        unit: activity.unit,
                    },
                    startsOn: startsInput.value,
                    endsOn: endsInput.value,
                });
            state.selectedCampaignId = campaign.id;

            showToast("Challenge created.", "success");
            navigateTo("campaignDetail");
        } catch (error) {
            console.error(
                "Failed to create custom challenge:",
                error
            );

            submitButton.disabled = false;
            submitButton.textContent = "Create Challenge";

            showToast(
                error?.message ||
                    "Failed to create challenge.",
                "error"
            );
        }
    });

    return form;
}

export function renderCampaignCreateView() {
    const app = document.getElementById("app");
    if (!app) return;

    app.replaceChildren();

    const header = createAppHeader({
        title: "Start Something",
        showBack: true,
        showMenu: true,
        fallbackView: "campaigns",
    });

    app.appendChild(header);

    const container = document.createElement("main");
    container.className = "campaign-create-view";
    
    const content = document.createElement("div");
    content.className = "campaign-create-content";
    
    container.append(content);
    app.append(container, createGlobalNav());

    function showCreateOptions(
        templates = [],
        activityTypes = []
    ) {
        content.replaceChildren();
    
        if (
            canManageCampaigns()
            && templates.length > 0
        ) {
            const officialLabel =
                document.createElement("h2");
    
            officialLabel.className =
                "campaign-section-label";
    
            officialLabel.textContent =
                "Official Templates";
    
            const officialList =
                document.createElement("div");
    
            officialList.className =
                "campaign-template-list";
    
            templates.forEach(template => {
                officialList.append(
                    createTemplateButton(
                        template,
                        selectedTemplate => {
                            content.replaceChildren(
                                createCampaignForm(
                                    selectedTemplate,
                                    () => showCreateOptions(templates)
                                )
                            );
                        }
                    )
                );
            });
    
            content.append(
                officialLabel,
                officialList
            );
        }
    
        const customLabel =
            document.createElement("h2");
    
        customLabel.className =
            "campaign-section-label campaign-custom-section-label";
    
        customLabel.textContent =
            "Create Your Own";
    
        const customList =
            document.createElement("div");
    
        customList.className =
            "campaign-template-list";
    
        customList.append(
            createCustomChallengeButton({
                title: "Daily Quantity",
                description:
                    "Hit a target each day throughout the challenge.",
                onSelect: () => {
                    content.replaceChildren(
                        createCustomQuantityChallengeForm(
                            "daily",
                            activityTypes,
                            () => showCreateOptions(templates, activityTypes)
                        )
                    );
                },
            }),
        
            createCustomChallengeButton({
                title: "Cumulative Quantity",
                description:
                    "Work toward one total over the full challenge.",
                onSelect: () => {
                    content.replaceChildren(
                        createCustomQuantityChallengeForm(
                            "campaign",
                            activityTypes,
                            () => showCreateOptions(templates, activityTypes)
                        )
                    );
                },
            })
        );

        if (canManageCampaigns()) {
            customList.append(
                createCustomChallengeButton({
                    title: "Regional Cumulative Goal",
                    description:
                        "Let the whole region contribute toward one shared total.",
                    onSelect: () => {
                        content.replaceChildren(
                            createCustomQuantityChallengeForm(
                                "campaign",
                                activityTypes,
                                () => showCreateOptions(templates, activityTypes),
                                {
                                    creatorMode: "region",
                                    participantMode: "collective",
                                    enrollmentMode: "automatic",
                                }
                            )
                        );
                    },
                })
            );
        }
    
        content.append(
            customLabel,
            customList
        );
    }
    
    content.append(
        createState(
            "Loading options",
            "Finding available challenge options."
        )
    );
    
    const templatePromise = canManageCampaigns()
        ? loadCampaignTemplates()
        : Promise.resolve([]);
    
    Promise.all([
        templatePromise,
        loadActivityTypes(),
    ])
        .then(([templates, activityTypes]) => {
            showCreateOptions(
                templates,
                activityTypes
            );
        })
        .catch(error => {
            console.error(
                "Failed to load campaign creation options:",
                error
            );
    
            content.replaceChildren(
                createState(
                    "Unable to load options",
                    "Challenge creation options could not be loaded."
                )
            );
    
            showToast(
                "Challenge creation options could not be loaded.",
                "error"
            );
        });
}