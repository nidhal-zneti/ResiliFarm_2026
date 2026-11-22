import type { IrrigationAdvice } from '@/types';

import { apiRequest } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockIrrigation } from './mock';

/** Irrigation recommendation for today, calculated by the backend. */

/** Subset of GET /regions/{id}/weather used to drive the recommendation. */
type ApiWeather = {
  updated_at?: string;
  days: Array<{ et0_mm: number; rain_mm: number }>;
};

/** Shape returned by POST /recommendations/irrigation. */
type ApiIrrigation = {
  net_mm: number;
  water_m3: number;
  is_estimated: boolean;
};

export async function getIrrigationAdvice(regionId: number): Promise<IrrigationAdvice> {
  if (USE_MOCK) {
    await mockDelay();
    return mockIrrigation;
  }

  // Real regional weather (ET0 + rainfall for today) drives the calculation.
  const weather = await apiRequest<ApiWeather>(`/regions/${regionId}/weather`);
  const today = weather.days?.[0];
  if (!today) return { status: 'unavailable' };

  // The backend requires every FarmInput field. Crop/area are not exposed for
  // farmers yet, so the platform defaults are used; irrigation "needed" depends
  // on the crop coefficient and the real ET0/rain only.
  const result = await apiRequest<ApiIrrigation>('/recommendations/irrigation', {
    method: 'POST',
    body: {
      region_id: regionId,
      crop: 'olive',
      stage: 'mid',
      area_ha: 1,
      efficiency: 0.85,
      et0: Math.min(Math.max(today.et0_mm, 0), 30),
      rainfall: Math.min(Math.max(today.rain_mm, 0), 500),
      head_m: 30,
      pump_efficiency: 0.65,
      solar_kw: 12,
      sun_hours: 5.5,
    },
  });

  // The volume depends on the field area, which the app does not know yet, so it
  // is deliberately not surfaced — only the yes/no recommendation is shown.
  return {
    status: result.net_mm > 0.5 ? 'needed' : 'not_needed',
    updatedAt: weather.updated_at,
  };
}
