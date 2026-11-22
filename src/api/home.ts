import type { HomeSummary } from '@/types';

import { USE_MOCK } from './config';
import { getMyFarm } from './farms';
import { getIrrigationAdvice } from './irrigation';
import { mockDelay, mockHomeSummary } from './mock';
import { getAlerts } from './notifications';
import { getProfile } from './profile';
import { getWaterAvailability } from './water';
import { getWeather } from './weather';

/**
 * Aggregated payload for the Home screen.
 *
 * One call keeps the most important screen fast and simple. It composes the
 * individual services (profile, farm, weather, irrigation, water, alerts) so the
 * screen code stays unchanged whether the data is real or demo.
 */
export async function getHomeSummary(): Promise<HomeSummary> {
  if (USE_MOCK) {
    await mockDelay();
    return mockHomeSummary;
  }

  const [user, farm] = await Promise.all([getProfile(), getMyFarm()]);
  const [weather, irrigation, water, alerts] = await Promise.all([
    getWeather(farm.regionId),
    getIrrigationAdvice(farm.regionId),
    getWaterAvailability(farm.id),
    getAlerts(),
  ]);

  return { user, farm, irrigation, weather, water, alerts };
}
