import { navigateTo } from "../utils/navigation.js";
import { state } from "../modules/state.js";
import { canViewPaxOverview } from "../utils/permissions.js";

export function createPaxProfileNav(activeView) {
    const nav = document.createElement("div");
    nav.classList.add("pax-profile-nav");

    const items = [
        {
            label: "Overview",
            view: "paxProfile",
            isVisible: () =>
                canViewPaxOverview(state.selectedPaxId),
        },
        {
            label: "Community",
            view: "paxCommunity",
            isVisible: () => true,
        },
    ].filter(item =>
        !item.isVisible || item.isVisible()
    );

    nav.style.gridTemplateColumns =
        `repeat(${items.length}, minmax(0, 1fr))`;

    items.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("pax-profile-nav-item");
        button.textContent = item.label;

        if (item.view === activeView) {
            button.classList.add("active");
            button.disabled = true;
        } else {
            button.addEventListener("click", () => {
                navigateTo(item.view);
            });
        }

        nav.appendChild(button);
    });

    return nav;
}