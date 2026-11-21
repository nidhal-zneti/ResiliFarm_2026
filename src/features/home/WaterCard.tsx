import { Waves } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AlertBanner } from '@/components/AlertBanner';
import { Card } from '@/components/Card';
import { colors, radius, spacing, typography } from '@/theme';
import type { WaterAvailability } from '@/types';

/**
 * Water availability. When there is no sensor and no manual value we show a
 * clear "no data" message instead of inventing a level.
 */
export function WaterCard({ water }: { water: WaterAvailability }) {
  const { t } = useTranslation();

  if (!water.available) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.title}>{t('home.water')}</Text>
        <AlertBanner
          tone="neutral"
          title={t('home.waterUnavailable')}
          icon={<Waves size={20} color={colors.neutral} />}
        />
      </View>
    );
  }

  const level = Math.max(0, Math.min(100, water.levelPct ?? 0));

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>{t('home.water')}</Text>
        {water.note ? <Text style={styles.note}>{water.note}</Text> : null}
      </View>

      <View style={styles.levelRow}>
        <Text style={styles.levelLabel}>{t('home.waterLevel')}</Text>
        <Text style={styles.levelValue}>
          {level}
          <Text style={styles.levelUnit}> {t('units.percent')}</Text>
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${level}%` }]} />
      </View>

      {water.volumeM3 != null && water.capacityM3 != null ? (
        <Text style={styles.volume}>
          {water.volumeM3} {t('units.m3')} · {t('home.tankCapacity', { capacity: water.capacityM3 })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.subtitle,
    color: colors.text,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: 'end',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  levelLabel: {
    ...typography.small,
    color: colors.textMuted,
  },
  levelValue: {
    ...typography.title,
    color: colors.text,
  },
  levelUnit: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '400',
  },
  track: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  volume: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
