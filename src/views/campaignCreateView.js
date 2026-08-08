import { state } from "../modules/state.js";
import { navigateTo } from "../utils/navigation.js";
import {
    loadCampaignTemplates,
    createCampaign,
} from "../services/cloudData.js";
import { canManageCampaigns } from "../utils/permissions.js";
import { createGlobalNav } from "../components/globalNav.js";
import { showToast } from "../utils/toast.js";

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

        const regionId = state.currentRegionId;
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

export function renderCampaignCreateView() {
    const app = document.getElementById("app");
    if (!app) return;

    app.replaceChildren();

    const container = document.createElement("main");
    container.className = "campaign-create-view";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "campaign-detail-back";
    backButton.textContent = "‹ Campaigns";

    backButton.addEventListener("click", () => {
        navigateTo("campaigns");
    });

    const header = document.createElement("header");
    header.className = "campaign-create-header";

    const title = document.createElement("h1");
    title.textContent = "Start Campaign";

    const subtitle = document.createElement("p");
    subtitle.textContent =
        "Launch a regional campaign from an official The Q template.";

    header.append(title, subtitle);

    const content = document.createElement("div");
    content.className = "campaign-create-content";

    container.append(backButton, header, content);
    app.append(container, createGlobalNav());

    if (!canManageCampaigns()) {
        content.append(
            createState(
                "Not authorized",
                "Regional leadership is required to start campaigns."
            )
        );
        return;
    }

    content.append(
        createState(
            "Loading templates",
            "Finding available campaign templates."
        )
    );

    function showTemplates(templates) {
        content.replaceChildren();

        const label = document.createElement("h2");
        label.className = "campaign-section-label";
        label.textContent = "Official Templates";

        const list = document.createElement("div");
        list.className = "campaign-template-list";

        templates.forEach(template => {
            list.append(
                createTemplateButton(template, selectedTemplate => {
                    content.replaceChildren(
                        createCampaignForm(
                            selectedTemplate,
                            () => showTemplates(templates)
                        )
                    );
                })
            );
        });

        content.append(label, list);
    }

    loadCampaignTemplates()
        .then(templates => {
            if (templates.length === 0) {
                content.replaceChildren(
                    createState(
                        "No templates available",
                        "Official campaign templates will appear here when published."
                    )
                );
                return;
            }

            showTemplates(templates);
        })
        .catch(error => {
            console.error("Failed to load campaign templates:", error);

            content.replaceChildren(
                createState(
                    "Unable to load templates",
                    "Check your connection and try again."
                )
            );
        });
}