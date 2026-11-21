import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, StatusTone, toneStyles, typography } from '@/theme';

type StatTileProps = {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  tone?: StatusTone;
};

/**
 * Compact metric tile: an icon, a label and a big value.
 * Used in the weather row and water availability card.
 */
export function StatTile({ icon, label, value, unit, tone = 'neutral' }: StatTileProps) {
  const { bg, fg } = toneStyles[tone];
  return (
    <View style={styles.tile}>
      <View style={[styles.iconWrap, { backgroundColor: bg }]}>{icon}</View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.label, { color: fg }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.subtitle,
    color: colors.text,
  },
  unit: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '400',
  },
  label: {
    ...typography.caption,
  },
});
