import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

export function renderBackblastView () {

    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Backblast";

    const textBlock = document.createElement("pre");
    textBlock.textContent = state.draftBackblastText;

    const mediaSection = document.createElement("div");
    mediaSection.classList.add("preblast-media-section");

    const mediaInput = document.createElement("input");
    mediaInput.classList.add("media-input");
    mediaInput.type = "file";
    mediaInput.accept = "image/*,video/*";
    mediaInput.multiple = true;

    mediaInput.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        state.draftBackblastMediaFiles = files;
        state.currentView = "backblast";
        renderApp();
    });

    const mediaHelperText = document.createElement("div");
    mediaHelperText.classList.add("preblast-media-helper");
    mediaHelperText.textContent = "Images share quickly. Videos may upload slowly in BAND. For fastest posting, share text + images first and add videos separately in BAND App.";
    const mediaPreviewWrapper = document.createElement("div");
    mediaPreviewWrapper.classList.add("preblast-media-preview-wrapper");

    const mediaFiles = state.draftBackblastMediaFiles || [];

    mediaFiles.forEach((file, index) => {
        const mediaItem = document.createElement("div");
        mediaItem.classList.add("preblast-media-item");

        let previewMedia;

        if (file.type.startsWith("video/")) {
            previewMedia = document.createElement("video");
            previewMedia.controls = true;
        } else {
            previewMedia = document.createElement("img");
            previewMedia.alt = `Selected backblast media ${index + 1}`;
        }

        previewMedia.classList.add("preblast-media-preview");
        previewMedia.src = URL.createObjectURL(file);

        const removeMediaButton = document.createElement("button");
        removeMediaButton.textContent = "Remove Media";

        removeMediaButton.addEventListener("click", () => {
            state.draftBackblastMediaFiles =
                state.draftBackblastMediaFiles.filter((_, i) => i !== index);
            state.currentView = "backblast";
            renderApp();
        });

        mediaItem.append(previewMedia, removeMediaButton);
        mediaPreviewWrapper.append(mediaItem);
    });

    mediaSection.append(mediaInput, mediaHelperText, mediaPreviewWrapper);

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy Backblast";
    copyButton.addEventListener("click", () => {
        console.log("COPYING:", state.draftBackblastText || "");
        navigator.clipboard.writeText(state.draftBackblastText || "");
        copyButton.textContent = "Copied";
        setTimeout(() => {
            copyButton.textContent = "Copy Backblast"
        }, 1500);
    });

    const shareButton = document.createElement("button");
    shareButton.textContent = "Share Backblast";
    
    if (typeof navigator.share !== "function") {
        shareButton.disabled = true;
        shareButton.textContent = "Share Not Available";
    } else {
        shareButton.addEventListener("click", async () => {
            try {
                const mediaFiles = state.draftBackblastMediaFiles || [];
                const text = state.draftBackblastText || "";
    
                const imageFiles = mediaFiles.filter(file =>
                    file.type.startsWith("image/")
                );
    
                const videoFiles = mediaFiles.filter(file =>
                    file.type.startsWith("video/")
                );
    
                const hasVideo = videoFiles.length > 0;
    
                if (!mediaFiles.length) {
                    await navigator.share({ text });
                    return;
                }
    
                if (hasVideo) {
                    const useFastShare = confirm(
                        "This post includes video.\n\n" +
                        "OK = Fast Share (recommended): share text + images only\n" +
                        "Cancel = Include Video: may take longer to upload in BAND"
                    );
    
                    if (useFastShare) {
                        if (imageFiles.length && navigator.canShare?.({ files: imageFiles })) {
                            await navigator.share({
                                text,
                                files: imageFiles,
                            });
                        } else {
                            await navigator.share({ text });
                        }
    
                        alert("Shared text" + (imageFiles.length ? " + images" : "") + ". Upload videos separately in BAND if needed.");
                        return;
                    }
                }
    
                if (navigator.canShare?.({ files: mediaFiles })) {
                    await navigator.share({
                        text,
                        files: mediaFiles,
                    });
                } else {
                    await navigator.share({ text });
                }
            } catch (error) {
                console.error("Share failed:", error);
            }
        });
    }
    const doneButton = document.createElement("button");
    doneButton.textContent ="Done";
    doneButton.addEventListener("click", () => {
        state.draftBackblastMediaFiles = [];
        state.draftBackblastText = "";
        state.currentView = "dashboard";
        renderApp();
    });

    app.append(title, textBlock, mediaSection, shareButton, copyButton);

    app.append(doneButton);
}