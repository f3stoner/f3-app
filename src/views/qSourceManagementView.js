import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import {
    loadAllQSources,
    insertQSource,
    updateQSourceInCloud,
    deleteQSourceFromCloud,
    loadQSources,
    updateQSourceDisplayOrder,
} from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";

export function renderQSourceManagementView() {
    const app = document.getElementById("app");
    app.textContent = "";

    if (!hasPermission(PERMISSIONS.MANAGE_Q_SOURCE)) {
        app.textContent = "You do not have permission to manage Q Source.";
        return;
    }

    if (!state.hasLoadedAllQSources && !state.isLoadingAllQSources) {
        state.isLoadingAllQSources = true;

        loadAllQSources(state.currentRegionId)
            .then(qSources => {
                state.allQSources = qSources;
                state.hasLoadedAllQSources = true;
            })
            .catch(error => {
                console.error("Failed to load Q Sources:", error);
            })
            .finally(() => {
                state.isLoadingAllQSources = false;

                if (state.currentView === "qSourceManagement") {
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
    title.textContent = "Q Source";

    const form = document.createElement("div");
    form.classList.add("section");

    const titleInput = document.createElement("input");
    titleInput.placeholder = "Title";

    const bodyInput = document.createElement("textarea");
    bodyInput.placeholder = "Q Source text";

    const startsInput = document.createElement("input");
    startsInput.type = "date";

    const endsInput = document.createElement("input");
    endsInput.type = "date";

    const cancelEditButton = document.createElement("button");
    cancelEditButton.classList.add("secondary-button");
    cancelEditButton.textContent = "Cancel Edit";
    cancelEditButton.style.display = "none";

    const saveButton = document.createElement("button");
    saveButton.textContent = "Create Q Source";

    const copyQSourceButton = document.createElement("button");
    copyQSourceButton.type = "button";
    copyQSourceButton.textContent = "Copy Q Source";

    copyQSourceButton.addEventListener("click", async () => {
        const text = buildQSourcesCopyText(state.allQSources || []);

        if (!text) {
            showToast("No active Q Source to copy.", "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            showToast("Q Source copied.", "success");
        } catch (error) {
            console.error("Failed to copy Q Source:", error);
            showToast("Failed to copy Q Source.", "error");
        }
    });

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");
    actionRow.append(saveButton, copyQSourceButton);

    form.append(
        label("Title"), titleInput,
        label("Body"), bodyInput,
        label("Starts On Optional"), startsInput,
        label("Expires After Optional"), endsInput,
        actionRow,
        cancelEditButton,
    );

    const list = document.createElement("div");
    list.classList.add("section");

    saveButton.addEventListener("click", async () => {
        if (!titleInput.value.trim() || !bodyInput.value.trim()) {
            showToast("Title and body are required.", "error");
            return;
        }

        try {
            const existingQSource = (state.allQSources || [])
                .find(qSource => qSource.id === state.editingQSourceId);

            if (existingQSource) {
                await updateQSourceInCloud(state.currentRegionId, {
                    ...existingQSource,
                    title: titleInput.value.trim(),
                    body: bodyInput.value.trim(),
                    startsOn: startsInput.value || null,
                    endsOn: endsInput.value || null,
                });

                state.editingQSourceId = null;
                showToast("Q Source updated.", "success");
            } else {
                const nextDisplayOrder =
                    Math.max(
                        0,
                        ...(state.allQSources || []).map(qSource => qSource.displayOrder || 0)
                    ) + 1;

                await insertQSource(state.currentRegionId, {
                    id: crypto.randomUUID(),
                    scope: "region",
                    title: titleInput.value.trim(),
                    body: bodyInput.value.trim(),
                    startsOn: startsInput.value || null,
                    endsOn: endsInput.value || null,
                    isActive: true,
                    createdByUserId: state.currentUserId,
                    displayOrder: nextDisplayOrder,
                });

                showToast("Q Source created.", "success");
            }

            state.qSources = await loadQSources(state.currentRegionId);
            state.allQSources = await loadAllQSources(state.currentRegionId);
            state.hasLoadedAllQSources = true;

            renderApp();
        } catch (error) {
            console.error("Failed to save Q Source:", error);
            showToast("Failed to save Q Source.", "error");
        }
    });

    cancelEditButton.addEventListener("click", () => {
        state.editingQSourceId = null;

        titleInput.value = "";
        bodyInput.value = "";
        startsInput.value = "";
        endsInput.value = "";

        saveButton.textContent = "Create Q Source";
        cancelEditButton.style.display = "none";
    });

    renderQSourceList(list, {
        titleInput,
        bodyInput,
        startsInput,
        endsInput,
        saveButton,
        cancelEditButton,
    });

    app.append(header, title, form, list, createGlobalNav());
}

function label(text) {
    const el = document.createElement("div");
    el.classList.add("detail-label");
    el.textContent = text;
    return el;
}

function buildQSourcesCopyText(qSources = []) {
    return qSources
        .filter(qSource => qSource.isActive)
        .map(qSource => `${qSource.title}\n${qSource.body}`)
        .join("\n\n");
}

async function moveQSource(qSourceId, direction) {
    const qSources = [...(state.allQSources || [])];
    const currentIndex = qSources.findIndex(qSource => qSource.id === qSourceId);
    const nextIndex = currentIndex + direction;

    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= qSources.length) {
        return;
    }

    const current = qSources[currentIndex];
    const target = qSources[nextIndex];

    try {
        await Promise.all([
            updateQSourceDisplayOrder(
                state.currentRegionId,
                current.id,
                nextIndex
            ),
            updateQSourceDisplayOrder(
                state.currentRegionId,
                target.id,
                currentIndex
            ),
        ]);

        state.qSources = await loadQSources(state.currentRegionId);
        state.allQSources = await loadAllQSources(state.currentRegionId);
        state.hasLoadedAllQSources = true;

        renderApp();
    } catch (error) {
        console.error("Failed to reorder Q Sources:", error);
        showToast("Failed to reorder Q Sources.", "error");
    }
}

function renderQSourceList(container, controls) {
    container.textContent = "";

    const qSources = state.allQSources || [];

    if (qSources.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No Q Source yet.";
        container.appendChild(empty);
        return;
    }

    qSources.forEach((qSource, index) => {
        const card = document.createElement("div");
        card.classList.add("member-card", "admin-q-source-card");
        card.classList.toggle("q-source-card-inactive", !qSource.isActive);

        const title = document.createElement("div");
        title.classList.add("member-name", "q-source-title");
        title.textContent = qSource.title || "Q Source";

        const body = document.createElement("div");
        body.classList.add("stats-line", "q-source-body");
        body.textContent = qSource.body || "";

        const meta = document.createElement("div");
        meta.classList.add("stats-line");

        const status = qSource.isActive ? "Active" : "Inactive";

        meta.textContent =
            `${status} • ` +
            `${qSource.startsOn || "Immediate"} → ` +
            `${qSource.endsOn || "No Expiration"}`;

        const actions = document.createElement("div");
        actions.classList.add("q-source-admin-actions");

        const moveUpButton = document.createElement("button");
        moveUpButton.classList.add("secondary-button", "move-btn");
        moveUpButton.textContent = "↑";
        moveUpButton.disabled = index === 0;

        moveUpButton.addEventListener("click", async () => {
            await moveQSource(qSource.id, -1);
        });

        const moveDownButton = document.createElement("button");
        moveDownButton.classList.add("secondary-button", "move-btn");
        moveDownButton.textContent = "↓";
        moveDownButton.disabled = index === qSources.length - 1;

        moveDownButton.addEventListener("click", async () => {
            await moveQSource(qSource.id, 1);
        });

        const editButton = document.createElement("button");
        editButton.classList.add("secondary-button");
        editButton.textContent = "Edit";

        editButton.addEventListener("click", () => {
            state.editingQSourceId = qSource.id;

            controls.titleInput.value = qSource.title || "";
            controls.bodyInput.value = qSource.body || "";
            controls.startsInput.value = qSource.startsOn || "";
            controls.endsInput.value = qSource.endsOn || "";

            controls.saveButton.textContent = "Save Changes";
            controls.cancelEditButton.style.display = "";

            window.scrollTo({
                top: 0,
                behavior: "smooth",
            });
        });

        const toggleButton = document.createElement("button");
        toggleButton.classList.add("secondary-button");
        toggleButton.textContent = qSource.isActive
            ? "Deactivate"
            : "Activate";

        toggleButton.addEventListener("click", async () => {
            try {
                await updateQSourceInCloud(
                    state.currentRegionId,
                    {
                        ...qSource,
                        isActive: !qSource.isActive,
                    }
                );

                state.qSources = await loadQSources(state.currentRegionId);
                state.allQSources = await loadAllQSources(state.currentRegionId);
                state.hasLoadedAllQSources = true;

                renderApp();
            } catch (error) {
                console.error("Failed to update Q Source:", error);
                showToast("Failed to update Q Source.", "error");
            }
        });

        const deleteButton = document.createElement("button");
        deleteButton.classList.add("secondary-button", "delete-btn");
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", async () => {
            const confirmed = confirm("Delete this Q Source?");

            if (!confirmed) return;

            try {
                await deleteQSourceFromCloud(
                    state.currentRegionId,
                    qSource.id
                );

                state.qSources = await loadQSources(state.currentRegionId);
                state.allQSources = await loadAllQSources(state.currentRegionId);
                state.hasLoadedAllQSources = true;

                renderApp();
            } catch (error) {
                console.error("Failed to delete Q Source:", error);
                showToast("Failed to delete Q Source.", "error");
            }
        });

        const content = document.createElement("div");
        content.classList.add("admin-q-source-content");

        content.append(title, body, meta);

        actions.append(
            moveUpButton,
            moveDownButton,
            editButton,
            toggleButton,
            deleteButton
        );

        card.append(content, actions);
        container.appendChild(card);
    });
}