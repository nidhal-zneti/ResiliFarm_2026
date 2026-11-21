import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, StatusTone, toneStyles, typography } from '@/theme';

type BadgeProps = {
  label: string;
  tone?: StatusTone;
};

/** Small pill used for statuses such as "Irrigation needed". */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { bg, fg } = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
  },
});
