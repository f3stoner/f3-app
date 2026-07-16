import { filterDateAwareContent } from "./dateAwareContent.js";
import { getTodayDate } from "./date.js";

export function buildThirdFContentBlock(thirdFItems = [], targetDate = getTodayDate()) {
    const items = filterDateAwareContent(thirdFItems, targetDate)
        .filter(item => item.published === true);

    if (items.length === 0) return "";

    const body = items
    .map(item => {
        return [
            item.title,
            item.summary,
        ].filter(Boolean).join("\n");
    })
    .join("\n\n");

    return `THIRD F\n\n${body}`;
}

export function getEffectiveWorkoutThirdF({
    workout,
    thirdFItems = [],
    targetDate = null,
} = {}) {
    if (workout?.thirdFMode === "custom") {
        return {
            mode: "custom",
            text: workout.thirdFText || "",
        };
    }

    const effectiveDate =
        targetDate ||
        workout?.date ||
        getTodayDate();

    return {
        mode: "auto",
        text: buildThirdFContentBlock(
            thirdFItems,
            effectiveDate
        ),
    };
}