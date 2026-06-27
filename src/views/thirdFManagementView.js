import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import {
    loadThirdFDiscussionsForAdmin,
    saveThirdFDiscussion,
    deleteThirdFDiscussion,
} from "../services/thirdFData.js";
import { showToast } from "../utils/toast.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";

const DISCUSSION_TYPES = [
    { value: "q_source", label: "Q Source" },
    { value: "discussion", label: "Discussion" },
    { value: "leadership", label: "Leadership" },
    { value: "devotional", label: "Devotional" },
    { value: "service", label: "Service" },
    { value: "custom", label: "Custom" },
];

function label(text) {
    const el = document.createElement("div");
    el.classList.add("detail-label");
    el.textContent = text;
    return el;
}

function getDefaultWeekStartDate() {
    const date = new Date();
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;

    date.setDate(date.getDate() + diff);

    return date.toISOString().slice(0, 10);
}

function createTypeSelect() {
    const select = document.createElement("select");

    DISCUSSION_TYPES.forEach(type => {
        const option = document.createElement("option");
        option.value = type.value;
        option.textContent = type.label;
        select.appendChild(option);
    });

    return select;
}

function getTypeLabel(value) {
    return DISCUSSION_TYPES.find(type => type.value === value)?.label || "Discussion";
}

export function renderThirdFManagementView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (!state.hasLoadedThirdFDiscussionsForAdmin && !state.isLoadingThirdFDiscussionsForAdmin) {
        state.isLoadingThirdFDiscussionsForAdmin = true;

        loadThirdFDiscussionsForAdmin()
            .then(discussions => {
                state.thirdFDiscussionsForAdmin = discussions;
                state.hasLoadedThirdFDiscussionsForAdmin = true;
            })
            .catch(error => {
                console.error("Failed to load Third F discussions:", error);
                showToast("Failed to load Third F discussions.", "error");
            })
            .finally(() => {
                state.isLoadingThirdFDiscussionsForAdmin = false;

                if (state.currentView === "thirdFManagement") {
                    renderApp();
                }
            });
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Manage Third F";

    const form = document.createElement("div");
    form.classList.add("section", "third-f-management-form");

    const titleInput = document.createElement("input");
    titleInput.placeholder = "Title";

    const weekInput = document.createElement("input");
    weekInput.type = "date";
    weekInput.value = getDefaultWeekStartDate();

    const typeInput = createTypeSelect();
    typeInput.value = "discussion";

    const summaryInput = document.createElement("textarea");
    summaryInput.placeholder = "Short summary";

    const discussionInput = document.createElement("textarea");
    discussionInput.placeholder = "Full discussion text";
    discussionInput.classList.add("third-f-discussion-input");

    const linkInput = document.createElement("input");
    linkInput.type = "url";
    linkInput.placeholder = "Optional link";

    const publishedLabel = document.createElement("label");
    publishedLabel.classList.add("third-f-published-row");

    const publishedInput = document.createElement("input");
    publishedInput.type = "checkbox";
    publishedInput.checked = true;

    const publishedText = document.createElement("span");
    publishedText.textContent = "Published";

    publishedLabel.append(publishedInput, publishedText);

    const saveButton = document.createElement("button");
    saveButton.textContent = "Create Discussion";

    const cancelEditButton = document.createElement("button");
    cancelEditButton.type = "button";
    cancelEditButton.classList.add("secondary-button");
    cancelEditButton.textContent = "Cancel Edit";
    cancelEditButton.style.display = "none";

    const actionRow = document.createElement("div");
    actionRow.classList.add("third-f-management-actions");
    actionRow.append(saveButton, cancelEditButton);

    form.append(
        label("Week Start"),
        weekInput,
        label("Type"),
        typeInput,
        label("Title"),
        titleInput,
        label("Summary"),
        summaryInput,
        label("Discussion"),
        discussionInput,
        label("Link Optional"),
        linkInput,
        publishedLabel,
        actionRow,
    );

    const list = document.createElement("div");
    list.classList.add("section");

    function resetForm() {
        state.editingThirdFDiscussionId = null;

        weekInput.value = getDefaultWeekStartDate();
        typeInput.value = "discussion";
        titleInput.value = "";
        summaryInput.value = "";
        discussionInput.value = "";
        linkInput.value = "";
        publishedInput.checked = true;

        saveButton.textContent = "Create Discussion";
        cancelEditButton.style.display = "none";
    }

    async function refreshDiscussions() {
        state.thirdFDiscussionsForAdmin = await loadThirdFDiscussionsForAdmin();
        state.hasLoadedThirdFDiscussionsForAdmin = true;
    }

    saveButton.addEventListener("click", async () => {
        const titleValue = titleInput.value.trim();
        const weekValue = weekInput.value;

        if (!weekValue || !titleValue) {
            showToast("Week and title are required.", "error");
            return;
        }

        try {
            await saveThirdFDiscussion({
                id: state.editingThirdFDiscussionId || null,
                weekStartDate: weekValue,
                title: titleValue,
                type: typeInput.value,
                summary: summaryInput.value.trim(),
                discussion: discussionInput.value.trim(),
                link: linkInput.value.trim(),
                published: publishedInput.checked,
            });

            showToast(
                state.editingThirdFDiscussionId
                    ? "Discussion updated."
                    : "Discussion created.",
                "success"
            );

            resetForm();
            await refreshDiscussions();
            renderApp();
        } catch (error) {
            console.error("Failed to save Third F discussion:", error);
            showToast("Failed to save discussion.", "error");
        }
    });

    cancelEditButton.addEventListener("click", resetForm);

    renderThirdFAdminList(list, {
        weekInput,
        typeInput,
        titleInput,
        summaryInput,
        discussionInput,
        linkInput,
        publishedInput,
        saveButton,
        cancelEditButton,
        refreshDiscussions,
    });



    app.append(header, title, form, list, createGlobalNav());

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function renderThirdFAdminList(container, controls) {
    container.textContent = "";

    const discussions = [...(state.thirdFDiscussionsForAdmin || [])]
        .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

    if (state.isLoadingThirdFDiscussionsForAdmin) {
        const loading = document.createElement("div");
        loading.classList.add("detail-value");
        loading.textContent = "Loading Third F discussions...";
        container.appendChild(loading);
        return;
    }

    if (discussions.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No Third F discussions yet.";
        container.appendChild(empty);
        return;
    }

    discussions.forEach(discussion => {
        const card = document.createElement("div");
        card.classList.add("member-card", "admin-q-source-card");
        card.classList.toggle("q-source-card-inactive", !discussion.published);

        const content = document.createElement("div");
        content.classList.add("admin-q-source-content");

        const title = document.createElement("div");
        title.classList.add("member-name", "q-source-title");
        title.textContent = discussion.title || "Untitled Discussion";

        const summary = document.createElement("div");
        summary.classList.add("stats-line", "q-source-body");
        summary.textContent = discussion.summary || discussion.discussion || "";

        const meta = document.createElement("div");
        meta.classList.add("stats-line");
        meta.textContent = `${discussion.published ? "Published" : "Draft"} • ${getTypeLabel(discussion.type)} • Week of ${discussion.weekStartDate}`;

        content.append(title, summary, meta);

        const actions = document.createElement("div");
        actions.classList.add("q-source-admin-actions");

        const editButton = document.createElement("button");
        editButton.classList.add("secondary-button");
        editButton.textContent = "Edit";

        editButton.addEventListener("click", () => {
            state.editingThirdFDiscussionId = discussion.id;

            controls.weekInput.value = discussion.weekStartDate || "";
            controls.typeInput.value = discussion.type || "discussion";
            controls.titleInput.value = discussion.title || "";
            controls.summaryInput.value = discussion.summary || "";
            controls.discussionInput.value = discussion.discussion || "";
            controls.linkInput.value = discussion.link || "";
            controls.publishedInput.checked = discussion.published === true;

            controls.saveButton.textContent = "Save Changes";
            controls.cancelEditButton.style.display = "";

            window.scrollTo({ top: 0, behavior: "smooth" });
        });

        const publishButton = document.createElement("button");
        publishButton.classList.add("secondary-button");
        publishButton.textContent = discussion.published ? "Unpublish" : "Publish";

        publishButton.addEventListener("click", async () => {
            try {
                await saveThirdFDiscussion({
                    ...discussion,
                    published: !discussion.published,
                });

                await controls.refreshDiscussions();
                renderApp();
            } catch (error) {
                console.error("Failed to update discussion:", error);
                showToast("Failed to update discussion.", "error");
            }
        });

        const deleteButton = document.createElement("button");
        deleteButton.classList.add("secondary-button", "delete-btn");
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", async () => {
            const confirmed = confirm("Delete this Third F discussion?");
            if (!confirmed) return;

            try {
                await deleteThirdFDiscussion(discussion.id);

                await controls.refreshDiscussions();
                renderApp();
            } catch (error) {
                console.error("Failed to delete discussion:", error);
                showToast("Failed to delete discussion.", "error");
            }
        });

        actions.append(editButton, publishButton, deleteButton);
        card.append(content, actions);
        container.appendChild(card);
    });
}