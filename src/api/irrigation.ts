import type { IrrigationAdvice } from '@/types';

import { ApiError } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockIrrigation } from './mock';

/** Irrigation recommendation for today. */

export async function getIrrigationAdvice(farmId: number): Promise<IrrigationAdvice> {
  if (USE_MOCK) {
    await mockDelay();
    return mockIrrigation;
  }
  void farmId;
  // TODO: the backend exposes POST /recommendations/irrigation but it returns
  // engineer-level values (ET0, Kc, mm). A farmer-friendly summary endpoint
  // (status + volume + plain-language reason) still needs to be added.
  throw new ApiError('notAvailable', 501);
}
