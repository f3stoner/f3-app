// utils/search.js

export function normalizeSearchText(value = "") {
    return String(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

export function doesSearchMatch(value, query) {
    const normalizedValue = normalizeSearchText(value);
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) return true;

    if (normalizedValue.includes(normalizedQuery)) {
        return true;
    }

    if (normalizedValue.length < 5 || normalizedQuery.length < 5) {
        return false;
    }

    return levenshteinDistance(
        normalizedValue,
        normalizedQuery
    ) <= 2;
}

export function levenshteinDistance(a = "", b = "") {
    const matrix = Array.from(
        { length: b.length + 1 },
        (_, i) => [i]
    );

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}