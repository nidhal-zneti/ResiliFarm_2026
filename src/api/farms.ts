import type { Farm } from '@/types';

import { apiRequest } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockFarm } from './mock';

/** Farm information. */

/** Shape returned by GET /farms (list of farms the user may see). */
type ApiFarmSummary = {
  id: number;
  name: string;
  region_id: number;
  region: string;
};

export async function getFarms(): Promise<ApiFarmSummary[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [{ id: mockFarm.id, name: mockFarm.name, region_id: 1, region: mockFarm.location }];
  }
  return apiRequest<ApiFarmSummary[]>('/farms');
}

export async function getMyFarm(): Promise<Farm> {
  if (USE_MOCK) {
    await mockDelay();
    return mockFarm;
  }
  // GET /farms exists but does not yet return crop, area, soil or irrigation
  // method. TODO: extend the backend, then map the full farm details here.
  const farms = await apiRequest<ApiFarmSummary[]>('/farms');
  const first = farms[0];
  if (!first) throw new Error('farmNotFound');
  return {
    id: first.id,
    name: first.name,
    location: first.region,
    crop: '',
    areaHa: 0,
    irrigationMethod: '',
  };
}
