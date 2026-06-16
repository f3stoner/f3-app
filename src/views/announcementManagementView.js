import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import {
    loadAllAnnouncements,
    insertAnnouncement,
    updateAnnouncementInCloud,
    deleteAnnouncementFromCloud,
    loadAnnouncements,
} from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { updateAnnouncementDisplayOrder } from "../services/cloudData.js";

export function renderAnnouncementManagementView() {
    const app = document.getElementById("app");
    app.textContent = "";

    if (!state.hasLoadedAllAnnouncements && !state.isLoadingAllAnnouncements) {
        state.isLoadingAllAnnouncements = true;
    
        loadAllAnnouncements(state.currentRegionId)
            .then(announcements => {    
                state.allAnnouncements = announcements;
                state.hasLoadedAllAnnouncements = true;
            })
            .catch(error => {
                console.error("Failed to load announcements:", error);
            })
            .finally(() => {
                state.isLoadingAllAnnouncements = false;
    
                if (state.currentView === "announcementManagement") {
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
    title.textContent = "Announcements";

    const form = document.createElement("div");
    form.classList.add("section");

    const titleInput = document.createElement("input");
    titleInput.placeholder = "Title";

    const bodyInput = document.createElement("textarea");
    bodyInput.placeholder = "Announcement text";

    const linkUrlInput = document.createElement("input");
    linkUrlInput.placeholder = "Optional link URL";

    const linkLabelInput = document.createElement("input");
    linkLabelInput.placeholder = "Optional link label";

    const startsInput = document.createElement("input");
    startsInput.type = "date";

    const endsInput = document.createElement("input");
    endsInput.type = "date";

    const cancelEditButton = document.createElement("button");
    cancelEditButton.classList.add("secondary-button");
    cancelEditButton.textContent = "Cancel Edit";
    cancelEditButton.style.display = "none";

    const saveButton = document.createElement("button");
    saveButton.textContent = "Create Announcement";

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");

    const copyAnnouncementsButton = document.createElement("button");
    copyAnnouncementsButton.type = "button";
    copyAnnouncementsButton.textContent = "Copy Announcements";

    // no secondary-button class

    copyAnnouncementsButton.addEventListener("click", async () => {
        const text = buildAnnouncementsCopyText(state.allAnnouncements || []);

        if (!text) {
            showToast("No active announcements to copy.", "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            showToast("Announcements copied.", "success");
        } catch (error) {
            console.error("Failed to copy announcements:", error);
            showToast("Failed to copy announcements.", "error");
        }
    });

    actionRow.append(saveButton, copyAnnouncementsButton);


    form.append(
        label("Title"), titleInput,
        label("Body"), bodyInput,
        label("Link URL Optional"), linkUrlInput,
        label("Link Label Optional"), linkLabelInput,
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
            const existingAnnouncement = (state.allAnnouncements || [])
                .find(a => a.id === state.editingAnnouncementId);

            if (existingAnnouncement) {
                await updateAnnouncementInCloud(state.currentRegionId, {
                    ...existingAnnouncement,
                    title: titleInput.value.trim(),
                    body: bodyInput.value.trim(),
                    linkUrl: linkUrlInput.value.trim() || null,
                    linkLabel: linkLabelInput.value.trim() || null,
                    startsOn: startsInput.value || null,
                    endsOn: endsInput.value || null,
                });

                state.editingAnnouncementId = null;
                showToast("Announcement updated.", "success");
            } else {
                const nextDisplayOrder =
                    Math.max(
                        0,
                        ...(state.allAnnouncements || []).map(a => a.displayOrder || 0)
                    ) + 1;

                await insertAnnouncement(state.currentRegionId, {
                    id: crypto.randomUUID(),
                    scope: "region",
                    title: titleInput.value.trim(),
                    body: bodyInput.value.trim(),
                    linkUrl: linkUrlInput.value.trim() || null,
                    linkLabel: linkLabelInput.value.trim() || null,
                    startsOn: startsInput.value || null,
                    endsOn: endsInput.value || null,
                    isActive: true,
                    createdByUserId: state.currentUserId,
                    displayOrder: nextDisplayOrder,
                });

                showToast("Announcement created.", "success");
            }

            state.announcements = await loadAnnouncements(state.currentRegionId);
            state.allAnnouncements = await loadAllAnnouncements(state.currentRegionId);
            state.hasLoadedAllAnnouncements = true;

            renderApp();
        } catch (error) {
            console.error("Failed to save announcement:", error);
            showToast("Failed to save announcement.", "error");
        }
    });

    cancelEditButton.addEventListener("click", () => {
        state.editingAnnouncementId = null;
    
        titleInput.value = "";
        bodyInput.value = "";
        linkUrlInput.value = "";
        linkLabelInput.value = "";
        startsInput.value = "";
        endsInput.value = "";
    
        saveButton.textContent = "Create Announcement";
        cancelEditButton.style.display = "none";
    });

    renderAnnouncementList(list, {
        titleInput,
        bodyInput,
        linkUrlInput,
        linkLabelInput,
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

function buildAnnouncementsCopyText(announcements = []) {
    return announcements
        .filter(announcement => announcement.isActive)
        .map(announcement => {
            const parts = [
                announcement.title,
                announcement.body,
            ];

            if (announcement.linkUrl) {
                parts.push(
                    `${announcement.linkLabel || "Link"}: ${announcement.linkUrl}`
                );
            }

            return parts.filter(Boolean).join("\n");
        })
        .join("\n\n");
}

async function moveAnnouncement(announcementId, direction) {
    const announcements = [...(state.allAnnouncements || [])];
    const currentIndex = announcements.findIndex(a => a.id === announcementId);
    const nextIndex = currentIndex + direction;

    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= announcements.length) {
        return;
    }

    const current = announcements[currentIndex];
    const target = announcements[nextIndex];

    console.log("moving announcement", {
        currentIndex,
        nextIndex,
        currentId: current.id,
        currentOrder: current.displayOrder,
        targetId: target.id,
        targetOrder: target.displayOrder,
    });
    
    const currentOrder = current.displayOrder ?? currentIndex;
    const targetOrder = target.displayOrder ?? nextIndex;
    
    try {
        await Promise.all([
            updateAnnouncementDisplayOrder(
                state.currentRegionId,
                current.id,
                nextIndex
            ),
            updateAnnouncementDisplayOrder(
                state.currentRegionId,
                target.id,
                currentIndex
            ),
        ]);

        console.log("reorder update complete");

        state.announcements = await loadAnnouncements(state.currentRegionId);
        state.allAnnouncements = await loadAllAnnouncements(state.currentRegionId);
        state.hasLoadedAllAnnouncements = true;

        renderApp();
    } catch (error) {
        console.error("Failed to reorder announcements:", error);
        showToast("Failed to reorder announcements.", "error");
    }
}

function renderAnnouncementList(container, controls) {
    container.textContent = "";

    const announcements = state.allAnnouncements || [];

    if (announcements.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No announcements yet.";
        container.appendChild(empty);
        return;
    }

    announcements.forEach((announcement, index) => {
        const card = document.createElement("div");
        card.classList.add("member-card", "admin-announcement-card");
        card.classList.toggle("announcement-card-inactive", !announcement.isActive);

        const title = document.createElement("div");
        title.classList.add("member-name", "announcement-title");
        title.textContent = announcement.title || "📣 Announcement";
        
        const body = document.createElement("div");
        body.classList.add("stats-line", "announcement-body");
        body.textContent = announcement.body || "";

        const meta = document.createElement("div");
        meta.classList.add("stats-line");

        const status = announcement.isActive ? "Active" : "Inactive";

        meta.textContent =
            `${status} • ` +
            `${announcement.startsOn || "Immediate"} → ` +
            `${announcement.endsOn || "No Expiration"}`;

        const actions = document.createElement("div");
        actions.classList.add("announcement-admin-actions");

        const moveUpButton = document.createElement("button");
        moveUpButton.classList.add("secondary-button", "move-btn");
        moveUpButton.textContent = "↑";
        moveUpButton.disabled = index === 0;

        moveUpButton.addEventListener("click", async () => {
            await moveAnnouncement(announcement.id, -1);
        });

        const moveDownButton = document.createElement("button");
        moveDownButton.classList.add("secondary-button", "move-btn");
        moveDownButton.textContent = "↓";
        moveDownButton.disabled = index === announcements.length - 1;

        moveDownButton.addEventListener("click", async () => {
            await moveAnnouncement(announcement.id, 1);
        });

        const editButton = document.createElement("button");
        editButton.classList.add("secondary-button");
        editButton.textContent = "Edit";

        editButton.addEventListener("click", () => {
            state.editingAnnouncementId = announcement.id;

            controls.titleInput.value = announcement.title || "";
            controls.bodyInput.value = announcement.body || "";
            controls.linkUrlInput.value = announcement.linkUrl || "";
            controls.linkLabelInput.value = announcement.linkLabel || "";
            controls.startsInput.value = announcement.startsOn || "";
            controls.endsInput.value = announcement.endsOn || "";

            controls.saveButton.textContent = "Save Changes";
            controls.cancelEditButton.style.display = "";

            window.scrollTo({
                top: 0,
                behavior: "smooth",
            });
        });

        const toggleButton = document.createElement("button");
        toggleButton.classList.add("secondary-button");
        toggleButton.textContent = announcement.isActive
            ? "Deactivate"
            : "Activate";

        toggleButton.addEventListener("click", async () => {
            try {
                await updateAnnouncementInCloud(
                    state.currentRegionId,
                    {
                        ...announcement,
                        isActive: !announcement.isActive,
                    }
                );

                state.announcements =
                    await loadAnnouncements(state.currentRegionId);

                state.allAnnouncements =
                    await loadAllAnnouncements(state.currentRegionId);
                
                state.hasLoadedAllAnnouncements = true;

                renderApp();
            } catch (error) {
                console.error("Failed to update announcement:", error);
                showToast("Failed to update announcement.", "error");
            }
        });

        const deleteButton = document.createElement("button");
        deleteButton.classList.add("secondary-button", "delete-btn");
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", async () => {
            const confirmed = confirm(
                "Delete this announcement?"
            );

            if (!confirmed) return;

            try {
                await deleteAnnouncementFromCloud(
                    state.currentRegionId,
                    announcement.id
                );

                state.announcements =
                    await loadAnnouncements(state.currentRegionId);

                state.allAnnouncements =
                    await loadAllAnnouncements(state.currentRegionId);
                
                state.hasLoadedAllAnnouncements = true;

                renderApp();
            } catch (error) {
                console.error("Failed to delete announcement:", error);
                showToast("Failed to delete announcement.", "error");
            }
        });

        const content = document.createElement("div");
        content.classList.add("admin-announcement-content");

        content.append(title, body, meta);

        if (announcement.linkUrl) {
            const link = document.createElement("a");
            link.href = announcement.linkUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = announcement.linkLabel || "Open Link";
            link.classList.add("secondary-button", "announcement-link-button");
            content.appendChild(link);
        }

        actions.append(moveUpButton, moveDownButton, editButton, toggleButton, deleteButton);

        card.append(content, actions);

        container.appendChild(card);
    });
}