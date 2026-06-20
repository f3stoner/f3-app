import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVIDER = "open-meteo";

type WeatherPayload = {
  aoId?: string;
  targetDateTime?: string;
};

type AoRecord = {
  id: string;
  region_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  weather_location_label: string | null;
  weather_enabled: boolean;
};

const WEATHER_CODE_MAP: Record<number, { condition: string; icon: string; severe: boolean }> = {
  0: { condition: "Clear", icon: "clear", severe: false },
  1: { condition: "Mostly clear", icon: "mostly-clear", severe: false },
  2: { condition: "Partly cloudy", icon: "partly-cloudy", severe: false },
  3: { condition: "Overcast", icon: "cloudy", severe: false },
  45: { condition: "Fog", icon: "fog", severe: false },
  48: { condition: "Freezing fog", icon: "fog", severe: true },
  51: { condition: "Light drizzle", icon: "drizzle", severe: false },
  53: { condition: "Drizzle", icon: "drizzle", severe: false },
  55: { condition: "Heavy drizzle", icon: "drizzle", severe: false },
  56: { condition: "Freezing drizzle", icon: "freezing-rain", severe: true },
  57: { condition: "Freezing drizzle", icon: "freezing-rain", severe: true },
  61: { condition: "Light rain", icon: "rain", severe: false },
  63: { condition: "Rain", icon: "rain", severe: false },
  65: { condition: "Heavy rain", icon: "rain", severe: true },
  66: { condition: "Freezing rain", icon: "freezing-rain", severe: true },
  67: { condition: "Freezing rain", icon: "freezing-rain", severe: true },
  71: { condition: "Light snow", icon: "snow", severe: false },
  73: { condition: "Snow", icon: "snow", severe: false },
  75: { condition: "Heavy snow", icon: "snow", severe: true },
  77: { condition: "Snow grains", icon: "snow", severe: false },
  80: { condition: "Rain showers", icon: "rain", severe: false },
  81: { condition: "Rain showers", icon: "rain", severe: false },
  82: { condition: "Violent rain showers", icon: "rain", severe: true },
  85: { condition: "Snow showers", icon: "snow", severe: false },
  86: { condition: "Heavy snow showers", icon: "snow", severe: true },
  95: { condition: "Thunderstorm", icon: "storm", severe: true },
  96: { condition: "Thunderstorm with hail", icon: "storm", severe: true },
  99: { condition: "Thunderstorm with hail", icon: "storm", severe: true },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function roundNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value);
}

function getTargetParts(targetDateTime?: string) {
  const fallback = new Date();

  if (!targetDateTime) {
    const fallbackDate = fallback.toISOString().slice(0, 10);
    const fallbackHour = fallback.getHours();

    return {
      forecastDate: fallbackDate,
      forecastHour: fallbackHour,
      targetHourKey: `${fallbackDate}T${String(fallbackHour).padStart(2, "0")}`,
    };
  }

  // Expected format: local AO time, e.g. "2026-06-20T05:30:00"
  // Do NOT send "2026-06-20T10:30:00.000Z" from the frontend.
  const forecastDate = targetDateTime.slice(0, 10);
  const forecastHour = Number(targetDateTime.slice(11, 13));

  if (!forecastDate || Number.isNaN(forecastHour)) {
    const fallbackDate = fallback.toISOString().slice(0, 10);
    const fallbackHour = fallback.getHours();

    return {
      forecastDate: fallbackDate,
      forecastHour: fallbackHour,
      targetHourKey: `${fallbackDate}T${String(fallbackHour).padStart(2, "0")}`,
    };
  }

  return {
    forecastDate,
    forecastHour,
    targetHourKey: `${forecastDate}T${String(forecastHour).padStart(2, "0")}`,
  };
}

function isForecastTooFarOut(forecastDate: string) {
  const today = new Date();
  const target = new Date(`${forecastDate}T12:00:00`);

  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return diffDays > 6;
}

function getCacheExpiration(forecastDate: string) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isToday = forecastDate === today;
  const minutes = isToday ? 30 : 120;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function findHourlyIndex(hourlyTimes: string[], targetHourKey: string) {
  if (!hourlyTimes?.length) return -1;

  return hourlyTimes.findIndex(time =>
    time.startsWith(targetHourKey)
  );
}

function normalizeWeather(raw: any, ao: AoRecord, targetHourKey: string) {
  const hourly = raw.hourly ?? {};
  const daily = raw.daily ?? {};

  const hourlyIndex = findHourlyIndex(hourly.time ?? [], targetHourKey);
  const forecastDate = targetHourKey.slice(0, 10);
  const dailyIndex = Array.isArray(daily.time)
    ? daily.time.findIndex((date: string) => date === forecastDate)
    : -1;

  if (hourlyIndex < 0) {
    return {
      weatherUnavailable: true,
      reason: "Forecast not available yet",
      targetHourKey,
      availableSample: hourly.time?.slice?.(0, 5) ?? [],
      source: PROVIDER,
      fetchedAt: new Date().toISOString(),
    };
  }

  const weatherCode = hourly.weather_code?.[hourlyIndex] ?? null;

  const codeInfo =
    typeof weatherCode === "number"
      ? WEATHER_CODE_MAP[weatherCode] ?? {
          condition: "Unknown",
          icon: "unknown",
          severe: false,
        }
      : {
          condition: "Unknown",
          icon: "unknown",
          severe: false,
        };

        console.log("HOURLY WEATHER SELECTION", {
          targetHourKey,
          hourlyIndex,
          selectedTime: hourly.time?.[hourlyIndex],
          weatherCode: hourly.weather_code?.[hourlyIndex],
          weatherCondition: codeInfo.condition,
          precipChance: hourly.precipitation_probability?.[hourlyIndex],
          temp: hourly.temperature_2m?.[hourlyIndex],
          windMph: hourly.wind_speed_10m?.[hourlyIndex],
          nearbyHours: hourly.time
            ?.slice(Math.max(0, hourlyIndex - 2), hourlyIndex + 3)
            ?.map((time: string, offset: number) => {
              const index = Math.max(0, hourlyIndex - 2) + offset;
        
              return {
                time,
                weatherCode: hourly.weather_code?.[index],
                precipChance: hourly.precipitation_probability?.[index],
                temp: hourly.temperature_2m?.[index],
              };
            }),
        });

  return {
    aoId: ao.id,
    aoName: ao.name,
    locationLabel: ao.weather_location_label ?? ao.name,

    targetTime: hourly.time?.[hourlyIndex] ?? null,
    targetHourKey,

    temp: roundNumber(hourly.temperature_2m?.[hourlyIndex]),
    feelsLike: roundNumber(hourly.apparent_temperature?.[hourlyIndex]),
    condition: codeInfo.condition,
    weatherCode,
    icon: codeInfo.icon,
    precipChance: roundNumber(hourly.precipitation_probability?.[hourlyIndex]),
    windMph: roundNumber(hourly.wind_speed_10m?.[hourlyIndex]),
    humidity: roundNumber(hourly.relative_humidity_2m?.[hourlyIndex]),

    severeAlert: codeInfo.severe,
    alertSummary: codeInfo.severe ? codeInfo.condition : null,

    sunrise: dailyIndex >= 0 ? daily.sunrise?.[dailyIndex] ?? null : null,
    sunset: dailyIndex >= 0 ? daily.sunset?.[dailyIndex] ?? null : null,

    source: PROVIDER,
    fetchedAt: new Date().toISOString(),

    selectionDebug: {
      hourlyIndex,
      selectedHourlyTime: hourly.time?.[hourlyIndex] ?? null,
      selectedWeatherCode: weatherCode,
      selectedPrecipChance: hourly.precipitation_probability?.[hourlyIndex] ?? null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { aoId, targetDateTime } = (await req.json()) as WeatherPayload;

    if (!aoId) {
      return jsonResponse({ error: "Missing aoId" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase function secrets" }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { forecastDate, forecastHour, targetHourKey } = getTargetParts(targetDateTime);

    if (isForecastTooFarOut(forecastDate)) {
      return jsonResponse({
        weatherUnavailable: true,
        reason: "Forecast not available yet",
        targetHourKey,
        source: PROVIDER,
        fetchedAt: new Date().toISOString(),
      });
    }

    const { data: ao, error: aoError } = await supabase
      .from("aos")
      .select("id, region_id, name, latitude, longitude, weather_location_label, weather_enabled")
      .eq("id", aoId)
      .single<AoRecord>();

    if (aoError || !ao) {
      return jsonResponse({ error: "AO not found" }, 404);
    }

    if (!ao.weather_enabled) {
      return jsonResponse({
        weatherUnavailable: true,
        reason: "Weather disabled for this AO",
      });
    }

    if (ao.latitude == null || ao.longitude == null) {
      return jsonResponse({
        weatherUnavailable: true,
        reason: "AO is missing coordinates",
      });
    }

    const { data: cached } = await supabase
      .from("ao_weather_cache")
      .select("normalized_weather, expires_at")
      .eq("ao_id", aoId)
      .eq("forecast_date", forecastDate)
      .eq("forecast_hour", forecastHour)
      .maybeSingle();

      if (cached && new Date(cached.expires_at) > new Date()) {
        console.log("WEATHER CACHE HIT", {
          aoId,
          targetDateTime,
          forecastDate,
          forecastHour,
          targetHourKey,
          cachedWeather: cached.normalized_weather,
        });
      
        return jsonResponse({
          ...cached.normalized_weather,
          cached: true,
        });
      }

    if (cached && new Date(cached.expires_at) > new Date()) {
      return jsonResponse({
        ...cached.normalized_weather,
        cached: true,
      });
    }

    const params = new URLSearchParams({
      latitude: String(ao.latitude),
      longitude: String(ao.longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      hourly:
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m",
      daily: "sunrise,sunset",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "inch",
      timezone: "auto",
      forecast_days: "10",
    });

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    console.log("Open-Meteo URL", weatherUrl);
    
    const weatherResponse = await fetch(weatherUrl);
    
    if (!weatherResponse.ok) {
      const errorText = await weatherResponse.text();
    
      console.error("Weather provider request failed", {
        status: weatherResponse.status,
        statusText: weatherResponse.statusText,
        errorText,
        weatherUrl,
      });
    
      return jsonResponse({
        weatherUnavailable: true,
        reason: "Weather provider request failed",
        providerStatus: weatherResponse.status,
        providerError: errorText,
        source: PROVIDER,
        fetchedAt: new Date().toISOString(),
      });
    }

    const rawWeather = await weatherResponse.json();
    const normalizedWeather = normalizeWeather(rawWeather, ao, targetHourKey);

    console.log("WEATHER DEBUG", {
      aoName: ao.name,
      targetDateTime,
      targetHourKey,
      forecastDate,
      forecastHour,
      normalizedWeather,
    });

    const expiresAt = getCacheExpiration(forecastDate);

    const { error: cacheError } = await supabase
      .from("ao_weather_cache")
      .upsert(
        {
          region_id: ao.region_id,
          ao_id: ao.id,
          forecast_date: forecastDate,
          forecast_hour: forecastHour,
          provider: PROVIDER,
          normalized_weather: normalizedWeather,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        {
          onConflict: "ao_id,forecast_date,forecast_hour",
        },
      );

    if (cacheError) {
      console.error("Weather cache upsert failed", cacheError);
    }

    return jsonResponse({
      ...normalizedWeather,
      cached: false,
    });
  } catch (error) {
    console.error("get-ao-weather error", error);

    return jsonResponse({
      weatherUnavailable: true,
      reason: "Unexpected weather function error",
      source: PROVIDER,
      fetchedAt: new Date().toISOString(),
    });  }
});