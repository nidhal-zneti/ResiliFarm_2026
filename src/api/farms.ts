import type { Farm } from '@/types';

import { ApiError, apiRequest } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockFarm } from './mock';

/** Farm information. */

/** Shape returned by GET /farms (list of farms the user may see). */
export type ApiFarmSummary = {
  id: number;
  name: string;
  region_id: number;
  region: string;
};

export async function getFarms(): Promise<ApiFarmSummary[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [{ id: mockFarm.id, name: mockFarm.name, region_id: mockFarm.regionId, region: mockFarm.location }];
  }
  return apiRequest<ApiFarmSummary[]>('/farms');
}

export async function getMyFarm(): Promise<Farm> {
  if (USE_MOCK) {
    await mockDelay();
    return mockFarm;
  }
  const farms = await apiRequest<ApiFarmSummary[]>('/farms');
  const first = farms[0];
  if (!first) throw new ApiError('farmNotFound', 404);
  // GET /farms does not yet return crop, area or irrigation method. TODO: extend
  // the backend, then fill these in instead of leaving them blank.
  return {
    id: first.id,
    name: first.name,
    regionId: first.region_id,
    location: first.region,
    crop: '',
    areaHa: 0,
    irrigationMethod: '',
  };
}
