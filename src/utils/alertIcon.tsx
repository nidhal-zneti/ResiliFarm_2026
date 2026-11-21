import { AlertTriangle, Bell, CheckCircle2, Info } from 'lucide-react-native';
import { ReactNode } from 'react';

import { colors } from '@/theme';
import type { AlertTone } from '@/types';

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  info: Info,
  neutral: Bell,
} as const;

const ICON_COLORS: Record<AlertTone, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
  neutral: colors.neutral,
};

/** Shared tone -> icon mapping for alerts and notifications. */
export function alertIcon(tone: AlertTone, size = 20): ReactNode {
  const Icon = ICONS[tone];
  return <Icon size={size} color={ICON_COLORS[tone]} />;
}
