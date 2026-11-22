import type { ScheduleEntry } from '@/types';

import { USE_MOCK } from './config';
import { mockDelay, mockSchedule } from './mock';

/** Irrigation schedule: past (done) and upcoming (planned). */

export async function getSchedule(farmId: number): Promise<ScheduleEntry[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mockSchedule;
  }
  void farmId;
  // The backend stores irrigation records but exposes no schedule endpoint yet.
  return [];
}
