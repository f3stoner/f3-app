import { state } from "../modules/state.js";
import { createGlobalNav } from "../components/globalNav.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import { normalizeMediaImage } from "../utils/imageProcessing.js";
import {
    clearRegionPublicSiteMediaSlot,
    finalizeRegionPublicSiteMediaAsset,
    loadRegionPublicSiteConfig,
    loadRegionPublicSiteMedia,
    removeRegionPublicSiteMediaAsset,
    reserveRegionPublicSiteMediaAsset,
    saveRegionPublicSiteConfig,
    setRegionPublicSiteMediaSlot,
} from "../services/cloudData.js";
import {
    deleteRegionPublicSiteAsset,
    deleteRegionPublicSiteMedia,
    getRegionPublicSiteAssetUrl,
    uploadRegionPublicSiteAsset,
    uploadRegionPublicSiteMedia,
} from "../services/mediaService.js";

export async function renderPublicSiteSettingsView() {
    const app = document.getElementById("app");
    app.textContent = "";
    app.classList.add("view-public-site-settings");

    cleanupMainMenu();

    if (!hasPermission(PERMISSIONS.ACCESS_ADMIN_SETTINGS)) {
        showToast(
            "You do not have access to Public Site settings.",
            "error"
        );

        navigateTo("adminSettings");
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Public Site";

    const intro = document.createElement("p");
    intro.classList.add("stats-line");
    intro.textContent =
        "Manage the branding and public information used by your region website.";

    const content = document.createElement("section");
    content.classList.add("admin-public-site");

    let publicSiteConfig;
    let publicSiteMedia;
    
    try {
        [
            publicSiteConfig,
            publicSiteMedia,
        ] = await Promise.all([
            loadRegionPublicSiteConfig(
                state.currentRegionId
            ),
            loadRegionPublicSiteMedia(
                state.currentRegionId
            ),
        ]);
    } catch (error) {
        console.warn(
            "Public site configuration unavailable:",
            error
        );

        const unavailable = document.createElement("p");
        unavailable.classList.add("stats-line");
        unavailable.textContent =
            "You do not have permission to manage this public site, or public site configuration is not available for this region.";

        content.append(unavailable);

        const nav = createGlobalNav();

        app.append(
            header,
            title,
            intro,
            content,
            nav
        );

        if (state.isMainMenuOpen) {
            document.body.appendChild(
                createMainMenu()
            );
        }

        return;
    }

    if (!publicSiteConfig) {
        const unavailable = document.createElement("p");
        unavailable.classList.add("stats-line");
        unavailable.textContent =
            "Public site configuration is not available for this region.";

        content.append(unavailable);

        const nav = createGlobalNav();

        app.append(
            header,
            title,
            intro,
            content,
            nav
        );

        if (state.isMainMenuOpen) {
            document.body.appendChild(
                createMainMenu()
            );
        }

        return;
    }

    let logoAssetPath =
        publicSiteConfig.logoAssetPath || null;

    let heroAssetPath =
        publicSiteConfig.heroAssetPath || null;

    function createSettingsSection(titleText, descriptionText = "") {
        const section = document.createElement("section");
        section.classList.add("public-site-settings-section");
    
        const header = document.createElement("div");
        header.classList.add("public-site-settings-section-header");
    
        const title = document.createElement("h2");
        title.textContent = titleText;
    
        header.appendChild(title);
    
        if (descriptionText) {
            const description = document.createElement("p");
            description.classList.add("stats-line");
            description.textContent = descriptionText;
            header.appendChild(description);
        }
    
        section.appendChild(header);
    
        return section;
    }
    
    const brandingSection = createSettingsSection(
        "Branding",
        "Control the visual identity used across your public region website."
    );

    const logoHeading =
        document.createElement("div");

    logoHeading.classList.add("detail-label");
    logoHeading.textContent = "Region Logo";

    const logoPreview =
        document.createElement("img");

    logoPreview.classList.add(
        "public-site-image-preview",
        "public-site-logo-preview"
    );

    logoPreview.alt = "Region logo preview";

    const logoEmpty =
        document.createElement("div");

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

    const logoInput =
        document.createElement("input");

    logoInput.type = "file";
    logoInput.accept =
        "image/jpeg,image/png,image/webp,image/heic,image/heif";

    const removeLogoButton =
        document.createElement("button");

    removeLogoButton.type = "button";
    removeLogoButton.textContent = "Remove Logo";
    removeLogoButton.classList.add(
        "public-site-destructive-button"
    );

    removeLogoButton.addEventListener(
        "click",
        () => {
            logoAssetPath = null;
            logoInput.value = "";
            refreshLogoPreview();
        }
    );

    const heroHeading =
        document.createElement("div");

    heroHeading.classList.add("detail-label");
    heroHeading.textContent = "Hero Image";

    const heroPreview =
        document.createElement("img");

    heroPreview.classList.add(
        "public-site-image-preview",
        "public-site-hero-preview"
    );

    heroPreview.alt = "Region hero image preview";

    const heroEmpty =
        document.createElement("div");

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

    const heroInput =
        document.createElement("input");

    heroInput.type = "file";
    heroInput.accept =
        "image/jpeg,image/png,image/webp,image/heic,image/heif";

    const removeHeroButton =
        document.createElement("button");

    removeHeroButton.type = "button";
    removeHeroButton.textContent =
        "Remove Hero Image";
    removeHeroButton.classList.add(
        "public-site-destructive-button"
    );

    removeHeroButton.addEventListener(
        "click",
        () => {
            heroAssetPath = null;
            heroInput.value = "";
            refreshHeroPreview();
        }
    );

    const copySection = createSettingsSection(
        "Website Copy",
        "Manage the short public-facing description and colors used by your region."
    );

    function createTextInput(
        labelText,
        value = ""
    ) {
        const label =
            document.createElement("div");

        label.classList.add("detail-label");
        label.textContent = labelText;

        const input =
            document.createElement("input");

        input.type = "text";
        input.value = value || "";

        return {
            label,
            input,
        };
    }

    const tagline = createTextInput(
        "Tagline",
        publicSiteConfig.tagline
    );

    const descriptionLabel =
        document.createElement("div");

    descriptionLabel.classList.add(
        "detail-label"
    );

    descriptionLabel.textContent =
        "Description";

    const description =
        document.createElement("textarea");

    description.rows = 5;
    description.value =
        publicSiteConfig.description || "";

    const primaryColor =
        createTextInput(
            "Primary Color",
            publicSiteConfig.primaryColor || ""
        );

    primaryColor.input.placeholder =
        "#000000";

    const secondaryColor =
        createTextInput(
            "Accent Color",
            publicSiteConfig.secondaryColor || ""
        );

    secondaryColor.input.placeholder = "#D9B65B";

    const contactSection = createSettingsSection(
        "Contact & Social",
        "Help new visitors connect with your region and find your public communities."
    );
    
    const contactEmail = createTextInput(
        "Contact Email",
        publicSiteConfig.contactEmail || ""
    );
    
    contactEmail.input.type = "email";
    contactEmail.input.placeholder = "contact@example.com";
    
    const contactUrl = createTextInput(
        "Contact Link",
        publicSiteConfig.contactUrl || ""
    );
    
    contactUrl.input.type = "url";
    contactUrl.input.placeholder = "https://...";
    
    const joinUrl = createTextInput(
        "Join / Community Link",
        publicSiteConfig.joinUrl || ""
    );
    
    joinUrl.input.type = "url";
    joinUrl.input.placeholder = "https://...";
    
    function getSocialUrl(platform) {
        const links = Array.isArray(publicSiteConfig.socialLinks)
            ? publicSiteConfig.socialLinks
            : [];
    
        const match = links.find(
            link => link?.platform === platform
        );
    
        return match?.url || "";
    }
    
    const facebook = createTextInput(
        "Facebook",
        getSocialUrl("facebook")
    );
    
    facebook.input.type = "url";
    facebook.input.placeholder = "https://facebook.com/...";
    
    const instagram = createTextInput(
        "Instagram",
        getSocialUrl("instagram")
    );
    
    instagram.input.type = "url";
    instagram.input.placeholder = "https://instagram.com/...";
    
    const youtube = createTextInput(
        "YouTube",
        getSocialUrl("youtube")
    );
    
    youtube.input.type = "url";
    youtube.input.placeholder = "https://youtube.com/...";
    
    const xTwitter = createTextInput(
        "X / Twitter",
        getSocialUrl("x")
    );
    
    xTwitter.input.type = "url";
    xTwitter.input.placeholder = "https://x.com/...";
    
    function buildSocialLinks() {
        return [
            {
                platform: "facebook",
                url: facebook.input.value.trim(),
            },
            {
                platform: "instagram",
                url: instagram.input.value.trim(),
            },
            {
                platform: "youtube",
                url: youtube.input.value.trim(),
            },
            {
                platform: "x",
                url: xTwitter.input.value.trim(),
            },
        ].filter(link => link.url);
    }

    const photographySection = createSettingsSection(
        "Homepage Photography",
        "Choose the photos that tell your region's story on the public homepage."
    );
    
    function getMediaSlot(slotKey) {
        return publicSiteMedia?.slots?.[slotKey] || null;
    }
    
    function getSlotAssetId(slot) {
        return slot?.assetId || slot?.asset_id || null;
    }
    
    function getRemovedStoragePath(result) {
        return result?.storagePath || result?.storage_path || null;
    }
    
    function createPhotographyControl({
        slotKey,
        titleText,
        helpText,
    }) {
        let slot = getMediaSlot(slotKey);
        let focalX = slot?.focalX ?? 0.5;
        let focalY = slot?.focalY ?? 0.5;
    
        const container = document.createElement("div");
        container.classList.add("public-site-photo-control");
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = titleText;
    
        const help = document.createElement("p");
        help.classList.add("stats-line");
        help.textContent = helpText;
    
        const focalEditor = document.createElement("div");
        focalEditor.classList.add("public-site-focal-editor");
    
        const preview = document.createElement("img");
        preview.classList.add(
            "public-site-image-preview",
            "public-site-photo-preview"
        );
        preview.alt = `${titleText} preview`;
    
        const focalTarget = document.createElement("div");
        focalTarget.classList.add("public-site-focal-target");
        focalTarget.setAttribute("aria-hidden", "true");
    
        focalEditor.append(preview, focalTarget);
    
        const empty = document.createElement("div");
        empty.classList.add("stats-line");
        empty.textContent = "No photo selected.";
    
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept =
            "image/jpeg,image/png,image/webp,image/heic,image/heif";
    
        const altLabel = document.createElement("div");
        altLabel.classList.add("detail-label");
        altLabel.textContent = "Photo Description";
    
        const altInput = document.createElement("input");
        altInput.type = "text";
        altInput.maxLength = 300;
        altInput.placeholder =
            "Describe the photo for visitors using screen readers.";
    
        const actions = document.createElement("div");
        actions.classList.add("public-site-photo-actions");
    
        const savePhotoButton = document.createElement("button");
        savePhotoButton.type = "button";
    
        const removePhotoButton = document.createElement("button");
        removePhotoButton.type = "button";
        removePhotoButton.textContent = "Remove from Site";
    
        const focalControls = document.createElement("div");
        focalControls.classList.add("public-site-focal-controls");
    
        const focalHelp = document.createElement("p");
        focalHelp.classList.add("stats-line");
        focalHelp.textContent =
            "Click the most important part of the photo to control responsive cropping.";
    
        const saveFocalButton = document.createElement("button");
        saveFocalButton.type = "button";
        saveFocalButton.textContent = "Save Focal Point";
    
        focalControls.append(focalHelp, saveFocalButton);
    
        function refreshFocalPreview() {
            focalTarget.style.left = `${focalX * 100}%`;
            focalTarget.style.top = `${focalY * 100}%`;
            preview.style.objectPosition =
                `${focalX * 100}% ${focalY * 100}%`;
        }
    
        function refreshControl() {
            const url = getRegionPublicSiteAssetUrl(
                slot?.storagePath
            );
    
            if (url) {
                preview.src = url;
                preview.hidden = false;
                focalEditor.hidden = false;
                empty.hidden = true;
            } else {
                preview.removeAttribute("src");
                preview.hidden = true;
                focalEditor.hidden = true;
                empty.hidden = false;
            }
    
            focalX = slot?.focalX ?? 0.5;
            focalY = slot?.focalY ?? 0.5;
    
            refreshFocalPreview();
    
            altInput.value = slot?.altText || "";
    
            savePhotoButton.textContent =
                slot ? "Replace Photo" : "Save Photo";
    
            removePhotoButton.hidden = !slot;
            focalControls.hidden = !slot;
        }
    
        async function reloadMedia() {
            publicSiteMedia =
                await loadRegionPublicSiteMedia(
                    state.currentRegionId
                );
    
            slot = getMediaSlot(slotKey);
            refreshControl();
        }
    
        async function cleanupAsset(assetId) {
            if (!assetId) return;
    
            const removed =
                await removeRegionPublicSiteMediaAsset(
                    assetId
                );
    
            const storagePath =
                getRemovedStoragePath(removed);
    
            if (storagePath) {
                await deleteRegionPublicSiteMedia(
                    storagePath
                );
            }
        }
    
        refreshControl();
    
        focalEditor.addEventListener(
            "click",
            event => {
                if (!slot) return;
    
                const rect =
                    focalEditor.getBoundingClientRect();
    
                if (!rect.width || !rect.height) return;
    
                focalX = Math.max(
                    0,
                    Math.min(
                        1,
                        (event.clientX - rect.left) /
                            rect.width
                    )
                );
    
                focalY = Math.max(
                    0,
                    Math.min(
                        1,
                        (event.clientY - rect.top) /
                            rect.height
                    )
                );
    
                refreshFocalPreview();
            }
        );
    
        saveFocalButton.addEventListener(
            "click",
            async () => {
                const assetId =
                    getSlotAssetId(slot);
    
                if (!assetId) return;
    
                const altText =
                    altInput.value.trim();
    
                if (!altText) {
                    showToast(
                        "Add a photo description first.",
                        "error"
                    );
                    return;
                }
    
                savePhotoButton.disabled = true;
                removePhotoButton.disabled = true;
                saveFocalButton.disabled = true;
    
                try {
                    await setRegionPublicSiteMediaSlot(
                        state.currentRegionId,
                        {
                            slotKey,
                            assetId,
                            altText,
                            focalX,
                            focalY,
                        }
                    );
    
                    await reloadMedia();
    
                    showToast(
                        `${titleText} focal point saved.`,
                        "success"
                    );
                } catch (error) {
                    console.error(
                        `Failed to save ${slotKey} focal point:`,
                        error
                    );
    
                    showToast(
                        "Failed to save focal point.",
                        "error"
                    );
                } finally {
                    savePhotoButton.disabled = false;
                    removePhotoButton.disabled = false;
                    saveFocalButton.disabled = false;
                }
            }
        );
    
        savePhotoButton.addEventListener(
            "click",
            async () => {
                const file = fileInput.files?.[0];
                const altText = altInput.value.trim();
    
                if (!file) {
                    showToast(
                        "Choose a photo first.",
                        "error"
                    );
                    return;
                }
    
                if (!altText) {
                    showToast(
                        "Add a photo description first.",
                        "error"
                    );
                    return;
                }
    
                const previousAssetId =
                    getSlotAssetId(slot);
    
                let reservation = null;
                let assigned = false;
    
                savePhotoButton.disabled = true;
                removePhotoButton.disabled = true;
                saveFocalButton.disabled = true;
    
                try {
                    const blob =
                        await normalizeMediaImage(file);
    
                    reservation =
                        await reserveRegionPublicSiteMediaAsset(
                            state.currentRegionId,
                            {
                                mimeType: blob.type,
                                fileSizeBytes: blob.size,
                                width: null,
                                height: null,
                            }
                        );
    
                    await uploadRegionPublicSiteMedia(
                        reservation.storagePath,
                        blob
                    );
    
                    await finalizeRegionPublicSiteMediaAsset(
                        reservation.assetId
                    );
    
                    await setRegionPublicSiteMediaSlot(
                        state.currentRegionId,
                        {
                            slotKey,
                            assetId: reservation.assetId,
                            altText,
                            focalX: 0.5,
                            focalY: 0.5,
                        }
                    );
    
                    assigned = true;
    
                    await reloadMedia();
    
                    fileInput.value = "";
    
                    if (
                        previousAssetId &&
                        previousAssetId !== reservation.assetId
                    ) {
                        try {
                            await cleanupAsset(
                                previousAssetId
                            );
                        } catch (cleanupError) {
                            console.warn(
                                "Photo replaced, but old asset cleanup failed:",
                                cleanupError
                            );
                        }
                    }
    
                    showToast(
                        `${titleText} saved.`,
                        "success"
                    );
                } catch (error) {
                    console.error(
                        `Failed to save ${slotKey}:`,
                        error
                    );
    
                    if (
                        reservation?.assetId &&
                        !assigned
                    ) {
                        try {
                            await cleanupAsset(
                                reservation.assetId
                            );
                        } catch (cleanupError) {
                            console.warn(
                                "Failed new asset cleanup:",
                                cleanupError
                            );
                        }
                    }
    
                    showToast(
                        "Failed to save photo.",
                        "error"
                    );
                } finally {
                    savePhotoButton.disabled = false;
                    removePhotoButton.disabled = false;
                    saveFocalButton.disabled = false;
                }
            }
        );
    
        removePhotoButton.addEventListener(
            "click",
            async () => {
                const assetId =
                    getSlotAssetId(slot);
    
                if (!assetId) return;
    
                savePhotoButton.disabled = true;
                removePhotoButton.disabled = true;
                saveFocalButton.disabled = true;
    
                try {
                    await clearRegionPublicSiteMediaSlot(
                        state.currentRegionId,
                        slotKey
                    );
    
                    await reloadMedia();
    
                    try {
                        await cleanupAsset(assetId);
                    } catch (cleanupError) {
                        console.warn(
                            "Photo removed from site, but asset cleanup failed:",
                            cleanupError
                        );
                    }
    
                    fileInput.value = "";
    
                    showToast(
                        `${titleText} removed.`,
                        "success"
                    );
                } catch (error) {
                    console.error(
                        `Failed to remove ${slotKey}:`,
                        error
                    );
    
                    showToast(
                        "Failed to remove photo.",
                        "error"
                    );
                } finally {
                    savePhotoButton.disabled = false;
                    removePhotoButton.disabled = false;
                    saveFocalButton.disabled = false;
                }
            }
        );
    
        actions.append(
            savePhotoButton,
            removePhotoButton
        );
    
        container.append(
            heading,
            help,
            focalEditor,
            empty,
            fileInput,
            altLabel,
            altInput,
            actions,
            focalControls
        );
    
        return container;
    }
    
    const communityPhoto =
        createPhotographyControl({
            slotKey:
                "home_community_primary",
    
            titleText:
                "Community Photo",
    
            helpText:
                "A strong group photo that shows the men and community behind your region.",
        });
    
    const fellowshipPhoto =
        createPhotographyControl({
            slotKey:
                "home_community_secondary",
    
            titleText:
                "Fellowship Photo",
    
            helpText:
                "A candid photo showing the relationships built outside the workout.",
        });

    const newHereWorkoutPhoto =
        createPhotographyControl({
            slotKey:
                "new_here_workout",
    
            titleText:
                "First Workout Photo",
    
            helpText:
                "A photo that helps a new guy picture what it looks like to show up for his first F3 workout.",
        });
    
    const newHereCoffeeteriaPhoto =
        createPhotographyControl({
            slotKey:
                "new_here_coffeeteria",
    
            titleText:
                "Coffeeteria Photo",
    
            helpText:
                "A candid photo showing the fellowship that often happens after the workout.",
        });

    const aboutFitnessPhoto =
        createPhotographyControl({
            slotKey:
                "about_fitness",
    
            titleText:
                "Fitness Photo",
    
            helpText:
                "A photo showing men working together during an F3 workout.",
        });
    
    const aboutFellowshipPhoto =
        createPhotographyControl({
            slotKey:
                "about_fellowship",
    
            titleText:
                "Fellowship Photo",
    
            helpText:
                "A photo showing the relationships and community built through F3.",
        });
    
    const aboutFaithPhoto =
        createPhotographyControl({
            slotKey:
                "about_faith",
    
            titleText:
                "Faith Photo",
    
            helpText:
                "A photo showing service, reflection, leadership or another expression of living for something beyond yourself.",
        });
    
    const saveButton = document.createElement("button");

    saveButton.type = "button";
    saveButton.textContent =
        "Save Public Site";

    saveButton.classList.add(
        "public-site-primary-button"
    );

    saveButton.addEventListener(
        "click",
        async () => {
            saveButton.disabled = true;

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

                    logoAssetPath =
                        newLogoPath;
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

                    heroAssetPath =
                        newHeroPath;
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
            
                        contactEmail:
                            contactEmail.input.value.trim(),
            
                        contactUrl:
                            contactUrl.input.value.trim(),
            
                        joinUrl:
                            joinUrl.input.value.trim(),
            
                        socialLinks:
                            buildSocialLinks(),
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
                saveButton.disabled = false;
            }
        }
    );

    const brandingFields = document.createElement("div");
    brandingFields.classList.add("public-site-settings-fields");

    brandingFields.append(
        logoHeading,
        logoPreview,
        logoEmpty,
        logoInput,
        removeLogoButton,

        heroHeading,
        heroPreview,
        heroEmpty,
        heroInput,
        removeHeroButton
    );

    brandingSection.appendChild(brandingFields);

    const copyFields = document.createElement("div");
    copyFields.classList.add("public-site-settings-fields");

    copyFields.append(
        tagline.label,
        tagline.input,

        descriptionLabel,
        description,

        primaryColor.label,
        primaryColor.input,

        secondaryColor.label,
        secondaryColor.input,

        saveButton
    );

    copySection.appendChild(copyFields);

    const contactFields = document.createElement("div");
    contactFields.classList.add(
        "public-site-settings-fields"
    );

    contactFields.append(
        contactEmail.label,
        contactEmail.input,

        contactUrl.label,
        contactUrl.input,

        joinUrl.label,
        joinUrl.input,

        facebook.label,
        facebook.input,

        instagram.label,
        instagram.input,

        youtube.label,
        youtube.input,

        xTwitter.label,
        xTwitter.input
    );

    contactSection.appendChild(contactFields);

    const photographyGrid = document.createElement("div");
    photographyGrid.classList.add("public-site-photo-grid");

    photographyGrid.append(
        communityPhoto,
        fellowshipPhoto
    );

    photographySection.appendChild(photographyGrid);

    const newHerePhotographySection =
        createSettingsSection(
            "New Here Photography",
            "Choose the photos that help a first-time visitor understand what showing up actually feels like."
    );

    const newHerePhotographyGrid =
        document.createElement("div");

    newHerePhotographyGrid.classList.add(
        "public-site-photo-grid"
    );

    newHerePhotographyGrid.append(
        newHereWorkoutPhoto,
        newHereCoffeeteriaPhoto
    );

    newHerePhotographySection.appendChild(
        newHerePhotographyGrid
    );

    const aboutPhotographySection =
        createSettingsSection(
            "About Photography",
            "Choose the photos that represent Fitness, Fellowship and Faith in your region."
        );

    const aboutPhotographyGrid =
        document.createElement("div");

    aboutPhotographyGrid.classList.add(
        "public-site-photo-grid"
    );

    aboutPhotographyGrid.append(
        aboutFitnessPhoto,
        aboutFellowshipPhoto,
        aboutFaithPhoto
    );

    aboutPhotographySection.appendChild(
        aboutPhotographyGrid
    );

    content.append(
        brandingSection,
        copySection,
        contactSection,
        photographySection,
        newHerePhotographySection,
        aboutPhotographySection
    );

    const nav = createGlobalNav();

    app.append(
        header,
        title,
        intro,
        content,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(
            createMainMenu()
        );
    }
}