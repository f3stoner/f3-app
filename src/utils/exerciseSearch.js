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
        .filter(exercise => {
            const name = String(exercise.name || "").toLowerCase();
            const normalizedName = String(exercise.normalizedName || "").toLowerCase();

            const aliasMatch = (exercise.aliases || []).some(alias =>
                String(alias).toLowerCase().includes(trimmedQuery)
            );

            return (
                name.includes(trimmedQuery) ||
                normalizedName.includes(trimmedQuery) ||
                aliasMatch
            );
        })
        .sort((a, b) => (b.sourceCount || 0) - (a.sourceCount || 0))
        .slice(0, limit);
}