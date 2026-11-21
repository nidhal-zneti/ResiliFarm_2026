import { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, radius, spacing, typography } from '@/theme';

type ComingSoonProps = {
  icon: LucideIcon;
  title: string;
  note: string;
};

/**
 * Deliberate placeholder for screens scheduled in a later phase, so navigation
 * is complete and the roadmap stays honest.
 */
export function ComingSoon({ icon: Icon, title, note }: ComingSoonProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.iconWrap}>
        <Icon size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.subtitle,
    color: colors.text,
  },
  note: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
