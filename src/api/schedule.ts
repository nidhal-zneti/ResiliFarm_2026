import type { ScheduleEntry } from '@/types';

import { USE_MOCK } from './config';
import { mockDelay, mockSchedule } from './mock';
import { apiRequest } from './client';

type ApiScheduleDay = {
  date: string;
  needed: boolean;
  net_mm: number;
  water_m3: number;
  rain_mm: number;
  et0_mm: number;
  reason: string;
};

type ApiSchedule = {
  source: string;
  days: ApiScheduleDay[];
};

export type IrrigationScheduleDay = {
  date: string;
  needed: boolean;
  netMm: number;
  waterM3: number;
  rainMm: number;
  et0Mm: number;
  reason: string;
};

export type IrrigationSchedule = {
  source: string;
  days: IrrigationScheduleDay[];
};

export async function getIrrigationSchedule(farmId: number): Promise<IrrigationSchedule> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      source: 'Local demo forecast',
      days: mockSchedule.map((entry) => ({
        date: entry.date,
        needed: entry.status === 'planned',
        netMm: entry.status === 'planned' ? 12 : 2,
        waterM3: entry.waterM3 ?? 0,
        rainMm: entry.status === 'planned' ? 0 : 5,
        et0Mm: 5,
        reason: entry.status === 'planned' ? 'forecastDeficit' : 'rainCoversNeeds',
      })),
    };
  }
  const result = await apiRequest<ApiSchedule>(`/farms/${farmId}/irrigation-schedule`);
  return {
    source: result.source,
    days: result.days.map((day) => ({
      date: day.date,
      needed: day.needed,
      netMm: day.net_mm,
      waterM3: day.water_m3,
      rainMm: day.rain_mm,
      et0Mm: day.et0_mm,
      reason: day.reason,
    })),
  };
}

/** Irrigation schedule: past (done) and upcoming (planned). */

export async function getSchedule(farmId: number): Promise<ScheduleEntry[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mockSchedule;
  }
  const result = await apiRequest<ApiSchedule>(`/farms/${farmId}/irrigation-schedule`);
  return result.days.map((day) => ({
    id: day.date,
    date: day.date,
    status: day.needed ? 'planned' : 'done',
    waterM3: day.needed ? day.water_m3 : undefined,
  }));
}
