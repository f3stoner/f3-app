import { getWorkoutEmphasisForSlot } from "../utils/workoutEmphasis.js";
import { createIcon } from "../utils/icons.js";

export function createWorkoutEmphasisBadge(slot, ao) {
    const emphasis = getWorkoutEmphasisForSlot(slot, ao);

    const displayEmphasis = slot.customEmphasisLabel
        ? {
            key: "custom",
            label: slot.customEmphasisLabel,
            icon: null,
        }
        : emphasis;

    if (!displayEmphasis) {
        return null;
    }

    const row = document.createElement("div");
    row.classList.add("q-signup-emphasis-row");

    const badge = document.createElement("span");
    badge.classList.add("workout-emphasis-line");

    if (displayEmphasis.icon) {
        const icon = createIcon(displayEmphasis.icon);
        icon.classList.add("workout-emphasis-icon");
        badge.append(icon);
    }

    const label = document.createElement("div");
    label.textContent = displayEmphasis.label;

    badge.appendChild(label);
    row.appendChild(badge);

    return row;
}