import { formatDate } from "./date.js";

export function createDateField({ value, onChange}) {
    const wrapper = document.createElement("label");
    wrapper.classList.add("fake-date-field");

    const display = document.createElement("div");
    display.classList.add("fake-date-display");
    display.textContent = formatDate(value);

    display.addEventListener("click", () => {
        input.focus();
        input.showPicker?.();
        input.click();
    });

    const input = document.createElement("input");
    input.classList.add("native-date-input");
    input.type = "date";
    input.value = value;

    input.addEventListener("change", (event) => {
        const newValue = event.target.value;
        display.textContent = formatDate(newValue);
        onChange?.(newValue);
    });

    wrapper.append(display, input);

    return { wrapper, input, display };
}