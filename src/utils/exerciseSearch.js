export function searchExercises(exercises, query, options = {}) {
    const trimmedQuery = String(query || "").trim().toLowerCase();

    if (trimmedQuery.length < 2) return [];

    const limit = options.limit || 8;

    return (exercises || [])
        .filter(exercise => {
            const name = String(exercise.name || "").toLowerCase();
            const normalizedName = String(exercise.normalizedName || "").toLowerCase();

            return (
                name.includes(trimmedQuery) ||
                normalizedName.includes(trimmedQuery)
            );
        })
        .slice(0, limit);
}