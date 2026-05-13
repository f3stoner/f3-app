import { supabase } from "./supabaseClient.js";

export async function getAoWeather(aoId, targetDateTime) {
    if (!aoId) {
        return {
            weatherUnavailable: true,
            reason: "Missing AO",
        };
    }

    try {
        const { data, error } = await supabase.functions.invoke("get-ao-weather", {
            body: {
                aoId,
                targetDateTime,
            },
        });

        if (error) {
            console.error("Weather fetch failed.", error);

            return {
                weatherUnavailable: true,
                reason: "Weather unavailable",
            };
        }

        return data;
    } catch (err) {
        console.error("Weather invoke exception", err);

        return {
            weatherUnavailable: true,
            reason: "Weather unavailable",
        };
    }
}