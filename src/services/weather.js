import { supabase } from "./supabaseClient.js";

export async function getSiteWeather(siteId, targetDateTime) {
    if (!siteId) {
        return {
            weatherUnavailable: true,
            reason: "Missing Site",
        };
    }

    try {
        const { data, error } = await supabase.functions.invoke(
            "get-ao-weather",
            {
                body: {
                    siteId,
                    targetDateTime,
                },
            }
        );

        if (error) {
            console.error("Weather fetch failed.", error);

            return {
                weatherUnavailable: true,
                reason: "Weather unavailable",
            };
        }

        return data;
    } catch (err) {
        console.error("Weather invoke exception.", err);

        return {
            weatherUnavailable: true,
            reason: "Weather unavailable",
        };
    }
}