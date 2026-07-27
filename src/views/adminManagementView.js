import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createAppHeader } from "../components/appHeader.js";
import { hasPermission, PERMISSIONS } from "../utils/permissions.js";
import {
    loadRegionProfiles,
    loadProfileAoPermissions,
    setProfileAoPermissions,
    loadProfileRegionPositions,
    setProfileRegionPositions,
} from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";

const AO_LEADERSHIP_POSITIONS = [
    { value: "aoq", label: "AOQ" },
    { value: "ao_coq", label: "AO Co-Q" },
    { value: "first_f", label: "1F Q" },
    { value: "second_f", label: "2F Q" },
    { value: "third_f", label: "3F Q" },
    { value: "ao_data_q", label: "AO Data Q" },
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
    subtitle.textContent = "Review leadership structure and manage administrative access.";

    const loading = document.createElement("div");
    loading.classList.add("stats-line");
    loading.textContent = "Loading profiles...";

    app.append(header, title, subtitle, loading);

    let profiles = [];

    async function reloadAdminManagementData() {
        const [
            refreshedProfiles,
            refreshedAoPermissions,
            refreshedRegionPositions,
        ] = await Promise.all([
            loadRegionProfiles(
                state.currentRegionId
            ),
            loadProfileAoPermissions(
                state.currentRegionId
            ),
            loadProfileRegionPositions(
                state.currentRegionId
            ),
        ]);
    
        profiles = refreshedProfiles;
    
        state.adminProfiles =
            refreshedProfiles;
    
        state.profileAoPermissions =
            refreshedAoPermissions;
    
        state.profileRegionPositions =
            refreshedRegionPositions;
    }

    try {
        const results = await Promise.all([
            loadRegionProfiles(state.currentRegionId),
            loadProfileAoPermissions(state.currentRegionId),
            loadProfileRegionPositions(state.currentRegionId),
        ]);

        profiles = results[0];

        const refreshedAoPermissions =
            results[1];

        const regionPositions =
            results[2];

        state.adminProfiles =
            profiles;

        state.profileAoPermissions =
            refreshedAoPermissions;

        state.profileRegionPositions =
            regionPositions;

    } catch (error) {
        console.error("Failed to load admin management data:", error);
        loading.textContent = "Failed to load admin management data.";
        return;
    }

    loading.remove();

    const leadershipOverviewWrap = document.createElement("div");

    let openRegionalAssignmentPosition = null;

    let openAoAssignment = null;

    const expandedAoLeadershipGroups = new Set();

    function getProfileName(profile) {
        return profile.display_name || "Unnamed PAX";
    }

    function getProfileAoPermissions(profileId) {
        return state.profileAoPermissions.filter(permission =>
            permission.profileId === profileId
        );
    }

    function getProfileRegionPositions(profileId) {
        return state.profileRegionPositions.filter(position =>
            position.profileId === profileId
        );
    }

    function createProfileSearchSelector({
        excludeProfile,
        onSelectionChange,
    }) {
        const searchWrap =
            document.createElement("div");
    
        searchWrap.classList.add(
            "session-search-wrap"
        );
    
        const searchInput =
            document.createElement("input");
    
        searchInput.type = "text";
        searchInput.placeholder = "Search PAX...";
        searchInput.autocomplete = "off";
    
        searchInput.classList.add(
            "session-search"
        );
    
        searchInput.setAttribute(
            "role",
            "combobox"
        );
    
        searchInput.setAttribute(
            "aria-autocomplete",
            "list"
        );
    
        searchInput.setAttribute(
            "aria-expanded",
            "false"
        );
    
        const searchResults =
            document.createElement("div");
    
        searchResults.classList.add(
            "session-search-results"
        );
    
        searchResults.setAttribute(
            "role",
            "listbox"
        );
    
        searchWrap.append(
            searchInput,
            searchResults
        );
    
        let selectedProfileId = null;
        let activeResultIndex = -1;
    
        function getMatches() {
            const searchTerm =
                searchInput.value
                    .trim()
                    .toLowerCase();
    
            if (!searchTerm) {
                return [];
            }
    
            return [...profiles]
                .filter(profile => {
                    if (
                        excludeProfile?.(profile)
                    ) {
                        return false;
                    }
    
                    return getProfileName(profile)
                        .toLowerCase()
                        .includes(searchTerm);
                })
                .sort((a, b) =>
                    getProfileName(a).localeCompare(
                        getProfileName(b)
                    )
                )
                .slice(0, 8);
        }
    
        function closeResults() {
            activeResultIndex = -1;
    
            searchResults.textContent = "";
    
            searchInput.setAttribute(
                "aria-expanded",
                "false"
            );
    
            searchInput.removeAttribute(
                "aria-activedescendant"
            );
        }
    
        function selectProfile(profile) {
            selectedProfileId =
                profile.id;
    
            searchInput.value =
                getProfileName(profile);
    
            onSelectionChange?.(
                profile.id
            );
    
            closeResults();
        }
    
        function renderResults() {
            searchResults.textContent = "";
    
            const searchTerm =
                searchInput.value.trim();
    
            if (!searchTerm) {
                closeResults();
                return;
            }
    
            const matches =
                getMatches();
    
            searchInput.setAttribute(
                "aria-expanded",
                "true"
            );
    
            if (matches.length === 0) {
                activeResultIndex = -1;
    
                const empty =
                    document.createElement("div");
    
                empty.classList.add(
                    "session-search-empty"
                );
    
                empty.textContent =
                    "No matching PAX";
    
                searchResults.appendChild(
                    empty
                );
    
                return;
            }
    
            if (
                activeResultIndex < 0 ||
                activeResultIndex >=
                    matches.length
            ) {
                activeResultIndex = 0;
            }
    
            matches.forEach(
                (profile, index) => {
                    const item =
                        document.createElement(
                            "button"
                        );
    
                    item.type = "button";
    
                    item.classList.add(
                        "session-search-result"
                    );
    
                    item.setAttribute(
                        "role",
                        "option"
                    );
    
                    item.setAttribute(
                        "aria-selected",
                        index ===
                            activeResultIndex
                            ? "true"
                            : "false"
                    );
    
                    if (
                        index ===
                        activeResultIndex
                    ) {
                        item.classList.add(
                            "active"
                        );
                    }
    
                    const content =
                        document.createElement(
                            "span"
                        );
    
                    content.classList.add(
                        "session-search-result-content"
                    );
    
                    const name =
                        document.createElement(
                            "span"
                        );
    
                    name.classList.add(
                        "session-search-result-name"
                    );
    
                    name.textContent =
                        getProfileName(profile);
    
                    content.appendChild(name);
    
                    const addIndicator =
                        document.createElement(
                            "span"
                        );
    
                    addIndicator.classList.add(
                        "session-search-result-add"
                    );
    
                    addIndicator.textContent = "+";
    
                    addIndicator.setAttribute(
                        "aria-hidden",
                        "true"
                    );
    
                    item.append(
                        content,
                        addIndicator
                    );
    
                    item.addEventListener(
                        "pointerdown",
                        event => {
                            event.preventDefault();
                        }
                    );
    
                    item.addEventListener(
                        "click",
                        () => {
                            selectProfile(
                                profile
                            );
                        }
                    );
    
                    searchResults.appendChild(
                        item
                    );
                }
            );
        }
    
        searchInput.addEventListener(
            "input",
            () => {
                selectedProfileId = null;
    
                onSelectionChange?.(null);
    
                activeResultIndex = 0;
    
                renderResults();
            }
        );
    
        searchInput.addEventListener(
            "focus",
            () => {
                if (!selectedProfileId) {
                    renderResults();
                }
            }
        );
    
        searchInput.addEventListener(
            "keydown",
            event => {
                const matches =
                    getMatches();
    
                if (event.key === "Escape") {
                    event.preventDefault();
    
                    closeResults();
                    searchInput.blur();
    
                    return;
                }
    
                if (matches.length === 0) {
                    return;
                }
    
                if (
                    event.key ===
                    "ArrowDown"
                ) {
                    event.preventDefault();
    
                    activeResultIndex =
                        (
                            activeResultIndex +
                            1
                        ) %
                        matches.length;
    
                    renderResults();
                    return;
                }
    
                if (
                    event.key ===
                    "ArrowUp"
                ) {
                    event.preventDefault();
    
                    activeResultIndex =
                        (
                            activeResultIndex -
                            1 +
                            matches.length
                        ) %
                        matches.length;
    
                    renderResults();
                    return;
                }
    
                if (event.key === "Enter") {
                    event.preventDefault();
    
                    const selectedProfile =
                        matches[
                            activeResultIndex
                        ] || matches[0];
    
                    selectProfile(
                        selectedProfile
                    );
                }
            }
        );
    
        searchWrap.addEventListener(
            "focusout",
            () => {
                requestAnimationFrame(
                    () => {
                        if (
                            !searchWrap.contains(
                                document.activeElement
                            )
                        ) {
                            closeResults();
                        }
                    }
                );
            }
        );
    
        requestAnimationFrame(() => {
            searchInput.focus();
        });
    
        return {
            element: searchWrap,
        };
    }
    
    function openLeadershipEditor(
        profileId,
        editorType
    ) {
        if (editorType === "region") {
            const isAlreadyOpen =
                state.editingRegionLeadershipProfileId ===
                profileId;
    
            state.editingRegionLeadershipProfileId =
                isAlreadyOpen
                    ? null
                    : profileId;
    
            state.editingAoLeadershipProfileId =
                null;
        } else {
            const isAlreadyOpen =
                state.editingAoLeadershipProfileId ===
                profileId;
    
            state.editingAoLeadershipProfileId =
                isAlreadyOpen
                    ? null
                    : profileId;
    
            state.editingRegionLeadershipProfileId =
                null;
        }
    
        openRegionalAssignmentPosition = null;
        openAoAssignment = null;

        renderLeadershipOverviews();
    
        requestAnimationFrame(() => {
            const editor =
                leadershipOverviewWrap.querySelector(
                    `[data-leadership-editor-profile-id="${profileId}"]`
                );
    
            editor?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        });
    }

    function createRegionalPositionAssigner(
        positionDefinition
    ) {
        const editor =
            document.createElement("div");
    
        editor.classList.add(
            "admin-inline-assignment-editor"
        );
    
        let selectedProfileId = null;

        const profileSelector =
            createProfileSearchSelector({
                excludeProfile: profile =>
                    getProfileRegionPositions(
                        profile.id
                    ).some(
                        assignment =>
                            assignment.position ===
                            positionDefinition.value
                    ),

                onSelectionChange: profileId => {
                    selectedProfileId =
                        profileId;
                },
            });
    
        const assignButton =
            document.createElement("button");
    
        assignButton.type = "button";
        assignButton.classList.add(
            "primary-button"
        );
    
        assignButton.textContent =
            `Assign ${positionDefinition.label}`;
    
        assignButton.addEventListener(
            "click",
            async () => {
                const profileId =
                    selectedProfileId;
    
                if (!profileId) {
                    showToast(
                        "Select a PAX first.",
                        "error"
                    );
    
                    return;
                }
    
                const existingPositions =
                    getProfileRegionPositions(
                        profileId
                    ).map(
                        assignment =>
                            assignment.position
                    );
    
                if (
                    existingPositions.includes(
                        positionDefinition.value
                    )
                ) {
                    showToast(
                        "That user already has this regional position.",
                        "error"
                    );
    
                    return;
                }
    
                assignButton.disabled = true;
                assignButton.textContent =
                    "Assigning...";
    
                try {
                    await setProfileRegionPositions(
                        profileId,
                        state.currentRegionId,
                        [
                            ...existingPositions,
                            positionDefinition.value,
                        ]
                    );
    
                    await reloadAdminManagementData();
    
                    openRegionalAssignmentPosition =
                        null;
    
                    renderLeadershipOverviews();
    
                    showToast(
                        `${positionDefinition.label} assigned.`,
                        "success"
                    );
                } catch (error) {
                    console.error(
                        "Failed to assign regional position:",
                        error
                    );
    
                    showToast(
                        "Failed to assign regional position.",
                        "error"
                    );
    
                    assignButton.disabled = false;
                    assignButton.textContent =
                        `Assign ${positionDefinition.label}`;
                }
            }
        );
    
        const cancelButton =
            document.createElement("button");
    
        cancelButton.type = "button";
        cancelButton.classList.add(
            "secondary-button"
        );
    
        cancelButton.textContent = "Cancel";
    
        cancelButton.addEventListener(
            "click",
            () => {
                openRegionalAssignmentPosition =
                    null;
    
                renderLeadershipOverviews();
            }
        );
    
        const actions =
            document.createElement("div");
    
        actions.classList.add("button-row");
    
        actions.append(
            assignButton,
            cancelButton
        );
    
        editor.append(
            profileSelector.element,
            actions
        );
    
        return editor;
    }

    function createAoPositionAssigner(
        ao,
        positionDefinition
    ) {
        const editor =
            document.createElement("div");
    
        editor.classList.add(
            "admin-inline-assignment-editor"
        );
    
        let selectedProfileId = null;

        const profileSelector =
            createProfileSearchSelector({
                excludeProfile: profile =>
                    getProfileAoPermissions(
                        profile.id
                    ).some(
                        assignment =>
                            assignment.aoId ===
                                ao.id &&
                            assignment.position ===
                                positionDefinition.value
                    ),

                onSelectionChange: profileId => {
                    selectedProfileId =
                        profileId;
                },
            });
    
        const assignButton =
            document.createElement("button");
    
        assignButton.type = "button";
        assignButton.classList.add(
            "primary-button"
        );
    
        assignButton.textContent =
            `Assign ${positionDefinition.label}`;
    
        assignButton.addEventListener(
            "click",
            async () => {
                const profileId =
                    selectedProfileId;
    
                if (!profileId) {
                    showToast(
                        "Select a PAX first.",
                        "error"
                    );
    
                    return;
                }
    
                const existingAssignments =
                    getProfileAoPermissions(
                        profileId
                    ).map(permission => ({
                        aoId: permission.aoId,
                        position:
                            permission.position ||
                            "aoq",
                    }));
    
                const duplicate =
                    existingAssignments.some(
                        assignment =>
                            assignment.aoId ===
                                ao.id &&
                            assignment.position ===
                                positionDefinition.value
                    );
    
                if (duplicate) {
                    showToast(
                        "That user already has this AO position.",
                        "error"
                    );
    
                    return;
                }
    
                assignButton.disabled = true;
                assignButton.textContent =
                    "Assigning...";
    
                try {
                    await setProfileAoPermissions(
                        profileId,
                        state.currentRegionId,
                        [
                            ...existingAssignments,
                            {
                                aoId: ao.id,
                                position:
                                    positionDefinition.value,
                            },
                        ]
                    );
    
                    await reloadAdminManagementData();
    
                    openAoAssignment = null;
    
                    renderLeadershipOverviews();
    
                    showToast(
                        `${positionDefinition.label} assigned at ${ao.name}.`,
                        "success"
                    );
                } catch (error) {
                    console.error(
                        "Failed to assign AO position:",
                        error
                    );
    
                    showToast(
                        "Failed to assign AO position.",
                        "error"
                    );
    
                    assignButton.disabled = false;
                    assignButton.textContent =
                        `Assign ${positionDefinition.label}`;
                }
            }
        );
    
        const cancelButton =
            document.createElement("button");
    
        cancelButton.type = "button";
        cancelButton.classList.add(
            "secondary-button"
        );
    
        cancelButton.textContent = "Cancel";
    
        cancelButton.addEventListener(
            "click",
            () => {
                openAoAssignment = null;
    
                renderLeadershipOverviews();
            }
        );
    
        const actions =
            document.createElement("div");
    
        actions.classList.add("button-row");
    
        actions.append(
            assignButton,
            cancelButton
        );
    
        editor.append(
            profileSelector.element,
            actions
        );
    
        return editor;
    }

    function createRegionalLeadershipOverview() {
        const section = document.createElement("section");
    
        section.classList.add(
            "section",
            "admin-structure-overview",
            "admin-region-overview"
        );
    
        const heading = document.createElement("div");
    
        heading.classList.add(
            "planner-section-header-row"
        );
    
        const label = document.createElement("div");
    
        label.classList.add("detail-label");
        label.textContent = "Regional Leadership";
    
        heading.appendChild(label);
        section.appendChild(heading);

        let renderedEditorProfileId = null;
    
        REGION_LEADERSHIP_POSITIONS.forEach(
            positionDefinition => {
                const row = document.createElement("div");
    
                row.classList.add(
                    "admin-structure-row"
                );
    
                const positionLabel =
                    document.createElement("div");
    
                positionLabel.classList.add(
                    "admin-structure-label"
                );
    
                positionLabel.textContent =
                    positionDefinition.label;
    
                const assignments =
                    state.profileRegionPositions
                        .filter(
                            assignment =>
                                assignment.position ===
                                positionDefinition.value
                        )
                        .map(assignment =>
                            profiles.find(
                                profile =>
                                    profile.id ===
                                    assignment.profileId
                            )
                        )
                        .filter(Boolean)
                        .sort((a, b) =>
                            getProfileName(a).localeCompare(
                                getProfileName(b)
                            )
                        );
    
                const people =
                    document.createElement("div");
    
                people.classList.add(
                    "admin-structure-people"
                );
    
                if (assignments.length === 0) {
                    const emptyButton =
                        document.createElement("button");
                
                    emptyButton.type = "button";
                
                    emptyButton.classList.add(
                        "admin-structure-empty",
                        "admin-empty-assignment-button"
                    );
                
                    emptyButton.textContent =
                        "No one assigned";
                
                    emptyButton.title =
                        `Assign ${positionDefinition.label}`;
                
                    emptyButton.addEventListener(
                        "click",
                        () => {
                            const isAlreadyOpen =
                                openRegionalAssignmentPosition ===
                                positionDefinition.value;
                
                                openRegionalAssignmentPosition =
                                isAlreadyOpen
                                    ? null
                                    : positionDefinition.value;
                            
                            openAoAssignment = null;
                            
                            state.editingRegionLeadershipProfileId =
                                null;
                            
                            state.editingAoLeadershipProfileId =
                                null;
                            
                            renderLeadershipOverviews();
                        }
                    );
                
                    people.appendChild(emptyButton);
                } else {
                    assignments.forEach(profile => {
                        const person =
                            document.createElement("button");
                    
                        person.type = "button";
                    
                        person.classList.add(
                            "admin-structure-person",
                            "admin-structure-person-button"
                        );
                    
                        person.textContent =
                            getProfileName(profile);
                    
                        person.title =
                            `Edit regional leadership for ${getProfileName(profile)}`;
                    
                        person.addEventListener(
                            "click",
                            () => {
                                openLeadershipEditor(
                                    profile.id,
                                    "region"
                                );
                            }
                        );
                    
                        people.appendChild(person);
                    });
                }
    
                row.append(
                    positionLabel,
                    people
                );
                
                section.appendChild(row);
                
                if (
                    assignments.length === 0 &&
                    openRegionalAssignmentPosition ===
                        positionDefinition.value
                ) {
                    section.appendChild(
                        createRegionalPositionAssigner(
                            positionDefinition
                        )
                    );
                }
                
                const editingProfile = assignments.find(
                    profile =>
                        profile.id ===
                        state.editingRegionLeadershipProfileId
                );
                
                if (
                    editingProfile &&
                    renderedEditorProfileId !== editingProfile.id
                ) {
                    renderedEditorProfileId =
                        editingProfile.id;
                
                    section.appendChild(
                        createRegionLeadershipEditor(
                            editingProfile
                        )
                    );
                }
            }
        );
    
        return section;
    }

    function createAoLeadershipOverview() {
        const section = document.createElement("section");
    
        section.classList.add(
            "section",
            "admin-structure-overview",
            "admin-ao-overview"
        );
    
        const heading = document.createElement("div");
    
        heading.classList.add(
            "planner-section-header-row"
        );
    
        const label = document.createElement("div");
    
        label.classList.add("detail-label");
        label.textContent = "AO Leadership";
    
        heading.appendChild(label);
        section.appendChild(heading);
    
        const activeAos = [...state.aos]
            .filter(ao => ao.isActive !== false)
            .sort((a, b) =>
                a.name.localeCompare(b.name)
            );
    
        activeAos.forEach(ao => {
            const aoGroup =
                document.createElement("div");
    
            aoGroup.classList.add(
                "admin-ao-overview-group"
            );
    
            const isExpanded =
                expandedAoLeadershipGroups.has(
                    ao.id
                );

            const aoHeading =
                document.createElement("button");

            aoHeading.type = "button";

            aoHeading.classList.add(
                "admin-ao-overview-heading",
                "admin-ao-overview-toggle"
            );

            const aoName =
                document.createElement("span");

            aoName.classList.add("member-name");
            aoName.textContent = ao.name;

            const aoIndicator =
                document.createElement("span");

            aoIndicator.classList.add(
                "admin-ao-overview-indicator"
            );

            aoIndicator.textContent =
                isExpanded ? "⌃" : "⌄";

            aoHeading.append(
                aoName,
                aoIndicator
            );

            aoHeading.addEventListener(
                "click",
                () => {
                    if (
                        expandedAoLeadershipGroups.has(
                            ao.id
                        )
                    ) {
                        expandedAoLeadershipGroups.delete(
                            ao.id
                        );
                    
                        if (
                            openAoAssignment?.aoId === ao.id
                        ) {
                            openAoAssignment = null;
                        }
                    } else {
                        expandedAoLeadershipGroups.add(
                            ao.id
                        );
                    }
                    
                    renderLeadershipOverviews();
                }
            );

            aoGroup.appendChild(aoHeading);

            if (!isExpanded) {
                section.appendChild(aoGroup);
                return;
            }
    
            const positionGroups =
                AO_LEADERSHIP_POSITIONS.map(
                    positionDefinition => {
                        const assignments =
                            state.profileAoPermissions
                                .filter(
                                    assignment =>
                                        assignment.aoId ===
                                            ao.id &&
                                        assignment.position ===
                                            positionDefinition.value
                                )
                                .map(assignment =>
                                    profiles.find(
                                        profile =>
                                            profile.id ===
                                            assignment.profileId
                                    )
                                )
                                .filter(Boolean)
                                .sort((a, b) =>
                                    getProfileName(a)
                                        .localeCompare(
                                            getProfileName(b)
                                        )
                                );

                        return {
                            positionDefinition,
                            assignments,
                        };
                    }
                );
    
                positionGroups.forEach(
                    ({
                        positionDefinition,
                        assignments,
                    }) => {
                        const row =
                            document.createElement("div");
                
                        row.classList.add(
                            "admin-structure-row"
                        );
                
                        const positionLabel =
                            document.createElement("div");
                
                        positionLabel.classList.add(
                            "admin-structure-label"
                        );
                
                        positionLabel.textContent =
                            positionDefinition.label;
                
                        const people =
                            document.createElement("div");
                
                        people.classList.add(
                            "admin-structure-people"
                        );
                
                        if (assignments.length === 0) {
                            const assignButton =
                                document.createElement("button");
                
                            assignButton.type = "button";
                
                            assignButton.classList.add(
                                "admin-structure-empty",
                                "admin-empty-assignment-button"
                            );
                
                            assignButton.textContent =
                                "No one assigned";
                
                            assignButton.title =
                                `Assign ${positionDefinition.label} at ${ao.name}`;
                
                            assignButton.addEventListener(
                                "click",
                                () => {
                                    openAoAssignment =
                                        openAoAssignment?.aoId ===
                                            ao.id &&
                                        openAoAssignment?.position ===
                                            positionDefinition.value
                                            ? null
                                            : {
                                                aoId: ao.id,
                                                position:
                                                    positionDefinition.value,
                                            };
                
                                    openRegionalAssignmentPosition = null;

                                    state.editingAoLeadershipProfileId =
                                        null;
                                    
                                    state.editingRegionLeadershipProfileId =
                                        null;
                                    
                                    renderLeadershipOverviews();
                                }
                            );
                
                            people.appendChild(assignButton);
                        } else {
                            assignments.forEach(profile => {
                                const person =
                                    document.createElement("button");
                
                                person.type = "button";
                
                                person.classList.add(
                                    "admin-structure-person",
                                    "admin-structure-person-button"
                                );
                
                                person.textContent =
                                    getProfileName(profile);
                
                                person.title =
                                    `Edit AO leadership for ${getProfileName(profile)}`;
                
                                person.addEventListener(
                                    "click",
                                    () => {
                                        expandedAoLeadershipGroups.add(
                                            ao.id
                                        );
                
                                        openAoAssignment = null;
                
                                        openLeadershipEditor(
                                            profile.id,
                                            "ao"
                                        );
                                    }
                                );
                
                                people.appendChild(person);
                            });
                        }
                
                        row.append(
                            positionLabel,
                            people
                        );
                
                        aoGroup.appendChild(row);
                
                        if (
                            assignments.length === 0 &&
                            openAoAssignment?.aoId ===
                                ao.id &&
                            openAoAssignment?.position ===
                                positionDefinition.value
                        ) {
                            aoGroup.appendChild(
                                createAoPositionAssigner(
                                    ao,
                                    positionDefinition
                                )
                            );
                        }
                
                        const editingProfile =
                            assignments.find(
                                profile =>
                                    profile.id ===
                                    state.editingAoLeadershipProfileId
                            );
                
                        if (
                            editingProfile &&
                            !aoGroup.querySelector(
                                `[data-leadership-editor-profile-id="${editingProfile.id}"]`
                            )
                        ) {
                            aoGroup.appendChild(
                                createAoLeadershipEditor(
                                    editingProfile
                                )
                            );
                        }
                    }
                );
    
            section.appendChild(aoGroup);
        });
    
        return section;
    }

    function renderLeadershipOverviews() {
        leadershipOverviewWrap.textContent = "";
    
        leadershipOverviewWrap.append(
            createRegionalLeadershipOverview(),
            createAoLeadershipOverview()
        );
    }

    function createAoLeadershipEditor(profile) {
        const editor = document.createElement("div");

        editor.classList.add(
            "section",
            "ao-leadership-editor"
        );

        editor.dataset.leadershipEditorProfileId =
            profile.id;
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = `AO Leadership · ${getProfileName(profile)}`;
    
        let draftAssignments =
            getProfileAoPermissions(profile.id)
                .map(permission => ({
                    aoId: permission.aoId,
                    position:
                        permission.position ||
                        "aoq",
                }));
    
        const assignmentList = document.createElement("div");
    
        function renderAssignmentList() {
            assignmentList.textContent = "";

            if (draftAssignments.length === 0) {
                const empty =
                    document.createElement("div");
            
                empty.classList.add(
                    "stats-line",
                    "admin-assignment-empty"
                );
            
                empty.textContent =
                    "No AO leadership assignments.";
            
                assignmentList.appendChild(empty);
                return;
            }
    
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
    
                    aoSelect.addEventListener(
                        "change",
                        event => {
                            draftAssignments[index].aoId =
                                event.target.value;
                    
                            renderAssignmentList();
                        }
                    );
    
                const positionSelect = document.createElement("select");
    
                AO_LEADERSHIP_POSITIONS.forEach(position => {
                    const option = document.createElement("option");
                    option.value = position.value;
                    option.textContent = position.label;
                    option.selected = position.value === assignment.position;
                    positionSelect.appendChild(option);
                });
    
                positionSelect.addEventListener(
                    "change",
                    event => {
                        draftAssignments[index].position =
                            event.target.value;
                
                        renderAssignmentList();
                    }
                );
    
                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.classList.add("secondary-button");
                removeButton.textContent = "Remove";
    
                removeButton.addEventListener("click", () => {
                    draftAssignments = draftAssignments.filter((_, assignmentIndex) =>
                        assignmentIndex !== index
                    );
    
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
                await setProfileAoPermissions(
                    profile.id,
                    state.currentRegionId,
                    cleanAssignments
                );
            
                await reloadAdminManagementData();
            
                showToast(
                    "AO leadership updated.",
                    "success"
                );
            
                state.editingAoLeadershipProfileId =
                    null;
            
                renderLeadershipOverviews();
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
            state.editingAoLeadershipProfileId =
                null;
        
            renderLeadershipOverviews();
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

        editor.classList.add(
            "section",
            "ao-leadership-editor"
        );

        editor.dataset.leadershipEditorProfileId =
            profile.id;
    
        const heading = document.createElement("div");
        heading.classList.add("detail-label");
        heading.textContent = `Regional Leadership · ${getProfileName(profile)}`;
    
        let draftPositions = getProfileRegionPositions(profile.id)
            .map(position => position.position);
    
        const positionList = document.createElement("div");
    
        function renderPositionList() {
            positionList.textContent = "";

            if (draftPositions.length === 0) {
                const empty = document.createElement("div");
                empty.classList.add(
                    "stats-line",
                    "admin-assignment-empty"
                );
            
                empty.textContent =
                    "No regional leadership positions assigned.";
            
                positionList.appendChild(empty);
                return;
            }
    
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
    
                positionSelect.addEventListener(
                    "change",
                    event => {
                        draftPositions[index] =
                            event.target.value;
                
                        renderPositionList();
                    }
                );
    
                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.classList.add("secondary-button");
                removeButton.textContent = "Remove";
    
                removeButton.addEventListener("click", () => {
                    draftPositions = draftPositions.filter(
                        (_, i) => i !== index
                    );
                
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
            const availablePosition =
                REGION_LEADERSHIP_POSITIONS.find(
                    option =>
                        !draftPositions.includes(
                            option.value
                        )
                );
        
            if (!availablePosition) {
                showToast(
                    "All regional leadership positions are already assigned to this user.",
                    "info"
                );
                return;
            }
        
            draftPositions.push(
                availablePosition.value
            );
        
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
                await setProfileRegionPositions(
                    profile.id,
                    state.currentRegionId,
                    draftPositions
                );
            
                await reloadAdminManagementData();
            
                showToast(
                    "Regional leadership updated.",
                    "success"
                );
            
                state.editingRegionLeadershipProfileId =
                    null;
            
                renderLeadershipOverviews();

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
            state.editingRegionLeadershipProfileId =
                null;
        
            renderLeadershipOverviews();
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

    renderLeadershipOverviews();

    app.append(
        leadershipOverviewWrap,
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}