import { state } from "../modules/state.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";

export function createInvitedByField (selectedId = "") {
    const wrapper = document.createElement("div");
    wrapper.classList.add("invited-by-field");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search invited by...";

    const results = document.createElement("div");
    results.classList.add("invited-by-results");

    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    hiddenInput.classList.add("fng-invited-by-select");
    hiddenInput.value = selectedId || "";

    if (selectedId) {
        const selectedMember = state.members.find(m => m.id === selectedId);
        if (selectedMember) {
            input.value = selectedMember.paxName;
        }
    }

    function getMatches(searchText) {
        const search = searchText.trim().toLowerCase();
        if (!search) return [];

        return state.members
        .filter(m => m.status === "active")
        .filter(member => {
            const paxName = (member.paxName || "").toLowerCase();
            const realName = (member.realName || "").toLowerCase();

            return paxName.includes(search) || realName.includes(search);
        })
        .slice(0, 8);
    }

    function renderResults(matches) {
        results.textContent = "";

        if (matches.length === 0) return;

        matches.forEach(member => {
            const item = document.createElement("button");
            item.type = "button";
            item.classList.add("invited-by-item");
            item.textContent = getMemberDisplayName(member);

            item.addEventListener("click", () => {
                input.value = getMemberDisplayName(member);
                hiddenInput.value = member.id;
                results.textContent = "";
            });

            results.appendChild(item);
        });
    }

    input.addEventListener("input", () => {
        hiddenInput.value = "";
        const matches = getMatches(input.value);
        renderResults(matches);
    });

    input.addEventListener("focus", () => {
        if (!hiddenInput.value) {
            const matches = getMatches(input.value);
            renderResults(matches);
        }
    });

    input.addEventListener("blur", () => {
        setTimeout(() => {
            results.textContent = "";
        }, 150);
    });

    wrapper.append(input, hiddenInput, results);

    return { wrapper, input, hiddenInput };
}