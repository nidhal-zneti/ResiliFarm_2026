import type { Weather } from '@/types';

import { ApiError } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockWeather } from './mock';

/** Weather now + short forecast. */

export async function getWeather(regionId: number): Promise<Weather> {
  if (USE_MOCK) {
    await mockDelay();
    return mockWeather;
  }
  void regionId;
  // TODO: map GET /regions/{id}/weather (Open-Meteo payload) into the simplified
  // `Weather` shape. The raw response contains fields a farmer should not see.
  throw new ApiError('notAvailable', 501);
}
