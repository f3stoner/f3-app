export function ensureCustomTemplates(customTemplates = {}) {
    return {
        preblast: {
            activeTemplateId: customTemplates.preblast?.activeTemplateId || null,
            savedTemplates: Array.isArray(customTemplates.preblast?.savedTemplates)
                ? customTemplates.preblast.savedTemplates
                : [],
        },
        backblast: {
            activeTemplateId: customTemplates.backblast?.activeTemplateId || null,
            savedTemplates: Array.isArray(customTemplates.backblast?.savedTemplates)
                ? customTemplates.backblast.savedTemplates
                : [],
        },
    };
}

export function createCustomTemplate({ name, content }) {
    return {
        id: crypto.randomUUID(),
        name,
        content,
        createdAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
    };
}