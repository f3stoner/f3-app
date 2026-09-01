import { state } from "../modules/state.js";
import { createGlobalNav } from "../components/globalNav.js";
import {
    cleanupMainMenu,
    createMainMenu,
} from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import {
    canManageCurrentRoster,
    isSuperAdmin,
} from "../utils/permissions.js";
import { navigateTo } from "../utils/navigation.js";
import {
    createModalShell,
    closeActiveModal,
} from "../utils/modal.js";
import { showToast } from "../utils/toast.js";
import {
    updateMemberProfile,
    setMemberRosterStatus,
} from "../services/appData.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";

let rosterManagementSearchTerm = "";
let rosterManagementStatusFilter = "all";
const savingMemberIds = new Set();

function normalizeSearchValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function getVisibleMembers() {
    const searchTerm =
        normalizeSearchValue(
            rosterManagementSearchTerm
        );

    return [...(state.members || [])]
        .filter(member => {
            if (
                rosterManagementStatusFilter !==
                    "all" &&
                member.status !==
                    rosterManagementStatusFilter
            ) {
                return false;
            }

            if (!searchTerm) {
                return true;
            }

            const searchableValues = [
                getMemberDisplayName(member),
                member.paxName,
                member.realName,
                member.homeAo,
            ];

            return searchableValues.some(value =>
                normalizeSearchValue(value)
                    .includes(searchTerm)
            );
        })
        .sort((a, b) => {
            if (a.status !== b.status) {
                if (a.status === "active") {
                    return -1;
                }

                if (b.status === "active") {
                    return 1;
                }
            }

            return getMemberDisplayName(a)
                .localeCompare(
                    getMemberDisplayName(b),
                    undefined,
                    {
                        sensitivity: "base",
                    }
                );
        });
}

function getRpcErrorMessage(
    error,
    fallbackMessage
) {
    const message =
        error?.message ||
        error?.details ||
        fallbackMessage;

    if (
        error?.code === "23505" ||
        message
            .toLowerCase()
            .includes("already uses")
    ) {
        return "Another member already uses that PAX name.";
    }

    if (
        error?.code === "42501" ||
        message
            .toLowerCase()
            .includes("not authorized") ||
        message
            .toLowerCase()
            .includes("only a superadmin")
    ) {
        return "You are not authorized to make this change.";
    }

    return message;
}

function openEditMemberModal(member) {
    if (!isSuperAdmin()) {
        return;
    }

    const {
        modal,
        closeModal,
    } = createModalShell();

    modal.classList.add(
        "roster-management-rename-modal"
    );

    const heading =
        document.createElement("h2");

    heading.textContent =
        "Edit PAX Profile";

    const currentName =
        document.createElement("div");

    currentName.classList.add(
        "stats-line",
        "roster-management-current-name"
    );

    currentName.textContent =
        `Editing ${
            getMemberDisplayName(member)
        }`;

    /*
     * PAX NAME
     */

    const paxNameLabel =
        document.createElement("label");

    paxNameLabel.classList.add(
        "detail-label"
    );

    paxNameLabel.textContent =
        "PAX Name";

    const paxNameInput =
        document.createElement("input");

    paxNameInput.type = "text";
    paxNameInput.value =
        member.paxName || "";
    paxNameInput.autocomplete =
        "off";
    paxNameInput.maxLength = 100;

    /*
     * REAL NAME
     */

    const realNameLabel =
        document.createElement("label");

    realNameLabel.classList.add(
        "detail-label"
    );

    realNameLabel.textContent =
        "Real Name";

    const realNameInput =
        document.createElement("input");

    realNameInput.type = "text";
    realNameInput.value =
        member.realName || "";
    realNameInput.autocomplete =
        "off";
    realNameInput.maxLength = 150;

    /*
     * PROUD PAPA
     */

    const proudPapaLabel =
        document.createElement("label");

    proudPapaLabel.classList.add(
        "detail-label"
    );

    proudPapaLabel.textContent =
        "Proud Papa";

    const proudPapaSelect =
        document.createElement("select");

    const noProudPapaOption =
        document.createElement("option");

    noProudPapaOption.value = "";
    noProudPapaOption.textContent =
        "None";

    proudPapaSelect.append(
        noProudPapaOption
    );

    [...(state.members || [])]
        .filter(
            candidate =>
                candidate.id !==
                member.id
        )
        .sort((a, b) =>
            getMemberDisplayName(a)
                .localeCompare(
                    getMemberDisplayName(b),
                    undefined,
                    {
                        sensitivity:
                            "base",
                    }
                )
        )
        .forEach(candidate => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                candidate.id;

            option.textContent =
                getMemberDisplayName(
                    candidate
                );

            if (
                candidate.id ===
                member.invitedById
            ) {
                option.selected = true;
            }

            proudPapaSelect.append(
                option
            );
        });

    /*
     * HOME AO
     */

    const homeAoLabel =
        document.createElement("label");

    homeAoLabel.classList.add(
        "detail-label"
    );

    homeAoLabel.textContent =
        "Home AO";

    const homeAoSelect =
        document.createElement("select");

    const noHomeAoOption =
        document.createElement("option");

    noHomeAoOption.value = "";
    noHomeAoOption.textContent =
        "None";

    homeAoSelect.append(
        noHomeAoOption
    );

    [...(state.aos || [])]
        .filter(
            ao =>
                ao.isActive !== false
        )
        .sort((a, b) =>
            String(a.name || "")
                .localeCompare(
                    String(b.name || ""),
                    undefined,
                    {
                        sensitivity:
                            "base",
                    }
                )
        )
        .forEach(ao => {
            const option =
                document.createElement(
                    "option"
                );

            /*
             * members.home_ao currently stores
             * the AO name, not AO id.
             */
            option.value =
                ao.name || "";

            option.textContent =
                ao.name || "Unnamed AO";

            if (
                String(
                    member.homeAo || ""
                ).toLowerCase() ===
                String(
                    ao.name || ""
                ).toLowerCase()
            ) {
                option.selected = true;
            }

            homeAoSelect.append(
                option
            );
        });

    /*
     * Preserve legacy/imported Home AO values
     * that may no longer exist in state.aos.
     */
    if (
        member.homeAo &&
        ![...homeAoSelect.options]
            .some(
                option =>
                    option.value ===
                    member.homeAo
            )
    ) {
        const legacyOption =
            document.createElement(
                "option"
            );

        legacyOption.value =
            member.homeAo;

        legacyOption.textContent =
            `${member.homeAo} (existing)`;

        legacyOption.selected = true;

        homeAoSelect.append(
            legacyOption
        );
    }

    const errorMessage =
        document.createElement("div");

    errorMessage.classList.add(
        "roster-management-error"
    );

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

    saveButton.classList.add(
        "primary-button"
    );

    saveButton.textContent =
        "Save Profile";

    async function submitProfile() {
        const paxName =
            paxNameInput.value
                .trim()
                .replace(/\s+/g, " ");

        const realName =
            realNameInput.value
                .trim()
                .replace(/\s+/g, " ");

        const invitedById =
            proudPapaSelect.value ||
            null;

        const homeAo =
            homeAoSelect.value ||
            "";

        errorMessage.textContent = "";

        if (!paxName) {
            errorMessage.textContent =
                "PAX name is required.";

            paxNameInput.focus();
            return;
        }

        saveButton.disabled = true;
        cancelButton.disabled = true;

        paxNameInput.disabled = true;
        realNameInput.disabled = true;
        proudPapaSelect.disabled = true;
        homeAoSelect.disabled = true;

        saveButton.textContent =
            "Saving…";

        try {
            await updateMemberProfile(
                member.id,
                {
                    paxName,
                    realName,
                    invitedById,
                    homeAo,
                }
            );

            closeModal();

            showToast(
                "PAX profile updated.",
                "success"
            );

            renderRosterManagementView();
        } catch (error) {
            console.error(
                "Failed to update member profile:",
                error
            );

            errorMessage.textContent =
                getRpcErrorMessage(
                    error,
                    "Failed to update PAX profile."
                );

            saveButton.disabled = false;
            cancelButton.disabled = false;

            paxNameInput.disabled = false;
            realNameInput.disabled = false;
            proudPapaSelect.disabled = false;
            homeAoSelect.disabled = false;

            saveButton.textContent =
                "Save Profile";
        }
    }

    saveButton.addEventListener(
        "click",
        submitProfile
    );

    [
        paxNameInput,
        realNameInput,
    ].forEach(input => {
        input.addEventListener(
            "keydown",
            event => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    event.preventDefault();

                    void submitProfile();
                }

                if (
                    event.key ===
                    "Escape"
                ) {
                    closeActiveModal();
                }
            }
        );
    });

    buttonRow.append(
        cancelButton,
        saveButton
    );

    modal.append(
        heading,
        currentName,

        paxNameLabel,
        paxNameInput,

        realNameLabel,
        realNameInput,

        proudPapaLabel,
        proudPapaSelect,

        homeAoLabel,
        homeAoSelect,

        errorMessage,
        buttonRow
    );

    requestAnimationFrame(() => {
        paxNameInput.focus();
        paxNameInput.select();
    });
}

function createMemberCard(
    member,
    rerenderList
) {
    const card =
        document.createElement("div");

    card.classList.add(
        "member-card",
        "roster-management-card"
    );

    if (member.status === "inactive") {
        card.classList.add(
            "member-card-inactive"
        );
    }

    const content =
        document.createElement("div");

    content.classList.add(
        "roster-management-member-content"
    );

    const name =
        document.createElement("div");

    name.classList.add("member-name");
    name.textContent =
        getMemberDisplayName(member);

    const details =
        document.createElement("div");

    details.classList.add("stats-line");

    const detailParts = [];

    if (member.realName) {
        detailParts.push(member.realName);
    }

    if (member.homeAo) {
        detailParts.push(member.homeAo);
    }

    details.textContent =
        detailParts.join(" • ") ||
        "No additional roster details";

    const badge =
        document.createElement("div");

    badge.classList.add(
        "member-status-badge",
        member.status === "active"
            ? "roster-status-active"
            : "roster-status-inactive"
    );

    badge.textContent =
        member.status === "active"
            ? "Active"
            : "Inactive";

    content.append(
        name,
        details,
        badge
    );

    const actions =
        document.createElement("div");

    actions.classList.add(
        "roster-management-actions"
    );

    const isSaving =
        savingMemberIds.has(member.id);

    if (isSuperAdmin()) {
        const editButton =
            document.createElement("button");

        editButton.type = "button";
        editButton.classList.add(
            "secondary-button",
            "roster-management-edit-button"
        );
        editButton.textContent = "Edit";
        editButton.disabled = isSaving;

        editButton.addEventListener(
            "click",
            () => {
                openEditMemberModal(member);
            }
        );

        actions.append(editButton);
    }

    const toggleButton =
        document.createElement("button");

    toggleButton.type = "button";
    toggleButton.disabled = isSaving;

    if (member.status === "active") {
        toggleButton.classList.add(
            "danger-button"
        );
        toggleButton.textContent =
            isSaving
                ? "Saving…"
                : "Deactivate";
    } else {
        toggleButton.classList.add(
            "primary-button"
        );
        toggleButton.textContent =
            isSaving
                ? "Saving…"
                : "Activate";
    }

    toggleButton.addEventListener(
        "click",
        async () => {
            if (savingMemberIds.has(member.id)) {
                return;
            }

            const nextIsActive =
                member.status !== "active";

            savingMemberIds.add(member.id);
            rerenderList();

            try {
                await setMemberRosterStatus(
                    member.id,
                    nextIsActive
                );

                showToast(
                    nextIsActive
                        ? "Member activated."
                        : "Member deactivated.",
                    "success"
                );
            } catch (error) {
                console.error(
                    "Failed to update roster status:",
                    error
                );

                showToast(
                    getRpcErrorMessage(
                        error,
                        "Failed to update roster status."
                    ),
                    "error"
                );
            } finally {
                savingMemberIds.delete(
                    member.id
                );

                rerenderList();
            }
        }
    );

    actions.append(toggleButton);

    card.append(content, actions);

    return card;
}

export function renderRosterManagementView() {
    const app =
        document.getElementById("app");

    app.textContent = "";

    cleanupMainMenu();

    if (!canManageCurrentRoster()) {
        showToast(
            "You do not have access to manage this roster.",
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

    const title =
        document.createElement("h1");

    title.textContent = "Roster Management";

    const description =
        document.createElement("p");

    description.classList.add(
        "view-subtitle"
    );

    description.textContent =
        `Manage the ${state.regionName || "regional"} home roster. Inactive members retain their history and remain available in session attendance search.`;

    const searchInput =
        document.createElement("input");

    searchInput.type = "search";
    searchInput.placeholder =
        "Search PAX, real name, or AO…";
    searchInput.value =
        rosterManagementSearchTerm;
    searchInput.classList.add(
        "session-search"
    );

    const filterRow =
        document.createElement("div");

    filterRow.classList.add(
        "button-row",
        "roster-management-filter-row"
    );

    const list =
        document.createElement("div");

    list.classList.add(
        "roster-management-list"
    );

    const summary =
        document.createElement("div");

    summary.classList.add(
        "stats-line",
        "roster-management-summary"
    );

    function renderList() {
        list.textContent = "";

        const visibleMembers =
            getVisibleMembers();

        summary.textContent =
            `${visibleMembers.length} of ${
                state.members.length
            } roster members`;

        if (visibleMembers.length === 0) {
            const empty =
                document.createElement("div");

            empty.classList.add(
                "detail-value",
                "roster-management-empty"
            );

            empty.textContent =
                "No matching roster members found.";

            list.append(empty);
            return;
        }

        visibleMembers.forEach(member => {
            list.append(
                createMemberCard(
                    member,
                    renderList
                )
            );
        });
    }

    [
        {
            value: "all",
            label: "All",
        },
        {
            value: "active",
            label: "Active",
        },
        {
            value: "inactive",
            label: "Inactive",
        },
    ].forEach(filter => {
        const button =
            document.createElement("button");

        button.type = "button";
        button.textContent = filter.label;

        if (
            rosterManagementStatusFilter ===
            filter.value
        ) {
            button.classList.add("active");
        }

        button.addEventListener(
            "click",
            () => {
                rosterManagementStatusFilter =
                    filter.value;

                renderRosterManagementView();
            }
        );

        filterRow.append(button);
    });

    searchInput.addEventListener(
        "input",
        event => {
            rosterManagementSearchTerm =
                event.target.value;

            renderList();
        }
    );

    renderList();

    const nav = createGlobalNav();

    app.append(
        header,
        title,
        description,
        searchInput,
        filterRow,
        summary,
        list,
        nav
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(
            createMainMenu()
        );
    }
}