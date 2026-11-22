import type { Alert, AlertTone, AppNotification } from '@/types';

import { apiRequest } from './client';
import { USE_MOCK } from './config';
import { getMyFarm } from './farms';
import { mockAlerts, mockDelay, mockNotifications } from './mock';

/** Region alerts, mapped into plain-language notifications. */

/** Shape returned by GET /alerts?region_id=. */
type ApiAlert = {
  id: number;
  region_id: number;
  is_simulated: boolean;
  source?: string;
  payload?: Record<string, unknown> | null;
  created_at?: string;
};

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function alertTone(alert: ApiAlert): AlertTone {
  const severity = String(alert.payload?.severity ?? '').toLowerCase();
  if (severity === 'high' || severity === 'critical') return 'danger';
  if (severity === 'medium' || severity === 'moderate') return 'warning';
  if (severity === 'low') return 'info';
  return 'warning';
}

function alertTitle(alert: ApiAlert): string {
  const payload = alert.payload ?? {};
  return (
    text(payload.title) ??
    text(payload.message) ??
    text(payload.code) ??
    text(alert.source) ??
    'Alert'
  );
}

function alertMessage(alert: ApiAlert): string | undefined {
  const payload = alert.payload ?? {};
  const message = text(payload.message) ?? text(payload.detail);
  return message && message !== alertTitle(alert) ? message : undefined;
}

async function fetchAlerts(): Promise<ApiAlert[]> {
  const farm = await getMyFarm();
  return apiRequest<ApiAlert[]>(`/alerts?region_id=${farm.regionId}`);
}

/** Compact alerts for the Home list. */
export async function getAlerts(): Promise<Alert[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mockAlerts;
  }
  const raw = await fetchAlerts();
  return raw.map((alert) => ({
    id: String(alert.id),
    tone: alertTone(alert),
    title: alertTitle(alert),
    message: alertMessage(alert),
  }));
}

/** Full notifications for the bell modal. */
export async function getNotifications(): Promise<AppNotification[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mockNotifications;
  }
  const raw = await fetchAlerts();
  return raw.map((alert) => ({
    id: String(alert.id),
    tone: alertTone(alert),
    title: alertTitle(alert),
    message: alertMessage(alert) ?? '',
    date: alert.created_at ?? new Date().toISOString(),
    read: false,
  }));
}
