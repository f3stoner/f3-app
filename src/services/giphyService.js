// src/services/giphyService.js

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs";
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

function getGiphyApiKey() {
    if (!GIPHY_API_KEY) {
        throw new Error("GIPHY_API_KEY is not configured.");
    }

    return GIPHY_API_KEY;
}

const giphyCache = new Map();

function getCacheKey(path, query = "") {
    return `${path}:${String(query || "").trim().toLowerCase()}`;
}

function getCachedResults(key) {
    return giphyCache.get(key) || null;
}

function cacheResults(key, results) {
    giphyCache.set(key, results);
}

function mapGiphyResult(item) {
    const images = item.images || {};

    const display =
        images.fixed_width ||
        images.downsized ||
        images.original;

    const preview =
        images.fixed_width_small ||
        images.fixed_width ||
        images.original;

    const still =
        images.fixed_width_still ||
        images.original_still ||
        images.original;

    return {
        id: item.id,
        title: item.title || "GIF",
        url: display?.webp || display?.url || "",
        previewUrl: preview?.webp || preview?.url || "",
        stillUrl: still?.url || "",
    };
}

async function requestGiphy(path, params = {}) {
    const cacheKey = getCacheKey(path, params.query);
    const cachedResults = getCachedResults(cacheKey);

    if (cachedResults) return cachedResults;

    const url = new URL(`${GIPHY_API_BASE}/${path}`);

    url.searchParams.set("api_key", getGiphyApiKey());
    url.searchParams.set("limit", String(params.limit || 18));
    url.searchParams.set("rating", "pg");

    if (params.query) {
        url.searchParams.set("q", params.query);
    }

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`GIPHY request failed: ${response.status}`);
    }

    const payload = await response.json();

    const results = (payload.data || [])
        .map(mapGiphyResult)
        .filter(item => item.url);

    cacheResults(cacheKey, results);

    return results;
}

export function loadTrendingGifs() {
    return requestGiphy("trending");
}

export function searchGifs(query) {
    const cleanQuery = String(query || "").trim();

    if (!cleanQuery) {
        return loadTrendingGifs();
    }

    return requestGiphy("search", {
        query: cleanQuery,
    });
}