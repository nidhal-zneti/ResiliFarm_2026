/**
 * ResiliFarm Mobile — domain types.
 *
 * These mirror the data a farmer actually needs. Technical concepts (ET0, Kc,
 * raw sensor graphs, MQTT...) are intentionally absent: they belong to the
 * agronomist/admin platform, not this app.
 */

export type Role = 'FARMER' | 'AGRONOMIST' | 'ADMIN';

export type Locale = 'fr' | 'ar' | 'en';

export type User = {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  locale: Locale;
};

export type Farm = {
  id: number;
  name: string;
  /** Region the farm belongs to (used to fetch its weather and alerts). */
  regionId: number;
  /** Human-readable place, e.g. "Sidi Bouzid". */
  location: string;
  crop: string;
  areaHa: number;
  irrigationMethod: string;
  soilType?: string;
};

/** Whether irrigation is needed today. `unavailable` = not enough data. */
export type IrrigationStatus = 'needed' | 'not_needed' | 'unavailable';

export type IrrigationAdvice = {
  status: IrrigationStatus;
  /** Suggested volume for the whole farm, in cubic metres. */
  waterM3?: number;
  /** Short, plain-language explanation of the recommendation. */
  reason?: string;
  /** A caution worth surfacing (e.g. "Rain expected, consider waiting"). */
  warning?: string;
  /** ISO timestamp of the underlying data, when known. */
  updatedAt?: string;
};

export type WeatherNow = {
  temperatureC: number;
  condition: string;
  rainfallMm: number;
  humidityPct: number;
  windKph: number;
};

export type WeatherDay = {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  /** Short weekday label already localised by the backend, if provided. */
  label?: string;
  condition: string;
  /** Omitted when the provider only supplies a daily maximum. */
  tempMinC?: number;
  tempMaxC: number;
  rainMm: number;
};

export type Weather = {
  now: WeatherNow;
  days: WeatherDay[];
  /** Where the data comes from, shown to the user for transparency. */
  source: string;
};

export type WaterSource = 'sensor' | 'manual' | 'none';

export type WaterAvailability = {
  /** False when there is no sensor and no manual figure — never fabricate. */
  available: boolean;
  source: WaterSource;
  /** Fill level, 0-100, when known. */
  levelPct?: number;
  volumeM3?: number;
  capacityM3?: number;
  /** Plain explanation, e.g. "Entered by you" or "No sensor connected". */
  note?: string;
};

export type AlertTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type Alert = {
  id: string;
  tone: AlertTone;
  title: string;
  message?: string;
};

export type AppNotification = {
  id: string;
  tone: AlertTone;
  title: string;
  message: string;
  /** ISO date. */
  date: string;
  read: boolean;
};

export type ScheduleStatus = 'planned' | 'done' | 'skipped';

export type ScheduleEntry = {
  id: string;
  /** ISO date. */
  date: string;
  /** Optional local time, e.g. "06:30". */
  time?: string;
  status: ScheduleStatus;
  waterM3?: number;
  note?: string;
};

/** Everything the Home screen needs, fetched in one call. */
export type HomeSummary = {
  user: User;
  farm: Farm;
  irrigation: IrrigationAdvice;
  weather: Weather;
  water: WaterAvailability;
  alerts: Alert[];
};
