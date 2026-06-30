import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createAppHeader } from "../components/appHeader.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import { loadRegionProfiles, updateProfileRole, loadProfileAoPermissions, setProfileAoPermissions, loadProfileRegionPositions, setProfileRegionPositions } from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";

const ROLE_OPTIONS = ["superadmin", "dataq", "slt", "aoq", "pax"];

const ROLE_LABELS = {
    superadmin: "Super Admin",
    dataq: "Data Q",
    slt: "SLT",
    aoq: "AO SLT",
    pax: "PAX",
};

const ROLE_DESCRIPTIONS = {
    superadmin: "Full access, including role management.",
    dataq: "Data, imports, telemetry, member management, and library workbench.",
    slt: "Regional operations, AO/Q management, announcements, Q Source, and library workbench.",
    aoq: "AO-level insights and Q slot management.",
    pax: "Standard user access.",
};

const AO_LEADERSHIP_POSITIONS = [
    { value: "aoq", label: "AOQ" },
    { value: "ao_coq", label: "AO Co-Q" },
    { value: "first_f", label: "1F Q" },
    { value: "second_f", label: "2F Q" },
    { value: "third_f", label: "3F Q" },
];

const REGION_LEADERSHIP_POSITIONS = [
    { value: "nantan", label: "Nantan" },
    { value: "weasel_shaker", label: "Weasel Shaker" },
    { value: "first_f", label: "1FQ" },
    { value: "second_f", label: "2FQ" },
    { value: "third_f", label: "3FQ" },
    { value: "rucking_q", label: "Rucking Q" },
    { value: "csaup_q", label: "CSAUP Q" },
    { value: "internal_commz_q", label: "Internal Commz Q" },
    { value: "external_commz_q", label: "External Commz Q" },
];

function getAoName(aoId) {
    return state.aos.find(ao => ao.id === aoId)?.name || "Unknown AO";
}

function getAoPositionLabel(position) {
    return AO_LEADERSHIP_POSITIONS.find(item => item.value === position)?.label || "AOQ";
}

function getProfileRegionPositions(profileId) {
    return state.profileRegionPositions.filter(position =>
        position.profileId === profileId
    );
}

function getRegionPositionLabel(position) {
    return REGION_LEADERSHIP_POSITIONS.find(item => item.value === position)?.label || position;
}

function createRegionLeadershipSummary(profileId) {
    const positions = getProfileRegionPositions(profileId);

    if (positions.length === 0) return null;

    const summary = document.createElement("div");
    summary.classList.add("stats-line");
    summary.textContent = positions
        .map(position => getRegionPositionLabel(position.position))
        .join(" · ");

    return summary;
}

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
    let aoPermissions = [];

    try {
        const results = await Promise.all([
            loadRegionProfiles(state.currentRegionId),
            loadProfileAoPermissions(state.currentRegionId),
            loadProfileRegionPositions(state.currentRegionId),
        ]);

        profiles = results[0];
        aoPermissions = results[1];
        const regionPositions = results[2];

        state.adminProfiles = profiles;
        state.profileAoPermissions = aoPermissions;
        state.profileRegionPositions = regionPositions;

    } catch (error) {
        console.error("Failed to load admin management data:", error);
        loading.textContent = "Failed to load admin management data.";
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

    function getProfileAoPermissions(profileId) {
        return state.profileAoPermissions.filter(permission =>
            permission.profileId === profileId
        );
    }
    
    function createAoLeadershipSummary(profileId) {
        const permissions = getProfileAoPermissions(profileId);
    
        if (permissions.length === 0) return null;
    
        const summary = document.createElement("div");
        summary.classList.add("stats-line");
        summary.textContent = permissions
            .map(permission =>
                `${getAoName(permission.aoId)} ${getAoPositionLabel(permission.position)}`
            )
            .join(" · ");
    
        return summary;
    }

    function createAoLeadershipEditor(profile) {
        const editor = document.createElement("div");
        editor.classList.add("section", "ao-leadership-editor");
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = `AO Leadership · ${getProfileName(profile)}`;
    
        let draftAssignments = getProfileAoPermissions(profile.id).map(permission => ({
            aoId: permission.aoId,
            position: permission.position || "aoq",
        }));
    
        if (draftAssignments.length === 0) {
            draftAssignments = [{ aoId: "", position: "aoq" }];
        }
    
        const assignmentList = document.createElement("div");
    
        function renderAssignmentList() {
            assignmentList.textContent = "";
    
            draftAssignments.forEach((assignment, index) => {
                const row = document.createElement("div");
                row.classList.add("admin-profile-row", "ao-leadership-row");
    
                const aoSelect = document.createElement("select");
    
                const emptyAo = document.createElement("option");
                emptyAo.value = "";
                emptyAo.textContent = "Select AO";
                aoSelect.appendChild(emptyAo);
    
                [...state.aos]
                    .filter(ao => ao.isActive !== false)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach(ao => {
                        const option = document.createElement("option");
                        option.value = ao.id;
                        option.textContent = ao.name;
                        option.selected = ao.id === assignment.aoId;
                    
                        const isDuplicateSelection = draftAssignments.some(
                            (otherAssignment, otherIndex) =>
                                otherIndex !== index &&
                                otherAssignment.aoId === ao.id &&
                                otherAssignment.position === assignment.position
                        );
                    
                        option.disabled = isDuplicateSelection;
                    
                        aoSelect.appendChild(option);
                    });
    
                aoSelect.addEventListener("change", event => {
                    draftAssignments[index].aoId = event.target.value;
                });
    
                const positionSelect = document.createElement("select");
    
                AO_LEADERSHIP_POSITIONS.forEach(position => {
                    const option = document.createElement("option");
                    option.value = position.value;
                    option.textContent = position.label;
                    option.selected = position.value === assignment.position;
                    positionSelect.appendChild(option);
                });
    
                positionSelect.addEventListener("change", event => {
                    draftAssignments[index].position = event.target.value;
                });
    
                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.classList.add("secondary-button");
                removeButton.textContent = "Remove";
    
                removeButton.addEventListener("click", () => {
                    draftAssignments = draftAssignments.filter((_, assignmentIndex) =>
                        assignmentIndex !== index
                    );
    
                    if (draftAssignments.length === 0) {
                        draftAssignments = [{ aoId: "", position: "aoq" }];
                    }
    
                    renderAssignmentList();
                });
    
                row.append(aoSelect, positionSelect, removeButton);
                assignmentList.appendChild(row);
            });
        }
    
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.classList.add("secondary-button");
        addButton.textContent = "+ Add AO Assignment";
    
        addButton.addEventListener("click", () => {
            draftAssignments.push({ aoId: "", position: "aoq" });
            renderAssignmentList();
        });
    
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.classList.add("primary-button");
        saveButton.textContent = "Save AO Leadership";
    
        saveButton.addEventListener("click", async () => {
            const cleanAssignments = draftAssignments
                .filter(assignment => assignment.aoId)
                .map(assignment => ({
                    aoId: assignment.aoId,
                    position: assignment.position || "aoq",
                }));

            const assignmentKeys = cleanAssignments.map(assignment =>
                `${assignment.aoId}__${assignment.position}`
            );
            
            if (new Set(assignmentKeys).size !== assignmentKeys.length) {
                showToast("Duplicate AO leadership assignments are not allowed.", "error");
                return;
            }
    
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
    
            try {
                const updatedPermissions = await setProfileAoPermissions(
                    profile.id,
                    state.currentRegionId,
                    cleanAssignments
                );
    
                state.profileAoPermissions = [
                    ...state.profileAoPermissions.filter(permission =>
                        permission.profileId !== profile.id
                    ),
                    ...updatedPermissions,
                ];
    
                aoPermissions = state.profileAoPermissions;
    
                showToast("AO leadership updated.", "success");
                state.editingAoLeadershipProfileId = null;
                renderGroups();
            } catch (error) {
                console.error("Failed to save AO leadership:", error);
                showToast("Failed to save AO leadership.", "error");
                saveButton.disabled = false;
                saveButton.textContent = "Save AO Leadership";
            }
        });
    
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.classList.add("secondary-button");
        cancelButton.textContent = "Cancel";
    
        cancelButton.addEventListener("click", () => {
            state.editingAoLeadershipProfileId = null;
            renderGroups();
        });
    
        const actions = document.createElement("div");
        actions.classList.add("button-row");
        actions.append(addButton, saveButton, cancelButton);
    
        renderAssignmentList();
    
        editor.append(heading, assignmentList, actions);
        return editor;
    }

    function createRegionLeadershipEditor(profile) {
        const editor = document.createElement("div");
        editor.classList.add("section", "ao-leadership-editor");
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = `Regional Leadership · ${getProfileName(profile)}`;
    
        let draftPositions = getProfileRegionPositions(profile.id)
            .map(position => position.position);
    
        if (draftPositions.length === 0) {
            draftPositions = ["first_f"];
        }
    
        const positionList = document.createElement("div");
    
        function renderPositionList() {
            positionList.textContent = "";
    
            draftPositions.forEach((position, index) => {
                const row = document.createElement("div");
                row.classList.add("admin-profile-row", "ao-leadership-row");
    
                const positionSelect = document.createElement("select");
    
                REGION_LEADERSHIP_POSITIONS.forEach(option => {
                    const optionElement = document.createElement("option");
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    optionElement.selected = option.value === position;
    
                    const duplicate = draftPositions.some(
                        (otherPosition, otherIndex) =>
                            otherIndex !== index &&
                            otherPosition === option.value
                    );
    
                    optionElement.disabled = duplicate;
    
                    positionSelect.appendChild(optionElement);
                });
    
                positionSelect.addEventListener("change", event => {
                    draftPositions[index] = event.target.value;
                });
    
                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.classList.add("secondary-button");
                removeButton.textContent = "Remove";
    
                removeButton.addEventListener("click", () => {
                    draftPositions = draftPositions.filter((_, i) => i !== index);
    
                    if (draftPositions.length === 0) {
                        draftPositions = ["first_f"];
                    }
    
                    renderPositionList();
                });
    
                row.append(positionSelect, removeButton);
                positionList.appendChild(row);
            });
        }
    
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.classList.add("secondary-button");
        addButton.textContent = "+ Add Position";
    
        addButton.addEventListener("click", () => {
            draftPositions.push("first_f");
            renderPositionList();
        });
    
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.classList.add("primary-button");
        saveButton.textContent = "Save Regional Leadership";
    
        saveButton.addEventListener("click", async () => {
            if (new Set(draftPositions).size !== draftPositions.length) {
                showToast("Duplicate regional leadership assignments are not allowed.", "error");
                return;
            }
    
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
    
            try {
                const updatedPositions = await setProfileRegionPositions(
                    profile.id,
                    state.currentRegionId,
                    draftPositions
                );
    
                state.profileRegionPositions = [
                    ...state.profileRegionPositions.filter(position =>
                        position.profileId !== profile.id
                    ),
                    ...updatedPositions,
                ];
    
                showToast("Regional leadership updated.", "success");
    
                state.editingRegionLeadershipProfileId = null;
                renderGroups();
            } catch (error) {
                console.error("Failed to save regional leadership:", error);
                showToast("Failed to save regional leadership.", "error");
    
                saveButton.disabled = false;
                saveButton.textContent = "Save Regional Leadership";
            }
        });
    
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.classList.add("secondary-button");
        cancelButton.textContent = "Cancel";
    
        cancelButton.addEventListener("click", () => {
            state.editingRegionLeadershipProfileId = null;
            renderGroups();
        });
    
        const actions = document.createElement("div");
        actions.classList.add("button-row");
        actions.append(addButton, saveButton, cancelButton);
    
        renderPositionList();
    
        editor.append(
            heading,
            positionList,
            actions,
        );
    
        return editor;
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

                const aoSummary = createAoLeadershipSummary(profile.id);

                if (aoSummary) {
                    info.appendChild(aoSummary);
                }

                const regionSummary = createRegionLeadershipSummary(profile.id);

                if (regionSummary) {
                    info.appendChild(regionSummary);
                }

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
                    const previousRole = profile.role || "pax";
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

                if ((profile.role || "pax") !== "pax") {
                    const manageAoButton = document.createElement("button");
                    manageAoButton.type = "button";
                    manageAoButton.classList.add("secondary-button");
                    manageAoButton.textContent = "Manage AO Leadership";
                
                    manageAoButton.addEventListener("click", () => {
                        state.editingAoLeadershipProfileId =
                            state.editingAoLeadershipProfileId === profile.id
                                ? null
                                : profile.id;
                
                        renderGroups();
                    });
                
                    actions.appendChild(manageAoButton);
                }

                if ((profile.role || "pax") !== "pax") {
                    const manageRegionButton = document.createElement("button");
                    manageRegionButton.type = "button";
                    manageRegionButton.classList.add("secondary-button");
                    manageRegionButton.textContent = "Manage Regional Leadership";
                
                    manageRegionButton.addEventListener("click", () => {
                        state.editingRegionLeadershipProfileId =
                            state.editingRegionLeadershipProfileId === profile.id
                                ? null
                                : profile.id;
                
                        renderGroups();
                    });
                
                    actions.appendChild(manageRegionButton);
                }

                row.append(info, actions);
                section.appendChild(row);

                if (state.editingAoLeadershipProfileId === profile.id) {
                    section.appendChild(createAoLeadershipEditor(profile));
                }

                if (state.editingRegionLeadershipProfileId === profile.id) {
                    section.appendChild(createRegionLeadershipEditor(profile));
                }
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