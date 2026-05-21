import exerciseSeed from "../data/exercises.seed.json";

const EXERCISES = exerciseSeed.exercises.map(exercise => ({
    ...exercise,
    normalizedName: String(exercise.name || "").toLowerCase(),
}));

export function searchExercises(query, options = {}) {
    const trimmedQuery = String(query || "").trim().toLowerCase();

    if (trimmedQuery.length < 2) return [];

    const limit = options.limit || 8;

    return EXERCISES
    .map(exercise => {
        const name = String(exercise.name || "").toLowerCase();
        const normalizedName = String(exercise.normalizedName || "").toLowerCase();
        const aliases = exercise.aliases || [];

        const aliasMatch = aliases.some(alias =>
            String(alias).toLowerCase().includes(trimmedQuery)
        );

        let score = 0;

        if (name === trimmedQuery) score += 100;
        if (normalizedName === trimmedQuery) score += 100;

        if (aliases.some(alias => String(alias).toLowerCase() === trimmedQuery)) {
            score += 95;
        }

        if (name.startsWith(trimmedQuery)) score += 75;
        if (normalizedName.startsWith(trimmedQuery)) score += 75;

        if (aliases.some(alias => String(alias).toLowerCase().startsWith(trimmedQuery))) {
            score += 70;
        }

        if (name.includes(trimmedQuery)) score += 40;
        if (normalizedName.includes(trimmedQuery)) score += 40;
        if (aliasMatch) score += 35;

        score += Math.min((exercise.sourceCount || 0) / 100, 25);

        return {
            exercise,
            score,
        };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(result => result.exercise);
}