/**
 * ⚠️  MOCK DATA — NOT REAL MEASUREMENTS  ⚠️
 *
 * This folder exists only while the farmer API endpoints are being built.
 * The values below are illustrative examples. They are surfaced in the UI with
 * a visible "Demo data" badge and MUST NOT be presented as live readings.
 *
 * To go live: implement the endpoints in `src/api/*.ts` (they are already
 * written against the real contract) and set EXPO_PUBLIC_USE_MOCK=false.
 * Nothing else in the app needs to change.
 */

import type {
  Alert,
  AppNotification,
  Farm,
  HomeSummary,
  IrrigationAdvice,
  ScheduleEntry,
  User,
  WaterAvailability,
  Weather,
} from '@/types';

/**
 * Small artificial delay so loading states are visible while running on mock
 * data. Not used once the real API is connected.
 */
export function mockDelay(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ISO date string for `offset` days from today. Keeps the demo looking fresh. */
function dayFromNow(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export const mockUser: User = {
  id: 1,
  fullName: 'Ahmed Ben Salah',
  email: 'ahmed.demo@resilifarm.tn',
  role: 'FARMER',
  locale: 'fr',
};

export const mockFarm: Farm = {
  id: 1,
  name: 'Parcelle Olive Nord',
  location: 'Sidi Bouzid, Tunisia',
  crop: 'Olive',
  areaHa: 3.5,
  irrigationMethod: 'Drip irrigation',
  soilType: 'Clay-loam',
};

export const mockIrrigation: IrrigationAdvice = {
  status: 'needed',
  waterM3: 42,
  reason:
    'The soil is dry and no significant rain is expected in the next two days.',
  warning: 'Irrigate early in the morning to reduce evaporation losses.',
  updatedAt: new Date().toISOString(),
};

export const mockWeather: Weather = {
  now: {
    temperatureC: 31,
    condition: 'sunny',
    rainfallMm: 0,
    humidityPct: 38,
    windKph: 12,
  },
  days: [
    { date: dayFromNow(0), condition: 'sunny', tempMinC: 21, tempMaxC: 32, rainMm: 0 },
    { date: dayFromNow(1), condition: 'sunny', tempMinC: 22, tempMaxC: 34, rainMm: 0 },
    { date: dayFromNow(2), condition: 'cloudy', tempMinC: 23, tempMaxC: 31, rainMm: 1 },
    { date: dayFromNow(3), condition: 'lightRain', tempMinC: 20, tempMaxC: 27, rainMm: 6 },
    { date: dayFromNow(4), condition: 'cloudy', tempMinC: 19, tempMaxC: 26, rainMm: 2 },
  ],
  source: 'Demo data (Open-Meteo placeholder)',
};

export const mockWater: WaterAvailability = {
  available: true,
  source: 'manual',
  levelPct: 62,
  volumeM3: 31,
  capacityM3: 50,
  note: 'Level entered by you — no sensor connected.',
};

export const mockAlerts: Alert[] = [
  {
    id: 'heat',
    tone: 'warning',
    title: 'High temperatures expected',
    message: 'Up to 34 °C on Thursday. Your crop may need extra water.',
  },
  {
    id: 'water',
    tone: 'info',
    title: 'Water tank is 62 % full',
    message: 'Enough for about two more irrigation rounds.',
  },
];

export const mockHomeSummary: HomeSummary = {
  user: mockUser,
  farm: mockFarm,
  irrigation: mockIrrigation,
  weather: mockWeather,
  water: mockWater,
  alerts: mockAlerts,
};

export const mockSchedule: ScheduleEntry[] = [
  { id: 's1', date: dayFromNow(-3), time: '06:30', status: 'done', waterM3: 40 },
  { id: 's2', date: dayFromNow(-1), time: '06:30', status: 'done', waterM3: 38 },
  {
    id: 's3',
    date: dayFromNow(0),
    time: '06:30',
    status: 'planned',
    waterM3: 42,
    note: 'Irrigate before the heat of the day.',
  },
  { id: 's4', date: dayFromNow(2), time: '07:00', status: 'planned', waterM3: 30 },
];

export const mockNotifications: AppNotification[] = [
  {
    id: 'n1',
    tone: 'info',
    title: 'Rain expected tomorrow',
    message: 'Light rain (about 6 mm) is forecast in three days. You may skip one watering.',
    date: new Date().toISOString(),
    read: false,
  },
  {
    id: 'n2',
    tone: 'warning',
    title: 'Irrigation demand may increase',
    message: 'Temperatures above 30 °C are expected this week.',
    date: new Date(Date.now() - 3600_000).toISOString(),
    read: false,
  },
  {
    id: 'n3',
    tone: 'neutral',
    title: 'No sensor is connected',
    message: 'Water level is based on the value you entered manually.',
    date: new Date(Date.now() - 86_400_000).toISOString(),
    read: true,
  },
];
