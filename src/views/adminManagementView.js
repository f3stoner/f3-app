import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createAppHeader } from "../components/appHeader.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import { loadRegionProfiles, updateProfileRole } from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";

const ROLE_OPTIONS = ["superadmin", "dataq", "slt", "aoq", "pax"];

const ROLE_LABELS = {
    superadmin: "Super Admin",
    dataq: "Data Q",
    slt: "SLT",
    aoq: "AOQ",
    pax: "PAX",
};

const ROLE_DESCRIPTIONS = {
    superadmin: "Full access, including role management.",
    dataq: "Data, imports, telemetry, member management, and library workbench.",
    slt: "Regional operations, AO/Q management, announcements, Q Source, and library workbench.",
    aoq: "AO-level insights and Q slot management.",
    pax: "Standard user access.",
};

const collapsedRoles = new Set(["pax"]);

export async function renderAdminManagementView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    if (!hasPermission(PERMISSIONS.MANAGE_ROLES)) {
        app.textContent = "You do not have permission to manage admin roles.";
        return;
    }

    const header = createAppHeader({
        title: "",
        showBack: true,
        showMenu: true,
        onBack: () => {
            state.currentView = "adminSettings";
            renderApp();
        },
    });

    const title = document.createElement("h1");
    title.textContent = "Admin Management";

    const subtitle = document.createElement("p");
    subtitle.classList.add("stats-line");
    subtitle.textContent = "View and manage role assignments by admin level.";

    const loading = document.createElement("div");
    loading.classList.add("stats-line");
    loading.textContent = "Loading profiles...";

    app.append(header, title, subtitle, loading);

    let profiles = [];

    try {
        profiles = await loadRegionProfiles(state.currentRegionId);
    } catch (error) {
        console.error("Failed to load profiles:", error);
        loading.textContent = "Failed to load profiles.";
        return;
    }

    loading.remove();

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search users...";
    searchInput.classList.add("template-search-input");

    const groupsWrap = document.createElement("div");
    groupsWrap.classList.add("admin-role-groups");

    let searchTerm = "";

    function getProfileName(profile) {
        return profile.display_name || profile.email || "Unnamed User";
    }

    function renderGroups() {
        groupsWrap.textContent = "";

        const visibleProfiles = profiles.filter(profile => {
            const haystack = [
                profile.display_name,
                profile.email,
                profile.role,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(searchTerm.trim().toLowerCase());
        });

        ROLE_OPTIONS.forEach(role => {
            const roleProfiles = visibleProfiles.filter(profile =>
                (profile.role || "pax") === role
            );

            const section = document.createElement("div");
            section.classList.add("section", "admin-role-section");

            const heading = document.createElement("div");
            heading.classList.add("planner-section-header-row");

            const label = document.createElement("div");
            label.classList.add("detail-label");
            label.textContent = `${ROLE_LABELS[role]} (${roleProfiles.length})`;

            const isCollapsed = collapsedRoles.has(role);

            const toggleButton = document.createElement("button");
            toggleButton.type = "button";
            toggleButton.classList.add("secondary-button");
            toggleButton.textContent = isCollapsed ? "Show" : "Hide";

            toggleButton.addEventListener("click", () => {
                if (collapsedRoles.has(role)) {
                    collapsedRoles.delete(role);
                } else {
                    collapsedRoles.add(role);
                }

                renderGroups();
            });

            heading.append(label, toggleButton);
            section.appendChild(heading);

            if (isCollapsed) {
                const collapsedNote = document.createElement("div");
                collapsedNote.classList.add("stats-line");
                collapsedNote.textContent = `${roleProfiles.length} users hidden.`;
                section.appendChild(collapsedNote);
                groupsWrap.appendChild(section);
                return;
            }

            if (!roleProfiles.length) {
                const empty = document.createElement("div");
                empty.classList.add("stats-line");
                empty.textContent = "No users assigned.";
                section.appendChild(empty);
            }

            roleProfiles.forEach(profile => {
                const row = document.createElement("div");
                row.classList.add("admin-profile-row");

                const info = document.createElement("div");

                const name = document.createElement("div");
                name.classList.add("member-name");
                name.textContent = getProfileName(profile);

                info.append(name);

                const select = document.createElement("select");
                ROLE_OPTIONS.forEach(optionRole => {
                    const option = document.createElement("option");
                    option.value = optionRole;
                    option.textContent = ROLE_LABELS[optionRole];
                    option.selected = optionRole === (profile.role || "pax");
                    select.appendChild(option);
                });

                const saveButton = document.createElement("button");
                saveButton.type = "button";
                saveButton.classList.add("secondary-button");
                saveButton.textContent = "Save";
                saveButton.disabled = true;

                select.addEventListener("change", () => {
                    saveButton.disabled = select.value === profile.role;
                });

                saveButton.addEventListener("click", async () => {
                    const nextRole = select.value;

                    saveButton.disabled = true;
                    saveButton.textContent = "Saving...";

                    try {
                        const updatedProfile = await updateProfileRole(profile.id, nextRole);

                        profiles = profiles.map(item =>
                            item.id === profile.id
                                ? updatedProfile
                                : item
                        );

                        showToast("Role updated.", "success");
                        renderGroups();
                    } catch (error) {
                        console.error("Failed to update role:", error);
                        showToast("Failed to update role.", "error");
                        saveButton.disabled = false;
                        saveButton.textContent = "Save";
                    }
                });

                const actions = document.createElement("div");
                actions.classList.add("button-row", "admin-profile-actions");
                actions.append(select, saveButton);

                row.append(info, actions);
                section.appendChild(row);
            });

            groupsWrap.appendChild(section);
        });
    }

    searchInput.addEventListener("input", event => {
        searchTerm = event.target.value;
        renderGroups();
    });

    function createRolePermissionsCard() {
        const card = document.createElement("div");
        card.classList.add("section", "role-permissions-card");
    
        const heading = document.createElement("div");
        heading.classList.add("planner-section-header-row");
    
        const label = document.createElement("div");
        label.classList.add("detail-label");
        label.textContent = "Role Permissions";
    
        const showPermissions = Boolean(state.showAdminRolePermissions);
    
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.classList.add("secondary-button");
        toggle.textContent = showPermissions ? "Hide" : "Show";
    
        toggle.addEventListener("click", () => {
            state.showAdminRolePermissions = !state.showAdminRolePermissions;
            renderApp();
        });
    
        heading.append(label, toggle);
        card.appendChild(heading);
    
        if (!showPermissions) {
            const summary = document.createElement("div");
            summary.classList.add("stats-line");
            summary.textContent = "Show what each role can access before assigning permissions.";
            card.appendChild(summary);
            return card;
        }
    
        ROLE_OPTIONS.forEach(role => {
            const row = document.createElement("div");
            row.classList.add("role-permission-row");
    
            const title = document.createElement("div");
            title.classList.add("member-name");
            title.textContent = ROLE_LABELS[role];
    
            const description = document.createElement("div");
            description.classList.add("stats-line");
            description.textContent = ROLE_DESCRIPTIONS[role];
    
            row.append(title, description);
            card.appendChild(row);
        });
    
        return card;
    }

    renderGroups();

    app.append(searchInput, createRolePermissionsCard(), groupsWrap);

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}