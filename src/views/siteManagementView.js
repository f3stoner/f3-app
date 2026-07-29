import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import {
    insertSite,
    updateSiteInCloud,
} from "../services/cloudData.js";
import {
    hasPermission,
    PERMISSIONS,
} from "../utils/permissions.js";
import {
    cleanupMainMenu,
    createMainMenu,
} from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import {
    createModalShell,
    closeActiveModal,
} from "../utils/modal.js";
import { showToast } from "../utils/toast.js";
import { registerViewCleanup } from "../utils/viewCleanup.js";

registerViewCleanup(
    "siteManagement",
    () => {
        closeActiveModal();
    }
);

function normalizeOptionalText(value) {
    const normalized =
        String(value || "").trim();

    return normalized || null;
}

function parseOptionalCoordinate(
    value,
    label
) {
    const normalized =
        String(value || "").trim();

    if (!normalized) {
        return null;
    }

    const parsed = Number(normalized);

    if (!Number.isFinite(parsed)) {
        throw new Error(
            `${label} must be a valid number.`
        );
    }

    return parsed;
}

function replaceSiteInState(savedSite) {
    const existingIndex =
        state.sites.findIndex(
            site => site.id === savedSite.id
        );

    if (existingIndex === -1) {
        state.sites = [
            ...state.sites,
            savedSite,
        ];
    } else {
        state.sites = state.sites.map(
            site =>
                site.id === savedSite.id
                    ? savedSite
                    : site
        );
    }

    state.sites.sort((a, b) => {
        if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
        }

        return String(a.name || "")
            .localeCompare(
                String(b.name || "")
            );
    });
}

export function renderSiteManagementView() {
    const app =
        document.getElementById("app");

    app.textContent = "";

    cleanupMainMenu();

    if (
        !hasPermission(
            PERMISSIONS.MANAGE_SITES
        )
    ) {
        showToast(
            "You do not have permission to manage Sites.",
            "error"
        );

        state.currentView =
            "adminSettings";

        renderApp();
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
    });

    const title =
        document.createElement("h1");

    title.textContent =
        "Site Management";

    const subtitle =
        document.createElement("div");

    subtitle.classList.add(
        "site-management-subtitle"
    );

    subtitle.textContent =
        "Manage the physical locations used by AOs, Q slots, and workouts.";

    const addButton =
        document.createElement("button");

    addButton.classList.add(
        "site-management-add-button"
    );

    addButton.textContent =
        "Add Site";

    addButton.addEventListener(
        "click",
        () => {
            openSiteModal(null);
        }
    );

    const actionRow =
        document.createElement("div");

    actionRow.classList.add(
        "site-management-actions"
    );

    actionRow.appendChild(addButton);

    const listContainer =
        document.createElement("div");

    listContainer.classList.add(
        "site-management-list"
    );

    const sortedSites = [
        ...(state.sites || []),
    ].sort((a, b) => {
        if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
        }

        return String(a.name || "")
            .localeCompare(
                String(b.name || "")
            );
    });

    if (!sortedSites.length) {
        const empty =
            document.createElement("div");

        empty.classList.add(
            "detail-value"
        );

        empty.textContent =
            "No Sites have been created.";

        listContainer.appendChild(
            empty
        );
    } else {
        sortedSites.forEach(site => {
            const card =
                createSiteCard(site);

            listContainer.appendChild(
                card
            );
        });
    }

    const nav = createGlobalNav();

    app.append(
        header,
        title,
        subtitle,
        actionRow,
        listContainer,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(
            createMainMenu()
        );
    }
}

function createSiteCard(site) {
    const card =
        document.createElement("button");

    card.type = "button";

    card.classList.add(
        "site-management-card"
    );

    if (!site.isActive) {
        card.classList.add(
            "inactive-card"
        );
    }

    const content =
        document.createElement("div");

    content.classList.add(
        "site-management-card-content"
    );

    const name =
        document.createElement("div");

    name.classList.add(
        "site-management-card-name"
    );

    name.textContent =
        site.name || "Unnamed Site";

    const address =
        document.createElement("div");

    address.classList.add(
        "site-management-card-meta"
    );

    address.textContent =
        site.address ||
        "No address configured";

    const usage =
        document.createElement("div");

    usage.classList.add(
        "site-management-card-meta"
    );

    const defaultAoNames =
        (state.aos || [])
            .filter(
                ao =>
                    ao.defaultSiteId ===
                    site.id
            )
            .map(ao => ao.name)
            .sort((a, b) =>
                a.localeCompare(b)
            );

    usage.textContent =
        defaultAoNames.length
            ? `Default for ${defaultAoNames.join(", ")}`
            : "Not currently an AO default";

    const weather =
        document.createElement("div");

    weather.classList.add(
        "site-management-card-meta"
    );

    weather.textContent =
        site.weatherEnabled
            ? "Weather enabled"
            : "Weather disabled";

    content.append(
        name,
        address,
        usage,
        weather
    );

    const statusWrap =
        document.createElement("div");

    statusWrap.classList.add(
        "site-management-card-status"
    );

    const status =
        document.createElement("div");

    status.classList.add(
        "site-management-status"
    );

    status.textContent =
        site.isActive
            ? "Active"
            : "Inactive";

    if (!site.isActive) {
        status.classList.add(
            "inactive-text"
        );
    }

    statusWrap.appendChild(status);

    card.append(
        content,
        statusWrap
    );

    card.addEventListener(
        "click",
        () => {
            openSiteModal(site);
        }
    );

    return card;
}

function openSiteModal(existingSite) {
    const isEditing =
        Boolean(existingSite);

    const {
        modal,
        closeModal,
    } = createModalShell();

    const heading =
        document.createElement("h2");

    heading.textContent =
        isEditing
            ? "Edit Site"
            : "Add Site";

    const nameField =
        createTextField({
            label: "Site Name",
            value:
                existingSite?.name || "",
            placeholder:
                "Example: Hohlt Park Amphitheater",
        });

    const addressField =
        createTextField({
            label: "Address",
            value:
                existingSite?.address || "",
            placeholder:
                "Example: 2425 N Park St, Brenham, TX",
        });

    const mapUrlField =
        createTextField({
            label: "Map URL",
            value:
                existingSite?.mapUrl || "",
            placeholder:
                "Google Maps or Apple Maps link",
        });

    const latitudeField =
        createTextField({
            label: "Latitude",
            value:
                existingSite?.latitude ??
                "",
            placeholder:
                "Example: 30.1812",
            inputMode: "decimal",
        });

    const longitudeField =
        createTextField({
            label: "Longitude",
            value:
                existingSite?.longitude ??
                "",
            placeholder:
                "Example: -96.3977",
            inputMode: "decimal",
        });

    const weatherLabelField =
        createTextField({
            label:
                "Weather Location Label",
            value:
                existingSite
                    ?.weatherLocationLabel ||
                "",
            placeholder:
                "Optional fallback location label",
        });

    const weatherWrap =
        createCheckboxField({
            label: "Weather enabled",
            checked:
                existingSite
                    ?.weatherEnabled ??
                true,
        });

    const activeWrap =
        createCheckboxField({
            label: "Site is active",
            checked:
                existingSite
                    ?.isActive ??
                true,
        });

    const buttonRow =
        document.createElement("div");

    buttonRow.classList.add(
        "button-row"
    );

    const cancelButton =
        document.createElement("button");

    cancelButton.type = "button";
    cancelButton.classList.add(
        "secondary-button"
    );

    cancelButton.textContent =
        "Cancel";

    cancelButton.addEventListener(
        "click",
        closeModal
    );

    const saveButton =
        document.createElement("button");

    saveButton.type = "button";

    saveButton.textContent =
        isEditing
            ? "Save Site"
            : "Create Site";

    saveButton.addEventListener(
        "click",
        async () => {
            const regionId =
                state.currentRegionId;

            if (!regionId) {
                showToast(
                    "No active region.",
                    "error"
                );

                return;
            }

            const name =
                nameField.input.value
                    .trim()
                    .replace(/\s+/g, " ");

            if (!name) {
                showToast(
                    "Site name is required.",
                    "error"
                );

                nameField.input.focus();
                return;
            }

            let latitude;
            let longitude;

            try {
                latitude =
                    parseOptionalCoordinate(
                        latitudeField
                            .input.value,
                        "Latitude"
                    );

                longitude =
                    parseOptionalCoordinate(
                        longitudeField
                            .input.value,
                        "Longitude"
                    );
            } catch (error) {
                showToast(
                    error.message,
                    "error"
                );

                return;
            }

            if (
                latitude !== null &&
                (
                    latitude < -90 ||
                    latitude > 90
                )
            ) {
                showToast(
                    "Latitude must be between -90 and 90.",
                    "error"
                );

                return;
            }

            if (
                longitude !== null &&
                (
                    longitude < -180 ||
                    longitude > 180
                )
            ) {
                showToast(
                    "Longitude must be between -180 and 180.",
                    "error"
                );

                return;
            }

            const site = {
                id:
                    existingSite?.id ||
                    crypto.randomUUID(),
                regionId,
                name,
                address:
                    normalizeOptionalText(
                        addressField
                            .input.value
                    ) || "",
                mapUrl:
                    normalizeOptionalText(
                        mapUrlField
                            .input.value
                    ) || "",
                latitude,
                longitude,
                weatherLocationLabel:
                    normalizeOptionalText(
                        weatherLabelField
                            .input.value
                    ) || "",
                weatherEnabled:
                    weatherWrap.input.checked,
                isActive:
                    activeWrap.input.checked,
                createdAt:
                    existingSite?.createdAt ||
                    new Date()
                        .toISOString(),
                updatedAt:
                    new Date()
                        .toISOString(),
            };

            saveButton.disabled = true;

            saveButton.textContent =
                isEditing
                    ? "Saving…"
                    : "Creating…";

            try {
                const savedSite =
                    isEditing
                        ? await updateSiteInCloud(
                            regionId,
                            site
                        )
                        : await insertSite(
                            regionId,
                            site
                        );

                replaceSiteInState(
                    savedSite
                );

                closeModal();

                showToast(
                    isEditing
                        ? "Site updated."
                        : "Site created.",
                    "success"
                );

                renderApp();
            } catch (error) {
                console.error(
                    "Failed to save Site:",
                    error
                );

                const duplicateName =
                    error?.code === "23505" ||
                    String(
                        error?.message || ""
                    ).includes(
                        "sites_region_normalized_name_key"
                    );

                showToast(
                    duplicateName
                        ? "A Site with that name already exists in this region."
                        : "Failed to save Site.",
                    "error"
                );

                saveButton.disabled = false;

                saveButton.textContent =
                    isEditing
                        ? "Save Site"
                        : "Create Site";
            }
        }
    );

    buttonRow.append(
        cancelButton,
        saveButton
    );

    modal.append(
        heading,
        nameField.label,
        nameField.input,
        addressField.label,
        addressField.input,
        mapUrlField.label,
        mapUrlField.input,
        latitudeField.label,
        latitudeField.input,
        longitudeField.label,
        longitudeField.input,
        weatherLabelField.label,
        weatherLabelField.input,
        weatherWrap.wrapper,
        activeWrap.wrapper,
        buttonRow
    );
}

function createTextField({
    label,
    value = "",
    placeholder = "",
    inputMode = null,
}) {
    const labelElement =
        document.createElement("div");

    labelElement.classList.add(
        "detail-label"
    );

    labelElement.textContent = label;

    const input =
        document.createElement("input");

    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;

    if (inputMode) {
        input.inputMode = inputMode;
    }

    return {
        label: labelElement,
        input,
    };
}

function createCheckboxField({
    label,
    checked,
}) {
    const wrapper =
        document.createElement("label");

    wrapper.classList.add(
        "ao-status-toggle"
    );

    const input =
        document.createElement("input");

    input.type = "checkbox";
    input.checked = Boolean(checked);

    wrapper.append(
        input,
        document.createTextNode(
            ` ${label}`
        )
    );

    return {
        wrapper,
        input,
    };
}