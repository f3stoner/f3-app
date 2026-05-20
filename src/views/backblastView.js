import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { generateBackblast } from "../modules/backblast.js";
import { updateSession } from "../services/appData.js";
import { showToast } from "../utils/toast.js";
import { updateCustomTemplates } from "../services/cloudData.js";
import { logActionFailure } from "../services/appEvents.js";
import { navigateTo } from "../utils/navigation.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderBackblastView () {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    async function exitBackblastView() {
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
        state.hasAddedBackblastWeather = false;
        state.currentView = "sessionDetail";
        renderApp();
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        showMenu: true,
        onBack: exitBackblastView,
    });

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

    const hasSavedOpener = Boolean(state.customTemplates?.backblastIntro);

    let openerExpanded = false;

    const templateSection = document.createElement("div");
    templateSection.classList.add("card");

    const templateTitle = document.createElement("h2");
    templateTitle.textContent = "Backblast Opener";

    const templateHelper = document.createElement("div");
    templateHelper.classList.add("detail-label");
    templateHelper.textContent = hasSavedOpener
        ? "Saved opener is active for generated backblasts."
        : "No saved opener yet. Supports {paxCount}, {aonName}, {date}, and {qNames}.";

    const templateTextArea = document.createElement("textarea");
    templateTextArea.classList.add("preblast-textarea");
    templateTextArea.style.minHeight = "80px";
    templateTextArea.style.maxHeight = "160px";
    templateTextArea.style.overflowY = "auto";
    templateTextArea.value = state.customTemplates?.backblastIntro || "";
    templateTextArea.placeholder = "{paxCount} PAX including YHC joined together in the gloom this morning at {aoName}.";
    templateTextArea.style.display = "none";


    const saveTemplateButton = document.createElement("button");
    saveTemplateButton.textContent = "Save Opener";
    saveTemplateButton.style.display = "none";

    const toggleTemplateButton = document.createElement("button");
    toggleTemplateButton.textContent = hasSavedOpener ? "Edit" : "Add";

    saveTemplateButton.addEventListener("click", async () => {
        try {
            const updatedTemplates = {
                ...(state.customTemplates || {}),
                backblastIntro: templateTextArea.value.trim(),
            };

            await updateCustomTemplates(state.currentUserId, updatedTemplates);

            state.customTemplates = updatedTemplates;

            showToast("Backblast opener saved.", "success");
            renderApp();
        } catch (error) {
            console.error("Failed to save backblast opener:", error);
            showToast("Failed to save opener.", "error");
        }
    });

    toggleTemplateButton.addEventListener("click", () => {
        openerExpanded = !openerExpanded;

        templateTextArea.style.display = openerExpanded ? "block" : "none";
        saveTemplateButton.style.display = openerExpanded ? "inline-block" : "none";

        toggleTemplateButton.textContent = openerExpanded ? "Hide" : (hasSavedOpener ? "Edit" : "Add");

        if (openerExpanded) {
            autoResize(templateTextArea);
        }
    });

    const applyTemplateButton = document.createElement("button");
    applyTemplateButton.textContent = "Apply Saved Opener";
    applyTemplateButton.disabled = !hasSavedOpener;

    applyTemplateButton.addEventListener("click", () => {
        if (!session) {
            showToast("Could not apply opener. Session not found.", "error");
            return;
        }

        const confirmed = confirm("Regenerate this backblast with your saved opener? This will replace your current draft.");
        if (!confirmed) return;

        session.backblastText = "";
        state.draftBackblastText = generateBackblast(session, state.members);
        renderApp();
    });

    templateSection.append(templateTitle, templateHelper, toggleTemplateButton, applyTemplateButton, templateTextArea, saveTemplateButton);

    const textArea = document.createElement("textarea");
    textArea.classList.add("preblast-textarea");
    textArea.value = state.draftBackblastText || "";

    function autoResize(textarea) {
        textarea.style.height = "auto";
    
        const maxHeight = textarea === templateTextArea
            ? 160
            : Math.floor(window.innerHeight * 0.65);
    
        textarea.style.height =
            Math.min(textarea.scrollHeight, maxHeight) + "px";
    }

    autoResize(textArea);
    autoResize(templateTextArea);

    templateTextArea.addEventListener("input", () => {
        autoResize(templateTextArea);
    })

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

                    logActionFailure("shareBackblast", error, {
                        sessionId: state.selectedSessionId || null,
                        mediaFileCount: mediaFiles.length,
                        imageFileCount: imageFiles.length,
                        videoFileCount: videoFiles.length,
                        sharedFileCount: filesToShare.length,
                        usedFilesShare: Boolean(filesToShare.length && navigator.canShare?.({ files: filesToShare })),
                    });
                });
        });
    }

    const doneButton = document.createElement("button");
    doneButton.textContent ="Done";

    doneButton.addEventListener("click", exitBackblastView);

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
        state.hasAddedBackblastWeather = false;
        state.draftBackblastText = generateBackblast(session, state.members);
        renderApp();
    });

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");

    actionRow.append(shareButton, copyButton, resetButton, doneButton);

    app.append(
        header,
        title,
        helper,
        textArea,
        templateSection,
        mediaSection,
        actionRow
    );
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu);
    }
}