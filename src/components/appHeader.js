import { state } from "../modules/state.js";
import { goBack } from "../utils/navigation.js";
import { openMainMenu } from "./mainMenu.js";

export function createAppHeader({
    title = "",
    titleElement = null,
    showBack = true,
    fallbackView = "dashboard",
    showMenu = true,
} = {}) {
    const header = document.createElement("div");
    header.classList.add("app-header");

    const left = document.createElement("div");
    left.classList.add("app-header-left");

    if (showBack && state.currentView !== "dashboard") {
        const backButton = document.createElement("button");
        backButton.type = "button";
        backButton.classList.add("app-header-back-button");
        backButton.textContent = "← Back";

        backButton.addEventListener("click", () => {
            goBack(fallbackView);
        });

        left.appendChild(backButton);
    }

    const center = document.createElement("div");
    center.classList.add("app-header-title");

    if (titleElement) {
        center.appendChild(titleElement);
    } else {
        center.textContent = title;
    }

    const right = document.createElement("div");
    right.classList.add("app-header-right");

    if (showMenu) {
        const menuButton = document.createElement("button");
        menuButton.type = "button";
        menuButton.classList.add("hamburger-button");
        menuButton.setAttribute("aria-label", "Open menu");
        menuButton.textContent = "☰";

        menuButton.addEventListener("click", openMainMenu);

        right.appendChild(menuButton);
    }

    header.append(left, center, right);

    return header;
}