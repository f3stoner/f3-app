import { state } from "../modules/state.js";
import { renderApp, saveCurrentOfflineBootSnapshot } from "../index.js";
import {
    joinRegion,
    loadAccessibleRegions,
} from "../services/cloudData.js";
import {
    switchWorkspace,
} from "../services/workspaceService.js";

export function renderRegionGateView() {
    const app =
        document.getElementById("app");

    app.textContent = "";

    /*
     * The gate must use the explicit requested region,
     * never infer its target from the previously committed
     * currentRegionId.
     */
    const regionId =
        state.pendingRegionId;

    const region =
        state.availableRegions.find(
            candidate =>
                candidate.id === regionId
        );

    const regionName =
        region?.name ||
        "this region";

    const title =
        document.createElement("h1");

    title.textContent =
        "Enter Region Password";

    const subtitle =
        document.createElement("div");

    subtitle.classList.add(
        "view-subtitle"
    );

    subtitle.textContent =
        `Access required for ${regionName}`;

    const input =
        document.createElement("input");

    input.type = "password";
    input.placeholder =
        "Region password";

    const button =
        document.createElement("button");

    button.textContent = "Enter";

    const backButton =
        document.createElement("button");

    backButton.classList.add(
        "secondary-button"
    );

    backButton.textContent = "← Back";

    let submissionInProgress = false;

    button.addEventListener(
        "click",
        async () => {
            if (submissionInProgress) {
                return;
            }

            const entered =
                input.value.trim();

            if (!entered) {
                alert(
                    "Enter the region password."
                );

                input.focus();
                return;
            }

            if (!regionId) {
                alert(
                    "No region was selected."
                );

                return;
            }

            submissionInProgress = true;

            button.disabled = true;
            backButton.disabled = true;
            input.disabled = true;

            button.textContent =
                "Checking...";

            try {
                await joinRegion(
                    regionId,
                    entered
                );

                /*
                 * Do not allow an old gate request to
                 * override navigation that happened through
                 * some other path.
                 */
                if (
                    state.currentView !==
                    "regionGate"
                ) {
                    return;
                }

                const accessibleRegions =
                    await loadAccessibleRegions(
                        state.currentUserId
                    );

                if (
                    state.currentView !==
                    "regionGate"
                ) {
                    return;
                }

                state.accessibleRegions =
                    accessibleRegions || [];

                state.accessibleRegionIds =
                    state.accessibleRegions.map(
                        region => region.id
                    );

                const workspaceResult =
                    await switchWorkspace(
                        regionId
                    );

                if (
                    workspaceResult ===
                    "stale"
                ) {
                    return;
                }

                if (
                    workspaceResult !==
                    "loaded"
                ) {
                    throw new Error(
                        "Region access could not be confirmed."
                    );
                }

                try {
                    await saveCurrentOfflineBootSnapshot();
                } catch (error) {
                    console.warn(
                        "Region joined, but the offline snapshot could not be updated:",
                        error
                    );
                }

                if (
                    state.currentView !==
                    "regionGate"
                ) {
                    return;
                }

                state.currentView =
                    state.currentUserMemberId
                        ? "dashboard"
                        : "claimMember";

                renderApp();
            } catch (error) {
                console.error(error);

                alert(
                    error.message ||
                    "Failed to verify access"
                );

                if (
                    state.currentView ===
                    "regionGate"
                ) {
                    input.focus();
                    input.select();
                }
            } finally {
                submissionInProgress = false;

                button.disabled = false;
                backButton.disabled = false;
                input.disabled = false;

                button.textContent = "Enter";
            }
        }
    );

    input.addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                button.click();
            }
        }
    );

    backButton.addEventListener(
        "click",
        () => {
            if (submissionInProgress) {
                return;
            }

            state.pendingRegionId = null;

            state.currentView =
                state.currentUserId
                    ? "dashboard"
                    : "auth";

            renderApp();
        }
    );

    app.append(
        backButton,
        title,
        subtitle,
        input,
        button
    );

    input.focus();
}