import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import {
    buildBackblastSnapshot,
    generateBackblastBody,
    generateBackblastHeader,
    generateBackblastHashtags,
    generateBackblastIntro,
} from "../modules/backblast.js";
import { updateSession } from "../services/appData.js";
import { showToast } from "../utils/toast.js";
import { logActionFailure } from "../services/appEvents.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { getWorkoutEmphasisForSlot } from "../utils/workoutEmphasis.js";

export function renderBackblastView () {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    function returnToDashboardAfterShare() {
        state.draftBackblastMediaFiles = [];
        state.draftBackblastText = "";
        state.hasAddedBackblastWeather = false;
        state.selectedSessionId = null;
        state.currentView = "dashboard";
    
        showToast("Backblast shared.", "success");
        renderApp();
    }

    async function exitBackblastView() {
        const session = state.sessions.find(
            s => s.id === state.selectedSessionId
        );

        if (session) {
            try {
                const backblastText =
                    buildCurrentBackblastText();

                    const {
                        _backblastSectionsInitialized,
                        ...persistableSession
                    } = session;
                    
                    const updatedSession = {
                        ...persistableSession,
                    
                        backblastHashtagsText:
                            session.backblastHashtagsText ??
                            null,
                    
                        backblastIntroText:
                            session.backblastIntroText ??
                            null,
                    
                        backblastBodyText:
                            session.backblastBodyText ??
                            null,
                    
                        backblastText,
                    };

                await updateSession(
                    session.id,
                    updatedSession
                );

                Object.assign(
                    session,
                    updatedSession
                );
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

    function stripUrls(text = "") {
        return text.replace(
            /https?:\/\//gi,
            ""
        );
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

    function buildCurrentBackblastText() {
        if (!session) return "";
    
        return buildBackblastSnapshot(
            session,
            state.members
        );
    }

    let hashtagsText = "";
    let introText = "";
    let bodyText = "";

    if (session) {
        hashtagsText =
            session.backblastHashtagsText ??
            generateBackblastHashtags(session, state.members);
        
        introText =
            session.backblastIntroText ??
            generateBackblastIntro(session, state.members);
        
        bodyText =
            session.backblastBodyText ??
            generateBackblastBody(session);
    
        state.draftBackblastText =
            buildCurrentBackblastText();
    }

    const title = document.createElement("h1");
    title.textContent = "Backblast";
    
    const helper = document.createElement("div");
    helper.classList.add("detail-label");
    helper.textContent =
        "Your edits stay intact while attendance updates automatically.";
    
    const composer = document.createElement("section");
    
    composer.classList.add(
        "card",
        "backblast-composer"
    );
    
    /* =========================================================
       HASHTAGS
       ========================================================= */
    
    const hashtagsTextArea =
        document.createElement("textarea");
    
    hashtagsTextArea.classList.add(
        "backblast-composer-field",
        "backblast-composer-hashtags"
    );
    
    hashtagsTextArea.rows = 1;
    
    hashtagsTextArea.value = hashtagsText;
    
    hashtagsTextArea.placeholder =
        "#backblast #TheHub";

    const hashtagsField =
        document.createElement("div");
    
    hashtagsField.classList.add(
        "backblast-composer-editable",
        "backblast-composer-editable-hashtags"
    );
    
    const hashtagsLabel =
        document.createElement("div");
    
    hashtagsLabel.classList.add(
        "backblast-composer-editable-label"
    );
    
    hashtagsLabel.textContent =
        "EDIT HASHTAGS";
    
    hashtagsField.append(
        hashtagsLabel,
        hashtagsTextArea
    );
    
    /* =========================================================
       OPENING
       ========================================================= */
    
    const introTextArea =
        document.createElement("textarea");
    
    introTextArea.classList.add(
        "backblast-composer-field",
        "backblast-composer-intro"
    );
    
    introTextArea.value = introText;
    
    introTextArea.placeholder =
        "Add an opening note...";

    const introField =
        document.createElement("div");
    
    introField.classList.add(
        "backblast-composer-editable"
    );
    
    const introLabel =
        document.createElement("div");
    
    introLabel.classList.add(
        "backblast-composer-editable-label"
    );
    
    introLabel.textContent =
        "EDIT OPENING";
    
    introField.append(
        introLabel,
        introTextArea
    );
    
    /* =========================================================
       LIVE SESSION DATA
       ========================================================= */
    
    const generatedBlock =
        document.createElement("div");
    
    generatedBlock.classList.add(
        "backblast-composer-generated"
    );
    
    const generatedLabel =
        document.createElement("div");
    
    generatedLabel.classList.add(
        "backblast-composer-generated-label"
    );
    
    generatedLabel.textContent =
        "LIVE SESSION DATA";
    
    const generatedContent =
        document.createElement("pre");
    
    generatedContent.classList.add(
        "backblast-composer-generated-content"
    );
    
    generatedContent.textContent =
        session
            ? generateBackblastHeader(
                session,
                state.members
            )
            : "";
    
    generatedBlock.append(
        generatedLabel,
        generatedContent
    );
    
    /* =========================================================
       WORKOUT / NARRATIVE
       ========================================================= */
    
    const bodyTextArea =
        document.createElement("textarea");
    
    bodyTextArea.classList.add(
        "backblast-composer-field",
        "backblast-composer-body"
    );
    
    bodyTextArea.value = bodyText;
    
    bodyTextArea.placeholder =
        "Add workout details, commentary, announcements, or closing notes...";

    const bodyField =
        document.createElement("div");
    
    bodyField.classList.add(
        "backblast-composer-editable",
        "backblast-composer-editable-body"
    );
    
    const bodyLabel =
        document.createElement("div");
    
    bodyLabel.classList.add(
        "backblast-composer-editable-label"
    );
    
    bodyLabel.textContent =
        "EDIT WORKOUT DETAILS";
    
    bodyField.append(
        bodyLabel,
        bodyTextArea
    );
    
    composer.append(
        hashtagsField,
        introField,
        generatedBlock,
        bodyField
    );

    function autoResize(textarea) {
        textarea.style.height = "auto";

        const maxHeight =
            Math.floor(
                window.innerHeight * 0.65
            );

        textarea.style.height =
            Math.min(
                textarea.scrollHeight,
                maxHeight
            ) + "px";
    }

    function rebuildBackblastDraft() {
    if (!session) {
        state.draftBackblastText = "";
        return;
    }

    state.draftBackblastText =
        buildCurrentBackblastText();

    generatedContent.textContent =
        generateBackblastHeader(
            session,
            state.members
        );
    }

    autoResize(hashtagsTextArea);
    autoResize(introTextArea);
    autoResize(bodyTextArea);

    hashtagsTextArea.addEventListener(
        "input",
        () => {
            autoResize(
                hashtagsTextArea
            );
    
            if (!session) return;
    
            session.backblastHashtagsText =
                hashtagsTextArea.value;
    
            rebuildBackblastDraft();
        }
    );
    
    introTextArea.addEventListener(
        "input",
        () => {
            autoResize(
                introTextArea
            );
    
            if (!session) return;
    
            session.backblastIntroText =
                introTextArea.value;
    
            rebuildBackblastDraft();
        }
    );
    
    bodyTextArea.addEventListener(
        "input",
        () => {
            autoResize(
                bodyTextArea
            );
    
            if (!session) return;
    
            session.backblastBodyText =
                bodyTextArea.value;
    
            rebuildBackblastDraft();
        }
    );

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
    mediaHelperText.textContent = "BAND heads up: videos may upload slowly, @tags may not carry over, and text after links may get cut off or hidden by BAND.";

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

    async function copyTextToClipboard(text) {
        const safeText = text || "";
    
        if (!safeText.trim()) {
            showToast("Nothing to copy.", "error");
            return false;
        }
    
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(safeText);
            return true;
        }
    
        const fallbackTextarea = document.createElement("textarea");
        fallbackTextarea.value = safeText;
        fallbackTextarea.setAttribute("readonly", "");
        fallbackTextarea.style.position = "fixed";
        fallbackTextarea.style.left = "-9999px";
        fallbackTextarea.style.top = "0";
    
        document.body.appendChild(fallbackTextarea);
        fallbackTextarea.focus();
        fallbackTextarea.select();
    
        const successful = document.execCommand("copy");
        fallbackTextarea.remove();
    
        if (!successful) {
            throw new Error("Fallback copy failed.");
        }
    
        return true;
    }

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy Backblast";
    copyButton.addEventListener("click", async () => {
        const textToCopy =
            buildCurrentBackblastText();

        try {
            await copyTextToClipboard(
                textToCopy
            );

            state.draftBackblastText =
                textToCopy;
    
            copyButton.textContent = "Copied";
            showToast("Backblast copied.", "success");
    
            setTimeout(() => {
                copyButton.textContent = "Copy Backblast";
            }, 1500);
        } catch (error) {
            console.error("Copy failed:", error);
            showToast("Failed to copy backblast.", "error");
    
            logActionFailure("copyBackblast", error, {
                sessionId: state.selectedSessionId || null,
            });
        }
    });

    const shareButton = document.createElement("button");
    shareButton.textContent = "Share Backblast";
    
    if (typeof navigator.share !== "function") {
        shareButton.disabled = true;
        shareButton.textContent = "Share Not Available";
    } else {
        shareButton.addEventListener("click", () => {
            const mediaFiles =
                state.draftBackblastMediaFiles ||
                [];

            const rawText =
                buildCurrentBackblastText();

            state.draftBackblastText =
                rawText;

            const text =
                mediaFiles.length
                    ? stripUrls(rawText)
                    : rawText;
            
            const filesToShare = mediaFiles;
            
            if (mediaFiles.length && rawText !== text) {
                showToast("Links simplified so BAND keeps media attached.", "success");
            }

                let sharePromise;
                
                if (filesToShare.length && navigator.canShare?.({ files: filesToShare })) {
                    sharePromise = navigator.share({
                        text,
                        files: filesToShare,
                    });
                } else {
                    sharePromise = navigator.share({ text });
                }

                sharePromise
                    .then(async () => {
                        const session = state.sessions.find(
                            s => s.id === state.selectedSessionId
                        );

                        if (!session) return;

                        const backblastText =
                            buildCurrentBackblastText();

                            const persistableSession = { ...session };
                            
                            const updatedSession = {
                                ...persistableSession,
                            
                                backblastHashtagsText:
                                    session.backblastHashtagsText ??
                                    null,
                            
                                backblastIntroText:
                                    session.backblastIntroText ??
                                    null,
                            
                                backblastBodyText:
                                    session.backblastBodyText ??
                                    null,
                            
                                backblastText,
                            
                                backblastStatus:
                                    "shared",
                            
                                backblastPostedAt:
                                    new Date().toISOString(),
                            };
                        try {
                            await updateSession(session.id, updatedSession);
                            Object.assign(session, updatedSession);
                        } catch (error) {
                            console.error("Failed to persist backblast status:", error);
                        
                            showToast(
                                "Backblast shared, but The Q couldn't save its shared status.",
                                "warning"
                            );
                        }
                        
                        returnToDashboardAfterShare();
                    })
                    .catch((error) => {
                        if (error.name === "AbortError") return;

                        console.error("Share failed:", error);
                        showToast("Share failed.", "error");

                        logActionFailure("shareBackblast", error, {
                            sessionId: state.selectedSessionId || null,
                            mediaFileCount: mediaFiles.length,
                            sharedFileCount: filesToShare.length,
                            usedFilesShare: Boolean(
                                filesToShare.length &&
                                navigator.canShare?.({ files: filesToShare })
                            ),
                        });
                    });
                });

    }

    const doneButton = document.createElement("button");
    doneButton.textContent ="Done";

    doneButton.addEventListener("click", exitBackblastView);

    const resetButton = document.createElement("button");
    resetButton.textContent = "Reset";

    resetButton.addEventListener(
        "click",
        () => {
            const confirmed = confirm(
                "Reset the hashtags, opening notes, and backblast to their generated versions?"
            );
    
            if (!confirmed) return;
    
            const session =
                state.sessions.find(
                    candidate =>
                        candidate.id ===
                        state.selectedSessionId
                );
    
            if (!session) {
                showToast(
                    "Could not reset backblast. Session not found.",
                    "error"
                );
    
                return;
            }
    
            session.backblastHashtagsText =
                generateBackblastHashtags(
                    session,
                    state.members
                );

            session.backblastIntroText =
                generateBackblastIntro(
                    session,
                    state.members
                );

            session.backblastBodyText =
                generateBackblastBody(
                    session
                );
    
            session.backblastText =
                buildCurrentBackblastText();
    
            state.draftBackblastText =
                session.backblastText;
    
            state.hasAddedBackblastWeather =
                false;
    
            renderApp();
        }
    );

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");

    actionRow.append(shareButton, copyButton, resetButton, doneButton);

    app.append(
        header,
        title,
        helper,
        composer,
        mediaSection,
        actionRow
    );
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}