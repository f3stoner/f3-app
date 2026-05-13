export function ggetWeatherCacheKey(aoId, targetDateTime) {
    return `${aoId}__${targetDateTime}`;
}