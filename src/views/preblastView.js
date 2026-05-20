import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { showToast } from "../utils/toast.js";
import { logActionFailure } from "../services/appEvents.js";
import { createCustomTemplate, ensureCustomTemplates } from "../utils/customTemplates.js";
import { navigateTo } from "../utils/navigation.js";
import { getAoWeather } from "../services/weather.js";
import { updateCustomTemplates, updatePlannedWorkoutInCloud, updateQSlotInCloud } from "../services/cloudData.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderPreblastView() {

    console.log("selectedPreblastWorkoutId:", state.selectedPreblastWorkoutId);
    console.log("selectedPlannedWorkoutId:", state.selectedPlannedWorkoutId);
    console.log("editingPlannedWorkoutId:", state.editingPlannedWorkoutId);

    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

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

    const title = document.createElement("h1");
    title.textContent = "Preblast";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Write and refine your preblast.";

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

    function getPreblastAo(qSlot, workout) {
        if (qSlot?.aoId) {
            return state.aos.find(ao => ao.id === qSlot.aoId);
        }

        return state.aos.find(ao => ao.name === workout?.aoName);
    }

    function getTargetDateTime(qSlot, workout, ao) {
        const date = qSlot?.date || workout?.date;

        if (!date || !ao?.time) return null;

        return`${date}T${ao.time}:00`;
    }

    const preblastAo = getPreblastAo(preblastQSlot, preblastWorkout);
    const targetDateTime = getTargetDateTime(preblastQSlot, preblastWorkout, preblastAo);

    if (preblastAo?.id && targetDateTime && !state.hasAddedPreblastForecast) {
        state.hasAddedPreblastForecast = true;

        upsertForecastLine();

        getAoWeather(preblastAo.id, targetDateTime)
            .then(weather => {
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
    templateDetails.classList.add("section");

    const templateSummary = document.createElement("summary");
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
        state.selectedPlannedWorkoutId ||
        state.editingPlannedWorkoutId;

        return state.plannedWorkouts.find(
            workout => workout.id === workoutId
        );
    }

    function buildForecastLine(weather) {
        if (!weather || weather.weatherUnavailable) {
            return "Forecast: weather unavailable.";
        };

        const rainLabel = 
            typeof weather.precipChance === "number"
                ? `${weather.precipChance}% rain`
                : "rain chance unavailable";

        const windLabel =
            typeof weather.windMph === "number"
                ? `${weather.windMph} mph wind`
                : "wind unavailable";

        return `Forecast: ${weather.temp}° and ${weather.condition}, ${rainLabel}, ${windLabel}.`;
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

    const mediaDetails = document.createElement("details");
    mediaDetails.classList.add("section");
    mediaDetails.open = mediaFiles.length > 0;

    const mediaSummary = document.createElement("summary");
    mediaSummary.textContent = "Attachments";

    mediaDetails.append(mediaSummary, mediaSection);

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

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Draft";

    saveButton.addEventListener("click", async () => {
        if (!preblastQSlot) {
            showToast("No Q slot found for this preblast.", "error");
            return;
        }
        try {
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

            showToast("Preblast saved.");
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
    copyButton.textContent = "Copy Preblast";

    copyButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(textInput.value || "");
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
            const text = textInput.value || "";
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

    /*const doneButton = document.createElement("button");
    doneButton.textContent = "Done";

    doneButton.addEventListener("click", exitPreblastView);*/

    const actionRow = document.createElement("div");
    actionRow.classList.add("button-row");
    actionRow.append(saveButton, shareButton, copyButton);

    app.append(
        header,
        title,
        subtitle,
        textInput,
        actionRow,
        templateDetails,
        mediaDetails,
    );
    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}