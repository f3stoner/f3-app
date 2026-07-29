export function getWeatherCacheKey(siteId, targetDateTime) {
    return `${siteId}__${targetDateTime}`;
}