import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { getWorkoutFieldLabels } from "../utils/workoutLabels.js";
import { showToast } from "../utils/toast.js";
import {
    loadRegionPublicSiteConfig,
    saveRegionPublicSiteConfig,
    updateRegionWorkoutFieldLabels,
} from "../services/cloudData.js";
import { createElement } from "lucide";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { hasPermission, PERMISSIONS, isSuperAdmin, canManageCurrentRoster } from "../utils/permissions.js";
import { normalizeMediaImage } from "../utils/imageProcessing.js";
import {
    deleteRegionPublicSiteAsset,
    getRegionPublicSiteAssetUrl,
    uploadRegionPublicSiteAsset,
} from "../services/mediaService.js";

export async function renderAdminSettingsView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (!hasPermission(PERMISSIONS.ACCESS_ADMIN_SETTINGS)) {
        showToast("You do not have access to Admin Settings.", "error");
        navigateTo("dashboard");
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const labels = getWorkoutFieldLabels(state) || {};

    let publicSiteConfig = null;
    let canManagePublicSite = true;

    try {
        publicSiteConfig = await loadRegionPublicSiteConfig(
            state.currentRegionId
        );
    } catch (error) {
        console.warn(
            "Public site configuration unavailable:",
            error
        );

        canManagePublicSite = false;
    }

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

    const adminCards = [];

    if (canManageCurrentRoster()) {
        adminCards.push(
            createAdminCard(
                "Roster Management",
                "Search the home roster, manage active status, and maintain canonical member identity.",
                "rosterManagement"
            )
        );
    }

    adminCards.push(
        createAdminCard(
            "Manage AOs",
            "Create, edit, and activate workout locations.",
            "aoManagement"
        ),
    );
        if (
            hasPermission(
                PERMISSIONS.MANAGE_SITES
            )
        ) {
            adminCards.push(
                createAdminCard(
                    "Manage Sites",
                    "Create and maintain the physical locations used by AOs and workouts.",
                    "siteManagement"
                )
            );
        }
        adminCards.push(
            createAdminCard(
                "Admin Flags",
                "Review legacy roster and import flags.",
                "adminFlags"
            ),
            createAdminCard(
                "Review Stale PAX",
                "Find inactive or outdated roster records.",
                "stalePax"
            ),
            createAdminCard(
                "Import Runs",
                "Review nightly Aggieland dry-run results.",
                "importRuns"
            )
        );
    
    if (
        isSuperAdmin() &&
        hasPermission(PERMISSIONS.ACCESS_OPERATIONS_CENTER)
    ) {
        adminCards.unshift(
            createAdminCard(
                "Operations Center",
                "Review system health, platform analytics, and operations.",
                "operationsCenter"
            )
        );
    }
    
    adminHubGrid.append(...adminCards);

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

    const publicSiteSection = document.createElement("section");
    publicSiteSection.classList.add("admin-public-site");

    const publicSiteHeading = document.createElement("h2");
    publicSiteHeading.textContent = "Public Site";

    const publicSiteHelp = document.createElement("p");
    publicSiteHelp.classList.add("stats-line");
    publicSiteHelp.textContent =
        "Branding and public information used by your region website.";

    publicSiteSection.append(
        publicSiteHeading,
        publicSiteHelp
    );

    if (canManagePublicSite && publicSiteConfig) {
        let logoAssetPath =
            publicSiteConfig.logoAssetPath || null;

        let heroAssetPath =
            publicSiteConfig.heroAssetPath || null;

        const logoHeading = document.createElement("div");
        logoHeading.classList.add("detail-label");
        logoHeading.textContent = "Region Logo";

        const logoPreview = document.createElement("img");
        logoPreview.classList.add(
            "public-site-image-preview",
            "public-site-logo-preview"
        );
        logoPreview.alt = "Region logo preview";

        const logoEmpty = document.createElement("div");
        logoEmpty.classList.add("stats-line");
        logoEmpty.textContent = "No logo uploaded.";

        function refreshLogoPreview() {
            const url =
                getRegionPublicSiteAssetUrl(
                    logoAssetPath
                );

            if (url) {
                logoPreview.src = url;
                logoPreview.hidden = false;
                logoEmpty.hidden = true;
            } else {
                logoPreview.removeAttribute("src");
                logoPreview.hidden = true;
                logoEmpty.hidden = false;
            }
        }

        refreshLogoPreview();

        const logoInput = document.createElement("input");
        logoInput.type = "file";
        logoInput.accept =
            "image/jpeg,image/png,image/webp,image/heic,image/heif";

        const removeLogoButton =
            document.createElement("button");

        removeLogoButton.type = "button";
        removeLogoButton.textContent = "Remove Logo";

        removeLogoButton.addEventListener(
            "click",
            () => {
                logoAssetPath = null;
                logoInput.value = "";
                refreshLogoPreview();
            }
        );

        const heroHeading = document.createElement("div");
        heroHeading.classList.add("detail-label");
        heroHeading.textContent = "Hero Image";

        const heroPreview = document.createElement("img");
        heroPreview.classList.add(
            "public-site-image-preview",
            "public-site-hero-preview"
        );
        heroPreview.alt = "Region hero image preview";

        const heroEmpty = document.createElement("div");
        heroEmpty.classList.add("stats-line");
        heroEmpty.textContent = "No hero image uploaded.";

        function refreshHeroPreview() {
            const url =
                getRegionPublicSiteAssetUrl(
                    heroAssetPath
                );

            if (url) {
                heroPreview.src = url;
                heroPreview.hidden = false;
                heroEmpty.hidden = true;
            } else {
                heroPreview.removeAttribute("src");
                heroPreview.hidden = true;
                heroEmpty.hidden = false;
            }
        }

        refreshHeroPreview();

        const heroInput = document.createElement("input");
        heroInput.type = "file";
        heroInput.accept =
            "image/jpeg,image/png,image/webp,image/heic,image/heif";

        const removeHeroButton =
            document.createElement("button");

        removeHeroButton.type = "button";
        removeHeroButton.textContent = "Remove Hero Image";

        removeHeroButton.addEventListener(
            "click",
            () => {
                heroAssetPath = null;
                heroInput.value = "";
                refreshHeroPreview();
            }
        );

        function createPublicSiteTextInput(
            labelText,
            value = ""
        ) {
            const label = document.createElement("div");
            label.classList.add("detail-label");
            label.textContent = labelText;

            const input = document.createElement("input");
            input.type = "text";
            input.value = value || "";

            return {
                label,
                input,
            };
        }

        const tagline = createPublicSiteTextInput(
            "Tagline",
            publicSiteConfig.tagline
        );

        const descriptionLabel =
            document.createElement("div");

        descriptionLabel.classList.add("detail-label");
        descriptionLabel.textContent = "Description";

        const description =
            document.createElement("textarea");

        description.rows = 5;
        description.value =
            publicSiteConfig.description || "";

        const primaryColor =
            createPublicSiteTextInput(
                "Primary Color",
                publicSiteConfig.primaryColor || ""
            );

        primaryColor.input.placeholder = "#000000";

        const secondaryColor =
            createPublicSiteTextInput(
                "Accent Color",
                publicSiteConfig.secondaryColor || ""
            );

        secondaryColor.input.placeholder = "#D9B65B";

        const savePublicSiteButton =
            document.createElement("button");

        savePublicSiteButton.type = "button";
        savePublicSiteButton.textContent =
            "Save Public Site";

        savePublicSiteButton.addEventListener(
            "click",
            async () => {
                savePublicSiteButton.disabled = true;

                let newLogoPath = null;
                let newHeroPath = null;

                try {
                    if (logoInput.files?.[0]) {
                        const blob =
                            await normalizeMediaImage(
                                logoInput.files[0]
                            );

                        const extension =
                            blob.type === "image/jpeg"
                                ? "jpg"
                                : "webp";

                        newLogoPath =
                            await uploadRegionPublicSiteAsset(
                                state.currentRegionId,
                                "logo",
                                blob,
                                extension
                            );

                        logoAssetPath = newLogoPath;
                    }

                    if (heroInput.files?.[0]) {
                        const blob =
                            await normalizeMediaImage(
                                heroInput.files[0]
                            );

                        const extension =
                            blob.type === "image/jpeg"
                                ? "jpg"
                                : "webp";

                        newHeroPath =
                            await uploadRegionPublicSiteAsset(
                                state.currentRegionId,
                                "hero",
                                blob,
                                extension
                            );

                        heroAssetPath = newHeroPath;
                    }

                    const saved =
                        await saveRegionPublicSiteConfig(
                            state.currentRegionId,
                            {
                                tagline:
                                    tagline.input.value.trim(),
                                description:
                                    description.value.trim(),
                                primaryColor:
                                    primaryColor.input.value.trim(),
                                secondaryColor:
                                    secondaryColor.input.value.trim(),
                                logoAssetPath,
                                heroAssetPath,
                            }
                        );

                    const cleanupPaths = [
                        saved.previousLogoAssetPath &&
                        saved.previousLogoAssetPath !==
                            saved.logoAssetPath
                            ? saved.previousLogoAssetPath
                            : null,

                        saved.previousHeroAssetPath &&
                        saved.previousHeroAssetPath !==
                            saved.heroAssetPath
                            ? saved.previousHeroAssetPath
                            : null,
                    ].filter(Boolean);

                    if (cleanupPaths.length > 0) {
                        await Promise.allSettled(
                            cleanupPaths.map(path =>
                                deleteRegionPublicSiteAsset(
                                    path
                                )
                            )
                        );
                    }

                    publicSiteConfig = saved;
                    logoAssetPath =
                        saved.logoAssetPath || null;
                    heroAssetPath =
                        saved.heroAssetPath || null;

                    logoInput.value = "";
                    heroInput.value = "";

                    refreshLogoPreview();
                    refreshHeroPreview();

                    showToast(
                        "Public site settings saved.",
                        "success"
                    );
                } catch (error) {
                    console.error(
                        "Failed to save public site settings:",
                        error
                    );

                    const failedUploads = [
                        newLogoPath,
                        newHeroPath,
                    ].filter(Boolean);

                    if (failedUploads.length > 0) {
                        await Promise.allSettled(
                            failedUploads.map(path =>
                                deleteRegionPublicSiteAsset(
                                    path
                                )
                            )
                        );
                    }

                    showToast(
                        "Failed to save public site settings.",
                        "error"
                    );
                } finally {
                    savePublicSiteButton.disabled = false;
                }
            }
        );

        publicSiteSection.append(
            logoHeading,
            logoPreview,
            logoEmpty,
            logoInput,
            removeLogoButton,

            heroHeading,
            heroPreview,
            heroEmpty,
            heroInput,
            removeHeroButton,

            tagline.label,
            tagline.input,

            descriptionLabel,
            description,

            primaryColor.label,
            primaryColor.input,

            secondaryColor.label,
            secondaryColor.input,

            savePublicSiteButton
        );
    } else {
        const unavailable =
            document.createElement("p");

        unavailable.classList.add("stats-line");

        unavailable.textContent =
            publicSiteConfig
                ? "You do not have permission to manage this public site."
                : "Public site configuration is not available for this region.";

        publicSiteSection.append(unavailable);
    }

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
        
        publicSiteSection,
        
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}