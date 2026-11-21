import type { AppNotification } from '@/types';

import { ApiError } from './client';
import { USE_MOCK } from './config';
import { mockDelay, mockNotifications } from './mock';

/** Notifications shown from the Home screen bell icon. */

export async function getNotifications(): Promise<AppNotification[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mockNotifications;
  }
  // TODO: GET /alerts returns raw region alerts. Map them into plain-language
  // notifications (title + explanation + suggested action) here.
  throw new ApiError('notAvailable', 501);
}
