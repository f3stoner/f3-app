export function createSavedPlannerSection({ sectionType, name, content, createdByUserId }) {
    return {
        id: crypto.randomUUID(),
        sectionType,
        name,
        content,
        createdByUserId,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
    };
}

export function getSavedSectionsByType(savedSections = [], sectionType, currentUserId) {
    const allowedTypes =
        sectionType === "thang"
            ? ["thang", "thangs"]
            : [sectionType];
    
    return savedSections
        .filter(section =>
            allowedTypes.includes(section.sectionType) &&
            section.createdByUserId === currentUserId
        )
        .sort((a, b) => {
            const aTime = a.lastUsedAt || a.createdAt || 0;
            const bTime = b.lastUsedAt || b.createdAt || 0;
            return String(bTime).localeCompare(String(aTime));
        });
}