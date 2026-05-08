import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { saveState } from "../utils/storage.js";
import { updateCustomTemplates } from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { logActionFailure } from "../services/appEvents.js";

export function renderPreblastView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Preblast";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Write and refine your preblast.";

    const textInput = document.createElement("textarea");
    textInput.classList.add("preblast-textarea");
    textInput.value = state.draftPreblastText || "";

    textInput.addEventListener("input", (event) => {
        state.draftPreblastText = event.target.value;
    });

    const templateButtonRow = document.createElement("div");
    templateButtonRow.classList.add("button-row");

    const saveTemplateButton = document.createElement("button");
    saveTemplateButton.textContent = "Save Template";

    saveTemplateButton.addEventListener("click", async () => {
        state.customTemplates = state.customTemplates || {
            preblast: {
                activeTemplateId: "default",
                savedTemplates: [],
            },
            backblast: {
                activeTemplateId: "default",
                savedTemplates: [],
            },
        };
        const existingTemplate = state.customTemplates.preblast.savedTemplates[0];

        if (existingTemplate) {
            existingTemplate.content = textInput.value;
            existingTemplate.name = existingTemplate.name || "My Preblast Template";
        } else {
            state.customTemplates.preblast.savedTemplates.push({
                id: crypto.randomUUID(),
                name: "My Preblast Template",
                content: textInput.value,
            });
        }

        saveState(state);
        try {
            await updateCustomTemplates(state.currentUserId, state.customTemplates);

            saveTemplateButton.textContent = "Template Saved";
            setTimeout(() => {
                saveTemplateButton.textContent = "Save Template";
            }, 1500);
        } catch (error) {
            console.error("Template save failed:", error);
            showToast("Template saved locally, but failed to save to your account.");
        }
    });

    const useTemplateButton = document.createElement("button");
    useTemplateButton.textContent = "Use Template";

    useTemplateButton.addEventListener("click", () => {
        const savedTemplate = state.customTemplates?.preblast?.savedTemplates?.[0];

        if (!savedTemplate) {
            showToast("No saved preblast template yet.");
            return;
        }

        textInput.value = savedTemplate.content;
        state.draftPreblastText = savedTemplate.content;
    });

    templateButtonRow.append(useTemplateButton, saveTemplateButton);

    const mediaSection = document.createElement("div");
    mediaSection.classList.add("preblast-media-section");

    const mediaHelperText = document.createElement("div");
    mediaHelperText.classList.add("preblast-media-helper");
    mediaHelperText.textContent = "BAND heads up: videos may upload slowly, @tags may not carry over, and text after links may get cut off or hidden by BAND.";

    const mediaInput = document.createElement("input");
    mediaInput.classList.add("media-input");
    mediaInput.type = "file";
    mediaInput.accept = "image/*,video/*";
    mediaInput.multiple = true;

    mediaInput.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        state.draftPreblastMediaFiles = files;
        renderApp();
    });

    const mediaPreviewWrapper = document.createElement("div");
    mediaPreviewWrapper.classList.add("preblast-media-preview-wrapper");

    const mediaFiles = state.draftPreblastMediaFiles || [];

    mediaFiles.forEach((file, index) => {
        
        const mediaItem = document.createElement("div");
        mediaItem.classList.add("preblast-media-item");

        let previewMedia;
    
        if (file.type.startsWith("video/")) {
            previewMedia = document.createElement("video");
            previewMedia.controls = true;
        } else {
            previewMedia = document.createElement("img");
            previewMedia.alt = "Selected preblast media";
        }
    
        previewMedia.classList.add("preblast-media-preview");
        previewMedia.src = URL.createObjectURL(file);

        const removeMediaButton = document.createElement("button");
        removeMediaButton.textContent = "Remove Media";

        removeMediaButton.addEventListener("click", () => {
            state.draftPreblastMediaFiles = state.draftPreblastMediaFiles.filter((_, i) => i !== index);
            renderApp();
        });

        mediaItem.append(previewMedia, removeMediaButton);
        mediaPreviewWrapper.append(mediaItem);
    });

    mediaSection.append(mediaInput, mediaHelperText, mediaPreviewWrapper);

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy Preblast";

    copyButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(state.draftPreblastText || "");
            copyButton.textContent = "Copied";
            setTimeout(() => {
                copyButton.textContent = "Copy Preblast";
            }, 1500);
        } catch (error) {
            console.error("Copy failed:", error);
            showToast("Failed to copy preblast.", "error");
        }
    });

    const shareButton = document.createElement("button");
    shareButton.textContent = "Share Preblast";

    if (typeof navigator.share !== "function") {
        shareButton.disabled = true;
        shareButton.textContent = "Share Not Available";
    } else {
        shareButton.addEventListener("click", () => {
            const text = state.draftPreblastText || "";
            const mediaFiles = state.draftPreblastMediaFiles || [];

            let sharePromise;

            if (mediaFiles.length && navigator.canShare?.({ files: mediaFiles })) {
                sharePromise = navigator.share({
                    text,
                    files: mediaFiles,
                });
            } else {
                sharePromise = navigator.share({ text });
            }

            sharePromise.catch((error) => {
                if (error.name === "AbortError") return;

                console.error("Share failed:", error);
                showToast("Share failed.", "error");

                logActionFailure("sharePreblast", error, {
                    plannedWorkoutId: state.selectedPreblastWorkoutId || state.selectedPlannedWorkoutId || null,
                    mediaFileCount: mediaFiles.length,
                    usedFilesShare: Boolean(mediaFiles.length && navigator.canShare?.({ files: mediaFiles })),
                });
            });
        });
    }

    const doneButton = document.createElement("button");
    doneButton.textContent = "Done";

    doneButton.addEventListener("click", () => {
        const returnToWorkout = Boolean(state.selectedPlannedWorkoutId);

        state.draftPreblastMediaFiles = [];
        state.draftPreblastText = "";

        if (returnToWorkout) {
            state.currentView = "plannedWorkoutDetail";
        } else {
            state.currentView = "dashboard";
            state.selectedPlannedWorkoutId = null;
        }
        
        renderApp();
    });

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");
    actionRow.append(shareButton, copyButton, doneButton);

    app.append(
        title,
        subtitle,
        textInput,
        templateButtonRow,
        mediaSection,
        actionRow,
    );
}