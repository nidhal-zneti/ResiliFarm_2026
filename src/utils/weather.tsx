import type { TFunction } from 'i18next';
import {
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSun,
  Sun,
  Wind,
} from 'lucide-react-native';
import { ReactNode } from 'react';

/** Map a backend condition code to a simple, recognisable icon. */
export function weatherIcon(code: string, size: number, color: string): ReactNode {
  switch (code) {
    case 'sunny':
      return <Sun size={size} color={color} />;
    case 'partlyCloudy':
      return <CloudSun size={size} color={color} />;
    case 'cloudy':
      return <Cloud size={size} color={color} />;
    case 'lightRain':
      return <CloudDrizzle size={size} color={color} />;
    case 'rain':
      return <CloudRain size={size} color={color} />;
    case 'storm':
      return <CloudLightning size={size} color={color} />;
    case 'windy':
      return <Wind size={size} color={color} />;
    default:
      return <Cloud size={size} color={color} />;
  }
}

/** Localised, plain-language label for a condition code. */
export function weatherLabel(t: TFunction, code: string): string {
  return t(`weather.${code}`, { defaultValue: code });
}

/** Short localised weekday, e.g. "Mon". */
export function weekdayShort(isoDate: string, locale: string): string {
  try {
    return new Date(isoDate).toLocaleDateString(locale, { weekday: 'short' });
  } catch {
    return isoDate;
  }
}
