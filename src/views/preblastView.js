import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

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

    const mediaSection = document.createElement("div");
    mediaSection.classList.add("preblast-media-section");

    const mediaHelperText = document.createElement("div");
    mediaHelperText.classList.add("preblast-media-helper");
    mediaHelperText.textContent = "Videos may take a few seconds to load and may uploade more slowly in BAND.";

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
            alert("Failed to copy preblast.");
        }
    });

    const shareButton = document.createElement("button");
    shareButton.textContent = "Share Preblast";

    if (typeof navigator.share !== "function") {
        shareButton.disabled = true;
        shareButton.textContent = "Share Not Available";
    } else {
        shareButton.addEventListener("click", async () => {
            const text = state.draftPreblastText || "";
            const mediaFiles = state.draftPreblastMediaFiles || [];

            try {
                if (mediaFiles.length && navigator.canShare?.({ files: mediaFiles })) {
                    await navigator.share({
                        text,
                        files: mediaFiles,
                    });
                } else {
                    await navigator.share({ text });
                }
            } catch (error) {
                if (error.name === "AbortError") {
                    return;
                }
                
                console.error("Share failed:", error);
                alert("Share failed.");
            }
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
        }
        state.selectedPlannedWorkoutId = null;
        renderApp();
    });

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");
    actionRow.append(shareButton, copyButton, doneButton);

    app.append(
        title,
        subtitle,
        textInput,
        mediaSection,
        actionRow,
    );
}