import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { showToast } from "../utils/toast.js";
import { logActionFailure } from "../services/appEvents.js";
import { createCustomTemplate, ensureCustomTemplates } from "../utils/customTemplates.js";
import { navigateTo } from "../utils/navigation.js";
import { getSiteWeather } from "../services/weather.js";
import { updateCustomTemplates, updatePlannedWorkoutInCloud, updateQSlotInCloud } from "../services/cloudData.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { getWorkoutEmphasisForSlot, getWorkoutEmphasisTagsForSlot } from "../utils/workoutEmphasis.js";
import { loadThirdFDiscussions } from "../services/thirdFData.js";
import { resolveSiteForQSlot } from "../utils/siteResolution.js";

export function renderPreblastView() {

    function removeUrlProtocol(text = "") {
        return text.replace(/https?:\/\//gi, "");
    }

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

    console.log("selectedPreblastWorkoutId:", state.selectedPreblastWorkoutId);
    console.log("selectedPlannedWorkoutId:", state.selectedPlannedWorkoutId);

    const app = document.getElementById("app");
    app.textContent = "";

    app.className = "view-preblast";

    cleanupMainMenu();

    function returnToDashboardAfterShare() {
        state.draftPreblastMediaFiles = [];
        state.draftPreblastText = "";
        state.activePreblastWorkoutId = null;
        state.hasAddedPreblastForecast = false;
        state.selectedPreblastQSlotId = null;
        state.selectedPreblastWorkoutId = null;
        state.selectedPlannedWorkoutId = null;
        state.currentView = "dashboard";
        showToast("Preblast shared.", "success");
        renderApp();
    }

    function exitPreblastView() {
        const returnToWorkout = Boolean(state.selectedPlannedWorkoutId);

        state.draftPreblastMediaFiles = [];
        state.draftPreblastText = "";
        state.activePreblastWorkoutId = null;
        state.hasAddedPreblastForecast = false;
        state.selectedPreblastQSlotId = null;
        state.selectedPreblastWorkoutId = null;

        if (returnToWorkout) {
            state.currentView = "plannedWorkoutDetail";
        } else {
            state.currentView = "dashboard";
            state.selectedPlannedWorkoutId = null;
        }

        renderApp();
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        showMenu: true,
        onBack: exitPreblastView,
    });

    const intro = document.createElement("div");
    intro.classList.add("preblast-intro");
    
    const title = document.createElement("h1");
    title.textContent = "Preblast";
    
    const subtitle = document.createElement("div");
    subtitle.classList.add("preblast-subtitle");
    subtitle.textContent = "Write, review, and share your preblast.";
    
    intro.append(title, subtitle);

    function getPreblastQSlot() {
        return state.qSlots.find(
            slot => slot.id === state.selectedPreblastQSlotId
        );
    }

    const preblastQSlot = getPreblastQSlot();
    const preblastWorkout = getPreblastWorkout();

    const textInput = document.createElement("textarea");
    textInput.classList.add("preblast-textarea");
    textInput.value = state.draftPreblastText || "";

    textInput.addEventListener("input", (event) => {
        state.draftPreblastText = event.target.value;
    });

    const editorSection = document.createElement("section");
    editorSection.classList.add("preblast-editor-section");

    const editorLabel = document.createElement("div");
    editorLabel.classList.add("preblast-section-label");
    editorLabel.textContent = "Preblast Message";

    const editorShell = document.createElement("div");
    editorShell.classList.add("preblast-editor-shell");

    editorShell.appendChild(textInput);
    editorSection.append(
        editorLabel,
        editorShell
    );

    function getPreblastAo(qSlot, workout) {
        if (qSlot?.aoId) {
            return state.aos.find(ao => ao.id === qSlot.aoId);
        }

        return state.aos.find(ao => ao.name === workout?.aoName);
    }

    function getTargetDateTime(qSlot, workout, ao) {
        const date = qSlot?.date || workout?.date;
    
        const dayKey = date
            ? String(new Date(`${date}T12:00:00`).getDay())
            : "";
    
        const displayTime =
            workout?.startTime ||
            qSlot?.overrideTime ||
            qSlot?.startTime ||
            ao?.timeSchedule?.[dayKey] ||
            ao?.time ||
            "";
    
        if (!date || !displayTime) return null;
    
        return `${date}T${displayTime}:00`;
    }
    
    const preblastAo = getPreblastAo(preblastQSlot, preblastWorkout);
    const preblastSite = resolveSiteForQSlot(preblastQSlot, preblastAo);
    const targetDateTime = getTargetDateTime(preblastQSlot, preblastWorkout, preblastAo);
    
    upsertEmphasisHashtag();

    if (preblastSite?.id && targetDateTime && !state.hasAddedPreblastForecast) {
        state.hasAddedPreblastForecast = true;

        upsertForecastLine();

        getSiteWeather(preblastSite.id, targetDateTime)
            .then(weather => {
                console.log("preblast weather result", {
                    siteId: preblastSite.id,
                    targetDateTime,
                    weather,
                });
            
                const forecastLine = buildForecastLine(weather);
                upsertForecastLine(forecastLine);
            })
            .catch(error => {
                console.error("Failed to load preblast forecast:", error);
                upsertForecastLine("Forecast: weather unavailable.");
            });
    }

    state.customTemplates = ensureCustomTemplates(state.customTemplates);

    const templateSelect = document.createElement("select");
    templateSelect.value = state.customTemplates.preblast.activeTemplateId || "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select Preblast Template";
    templateSelect.appendChild(defaultOption);

    state.customTemplates.preblast.savedTemplates.forEach(template => {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.name || "Untitled Template";
        templateSelect.appendChild(option);
    });

    templateSelect.addEventListener("change", (event) => {
        state.customTemplates.preblast.activeTemplateId = event.target.value || null;
    });

    const applyTemplateButton = document.createElement("button");
    applyTemplateButton.type = "button";
    applyTemplateButton.textContent = "Apply Template";

    applyTemplateButton.addEventListener("click", () => {
        const templateId = templateSelect.value;

        const selectedTemplate = state.customTemplates.preblast.savedTemplates.find(
            template => template.id === templateId
        );

        if (!selectedTemplate) {
            showToast("Choose a template first.", "error");
            return;
        }

        if (textInput.value.trim()) {
            const shouldApply = window.confirm(
                "Apply this template? It will replace the current draft on screen."
            );

            if (!shouldApply) return;
        }

        textInput.value = selectedTemplate.content || "";
        state.draftPreblastText = textInput.value;
    });

    const saveAsTemplateButton = document.createElement("button");
    saveAsTemplateButton.type = "button";
    saveAsTemplateButton.textContent = "Save Current as Template";

    saveAsTemplateButton.addEventListener("click", async () => {
        const content = textInput.value.trim();

        if (!content) {
            showToast("Nothing to save as a template.", "error");
            return;
        }

        const templateName = window.prompt("Template name?");

        if (!templateName?.trim()) return;

        state.customTemplates = ensureCustomTemplates(state.customTemplates);

        const template = createCustomTemplate({
            name: templateName.trim(),
            content,
        });

        state.customTemplates.preblast.savedTemplates.push(template);
        state.customTemplates.preblast.activeTemplateId = template.id;

        await persistCustomTemplates("Template saved.");
    });

    const manageTemplateButton = document.createElement("button");
    manageTemplateButton.type = "button";
    manageTemplateButton.textContent = "Manage Templates";

    manageTemplateButton.addEventListener("click", () => {
        state.activeTemplateHubSection = "preblast";
        navigateTo("templateHub");
    });

    const templateDetails = document.createElement("details");
    templateDetails.classList.add(
        "preblast-template-panel"
    );

    const templateSummary = document.createElement("summary");
    templateSummary.classList.add(
        "preblast-template-summary"
    );
    templateSummary.textContent = "Preblast Templates";

    const templateContent = document.createElement("div");
    templateContent.classList.add("template-tools-content");

    templateContent.append(
        templateSelect,
        applyTemplateButton,
        saveAsTemplateButton,
        manageTemplateButton
    );

    templateDetails.append(templateSummary, templateContent);

    function getPreblastWorkout() {
        const workoutId =
            state.selectedPreblastWorkoutId ||
            state.selectedPlannedWorkoutId;

        return state.plannedWorkouts.find(
            workout => workout.id === workoutId
        );
    }

    function buildForecastLine(weather) {
        if (!weather || weather.weatherUnavailable) {
            return "Forecast: weather unavailable.";
        }
    
        const tempLabel =
            typeof weather.temp === "number"
                ? `${weather.temp}°`
                : "temp unavailable";

        const feelsLikeLabel =
            typeof weather.feelsLike === "number"
                ? `feels like ${weather.feelsLike}°`
                : null;
    
        const humidityLabel =
            typeof weather.humidity === "number"
                ? `${weather.humidity}% humidity`
                : "humidity unavailable";
    
        const rainLabel =
            typeof weather.precipChance === "number"
                ? `${weather.precipChance}% rain`
                : "rain chance unavailable";
    
        const windLabel =
            typeof weather.windMph === "number"
                ? `${weather.windMph} mph wind`
                : "wind unavailable";
    
                return `Forecast: ${
                    [
                        tempLabel,
                        feelsLikeLabel,
                        humidityLabel,
                        rainLabel,
                        windLabel,
                    ]
                        .filter(Boolean)
                        .join(", ")
                }.`;
    }
    
    function buildEmphasisHashtag() {
        if (!preblastQSlot) return "";
    
        const emphasisTags = getWorkoutEmphasisTagsForSlot(
            preblastQSlot,
            preblastAo
        );
    
        if (!emphasisTags.length && !preblastQSlot?.customEmphasisLabel) {
            return "";
        }
    
        if (preblastQSlot?.customEmphasisLabel) {
            return `#${preblastQSlot.customEmphasisLabel.toLowerCase()}`;
        }
    
        return emphasisTags
            .map(tag => `#${tag.label.toLowerCase()}`)
            .join(" ");
    }

    function buildQSourceText() {
        return (state.qSources || [])
            .map(qSource => `${qSource.title}\n${qSource.body}`)
            .join("\n\n");
    }

    function upsertQSourceText() {
        const qSourceText = buildQSourceText().trim();
    
        if (!qSourceText) return;
    
        const qSourceBlock = `Q Source:\n${qSourceText}`;
    
        const currentText = state.draftPreblastText || "";
    
        if (currentText.includes(qSourceBlock)) return;
    
        const nextText = currentText.trim()
            ? `${currentText.trim()}\n\n${qSourceBlock}`
            : qSourceBlock;
    
        state.draftPreblastText = nextText;
        textInput.value = nextText;
    }

    function upsertEmphasisHashtag() {
        const hashtag = buildEmphasisHashtag();
    
        if (!hashtag) return;
    
        const currentText = state.draftPreblastText || "";
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
            state.draftPreblastText = withoutOldEmphasis;
            textInput.value = withoutOldEmphasis;
            return;
        }
    
        const lines = withoutOldEmphasis.split("\n");
        const firstNonEmptyIndex = lines.findIndex(line => line.trim());

        if (firstNonEmptyIndex === -1) {
            state.draftPreblastText = hashtag;
            textInput.value = hashtag;
            return;
        }

        lines[firstNonEmptyIndex] = `${lines[firstNonEmptyIndex].trimEnd()} ${hashtag}`;

        const nextText = lines.join("\n");    
        
        state.draftPreblastText = nextText;
        textInput.value = nextText;
    }

    function upsertForecastLine(forecastLine = "Forecast: checking conditions...") {
        const currentText = state.draftPreblastText || "";

        let nextText;

        if (/^Forecast:.*$/im.test(currentText)) {
            nextText = currentText.replace(/^Forecast:.*$/im, forecastLine);
        } else {
            nextText = currentText.replace(
                /What to bring: Water/i,
                `${forecastLine}\n\nWhat to bring: Water`
            );
        }

        state.draftPreblastText = nextText;
        console.log({
            currentTextarea: textInput,
            isConnected: textInput.isConnected,
        });
        textInput.value = nextText;
    }

    async function persistCustomTemplates(successMessage) {
        try {
            await updateCustomTemplates(state.currentUserId, state.customTemplates);
            showToast(successMessage, "success");
            renderApp();
        } catch (error) {
            console.error("Failed to persist custom templates:", error);
            showToast("Failed to save to your account.", "error");
            renderApp();
        }
    }

    const mediaSection = document.createElement("div");
    mediaSection.classList.add("preblast-media-section");

    const mediaFiles = state.draftPreblastMediaFiles || [];

    const mediaPanel = document.createElement("section");
    mediaPanel.classList.add("preblast-media-panel");
    
    const mediaHeader = document.createElement("div");
    mediaHeader.classList.add("preblast-section-header");
    
    const mediaLabel = document.createElement("div");
    mediaLabel.classList.add("preblast-section-label");
    mediaLabel.textContent = "Attachments";
    
    const mediaCount = document.createElement("div");
    mediaCount.classList.add("preblast-section-count");
    mediaCount.textContent = mediaFiles.length;
    
    mediaHeader.append(
        mediaLabel,
        mediaCount
    );
    
    mediaPanel.append(
        mediaHeader,
        mediaSection
    );

    const mediaHelperText = document.createElement("div");
    mediaHelperText.classList.add("preblast-media-helper");
    mediaHelperText.textContent = "Add photos or short videos to share with your preblast. BAND may process larger files slowly.";

    const mediaInput = document.createElement("input");
    mediaInput.classList.add("media-input");
    mediaInput.type = "file";
    mediaInput.accept = "image/*,video/*";
    mediaInput.multiple = true;
    mediaInput.setAttribute(
        "aria-label",
        "Add photos or video"
    );

    mediaInput.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        state.draftPreblastMediaFiles = files;
        renderApp();
    });

    const mediaPreviewWrapper = document.createElement("div");
    mediaPreviewWrapper.classList.add("preblast-media-preview-wrapper");

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

    async function persistPreblastDraft({ showSuccessToast = false } = {}) {
        if (!preblastQSlot) {
            return null;
        }
    
        const savedAt = new Date().toISOString();
    
        const updatedQSlot = {
            ...preblastQSlot,
            preblastText: textInput.value,
            preblastLastModifiedAt: savedAt,
        };
    
        const savedQSlot = await updateQSlotInCloud(
            state.currentRegionId,
            updatedQSlot
        );
    
        state.qSlots = state.qSlots.map(slot =>
            slot.id === savedQSlot.id ? savedQSlot : slot
        );
    
        state.draftPreblastText = savedQSlot.preblastText || "";
    
        if (showSuccessToast) {
            showToast("Preblast saved.");
        }
    
        return savedQSlot;
    }

    const saveButton = document.createElement("button");
    saveButton.classList.add(
        "preblast-secondary-action"
    );
    saveButton.textContent = "Save Draft";

    saveButton.addEventListener("click", async () => {
        if (!preblastQSlot) {
            showToast("No Q slot found for this preblast.", "error");
            return;
        }
    
        try {
            await persistPreblastDraft({ showSuccessToast: true });
        } catch (error) {
            console.error("Failed to save preblast:", error);
            showToast("Failed to save preblast.", "error");
    
            logActionFailure("savePreblast", error, {
                qSlotId: preblastQSlot.id,
                plannedWorkoutId: state.selectedPreblastWorkoutId || null,
            });
        }
    });

    const copyButton = document.createElement("button");
    copyButton.classList.add(
        "preblast-secondary-action"
    );
    copyButton.textContent = "Copy Preblast";

    copyButton.addEventListener("click", async () => {
        const textToCopy = textInput.value || "";
    
        try {
            await copyTextToClipboard(textToCopy);
    
            copyButton.textContent = "Copied";
            showToast("Preblast copied.", "success");
    
            setTimeout(() => {
                copyButton.textContent = "Copy Preblast";
            }, 1500);
        } catch (error) {
            console.error("Copy failed:", error);
            showToast("Failed to copy preblast.", "error");
    
            logActionFailure("copyPreblast", error, {
                qSlotId: preblastQSlot?.id || null,
                plannedWorkoutId: state.selectedPreblastWorkoutId || null,
            });
    
            return;
        }
    
        try {
            await persistPreblastDraft();
        } catch (error) {
            console.error("Copied, but failed to save preblast:", error);
            showToast("Copied, but draft was not saved.", "error");
        }
    });
    const shareButton = document.createElement("button");
    shareButton.classList.add(
        "preblast-share-button",
        "primary-button"
    );
    shareButton.textContent = "Share Preblast";

    if (typeof navigator.share !== "function") {
        shareButton.disabled = true;
        shareButton.textContent = "Share Not Available";
    } else {
        shareButton.addEventListener("click", async () => {
            try {
                await persistPreblastDraft();

                const mediaFiles = state.draftPreblastMediaFiles || [];
                const rawText = textInput.value || "";
                const text = mediaFiles.length ? removeUrlProtocol(rawText) : rawText;
                
                if (mediaFiles.length && rawText !== text) {
                    showToast("Links simplified so BAND keeps media attached.", "success");
                }

                const sharePayload = {
                    text,
                    ...(mediaFiles.length ? { files: mediaFiles } : {}),
                };

                if (mediaFiles.length) {
                    if (navigator.canShare?.({ files: mediaFiles })) {
                        await navigator.share(sharePayload);
                    } else {
                        showToast("This device cannot share those media files. Try copy + manual upload.", "error");
                        return;
                    }
                } else {
                    await navigator.share({ text });
                }

                returnToDashboardAfterShare();

            } catch (error) {
                if (error.name === "AbortError") return;

                console.error("Share failed:", error);
                showToast("Share failed.", "error");

                logActionFailure("sharePreblast", error, {
                    qSlotId: preblastQSlot?.id || null,
                    plannedWorkoutId: state.selectedPreblastWorkoutId || state.selectedPlannedWorkoutId || null,
                    mediaFileCount: state.draftPreblastMediaFiles?.length || 0,
                    usedFilesShare: Boolean(
                        state.draftPreblastMediaFiles?.length &&
                        navigator.canShare?.({ files: state.draftPreblastMediaFiles })
                    ),
                });
            }
        });
    }

    /*const doneButton = document.createElement("button");
    doneButton.textContent = "Done";

    doneButton.addEventListener("click", exitPreblastView);*/

    const actionSection = document.createElement("div");
    actionSection.classList.add("preblast-actions");
    
    const secondaryActionRow = document.createElement("div");
    secondaryActionRow.classList.add(
        "preblast-secondary-actions"
    );
    
    secondaryActionRow.append(
        copyButton,
        saveButton
    );
    
    actionSection.append(
        shareButton,
        secondaryActionRow
    );

    app.append(
        header,
        intro,
        editorSection,
        actionSection,
        mediaPanel,
        templateDetails,
    );
    
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}