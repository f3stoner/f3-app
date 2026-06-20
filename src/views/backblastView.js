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
import { getAoWeather } from "../services/weather.js";
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

    function appendAnnouncementsToBackblast(text) {
        const savedAnnouncementText = session?.workout?.announcementText?.trim();
    
        if (savedAnnouncementText) {
            return `${text.trim()}\n\nANNOUNCEMENTS\n\n${savedAnnouncementText}`;
        }
    
        const announcements = state.announcements || [];
    
        if (announcements.length === 0) {
            return text;
        }
    
        const announcementText = announcements
            .map(announcement => `${announcement.title}\n${announcement.body}`)
            .join("\n\n");
    
        return `${text.trim()}\n\nANNOUNCEMENTS\n\n${announcementText}`;
    }

    function insertWeatherAfterDate(text, weatherLine) {
        const lines = text.split("\n");
    
        const dateLineIndex = lines.findIndex(line =>
            /^date:/i.test(line.trim())
        );
    
        if (dateLineIndex === -1) {
            return `${text}\n\n${weatherLine}`;
        }
    
        lines.splice(dateLineIndex + 1, 0, weatherLine);
        return lines.join("\n");
    }

    async function addWeatherToBackblast(session, textArea) {
        if (!session || state.hasAddedBackblastWeather) return;
    
        const ao = state.aos.find(a => a.name === session.aoName);
    
        const qSlot = getBackblastQSlot();

        const dayKey = session.date
            ? String(new Date(`${session.date}T12:00:00`).getDay())
            : "";

        const displayTime =
            qSlot?.overrideTime ||
            ao?.timeSchedule?.[dayKey] ||
            ao?.time ||
            "";

        if (!ao?.id || !displayTime || !session.date) return;

        try {
            const targetDateTime = `${session.date}T${displayTime}:00`;
            const startingText = state.draftBackblastText || "";

            const weather = await getAoWeather(ao.id, targetDateTime);
            
            if (!weather || weather.weatherUnavailable) return;
            
            if ((state.draftBackblastText || "") !== startingText) return;
            
            const weatherParts = [
                weather.temp != null ? `${weather.temp}°` : "--°",
                weather.humidity != null ? `${weather.humidity}% humidity` : null,
                weather.precipChance != null ? `${weather.precipChance}% rain` : null,
                weather.windMph != null ? `Wind ${weather.windMph} mph` : null,
            ].filter(Boolean);
            
            const weatherLine = `Weather: ${weatherParts.join(" • ")}`;
            
            const alreadyHasWeather = /^weather:/im.test(startingText);

            if (alreadyHasWeather) {
                state.hasAddedBackblastWeather = true;
                return;
            }

            state.draftBackblastText = insertWeatherAfterDate(startingText, weatherLine);
            state.hasAddedBackblastWeather = true;

            textArea.value = state.draftBackblastText;
            autoResize(textArea);

        } catch (error) {
            console.error("Failed to add weather to backblast:", error);
        }
    }

    function getBackblastAo() {
        return state.aos.find(ao => ao.name === session?.aoName);
    }
    
    function getBackblastQSlot() {
        const ao = getBackblastAo();
    
        if (!session || !ao) return null;
    
        const effectiveQIds = session.qIds || (session.qId ? [session.qId] : []);
    
        return state.qSlots.find(slot =>
            slot.date === session.date &&
            slot.aoId === ao.id &&
            (!slot.qUserId || effectiveQIds.includes(slot.qUserId))
        );
    }
    
    function buildEmphasisHashtag() {
        const ao = getBackblastAo();
        const qSlot = getBackblastQSlot();
    
        if (!qSlot) return "";
    
        const emphasis = getWorkoutEmphasisForSlot(qSlot, ao);
        const label = qSlot.customEmphasisLabel || emphasis?.label;
    
        if (!label) return "";
    
        return `#${label.toLowerCase()}`;
    }
    
    function upsertEmphasisHashtag() {
        const hashtag = buildEmphasisHashtag();
    
        if (!hashtag) return;
    
        const currentText = state.draftBackblastText || "";
    
        const emphasisLabels = [
            "Heavy",
            "Upper",
            "Lower",
            "Cardio",
            "Ruck",
            "Run",
            "Core",
            "30/30",
            "Stairs",
            "Bootcamp",
            "MurphTraining",
            "Other",
        ];
    
        const emphasisRegex = new RegExp(
            `\\s+#(?:${emphasisLabels.map(label =>
                label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            ).join("|")})`,
            "gi"
        );
    
        const withoutOldEmphasis = currentText.replace(emphasisRegex, "");
    
        if (withoutOldEmphasis.toLowerCase().includes(hashtag.toLowerCase())) {
            state.draftBackblastText = withoutOldEmphasis;
            return;
        }
    
        const lines = withoutOldEmphasis.split("\n");
        const firstNonEmptyIndex = lines.findIndex(line => line.trim());
    
        if (firstNonEmptyIndex === -1) {
            state.draftBackblastText = hashtag;
            return;
        }
    
        lines[firstNonEmptyIndex] = `${lines[firstNonEmptyIndex].trimEnd()} ${hashtag}`;
    
        state.draftBackblastText = lines.join("\n");
    }

    if (!state.draftBackblastText && session) {
        state.draftBackblastText = generateBackblast(session, state.members);
    }

    upsertEmphasisHashtag();


    const title = document.createElement("h1");
    title.textContent = "Backblast";

    const helper = document.createElement("div");
    helper.classList.add("detail-label");
    helper.textContent = "Edit before sharing";

    /*const hasSavedOpener = Boolean(state.customTemplates?.backblastIntro);

    let openerExpanded = false;

    const templateSection = document.createElement("div");
    templateSection.classList.add("card");

    const templateTitle = document.createElement("h2");
    templateTitle.textContent = "Backblast Opener";

    const DEFAULT_BACKBLAST_OPENER =
    "{paxCount} PAX including YHC joined together in the gloom this morning at {aoName}.";

    const templateHelper = document.createElement("div");
    templateHelper.classList.add("detail-label", "backblast-template-helper");
    templateHelper.textContent = hasSavedOpener
        ? "Saved opener is active for generated backblasts."
        : "Available tags: {paxCount}, {aoName}, {date}, and {qNames}. Tags are case-sensitive.";

    const templateTextArea = document.createElement("textarea");
    templateTextArea.classList.add("preblast-textarea");
    templateTextArea.style.minHeight = "80px";
    templateTextArea.style.maxHeight = "160px";
    templateTextArea.style.overflowY = "auto";
    templateTextArea.value = state.customTemplates?.backblastIntro || "";
    templateTextArea.placeholder = DEFAULT_BACKBLAST_OPENER;
    templateTextArea.style.display = "none";


    const saveTemplateButton = document.createElement("button");
    saveTemplateButton.textContent = "Save Opener";
    saveTemplateButton.style.display = "none";

    const toggleTemplateButton = document.createElement("button");
    toggleTemplateButton.textContent = hasSavedOpener ? "Edit" : "Customize";

    saveTemplateButton.addEventListener("click", async () => {
        try {
            const openerText =
                templateTextArea.value.trim() ||
                DEFAULT_BACKBLAST_OPENER;

            const updatedTemplates = {
                ...(state.customTemplates || {}),
                backblastIntro: openerText,
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

        toggleTemplateButton.textContent = openerExpanded
        ? "Hide"
        : (hasSavedOpener ? "Edit" : "Customize");

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

    templateSection.append(templateTitle, templateHelper, toggleTemplateButton, applyTemplateButton, templateTextArea, saveTemplateButton);*/

    const textArea = document.createElement("textarea");
    textArea.classList.add("preblast-textarea");
    textArea.value = state.draftBackblastText || "";

    function autoResize(textarea) {
        textarea.style.height = "auto";
    
        const maxHeight = Math.floor(window.innerHeight * 0.65);
    
        textarea.style.height =
            Math.min(textarea.scrollHeight, maxHeight) + "px";
    }

    autoResize(textArea);
   /* autoResize(templateTextArea);*/

    addWeatherToBackblast(session, textArea);

    /*templateTextArea.addEventListener("input", () => {
        autoResize(templateTextArea);
    })*/

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
        const textToCopy = textArea.value || state.draftBackblastText || "";
    
        try {
            await copyTextToClipboard(textToCopy);
    
            state.draftBackblastText = textToCopy;
    
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
            const mediaFiles = state.draftBackblastMediaFiles || [];
            const rawText = state.draftBackblastText || "";
            const text = mediaFiles.length ? stripUrls(rawText) : rawText;
            
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

                        const updatedSession = {
                            ...session,
                            backblastText: state.draftBackblastText || "",
                            backblastStatus: "shared",
                            backblastPostedAt: new Date().toISOString(),
                        };

                        await updateSession(session.id, updatedSession);
                        Object.assign(session, updatedSession);
                        
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
        /*templateSection,*/
        mediaSection,
        actionRow
    );
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}