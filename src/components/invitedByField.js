import { state } from "../modules/state.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";

function normalizeSelectedIds(selectedIds) {
    const values = Array.isArray(selectedIds)
        ? selectedIds
        : selectedIds
            ? [selectedIds]
            : [];

    return [...new Set(values.filter(Boolean))];
}

export function createInvitedByField(
    selectedIds = [],
    {
        excludedMemberId = null,
        includeInactive = true,
    } = {}
) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("invited-by-field");

    const selectedIdsState = normalizeSelectedIds(selectedIds);

    const selectedList = document.createElement("div");
    selectedList.classList.add("invited-by-selected");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search Proud Papas...";
    input.autocomplete = "off";

    const results = document.createElement("div");
    results.classList.add("invited-by-results");

    /*
     * Transitional compatibility:
     * Existing callers may still query `.fng-invited-by-select`
     * and expect the first selected inviter.
     */
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    hiddenInput.classList.add("fng-invited-by-select");
    hiddenInput.value = selectedIdsState[0] || "";

    /*
     * Canonical multi-value field.
     * Stored as JSON because hidden input values are strings.
     */
    const hiddenIdsInput = document.createElement("input");
    hiddenIdsInput.type = "hidden";
    hiddenIdsInput.classList.add("fng-inviter-ids");
    hiddenIdsInput.value = JSON.stringify(selectedIdsState);

    function syncHiddenInputs() {
        hiddenInput.value = selectedIdsState[0] || "";
        hiddenIdsInput.value = JSON.stringify(selectedIdsState);
    }

    function getMemberById(memberId) {
        return state.members.find(member => member.id === memberId) || null;
    }

    function removeSelectedId(memberId) {
        const index = selectedIdsState.indexOf(memberId);

        if (index === -1) return;

        selectedIdsState.splice(index, 1);

        syncHiddenInputs();
        renderSelected();
        renderResults(getMatches(input.value));
    }

    function renderSelected() {
        selectedList.textContent = "";

        selectedIdsState.forEach(memberId => {
            const member = getMemberById(memberId);

            if (!member) return;

            const chip = document.createElement("div");
            chip.classList.add("invited-by-chip");

            const label = document.createElement("span");
            label.classList.add("invited-by-chip-label");
            label.textContent = getMemberDisplayName(member);

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.classList.add("invited-by-chip-remove");
            removeButton.setAttribute(
                "aria-label",
                `Remove ${getMemberDisplayName(member)}`
            );
            removeButton.textContent = "×";

            removeButton.addEventListener("click", () => {
                removeSelectedId(memberId);
            });

            chip.append(label, removeButton);
            selectedList.appendChild(chip);
        });
    }

    function getMatches(searchText) {
        const search = String(searchText || "")
            .trim()
            .toLowerCase();

        if (!search) return [];

        return state.members
            .filter(member => {
                if (!member?.id) return false;
                if (member.id === excludedMemberId) return false;
                if (selectedIdsState.includes(member.id)) return false;

                if (!includeInactive && member.status !== "active") {
                    return false;
                }

                return true;
            })
            .filter(member => {
                const paxName = String(member.paxName || "").toLowerCase();
                const realName = String(member.realName || "").toLowerCase();

                return (
                    paxName.includes(search) ||
                    realName.includes(search)
                );
            })
            .sort((a, b) =>
                getMemberDisplayName(a).localeCompare(
                    getMemberDisplayName(b)
                )
            )
            .slice(0, 8);
    }

    function addSelectedMember(member) {
        if (!member?.id) return;
        if (member.id === excludedMemberId) return;
        if (selectedIdsState.includes(member.id)) return;

        selectedIdsState.push(member.id);

        input.value = "";
        results.textContent = "";

        syncHiddenInputs();
        renderSelected();

        input.focus();
    }

    function renderResults(matches) {
        results.textContent = "";

        matches.forEach(member => {
            const item = document.createElement("button");
            item.type = "button";
            item.classList.add("invited-by-item");

            const name = document.createElement("span");
            name.classList.add("invited-by-item-name");
            name.textContent = getMemberDisplayName(member);

            item.appendChild(name);

            item.addEventListener("mousedown", event => {
                /*
                 * Prevent blur from clearing results before click selection.
                 */
                event.preventDefault();
            });

            item.addEventListener("click", () => {
                addSelectedMember(member);
            });

            results.appendChild(item);
        });
    }

    input.addEventListener("input", () => {
        renderResults(getMatches(input.value));
    });

    input.addEventListener("focus", () => {
        renderResults(getMatches(input.value));
    });

    input.addEventListener("keydown", event => {
        if (
            event.key === "Backspace" &&
            !input.value &&
            selectedIdsState.length > 0
        ) {
            removeSelectedId(
                selectedIdsState[selectedIdsState.length - 1]
            );
        }

        if (event.key === "Escape") {
            results.textContent = "";
            input.blur();
        }
    });

    input.addEventListener("blur", () => {
        setTimeout(() => {
            results.textContent = "";
        }, 150);
    });

    function getSelectedIds() {
        return [...selectedIdsState];
    }

    function setSelectedIds(nextSelectedIds = []) {
        selectedIdsState.splice(
            0,
            selectedIdsState.length,
            ...normalizeSelectedIds(nextSelectedIds)
                .filter(memberId => memberId !== excludedMemberId)
        );

        syncHiddenInputs();
        renderSelected();
    }

    renderSelected();
    syncHiddenInputs();

    wrapper.append(
        selectedList,
        input,
        hiddenInput,
        hiddenIdsInput,
        results
    );

    return {
        wrapper,
        input,
        hiddenInput,
        hiddenIdsInput,
        getSelectedIds,
        setSelectedIds,
    };
}