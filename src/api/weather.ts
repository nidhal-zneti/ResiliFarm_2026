import type { Weather, WeatherDay } from '@/types';

import { apiRequest } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockWeather } from './mock';

/** Weather now + short forecast, from the real regional weather model. */

/** Shape returned by GET /regions/{id}/weather (Open-Meteo, normalised by the backend). */
type ApiWeather = {
  source: string;
  updated_at?: string;
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    rain: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  days: Array<{
    date: string;
    et0_mm: number;
    temperature_c: number;
    rain_mm: number;
    radiation_mj_m2: number;
    humidity_pct: number;
    wind_kmh: number;
  }>;
};

/** WMO weather code (current conditions) → the app's simple condition codes. */
export function wmoToCondition(code: number): string {
  if (code === 0) return 'sunny';
  if (code === 1 || code === 2) return 'partlyCloudy';
  if (code === 3 || code === 45 || code === 48) return 'cloudy';
  if (code === 61 || code === 80 || (code >= 51 && code <= 57)) return 'lightRain';
  if (code >= 95) return 'storm';
  if ((code >= 63 && code <= 67) || code === 81 || code === 82) return 'rain';
  if (code >= 71 && code <= 86) return 'rain'; // snow/showers shown as precipitation
  return 'cloudy';
}

/**
 * The forecast endpoint supplies no daily weather code, so the icon is derived
 * from the day's rain and radiation — a coarse, honest summary, not a reading.
 */
function dayCondition(rainMm: number, radiation: number): string {
  if (rainMm >= 2) return 'rain';
  if (rainMm > 0) return 'lightRain';
  if (radiation < 10) return 'cloudy';
  return 'sunny';
}

function toWeather(regionId: number, data: ApiWeather): Weather {
  void regionId;
  const current = data.current;
  const now = {
    temperatureC: Math.round(current.temperature_2m),
    condition: wmoToCondition(current.weather_code),
    rainfallMm: Math.round((current.rain ?? current.precipitation ?? 0) * 10) / 10,
    humidityPct: Math.round(current.relative_humidity_2m),
    windKph: Math.round(current.wind_speed_10m),
  };
  const days: WeatherDay[] = (data.days ?? []).map((day) => ({
    date: day.date,
    condition: dayCondition(day.rain_mm, day.radiation_mj_m2),
    tempMaxC: Math.round(day.temperature_c),
    rainMm: Math.round(day.rain_mm * 10) / 10,
  }));
  return { now, days, source: data.source };
}

export async function getWeather(regionId: number): Promise<Weather> {
  if (USE_MOCK) {
    await mockDelay();
    return mockWeather;
  }
  const data = await apiRequest<ApiWeather>(`/regions/${regionId}/weather`);
  return toWeather(regionId, data);
}
