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

    form.append(
        label("Title"), titleInput,
        label("Body"), bodyInput,
        label("Starts On Optional"), startsInput,
        label("Expires After Optional"), endsInput,
        saveButton,
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
                    startsOn: startsInput.value || null,
                    endsOn: endsInput.value || null,
                });

                state.editingAnnouncementId = null;
                showToast("Announcement updated.", "success");
            } else {
                await insertAnnouncement(state.currentRegionId, {
                    id: crypto.randomUUID(),
                    scope: "region",
                    title: titleInput.value.trim(),
                    body: bodyInput.value.trim(),
                    startsOn: startsInput.value || null,
                    endsOn: endsInput.value || null,
                    isActive: true,
                    createdByUserId: state.currentUserId,
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
        startsInput.value = "";
        endsInput.value = "";
    
        saveButton.textContent = "Create Announcement";
        cancelEditButton.style.display = "none";
    });

    renderAnnouncementList(list, {
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

    announcements.forEach(announcement => {
        const card = document.createElement("div");
        card.classList.add("member-card", "admin-announcement-card");
        card.classList.toggle("announcement-card-inactive", !announcement.isActive);

        const title = document.createElement("div");
        title.classList.add("member-name");
        title.textContent = announcement.title;

        const body = document.createElement("div");
        body.classList.add("stats-line");
        body.textContent = announcement.body;

        const meta = document.createElement("div");
        meta.classList.add("stats-line");

        const status = announcement.isActive ? "Active" : "Inactive";

        meta.textContent =
            `${status} • ` +
            `${announcement.startsOn || "Immediate"} → ` +
            `${announcement.endsOn || "No Expiration"}`;

        const actions = document.createElement("div");
        actions.classList.add("q-slot-actions");

        const editButton = document.createElement("button");
        editButton.classList.add("secondary-button");
        editButton.textContent = "Edit";

        editButton.addEventListener("click", () => {
            state.editingAnnouncementId = announcement.id;

            controls.titleInput.value = announcement.title || "";
            controls.bodyInput.value = announcement.body || "";
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
        deleteButton.classList.add("secondary-button");
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

        actions.append(editButton, toggleButton, deleteButton);

        card.append(content, actions);

        container.appendChild(card);
    });
}