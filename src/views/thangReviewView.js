import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createAppHeader } from "../components/appHeader.js";
import { createMainMenu, cleanupMainMenu } from "../components/mainMenu.js";
import {
    loadThangCandidates,
    approveThangCandidate,
    rejectThangCandidate,
} from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { generateHistoricalThangCandidatesForRegion } from "../services/thangExtraction.js";

const EMPHASIS_OPTIONS = [
    ["", "None"],
    ["heavy", "Heavy/Sandbag"],
    ["upper", "Upper"],
    ["lower", "Lower"],
    ["core", "Core"],
    ["cardio", "Cardio"],
    ["bootcamp", "Bootcamp"],
    ["ruck", "Ruck"],
    ["run", "Run"],
    ["30/30", "30/30"],
    ["benchmark", "Benchmark"],
    ["murph_training", "Murph Training"],
    ["stairs", "Stairs"],
];

const COUPON_OPTIONS = [
    ["unknown", "Unknown"],
    ["none", "None"],
    ["optional", "Optional"],
    ["required", "Required"],
];

const TERRAIN_OPTIONS = [
    ["any", "Any"],
    ["hill", "Hill"],
    ["stairs", "Stairs"],
    ["basketball_court", "Basketball Court"],
    ["tennis_court", "Tennis Court"],
    ["pull_up_bars", "Pull-up Bars"],
    ["field", "Field"],
    ["parking_lot", "Parking Lot"],
    ["other", "Other"],
];

const ACCESSORY_OPTIONS = [
    ["cones", "Cones"],
    ["whiteboard", "Whiteboard"],
    ["ball", "Ball"],
    ["speed_ladder", "Speed Ladder"],
    ["timer", "Timer"],
    ["speaker", "Speaker"],
    ["other", "Other"],
];

export function renderThangReviewView() {
    const app = document.getElementById("app");
    app.textContent = "";

    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "adminSettings",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Thang Review Queue";

    const helper = document.createElement("div");
    helper.classList.add("stats-line");
    helper.textContent = "Review extracted historical backblast candidates before adding them to the region library.";

    const extractButton = document.createElement("button");
    extractButton.type = "button";
    extractButton.classList.add("secondary-button");
    extractButton.textContent = "Extract Historical Thangs";

    extractButton.addEventListener("click", async () => {
        extractButton.disabled = true;
        extractButton.textContent = "Extracting...";

        try {
            const result = await generateHistoricalThangCandidatesForRegion(
                state.currentRegionId
            );

            state.hasLoadedThangCandidates = false;

            showToast(
                `Checked ${result.backblastsChecked}, inserted ${result.candidatesInserted}.`,
                "success"
            );

            renderApp();
        } catch (error) {
            console.error("Failed to extract historical thangs:", error);
            showToast("Failed to extract historical thangs.", "error");

            extractButton.disabled = false;
            extractButton.textContent = "Extract Historical Thangs";
        }
    });

    const candidates = state.thangCandidates || [];

    if (!state.hasLoadedThangCandidates) {
        loadThangCandidates(state.currentRegionId, { limit: 25, offset: 0 })
            .then(loaded => {
                state.thangCandidates = loaded;
                state.hasLoadedThangCandidates = true;
                renderApp();
            })
            .catch(error => {
                console.error("Failed to load thang candidates:", error);
                showToast("Failed to load thang candidates.", "error");
            });
    }

    const list = document.createElement("div");
    list.classList.add("thang-review-list");

    if (!state.hasLoadedThangCandidates) {
        list.textContent = "Loading candidates...";
    } else if (candidates.length === 0) {
        list.textContent = "No thang candidates need review.";
    } else {
        candidates.forEach(candidate => {
            list.appendChild(createCandidateCard(candidate));
        });
    }

    const loadMoreButton = document.createElement("button");
    loadMoreButton.type = "button";
    loadMoreButton.classList.add("secondary-button");
    loadMoreButton.textContent = "Load More";

    loadMoreButton.addEventListener("click", async () => {
        const more = await loadThangCandidates(state.currentRegionId, {
            limit: 25,
            offset: state.thangCandidates.length,
        });

        state.thangCandidates = [...state.thangCandidates, ...more];
        renderApp();
    });

    app.append(header, title, helper, /*extractButton,*/ list, ...(state.hasLoadedThangCandidates ? [loadMoreButton] : []));

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}

function createCandidateCard(candidate) {
    const card = document.createElement("div");
    card.classList.add("section", "thang-review-card");

    const source = document.createElement("div");
    source.classList.add("stats-line");
    source.textContent = `${candidate.sourceDate || "Unknown date"} • ${candidate.sourceAoName || "Unknown AO"}`;

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "Thang title";
    titleInput.value = candidate.title || "";

    const contentInput = document.createElement("textarea");
    contentInput.classList.add("notes");
    contentInput.value = candidate.content || "";

    const emphasisSelect = createSelect(EMPHASIS_OPTIONS, candidate.suggestedEmphasis || "");
    const couponSelect = createSelect(COUPON_OPTIONS, candidate.couponRequirement || "unknown");

    const terrainWrap = createCheckboxGroup(TERRAIN_OPTIONS, candidate.terrain || []);
    const accessoriesWrap = createCheckboxGroup(ACCESSORY_OPTIONS, candidate.accessories || []);

    const terrainOtherInput = createOtherInput(
        "Other terrain...",
        candidate.terrainOther || ""
    );
    
    const accessoriesOtherInput = createOtherInput(
        "Other accessory...",
        candidate.accessoriesOther || ""
    );
    
    syncOtherInputVisibility(terrainWrap, terrainOtherInput);
    syncOtherInputVisibility(accessoriesWrap, accessoriesOtherInput);
    
    terrainWrap.addEventListener("change", () => {
        syncOtherInputVisibility(terrainWrap, terrainOtherInput);
    });
    
    accessoriesWrap.addEventListener("change", () => {
        syncOtherInputVisibility(accessoriesWrap, accessoriesOtherInput);
    });

    const emphasisLabel = createLabel("Emphasis");
    const couponLabel = createLabel("Coupon");
    const terrainLabel = createLabel("Terrain");
    const accessoriesLabel = createLabel("Accessories");

    const actions = document.createElement("div");
    actions.classList.add("button-row");

    const approveButton = document.createElement("button");
    approveButton.textContent = "Approve to Library";

    approveButton.addEventListener("click", async () => {
        const updatedCandidate = readCandidateForm(candidate, {
            titleInput,
            contentInput,
            emphasisSelect,
            couponSelect,
            terrainWrap,
            accessoriesWrap,
            terrainOtherInput,
            accessoriesOtherInput,
        });

        if (!updatedCandidate.content.trim()) {
            showToast("Candidate content is required.", "error");
            return;
        }

        try {
            await approveThangCandidate(
                state.currentRegionId,
                updatedCandidate,
                state.currentUserId
            );

            state.hasLoadedThangCandidates = false;
            state.thangCandidates = [];

            showToast("Thang approved.", "success");
            renderApp();

        } catch (error) {
            console.error("Failed to approve thang candidate:", error);
            showToast("Failed to approve thang.", "error");
        }
    });

    const rejectButton = document.createElement("button");
    rejectButton.classList.add("danger-button");
    rejectButton.textContent = "Reject";

    rejectButton.addEventListener("click", async () => {
        const confirmed = confirm("Reject this candidate?");
        if (!confirmed) return;

        try {
            await rejectThangCandidate(
                state.currentRegionId,
                candidate.id,
                state.currentUserId
            );

            state.hasLoadedThangCandidates = false;
            state.thangCandidates = [];

            showToast("Candidate rejected.", "success");
            renderApp();

        } catch (error) {
            console.error("Failed to reject thang candidate:", error);
            showToast("Failed to reject candidate.", "error");
        }
    });

    actions.append(approveButton, rejectButton);

    card.append(
        source,
        titleInput,
        contentInput,
        emphasisLabel,
        emphasisSelect,
        couponLabel,
        couponSelect,
        terrainLabel,
        terrainWrap,
        terrainOtherInput,
        accessoriesLabel,
        accessoriesWrap,
        accessoriesOtherInput,
        actions
    );

    return card;
}

function createOtherInput(placeholder, value = "") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.value = value || "";
    input.classList.add("other-tag-input");
    return input;
}

function syncOtherInputVisibility(wrap, input) {
    const otherChecked = Boolean(
        wrap.querySelector("input[value='other']:checked")
    );

    input.hidden = !otherChecked;

    if (!otherChecked) {
        input.value = "";
    }
}

function createLabel(text) {
    const label = document.createElement("div");
    label.classList.add("detail-label");
    label.textContent = text;
    return label;
}

function createSelect(options, value) {
    const select = document.createElement("select");

    options.forEach(([optionValue, optionLabel]) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionLabel;
        select.appendChild(option);
    });

    select.value = value || "";

    return select;
}

function createCheckboxGroup(options, selectedValues = []) {
    const wrap = document.createElement("div");
    wrap.classList.add("checkbox-chip-grid");

    options.forEach(([value, labelText]) => {
        const label = document.createElement("label");
        label.classList.add("checkbox-chip");

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = value;
        input.checked = selectedValues.includes(value);

        label.append(input, document.createTextNode(` ${labelText}`));
        wrap.appendChild(label);
    });

    return wrap;
}

function getCheckedValues(wrap) {
    return [...wrap.querySelectorAll("input[type='checkbox']:checked")]
        .map(input => input.value);
}

function readCandidateForm(candidate, fields) {
    return {
        ...candidate,
        title: fields.titleInput.value.trim(),
        content: fields.contentInput.value.trim(),
        suggestedEmphasis: fields.emphasisSelect.value || "",
        couponRequirement: fields.couponSelect.value || "unknown",
        terrain: getCheckedValues(fields.terrainWrap),
        terrainOther: fields.terrainOtherInput?.value.trim() || "",
        accessories: getCheckedValues(fields.accessoriesWrap),
        accessoriesOther: fields.accessoriesOtherInput?.value.trim() || "",
    };
}