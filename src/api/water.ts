import type { WaterAvailability } from '@/types';

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
  // No tank/reservoir telemetry endpoint exists yet. Report honestly that there
  // is no reading rather than inventing one.
  return NO_DATA;
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
  // There is no endpoint to persist a manual level yet, so nothing is stored.
  return NO_DATA;
}
