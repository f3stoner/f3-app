export function createThangSection(index = 0, content = "") {
    return {
        id: crypto.randomUUID(),
        title: `Thang ${index + 1}`,
        content,
    };
}

export function normalizeThangSections(workout) {
    if (Array.isArray(workout?.thangSections) && workout.thangSections.length > 0) {
        return workout.thangSections;
    }

    if (typeof workout?.thangs === "string" && workout.thangs.trim()) {
        return [createThangSection(0, workout.thangs)];
    }

    return [createThangSection(0, "")];
}

export function serializeThangSections(thangSections = []) {
    return thangSections
        .filter(section => section.content?.trim())
        .map((section, index) => {
            const title = section.title?.trim() || `Thang ${index + 1}`;
            return `${title}\n${section.content.trim()}`;
        })
        .join("\n\n");
}