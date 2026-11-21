import type { WaterAvailability } from '@/types';

import { ApiError } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockWater } from './mock';

/**
 * Water availability (tank / reservoir level).
 *
 * Returns `{ available: false }` when there is no sensor and no manual figure —
 * the UI must show "no data" rather than inventing a level.
 */

const NO_DATA: WaterAvailability = {
  available: false,
  source: 'none',
  note: 'No water data available yet.',
};

export async function getWaterAvailability(farmId: number): Promise<WaterAvailability> {
  if (USE_MOCK) {
    await mockDelay();
    return mockWater;
  }
  void farmId;
  // TODO: no sensor/telemetry endpoint yet. Once it exists, map it here and
  // return NO_DATA when the sensor is missing or silent.
  void NO_DATA;
  throw new ApiError('notAvailable', 501);
}

export async function setManualWaterLevel(
  farmId: number,
  levelPct: number,
): Promise<WaterAvailability> {
  if (USE_MOCK) {
    await mockDelay();
    return { ...mockWater, available: true, source: 'manual', levelPct, note: 'Level entered by you.' };
  }
  void farmId;
  void levelPct;
  throw new ApiError('notAvailable', 501);
}
