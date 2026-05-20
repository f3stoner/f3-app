import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { getWorkoutFieldLabels } from "../utils/workoutLabels.js";
import { showToast } from "../utils/toast.js";
import { updateRegionWorkoutFieldLabels } from "../services/cloudData.js";
import { createElement } from "lucide";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";

export function renderAdminSettingsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const labels = getWorkoutFieldLabels(state) || {};

    const title = document.createElement("h1");
    title.textContent = "Admin";

    function createAdminCard(titleText, subtitleText, view) {
        const card = document.createElement("button");
        card.classList.add("admin-hub-card");

        const title = document.createElement("div");
        title.classList.add("member-name");
        title.textContent = titleText;

        const subtitle = document.createElement("div");
        subtitle.classList.add("stats-line");
        subtitle.textContent = subtitleText;

        card.append(title, subtitle);

        card.addEventListener("click", () => {
            navigateTo(view);
        });

        return card;
    }

    const adminHubGrid = document.createElement("div");
    adminHubGrid.classList.add("admin-hub-grid");

    const openFlagsCount = (state.adminFlags || [])
        .filter(flag => flag.status === "open").length;

    adminHubGrid.append(
        createAdminCard("Manage AOs", "Create, edit, and activate workout locations.", "aoManagement"),
        createAdminCard("Admin Flags", `${openFlagsCount} open issue${openFlagsCount === 1 ? "" : "s"} to review.`, "adminFlags"),
        createAdminCard("Review Stale PAX", "Find inactive or outdated roster records.", "stalePax")
    );

    const sectionTitle = document.createElement("h2");
    sectionTitle.textContent = "Region Settings";

    const labelsHeading = document.createElement("div");
    labelsHeading.classList.add("detail-label");
    labelsHeading.textContent = "Workout Field Labels";

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
        adminHubGrid,
        sectionTitle,
        labelsHeading,

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

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}