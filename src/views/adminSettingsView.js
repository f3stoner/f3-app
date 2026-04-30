import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { goBack } from "../utils/navigation.js";
import { getWorkoutFieldLabels } from "../utils/workoutLabels.js";
import { showToast } from "../utils/toast.js";
import { updateRegionWorkoutFieldLabels } from "../services/cloudData.js";

export function renderAdminSettingsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const labels = getWorkoutFieldLabels(state) || {};

    const title = document.createElement("h1");
    title.textContent = "Admin Settings";

    const backButton = document.createElement("button");
    backButton.classList.add("secondary-button");
    backButton.textContent = "← Back";
    backButton.addEventListener("click", () => {
        goBack("dashboard");
    });

    const header = document.createElement("div");
    header.classList.add("view-header");
    header.append(backButton, title);

    const sectionTitle = document.createElement("h2");
    sectionTitle.textContent = "Workout Field Labels";

    function createLabelInput(key, fallbackLabel) {
        const label = document.createElement("div");
        label.classList.add("detail-label");
        label.textContent = fallbackLabel;

        const input = document.createElement("input");
        input.type = "text";
        input.value = labels[key] || "";

        return { label, input };
    }

    const intro = createLabelInput("introduction", "Introduction Label");
    const warmorama = createLabelInput("warmorama", "Warm-O-Rama Label");
    const thangs = createLabelInput("thangs", "Thangs Label");
    const finisher = createLabelInput("finisher", "Mary / Finisher Label");
    const notes = createLabelInput("notes", "Notes Label");

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Labels";

    saveButton.addEventListener("click", async () => {
        const labels = {
            introduction: intro.input.value.trim() || "Introduction",
            warmorama: warmorama.input.value.trim() || "Warm-O-Rama",
            thangs: thangs.input.value.trim() || "Thangs",
            finisher: finisher.input.value.trim() || "Mary / Finisher",
            notes: notes.input.value.trim() || "Notes",
        };

        try {
            const savedRegion = await updateRegionWorkoutFieldLabels(
                state.currentRegionId,
                labels
            );

            state.workoutFieldLabels = savedRegion.workoutFieldLabels || labels;

            state.availableRegions = state.availableRegions.map(region =>
                region.id === state.currentRegionId
                    ? {
                        ...region,
                        workoutFieldLabels: state.workoutFieldLabels,
                    }
                    : region
            );

            showToast("Workout labels saved.", "success");
            renderApp();
        } catch (error) {
            console.error("Failed to save workoutlabels:", error);
            showToast("Failed to save workout labels.", "error");
        }
    });

    const nav = createGlobalNav();

    app.append(
        header,
        sectionTitle,

        intro.label,
        intro.input,

        warmorama.label,
        warmorama.input,

        thangs.label,
        thangs.input,

        finisher.label,
        finisher.input,

        notes.label,
        notes.input,

        saveButton,
        nav
    );
}