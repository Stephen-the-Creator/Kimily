// Live weather for the Dynamic Island pill via Rust backend Open-Meteo (free, no API key, cached for 30 minutes).
import { invoke } from "@tauri-apps/api/core";

export interface IslandWeather {
  query: string;
  place: string;
  temp: number;
  code: number;
  icon: string;
  fetchedAt: number;
}

export const WEATHER_ENABLED_KEY = "island.weather.enabled";
export const WEATHER_CITY_KEY = "island.weather.city";
const CACHE_KEY = "island.weather.cache";
const CACHE_TTL_MS = 30 * 60 * 1000;

export function weatherEnabled(): boolean {
  try {
    return localStorage.getItem(WEATHER_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function weatherCity(): string {
  try {
    return (localStorage.getItem(WEATHER_CITY_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function defaultCity(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const city = tz.split("/").pop()?.replace(/_/g, " ").trim();
    return city || "Berlin";
  } catch {
    return "Berlin";
  }
}

export function weatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "❄️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌤️";
}

function readCache(query: string): IslandWeather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IslandWeather;
    if (
      parsed.query.toLowerCase() === query.toLowerCase() &&
      Date.now() - parsed.fetchedAt < CACHE_TTL_MS &&
      typeof parsed.temp === "number"
    ) {
      return parsed;
    }
  } catch {}
  return null;
}

function writeCache(data: IslandWeather) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

export function clearWeatherCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export async function fetchIslandWeather(force = false): Promise<IslandWeather | null> {
  if (!weatherEnabled()) return null;
  const query = weatherCity() || defaultCity();
  if (!force) {
    const cached = readCache(query);
    if (cached) return cached;
  }
  const dto = await invoke<{ place: string; temp: number; code: number } | null>("island_weather", {
    place: weatherCity() || null,
  });
  if (!dto) return null;
  const result: IslandWeather = {
    query,
    place: dto.place,
    temp: dto.temp,
    code: dto.code,
    icon: weatherIcon(dto.code),
    fetchedAt: Date.now(),
  };
  writeCache(result);
  return result;
}
