import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { replacePersistedData } from "../services/appData.js";
import { loadRegionData, joinRegion } from "../services/cloudData.js";

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
    
        if (!entered) {
            alert("Enter the region password.");
            input.focus();
            return;
        }
    
        button.disabled = true;
        button.textContent = "Checking...";
    
        try {
            await joinRegion(state.currentRegionId, entered);
    
            const cloudData = await loadRegionData(state.currentRegionId);
            replacePersistedData(cloudData);
    
            console.log("regionGate members loaded:", cloudData.members.length);
            console.log("state members after replace:", state.members.length);
    
            state.currentView = state.currentUserMemberId
                ? "dashboard"
                : "claimMember";
    
            renderApp();
        } catch (error) {
            console.error(error);
            alert(error.message || "Failed to verify access");
            input.focus();
            input.select();
        } finally {
            button.disabled = false;
            button.textContent = "Enter";
        }
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            button.click();
        }
    });

    const backButton = document.createElement("button");
    backButton.classList.add("secondary-button");
    backButton.textContent = "← Back";

    backButton.addEventListener("click", () => {
        state.currentView = "auth";
        renderApp();
    });

    app.append(backButton, title, subtitle, input, button);

    input.focus();
}