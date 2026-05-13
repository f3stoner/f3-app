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
  let forecastDate = targetDateTime.slice(0, 10);
  let forecastHour = Number(targetDateTime.slice(11, 13));

  const minute = Number(targetDateTime.slice(14, 16));

  if (Number.isNaN(forecastHour)) {
    forecastHour = fallback.getHours();
  }

  if (!Number.isNaN(minute) && minute >= 30) {
    forecastHour += 1;
  }

  if (forecastHour >= 24) {
    const rollover = new Date(`${forecastDate}T12:00:00`);
    rollover.setDate(rollover.getDate() + 1);
    forecastDate = rollover.toISOString().slice(0, 10);
    forecastHour = 0;
  }
  return {
    forecastDate,
    forecastHour,
    targetHourKey: `${forecastDate}T${String(forecastHour).padStart(2, "0")}`,
  };
}

function getCacheExpiration(forecastDate: string) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isToday = forecastDate === today;
  const minutes = isToday ? 30 : 120;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function findHourlyIndex(hourlyTimes: string[], targetHourKey: string) {
  if (!hourlyTimes?.length) return 0;

  const exactIndex = hourlyTimes.findIndex(time =>
    time.startsWith(targetHourKey)
  );

  return exactIndex >= 0 ? exactIndex : 0;
}

function normalizeWeather(raw: any, ao: AoRecord, targetHourKey: string) {
  const hourly = raw.hourly ?? {};
  const daily = raw.daily ?? {};
  const current = raw.current ?? {};

  const hourlyIndex = findHourlyIndex(hourly.time ?? [], targetHourKey);

  const weatherCode =
    hourly.weather_code?.[hourlyIndex] ??
    current.weather_code ??
    null;

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

  return {
    aoId: ao.id,
    aoName: ao.name,
    locationLabel: ao.weather_location_label ?? ao.name,
    targetTime: hourly.time?.[hourlyIndex] ?? null,
    targetHourKey,
    temp: roundNumber(hourly.temperature_2m?.[hourlyIndex] ?? current.temperature_2m),
    feelsLike: roundNumber(hourly.apparent_temperature?.[hourlyIndex] ?? current.apparent_temperature),
    condition: codeInfo.condition,
    weatherCode,
    icon: codeInfo.icon,
    precipChance: roundNumber(hourly.precipitation_probability?.[hourlyIndex]),
    windMph: roundNumber(hourly.wind_speed_10m?.[hourlyIndex] ?? current.wind_speed_10m),
    humidity: roundNumber(hourly.relative_humidity_2m?.[hourlyIndex] ?? current.relative_humidity_2m),
    severeAlert: codeInfo.severe,
    alertSummary: codeInfo.severe ? codeInfo.condition : null,
    sunrise: daily.sunrise?.[0] ?? null,
    sunset: daily.sunset?.[0] ?? null,
    source: PROVIDER,
    fetchedAt: new Date().toISOString(),
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
      forecast_days: "7",
    });

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {
      return jsonResponse({ error: "Weather provider request failed" }, 502);
    }

    const rawWeather = await weatherResponse.json();
    const normalizedWeather = normalizeWeather(rawWeather, ao, targetHourKey);
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
          raw_weather: rawWeather,
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
      error: "Unexpected weather function error",
    }, 500);
  }
});