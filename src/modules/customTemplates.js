import { state } from "./state.js";

export function saveCustomTemplate(type, text) {
    state.customTemplates[type] = text;
}

export function getCustomTemplate(type) {
    return state.customTemplates?.[type] || "";
}