import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { generateBackblast } from "../modules/backblast.js";
import { updateSession } from "../services/appData.js";
import { showToast } from "../utils/toast.js";

export function renderBackblastView () {
    const app = document.getElementById("app");
    app.textContent = "";

    const session = state.sessions.find(
        s => s.id === state.selectedSessionId
    );

    if (!state.draftBackblastText && session) {
        state.draftBackblastText = generateBackblast(session, state.members);
    }

    const title = document.createElement("h1");
    title.textContent = "Backblast";

    const helper = document.createElement("div");
    helper.classList.add("detail-label");
    helper.textContent = "Edit before sharing";

    const textArea = document.createElement("textarea");
    textArea.classList.add("preblast-textarea");
    textArea.value = state.draftBackblastText || "";

    function autoResize(textarea) {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
    }

    autoResize(textArea);

    textArea.addEventListener("input", () => {
        autoResize(textArea);
        state.draftBackblastText = textArea.value;
    })

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
    mediaHelperText.textContent = "BAND heads up: videos may upload slowly, @tags may not carry over, and text after links may get cut off or hidden by BAND."

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
        shareButton.addEventListener("click", () => {
                const mediaFiles = state.draftBackblastMediaFiles || [];
                const text = state.draftBackblastText || "";
    
                const imageFiles = mediaFiles.filter(file =>
                    file.type.startsWith("image/")
                );
    
                const videoFiles = mediaFiles.filter(file =>
                    file.type.startsWith("video/")
                );
    
                const hasVideo = videoFiles.length > 0;
                const filesToShare = hasVideo ? imageFiles : mediaFiles;
    
                if (hasVideo) {
                    showToast("Sharing text/images only. Add videos separately in BAND.", "success");
                }
                let sharePromise;

                if (filesToShare.length && navigator.canShare?.({ files: filesToShare})) {
                    sharePromise = navigator.share({
                        text,
                        files: filesToShare,
                    });
                } else {
                    sharePromise = navigator.share({ text });
                }

                sharePromise.catch((error) => {
                    if (error.name === "AbortError") return;

                    console.error("Share failed:", error);
                    showToast("Share failed.", "error");
                });
        });
    }

    const doneButton = document.createElement("button");
    doneButton.textContent ="Done";

    doneButton.addEventListener("click", async () => {
        const session = state.sessions.find(
            s => s.id === state.selectedSessionId
        );

        if (session) {
            try {
                const updatedSession = {
                    ...session,
                    backblastText: state.draftBackblastText || "",
                };

                await updateSession(session.id, updatedSession);
            } catch (error) {
                console.error("Failed to save backblast text:", error);
                showToast("Failed to save backblast.", "error");
                return;
            }
        }

        state.draftBackblastMediaFiles = [];
        state.draftBackblastText = "";
        state.currentView = "sessionDetail";
        renderApp();
    });

    const resetButton = document.createElement("button");
    resetButton.textContent = "Reset";

    resetButton.addEventListener("click", () => {
        const confirmed = confirm("Reset backblast to original?");
        if (!confirmed) return;
        const session = state.sessions.find(
            s => s.id === state.selectedSessionId
        );
        if (!session) {
            showToast("Could not reset backblast. Session not found.", "error");
            return;
        }
        session.backblastText = "";
        state.draftBackblastText = generateBackblast(session, state.members);
        renderApp();
    });

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");

    actionRow.append(shareButton, copyButton, resetButton, doneButton);

    app.append(title, helper, textArea, mediaSection, actionRow);
}