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

export function hasThirdFContentBlock(text = "") {
    return /(^|\n)THIRD F(\n|$)/i.test(text);
}

export const THIRD_F_BLOCK_START = "THIRD F";

export function replaceThirdFContentBlock(text = "", nextBlock = "") {
    const blockRegex = /(^|\n)THIRD F\n\n[\s\S]*?(?=\n\n[A-Z][A-Z\s]+(?:\n|$)|$)/i;

    if (blockRegex.test(text)) {
        return text.replace(blockRegex, match => {
            const prefix = match.startsWith("\n") ? "\n" : "";
            return nextBlock ? `${prefix}${nextBlock}` : "";
        }).trim();
    }

    if (!nextBlock) return text;

    return text.trim()
        ? `${text.trim()}\n\n${nextBlock}`
        : nextBlock;
}