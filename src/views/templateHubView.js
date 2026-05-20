import { state } from "../modules/state.js";
import { saveState } from "../utils/storage.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { getSavedSectionsByType } from "../utils/plannerSections.js";
import { getWorkoutFieldLabel } from "../utils/workoutLabels.js";
import { deleteSavedPlannerSection, updateSavedPlannerSection, addSavedPlannerSection } from "../services/appData.js";
import { showToast } from "../utils/toast.js";
import { createSavedPlannerSection } from "../utils/plannerSections.js";
import { ensureCustomTemplates, createCustomTemplate } from "../utils/customTemplates.js";
import { updateCustomTemplates } from "../services/cloudData.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderTemplateHubView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "My Templates";

    const intro = document.createElement("div");
    intro.classList.add("stats-line");
    intro.textContent = "Manage reusable workout sections and future post templates.";

    const activeSection = state.activeTemplateHubSection || "planner";

    const plannerSection = createTemplateGroup({
        sectionKey: "planner",
        title: "Planner Templates",
        subtitle: "Saved sections you can reuse while planning a BD.",
        open: activeSection === "planner",
        content: createPlannerTemplatesContent(),
    });

    const preblastSection = createTemplateGroup({
        sectionKey: "preblast",
        title: "Preblast Templates",
        subtitle: "Named preblast formats you can reuse before a BD.",
        open: activeSection === "preblast",
        content: createPreblastTemplatesContent(),
    });

    const backblastSection = createTemplateGroup({
        sectionKey: "backblast",
        title: "Backblast Templates",
        subtitle: "Saved backblast formats and announcements.",
        open: activeSection === "backblast",
        content: createComingSoonContent("Backblast templates are coming soon..."),
    });

    const regionSection = createTemplateGroup({
        sectionKey: "region",
        title: "Region Templates",
        subtitle: "Shared defaults and region-level template tools.",
        open: activeSection === "region",
        content: createComingSoonContent("Region templates are coming soon..."),
    });

    app.append(
        header,
        title,
        intro,
        plannerSection,
        preblastSection,
        backblastSection,
        regionSection,
        createGlobalNav(),
    );

    if (state.editingPlannerTemplateId) {
        app.appendChild(createEditPlannerTemplateModal());
    }

    if (state.creatingPlannerTemplateType) {
        app.appendChild(createCreatePlannerTemplateModal());
    }

    if (state.editingPreblastTemplateId) {
        app.appendChild(createEditPreblastTemplateModal());
    }

    if (state.creatingPreblastTemplate) {
        app.appendChild(createCreatePreblastTemplateModal());
    }

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function createTemplateGroup({ sectionKey, title, subtitle, open, content }) {
    const details = document.createElement("details");
    details.classList.add("section", "template-group");

    if (open) {
        details.open = true;
    }

    const summary = document.createElement("summary");
    summary.classList.add("template-group-summary");

    const textWrap = document.createElement("div");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = title;

    const subheading = document.createElement("div");
    subheading.classList.add("stats-line");
    subheading.textContent = subtitle;

    textWrap.append(heading, subheading);
    summary.append(textWrap);

    details.append(summary, content);

    details.addEventListener("toggle", () => {
        if (details.open && sectionKey) {
            state.activeTemplateHubSection = sectionKey;
        }
    });

    return details;
}

function createComingSoonContent(message) {
    const card = document.createElement("div");
    card.classList.add("member-card");

    const text = document.createElement("div");
    text.classList.add("stats-line");
    text.textContent = message;

    card.appendChild(text);
    return card;
}

function createPlannerTemplatesContent() {
    const wrap = document.createElement("div");
    wrap.classList.add("template-section-list");

    const sectionTypes = [
        "introduction",
        "warmorama",
        "thangs",
        "finisher",
        "notes",
    ];

    let totalTemplates = 0;

    sectionTypes.forEach(sectionType => {
        const savedSections = getSavedSectionsByType(
            state.savedPlannerSections,
            sectionType,
            state.currentUserId
        );

        totalTemplates += savedSections.length;

        const group = document.createElement("div");
        group.classList.add("member-card", "template-type-group");

        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = getWorkoutFieldLabel(state, sectionType);

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.classList.add("icon-button", "template-add-button");
        addButton.textContent = "+";
        addButton.setAttribute(
            "aria-label",
            `Add ${getWorkoutFieldLabel(state, sectionType)} Template`
        );

        addButton.addEventListener("click", () => {
            state.creatingPlannerTemplateType = sectionType;
            renderApp();
        });

        const headerRow = document.createElement("div");
        headerRow.classList.add("template-type-header");

        headerRow.append(heading, addButton);

        group.appendChild(headerRow);

        if (savedSections.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("stats-line");
            empty.textContent = "No saved templates yet.";
            group.appendChild(empty);
        } else {
            savedSections.forEach(section => {
                group.appendChild(createPlannerTemplateCard(section));
            });
        }

        wrap.appendChild(group);
    });

    if (totalTemplates === 0) {
        const emptyCard = document.createElement("div");
        emptyCard.classList.add("member-card");

        const emptyTitle = document.createElement("div");
        emptyTitle.classList.add("member-name");
        emptyTitle.textContent = "No planner templates yet";

        const emptyText = document.createElement("div");
        emptyText.classList.add("stats-line");
        emptyText.textContent = "Save a section from the workout planner to reuse it here.";

        emptyCard.append(emptyTitle, emptyText);

        wrap.textContent = "";
        wrap.appendChild(emptyCard);
    }

    return wrap;
}

function createPlannerTemplateCard(section) {
    const card = document.createElement("div");
    card.classList.add("member-card", "template-card");

    const name = document.createElement("div");
    name.classList.add("member-name");
    name.textContent = section.name || "Untitled Template";

    const preview = document.createElement("div");
    preview.classList.add("template-preview");
    preview.textContent = section.content || "";

    const actions = document.createElement("div");
    actions.classList.add("button-row");

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.classList.add("danger-button");
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", async () => {
        const confirmed = confirm(`Delete "${section.name}"?`);
        if (!confirmed) return;

        try {
            await deleteSavedPlannerSection(section.id);
            showToast("Template deleted.", "success");
            renderApp();
        } catch (error) {
            console.error("failed to delete template:", error);
            showToast("Failed to delete template.", "error");
        }
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.classList.add("secondary-button");
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
        state.editingPlannerTemplateId = section.id;
        renderApp();
    });

    actions.append(editButton, deleteButton);
    card.append(name, preview, actions);

    return card;
}

function createEditPlannerTemplateModal() {
    const section = (state.savedPlannerSections || []).find(
        template => template.id === state.editingPlannerTemplateId
    );

    if (!section) {
        state.editingPlannerTemplateId = null;
        return document.createElement("div");
    }

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const title = document.createElement("h2");
    title.textContent = "Edit Template";

    const nameLabel = document.createElement("div");
    nameLabel.classList.add("detail-label");
    nameLabel.textContent = "Template Name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = section.name || "";

    const contentLabel = document.createElement("div");
    contentLabel.classList.add("detail-label");
    contentLabel.textContent = "Template Content";

    const contentInput = document.createElement("textarea");
    contentInput.classList.add("notes");
    contentInput.value = section.content || "";

    const actions = document.createElement("div");
    actions.classList.add("button-row");

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.classList.add("secondary-button");
    cancelButton.textContent = "Cancel";

    cancelButton.addEventListener("click", () => {
        state.editingPlannerTemplateId = null;
        renderApp();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save Template";

    saveButton.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        const content = contentInput.value.trim();

        if (!name || !content) {
            showToast("Template name and content are required.", "error");
            return;
        }

        const updatedSection = {
            ...section,
            name,
            content,
        };

        try {
            await updateSavedPlannerSection(updatedSection);

            state.editingPlannerTemplateId = null;

            showToast("Template updated.", "success");
            renderApp();

        } catch (error) {
            console.error("Failed to update template:", error);
            showToast("Failed to update template.", "error");
        }
    });

    actions.append(cancelButton, saveButton);

    modal.append(
        title,
        nameLabel,
        nameInput,
        contentLabel,
        contentInput,
        actions
    );

    overlay.appendChild(modal);

    overlay.addEventListener("click", () => {
        state.editingPlannerTemplateId = null;
        renderApp();
    });

    modal.addEventListener("click", event => event.stopPropagation());

    return overlay;
}

function createCreatePlannerTemplateModal() {
    const sectionType = state.creatingPlannerTemplateType;
    const sectionLabel = getWorkoutFieldLabel(state, sectionType);

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const title = document.createElement("h2");
    title.textContent = `Add ${sectionLabel} Template`;

    const nameLabel = document.createElement("div");
    nameLabel.classList.add("detail-label");
    nameLabel.textContent = "Template Name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";

    const contentLabel = document.createElement("div");
    contentLabel.classList.add("detail-label");
    contentLabel.textContent = "Template Content";

    const contentInput = document.createElement("textarea");
    contentInput.classList.add("notes");

    const actions = document.createElement("div");
    actions.classList.add("button-row");

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.classList.add("secondary-button");
    cancelButton.textContent = "Cancel";

    cancelButton.addEventListener("click", () => {
        state.creatingPlannerTemplateType = null;
        renderApp();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save Template";

    saveButton.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        const content = contentInput.value.trim();

        if (!name || !content) {
            showToast("Template name and content are required.", "error");
            return;
        }

        const newSection = createSavedPlannerSection({
            regionId: state.currentRegionId,
            sectionType,
            name,
            content,
            createdByUserId: state.currentUserId,
        });

        try {
            await addSavedPlannerSection(newSection);
            state.creatingPlannerTemplateType = null;
            showToast("Template saved.", "success");
            renderApp();

        } catch (error) {
            console.error("Failed to save template:", error);
            showToast("Failed to save template.", "error");
        }
    });

    actions.append(cancelButton, saveButton);

    modal.append(
        title,
        nameLabel,
        nameInput,
        contentLabel,
        contentInput,
        actions
    );

    overlay.appendChild(modal);

    overlay.addEventListener("click", () => {
        state.creatingPlannerTemplateType = null;
        renderApp();
    });

    modal.addEventListener("click", event => event.stopPropagation());

    return overlay;
}

function createPreblastTemplatesContent() {
    state.customTemplates = ensureCustomTemplates(state.customTemplates);

    const wrap = document.createElement("div");
    wrap.classList.add("template-section-list");

    const group = document.createElement("div");
    group.classList.add("member-card", "template-type-group");

    const heading = document.createElement("div");
    heading.classList.add("detail-label");
    heading.textContent = "Preblast";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.classList.add("icon-button", "template-add-button");
    addButton.textContent = "+";
    addButton.setAttribute("aria-label", "Add Preblast Template");

    addButton.addEventListener("click", () => {
        state.activeTemplateHubSection = "preblast";
        state.creatingPreblastTemplate = true;
        renderApp();
    });

    const headerRow = document.createElement("div");
    headerRow.classList.add("template-type-header");

    headerRow.append(heading, addButton);
    group.appendChild(headerRow);

    const templates = state.customTemplates.preblast.savedTemplates || [];

    if (templates.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("stats-line");
        empty.textContent = "No saved preblast templates yet.";
        group.appendChild(empty);

    } else {
        templates.forEach(template => {
            group.appendChild(createPreblastTemplateCard(template));
        });
    }
    wrap.appendChild(group);

    return wrap;
}

function createPreblastTemplateCard(template) {
    const card = document.createElement("div");
    card.classList.add("member-card", "template-card");

    const name = document.createElement("div");
    name.classList.add("member-name");
    name.textContent = template.name || "Untitled Template";

    const preview = document.createElement("div");
    preview.classList.add("template-preview");
    preview.textContent = template.content || "";

    const actions = document.createElement("div");
    actions.classList.add("button-row");

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.classList.add("secondary-button");
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
        state.activeTemplateHubSection = "preblast";
        state.editingPreblastTemplateId = template.id;
        renderApp();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.classList.add("danger-button");
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", async () => {
        const confirmed = confirm(`Delete "${template.name}"?`);
        if (!confirmed) return;

        state.customTemplates = ensureCustomTemplates(state.customTemplates);

        state.customTemplates.preblast.savedTemplates =
            state.customTemplates.preblast.savedTemplates.filter(t => t.id !== template.id);

        if (state.customTemplates.preblast.activeTemplateId === template.id) {
            state.customTemplates.preblast.activeTemplateId = null;
        }

        state.activeTemplateHubSection = "preblast";
        await persistCustomTemplates("Template deleted.");
    });

    actions.append(editButton, deleteButton);
    card.append(name, preview, actions);

    return card;
}

function createCreatePreblastTemplateModal() {
    return createPreblastTemplateModal({
        titleText: "Add Preblast Template",
        initialName: "",
        initialContent: "",

        onSave: async ({ name, content }) => {
            state.customTemplates = ensureCustomTemplates(state.customTemplates);
            const template = createCustomTemplate({ name, content });

            state.customTemplates.preblast.savedTemplates.push(template);
            state.customTemplates.preblast.activeTemplateId = template.id;
            state.creatingPreblastTemplate = false;
            state.activeTemplateHubSection = "preblast";
            await persistCustomTemplates("Template saved.");
        },

        onCancel: () => {
            state.creatingPreblastTemplate = false;
            renderApp();
        },
    });
}

function createEditPreblastTemplateModal() {
    state.customTemplates = ensureCustomTemplates(state.customTemplates);

    const template = state.customTemplates.preblast.savedTemplates.find(
        t => t.id === state.editingPreblastTemplateId
    );

    if (!template) {
        state.editingPreblastTemplateId = null;
        return document.createElement("div");
    }

    return createPreblastTemplateModal({
        titleText: "Edit Preblast Template",
        initialName: template.name || "",
        initialContent: template.content || "",

        onSave: async ({ name, content }) => {
            template.name = name;
            template.content = content;
            template.lastModifiedAt = new Date().toISOString();

            state.editingPreblastTemplateId = null;
            state.activeTemplateHubSection = "preblast";

            await persistCustomTemplates("Template updated.");
        },

        onCancel: () => {
            state.editingPreblastTemplateId = null;
            renderApp();
        },
    });
}

function createPreblastTemplateModal({
    titleText,
    initialName,
    initialContent,
    onSave,
    onCancel,

}) {
    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    const modal = document.createElement("div");
    modal.classList.add("modal");

    const title = document.createElement("h2");
    title.textContent = titleText;

    const nameLabel = document.createElement("div");
    nameLabel.classList.add("detail-label");
    nameLabel.textContent = "Template Name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = initialName;

    const contentLabel = document.createElement("div");
    contentLabel.classList.add("detail-label");
    contentLabel.textContent = "Template Content";

    const contentInput = document.createElement("textarea");
    contentInput.classList.add("notes");
    contentInput.value = initialContent;

    const actions = document.createElement("div");
    actions.classList.add("button-row");

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.classList.add("secondary-button");
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", onCancel);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save Template";

    saveButton.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        const content = contentInput.value.trim();

        if (!name || !content) {
            showToast("Template name and content are required.", "error");
            return;
        }

        try {
            await onSave({ name, content });

        } catch (error) {
            console.error("Failed to save preblast template:", error);
            showToast("Failed to save template.", "error");
        }
    });

    actions.append(cancelButton, saveButton);
    modal.append(title, nameLabel, nameInput, contentLabel, contentInput, actions);
    overlay.appendChild(modal);
    overlay.addEventListener("click", onCancel);
    modal.addEventListener("click", event => event.stopPropagation());

    return overlay;
}

async function persistCustomTemplates(successMessage) {
    try {
        await updateCustomTemplates(state.currentUserId, state.customTemplates);
        showToast(successMessage, "success");
        renderApp();
    } catch (error) {
        console.error("Failed to persist custom templates:", error);
        showToast("Failed to save to your account.", "error");
        renderApp();
    }
}