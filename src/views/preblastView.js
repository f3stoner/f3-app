import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { showToast } from "../utils/toast.js";
import { logActionFailure } from "../services/appEvents.js";
import { ensureCustomTemplates } from "../utils/customTemplates.js";
import { navigateTo } from "../utils/navigation.js";
import { getAoWeather } from "../services/weather.js";

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

    const preblastWorkout = getPreblastWorkout();
    const preblastAo = state.aos.find(ao => ao.name === preblastWorkout?.aoName);
    const targetDateTime = getTargetDateTime(preblastWorkout, preblastAo);

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

    const templateButtonRow = document.createElement("div");
    templateButtonRow.classList.add("button-row");

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
        const templateId = event.target.value;

        state.customTemplates.preblast.activeTemplateId = templateId || null;

        const selectedTemplate = state.customTemplates.preblast.savedTemplates.find(
            template => template.id === templateId
        );

        if (!selectedTemplate) return;

        textInput.value = selectedTemplate.content;
        state.draftPreblastText = selectedTemplate.content;
    });

    const manageTemplateButton = document.createElement("button");
    manageTemplateButton.type = "button";
    manageTemplateButton.classList.add("secondary-button");
    manageTemplateButton.textContent = "Manage Templates";

    manageTemplateButton.addEventListener("click", () => {
        state.activeTemplateHubSection = "preblast";
        navigateTo("templateHub");
    });

    templateButtonRow.append(templateSelect, manageTemplateButton);

    function getPreblastWorkout() {
        return state.plannedWorkouts.find(
            workout => workout.id === state.selectedPreblastWorkoutId
        );
    }

    function getTargetDateTime(workout, ao) {
        if (!workout?.date || !ao?.time) return null;
        return `${workout.date}T${ao.time}:00`;
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