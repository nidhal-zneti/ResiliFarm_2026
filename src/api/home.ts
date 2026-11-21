import type { HomeSummary } from '@/types';

import { USE_MOCK } from './config';
import { mockDelay, mockHomeSummary } from './mock';

/**
 * Aggregated payload for the Home screen.
 *
 * One call keeps the most important screen fast and simple. While the farmer
 * endpoints are being built it returns clearly-labelled mock data; once ready it
 * should compose the individual service calls (farms, weather, irrigation,
 * water, alerts) so the screen code does not change.
 */
export async function getHomeSummary(): Promise<HomeSummary> {
  if (USE_MOCK) {
    await mockDelay();
    return mockHomeSummary;
  }
  // TODO: compose from getMyFarm(), getIrrigationAdvice(), getWeather(),
  // getWaterAvailability() and getNotifications() once those endpoints exist.
  throw new Error('HomeSummary endpoint not available yet');
}
