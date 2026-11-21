import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing, StatusTone, toneStyles } from '@/theme';

type CardProps = {
  children: ReactNode;
  /** Optional semantic tint (e.g. 'success', 'warning'). */
  tone?: StatusTone;
  style?: ViewStyle;
};

/**
 * A white rounded card with a subtle border — the basic building block of
 * every screen. Pass a `tone` to tint the card background.
 */
export function Card({ children, tone, style }: CardProps) {
  const toneStyle = tone
    ? { backgroundColor: toneStyles[tone].bg, borderColor: 'transparent' }
    : undefined;

  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
});
