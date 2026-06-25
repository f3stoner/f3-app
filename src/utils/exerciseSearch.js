import exerciseSeed from "../data/exercises.seed.json";

const SEED_EXERCISES = exerciseSeed.exercises.map(exercise => ({
    ...exercise,
    normalizedName: String(exercise.name || "").toLowerCase(),
}));

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function buildSubtitle(parts = []) {
    return parts.filter(Boolean).slice(0, 4).join(" · ");
}

function scoreSuggestion({ name, normalizedName, aliases = [], sourceCount = 0 }, query) {
    const cleanName = normalizeText(name);
    const cleanNormalizedName = normalizeText(normalizedName || name);
    const cleanAliases = aliases.map(normalizeText);

    let score = 0;

    if (cleanName === query) score += 100;
    if (cleanNormalizedName === query) score += 100;
    if (cleanAliases.some(alias => alias === query)) score += 95;

    if (cleanName.startsWith(query)) score += 75;
    if (cleanNormalizedName.startsWith(query)) score += 75;
    if (cleanAliases.some(alias => alias.startsWith(query))) score += 70;

    if (cleanName.includes(query)) score += 40;
    if (cleanNormalizedName.includes(query)) score += 40;
    if (cleanAliases.some(alias => alias.includes(query))) score += 35;

    score += Math.min((sourceCount || 0) / 100, 25);

    return score;
}

function mapExerciseSuggestion(exercise) {
    return {
        type: "exercise",
        label: exercise.name,
        insertText: exercise.name,
        subtitle: buildSubtitle([
            "Exercise",
            ...(exercise.emphasis || []),
            ...(exercise.equipment || []),
            ...(exercise.tags || []),
        ]),
        item: exercise,
    };
}

function mapLibrarySuggestion(item) {
    return {
        type: "library_item",
        label: item.name,
        insertText: item.name,
        subtitle: buildSubtitle([
            item.itemType === "exercise"
                ? "Exercise"
                : item.itemType === "thang"
                    ? "Thang"
                    : "Library",
            ...(item.emphasis || []),
            ...(item.equipment || []),
            ...(item.tags || []),
        ]),
        description: item.description || "",
        item,
    };
}

export function searchExercises(query, options = {}) {
    const trimmedQuery = normalizeText(query);

    if (trimmedQuery.length < 2) return [];

    const {
        limit = 8,
        exercises = SEED_EXERCISES,
        libraryItems = [],
    } = options;

    const exerciseResults = (exercises || []).map(exercise => ({
        suggestion: mapExerciseSuggestion(exercise),
        score: scoreSuggestion(
            {
                name: exercise.name,
                normalizedName: exercise.normalizedName,
                aliases: exercise.aliases || [],
                sourceCount: exercise.sourceCount || 0,
            },
            trimmedQuery
        ),
    }));

    const libraryResults = (libraryItems || []).map(item => ({
        suggestion: mapLibrarySuggestion(item),
        score: scoreSuggestion(
            {
                name: item.name,
                normalizedName: item.normalizedName,
                aliases: item.aliases || [],
                sourceCount: 0,
            },
            trimmedQuery
        ) + 5,
    }));

    return [...exerciseResults, ...libraryResults]
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(result => result.suggestion);
}