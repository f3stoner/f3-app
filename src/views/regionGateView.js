import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { grantRegionAccess } from "../services/cloudData.js";
import { getRegionById } from "../services/cloudData.js";
import { replacePersistedData } from "../services/appData.js";
import { loadRegionData } from "../services/cloudData.js";

export function renderRegionGateView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Enter Region Password";

    const subtitle = document.createElement("div");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = `Access required for ${state.regionName}`;

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Region password";

    const button = document.createElement("button");
    button.textContent = "Enter";

    button.addEventListener("click", async () => {
        const entered = input.value.trim();

        try {
            const region = await getRegionById(state.currentRegionId);

            if (entered !== region.region_password) {
                alert("Incorrect Password");
                return;
            }

            await grantRegionAccess(state.currentUserId, state.currentRegionId);
            const cloudData = await loadRegionData(state.currentRegionId);
            replacePersistedData(cloudData);
            console.log("regionGate members loaded:", cloudData.members.length);
            console.log("state members after replace:", state.members.length);

            state.currentView = state.currentUserMemberId ? "dashboard" : "claimMember";
            renderApp();
        } catch (error) {
            console.error(error);
            alert("Failed to verify access");
        }
    });

    app.append(title, subtitle, input, button);
}